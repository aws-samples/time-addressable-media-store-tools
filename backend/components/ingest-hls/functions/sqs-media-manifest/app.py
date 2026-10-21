import json
import os
import time
import uuid
from datetime import datetime, timezone
from fractions import Fraction
from urllib.parse import urlparse

import boto3
import m3u8
import requests
from aws_lambda_powertools import Logger, Metrics, Tracer, single_metric
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.batch import (
    BatchProcessor,
    EventType,
    process_partial_response,
)
from aws_lambda_powertools.utilities.data_classes.sqs_event import SQSEvent, SQSRecord
from aws_lambda_powertools.utilities.idempotency import (
    DynamoDBPersistenceLayer,
    IdempotencyConfig,
    idempotent_function,
)
from aws_lambda_powertools.utilities.idempotency.persistence.datarecord import (
    DataRecord,
)
from aws_lambda_powertools.utilities.typing import LambdaContext
from ffprobe import ffprobe_link
from mediatimestamp.immutable import TimeRange, Timestamp

tracer = Tracer()
logger = Logger()
metrics = Metrics()
persistence_layer = DynamoDBPersistenceLayer(table_name=os.environ["IDEMPOTENCY_TABLE"])
batch_processor = BatchProcessor(event_type=EventType.SQS)


@tracer.capture_method(capture_response=False)
def idempotency_hook(response: dict, idempotent_data: DataRecord) -> dict:
    logger.warning(
        "Idempotency blocked processing",
        idempotency_key=idempotent_data.idempotency_key,
    )
    return response


idempotency_config = IdempotencyConfig(
    event_key_jmespath='["flowId", "lastMediaSequence", "eventTimestamp"]',
    response_hook=idempotency_hook,
)

s3 = boto3.client("s3")
sfn = boto3.client("stepfunctions")
sqs = boto3.client("sqs")
manifest_queue_url = os.environ["MANIFEST_QUEUE_URL"]
ingest_queue_url = os.environ["INGEST_QUEUE_URL"]
# MPEG-TS PTS is a 33-bit counter at 90kHz, so it wraps back to zero every ~26.5 hours.
PTS_RATE = 90000
PTS_WRAP_TICKS = 2**33
PTS_HALF_WRAP = Timestamp.from_count(PTS_WRAP_TICKS // 2, PTS_RATE)
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
# Stop taking on new segments with this much invocation time left, so a long catch-up
# re-queues itself rather than hitting the Lambda timeout on every attempt.
CATCH_UP_RESERVE_SECONDS = 60
# time.monotonic() value after which no new segments are started; set per invocation
invocation_deadline = None


@tracer.capture_method(capture_response=False)
def send_message_batch(messages: list) -> None:
    """Sends a batch of messages to the SQS queue"""
    if not messages:
        return
    entries = [
        {"Id": str(i), "MessageBody": json.dumps(message)}
        for i, message in enumerate(messages)
    ]
    sqs.send_message_batch(QueueUrl=ingest_queue_url, Entries=entries)


@tracer.capture_method(capture_response=False)
def get_manifest(source: str) -> m3u8.M3U8:
    """Parses an m3u8 manifest from the supplied source uri"""
    manifest_content = get_file(source).decode("utf-8")
    return m3u8.loads(manifest_content)


@tracer.capture_method(capture_response=False)
def normalize_byterange_offsets(segments: list) -> None:
    """Rewrite every #EXT-X-BYTERANGE to explicit 'length@offset' form, in place.

    Per RFC 8216, a byterange that omits '@offset' continues from the byte following
    the previous sub-range of the same resource. The m3u8 library stores the raw tag
    value, so an omitted offset arrives here as a bare length (e.g. '144550'). Resolving
    it here means the probe and the segment ingester always receive an absolute offset."""
    next_offset = {}
    for segment in segments:
        if not segment.byterange:
            continue
        parts = segment.byterange.split("@")
        length = int(parts[0])
        offset = int(parts[1]) if len(parts) > 1 else next_offset.get(segment.uri, 0)
        segment.byterange = f"{length}@{offset}"
        next_offset[segment.uri] = offset + length


@tracer.capture_method(capture_response=False)
def resolve_uri(manifest_path: str, uri: str) -> str:
    """Resolve a (possibly relative) HLS URI against the media manifest path."""
    if uri.startswith("http"):
        return uri
    if uri.startswith("/"):
        path_parse = urlparse(manifest_path)
        return f"{path_parse.scheme}://{path_parse.netloc}{uri}"
    return f"{manifest_path}/{uri}"


@tracer.capture_method(capture_response=False)
def normalize_map_byterange(byterange: str | None) -> str | None:
    """Rewrite an #EXT-X-MAP BYTERANGE to explicit 'length@offset' form.
    Per RFC 8216 the offset of an EXT-X-MAP byterange defaults to 0 when omitted."""
    if not byterange:
        return None
    parts = byterange.split("@")
    length = int(parts[0])
    offset = int(parts[1]) if len(parts) > 1 else 0
    return f"{length}@{offset}"


@tracer.capture_method(capture_response=False)
def init_object_id(init_uri: str, init_byterange: str | None) -> str:
    """Deterministic, reusable Object id for an initialisation segment identified by its
    resolved URI (and byterange). Stable across segments, batches, retries and re-imports so
    the init Object is reused rather than duplicated (TAMS AppNote 0024)."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"{init_uri}#{init_byterange or ''}"))


@tracer.capture_method(capture_response=False)
def get_file(source: str, byterange: str | None = None) -> bytes:
    """Reads the content of a file from the supplied source uri, optionally limited to a byterange in HLS #EXT-X-BYTERANGE format ('length@offset')."""
    source_parse = urlparse(source)
    range_header = None
    if byterange:
        length_str, offset_str = byterange.split("@")
        offset = int(offset_str)
        end = offset + int(length_str) - 1
        range_header = f"bytes={offset}-{end}"
    match source_parse.scheme:
        case "s3":
            params = {
                "Bucket": source_parse.netloc,
                "Key": source_parse.path[1:],
            }
            if range_header:
                params["Range"] = range_header
            response = s3.get_object(**params)
            return response["Body"].read()
        case "https" | "http":
            headers = {"Range": range_header} if range_header else None
            response = requests.get(source, headers=headers, timeout=30)
            response.raise_for_status()
            return response.content
        case _:
            raise ValueError(f"Unsupported URL scheme in '{source}'")


@tracer.capture_method(capture_response=False)
def get_manifest_start_pdt(manifest: m3u8.M3U8) -> Timestamp | None:
    """Returns the first segment's EXT-X-PROGRAM-DATE-TIME as a unix epoch Timestamp (sub-second precision kept), or None if absent."""
    if not manifest.segments:
        return None
    program_date_time = manifest.segments[0].program_date_time
    if not program_date_time:
        return None
    if program_date_time.tzinfo is None:
        program_date_time = program_date_time.replace(tzinfo=timezone.utc)
    delta = program_date_time - EPOCH
    return Timestamp.from_nanosec(
        (delta.days * 86400 + delta.seconds) * 1_000_000_000 + delta.microseconds * 1000
    )


@tracer.capture_method(capture_response=False)
def probe_segment(
    segment_uri: str,
    byterange: str | None,
    extinf_duration: float,
    init: dict | None = None,
) -> tuple[Timestamp | None, Timestamp, bool]:
    """Probes the segment and returns (start_pts, duration, is_mpegts). start_pts is None if ffprobe doesn't report it; duration falls back to #EXTINF on probe failure.
    init is an optional {'uri':..., 'byterange':...} initialisation segment prepended before probing fragmented MP4 / CMAF media."""
    try:
        # For fragmented MP4 / CMAF the initialisation segment's moov describes the WHOLE
        # presentation, so ffprobe's stream duration_ts is the entire clip's duration, not
        # this fragment's. Ask for packets so the fragment duration can be summed from them.
        probe_result = (
            ffprobe_link(
                segment_uri, byterange=byterange, init=init, show_packets=bool(init)
            )
            or {}
        )
        streams = probe_result.get("streams", [])
        if not streams:
            raise ValueError("ffprobe returned no streams")
        probe_stream = streams[0]
        rate = 1 / Fraction(probe_stream["time_base"])
        start_pts = (
            Timestamp.from_count(probe_stream["start_pts"], rate)
            if "start_pts" in probe_stream
            else None
        )
        if init:
            stream_index = probe_stream.get("index", 0)
            packet_ts = sum(
                int(packet["duration"])
                for packet in probe_result.get("packets", [])
                if packet.get("stream_index") == stream_index and "duration" in packet
            )
            if packet_ts <= 0:
                raise ValueError("no packet durations available for fragment")
            duration = Timestamp.from_count(packet_ts, rate)
        else:
            duration = Timestamp.from_count(probe_stream["duration_ts"], rate)
        is_mpegts = probe_result.get("format", {}).get("format_name") == "mpegts"
        return start_pts, duration, is_mpegts
    except (KeyError, ValueError, TypeError) as ex:
        logger.warning(
            "Segment probe incomplete, falling back to #EXTINF",
            segment_scheme=urlparse(segment_uri).scheme or "unknown",
            error=str(ex),
        )
        return (
            None,
            Timestamp.from_nanosec(int(extinf_duration * 1_000_000_000)),
            False,
        )


def unwrap_pts(pts: Timestamp, wraps: int) -> Timestamp:
    """Adds `wraps` MPEG-TS PTS wraps in 90kHz ticks, so the result rounds exactly as an
    unwrapped PTS would. Adding a wrap as a Timestamp loses a nanosecond to rounding."""
    return Timestamp.from_count(
        pts.to_count(PTS_RATE) + wraps * PTS_WRAP_TICKS, PTS_RATE
    )


@tracer.capture_method(capture_response=False)
def process_segment(
    state: dict,
    segment,
    flow_id: str,
    manifest_path: str,
    segments: list,
) -> None:
    """Processes one HLS segment and appends its TAMS record to `segments`; `state` (keys: ts_offset, last_end, pts_anchored, pts_wraps) is mutated in place to carry the contiguous-region anchor.
    ts_offset is recomputed on a new region: the first segment, segment.discontinuity, the first usable PTS in a region anchored without one, or a backward PTS jump with no discontinuity tag.
    An MPEG-TS PTS wrap within a region increments pts_wraps, and the PTS is unwrapped in 90kHz ticks before conversion so Flow time stays continuous to the nanosecond.
    A segment that partly overlaps the previous one has its start trimmed so TAMS accepts it."""
    segment_uri = resolve_uri(manifest_path, segment.uri)
    init = None
    if segment.init_section:
        init = {
            "uri": resolve_uri(manifest_path, segment.init_section.uri),
            "byterange": normalize_map_byterange(segment.init_section.byterange),
        }
    start_pts, duration, is_mpegts = probe_segment(
        segment_uri, segment.byterange, segment.duration, init=init
    )
    if is_mpegts and start_pts is not None:
        # ffprobe reports a file whose first PTS is within 60s of the 33-bit wrap as a
        # negative value. Use the PTS actually carried in the file, so wrap handling and
        # ts_offset do not depend on where a source happens to cut its segments.
        start_pts = Timestamp.from_count(
            start_pts.to_count(PTS_RATE) % PTS_WRAP_TICKS, PTS_RATE
        )
    # Treat start_pts of None OR 0 identically — both mean "no meaningful position
    # on a continuous media clock" (raw AC-3 / raw AAC / WebVTT all report 0 or nothing).
    has_pts = start_pts is not None and start_pts != Timestamp()
    is_new_region = state["ts_offset"] is None or segment.discontinuity
    raw_pts = start_pts
    if has_pts and not is_new_region:
        if not state["pts_anchored"]:
            # The region was anchored on a segment with no usable PTS (e.g. a failed
            # probe), so ts_offset assumes media time zero. Anchor on this real PTS.
            is_new_region = True
        else:
            if is_mpegts:
                start_pts = unwrap_pts(raw_pts, state["pts_wraps"])
                if state["ts_offset"] + start_pts < state["last_end"] - PTS_HALF_WRAP:
                    state["pts_wraps"] += 1
                    start_pts = unwrap_pts(raw_pts, state["pts_wraps"])
                    logger.info(
                        "MPEG-TS PTS wrapped",
                        pts_wraps=state["pts_wraps"],
                        start_pts=str(raw_pts),
                    )
            if state["ts_offset"] + start_pts + duration <= state["last_end"]:
                # The whole segment would land in Flow time already registered, which
                # means the source clock reset without an #EXT-X-DISCONTINUITY tag.
                logger.warning(
                    "PTS jumped backwards without #EXT-X-DISCONTINUITY, starting a new region",
                    start_pts=str(raw_pts),
                    last_end=str(state["last_end"]),
                )
                is_new_region = True
    if is_new_region:
        start_pts = raw_pts
        file_time_at_region_start = start_pts if has_pts else Timestamp()
        state["ts_offset"] = state["last_end"] - file_time_at_region_start
        state["pts_anchored"] = has_pts
        state["pts_wraps"] = 0
    if has_pts:
        seg_start = state["ts_offset"] + start_pts
    else:
        seg_start = state["last_end"]
    seg_end = seg_start + duration
    if seg_start < state["last_end"]:
        # Probed durations and PTS steps can disagree slightly, and TAMS rejects any
        # overlap. Trim this segment's start rather than lose it, keeping its end and
        # ts_offset so later segments are still placed by their own PTS.
        logger.warning(
            "Segment overlaps the previous segment, trimming its start",
            overlap=str(state["last_end"] - seg_start),
        )
        seg_start = state["last_end"]
    timerange = TimeRange(seg_start, seg_end, TimeRange.INCLUDE_START)
    segment_dict = {
        "flowId": flow_id,
        "timerange": str(timerange),
        "uri": segment_uri,
    }
    if segment.byterange:
        segment_dict["byterange"] = segment.byterange
    if init:
        segment_dict["initUri"] = init["uri"]
        if init["byterange"]:
            segment_dict["initByterange"] = init["byterange"]
        segment_dict["initObjectId"] = init_object_id(init["uri"], init["byterange"])
    # The media inside the segment still carries wrapped PTS values, so its ts_offset
    # includes the wraps to map them onto Flow time.
    media_ts_offset = state["ts_offset"] + Timestamp.from_count(
        state["pts_wraps"] * PTS_WRAP_TICKS, PTS_RATE
    )
    if str(media_ts_offset) != "0:0":
        segment_dict["ts_offset"] = str(media_ts_offset)
    segments.append(segment_dict)
    state["last_end"] = seg_end


def is_out_of_time() -> bool:
    """True once this invocation should stop starting new segments."""
    return invocation_deadline is not None and time.monotonic() >= invocation_deadline


def build_poll_message(message: dict, last_media_sequence: int, state: dict) -> dict:
    """Builds the next poll message, carrying forward progress and the timing anchor."""
    next_message = {
        **message,
        "lastMediaSequence": last_media_sequence,
        "eventTimestamp": int(time.time() * 1000),
    }
    # Until a segment has been processed there is no anchor to carry forward, and
    # the next poll must take the first-poll path rather than parse an empty one.
    if state["ts_offset"] is not None:
        next_message["tsOffset"] = str(state["ts_offset"])
        next_message["lastEnd"] = str(state["last_end"])
        next_message["ptsAnchored"] = state["pts_anchored"]
        next_message["ptsWraps"] = state["pts_wraps"]
    return next_message


@tracer.capture_method(capture_response=False)
def queue_poll(task_token: str, body: dict, delay_seconds: int) -> None:
    """Queues the next poll of the media manifest."""
    sqs.send_message(
        QueueUrl=manifest_queue_url,
        MessageAttributes={
            "TaskToken": {
                "DataType": "String",
                "StringValue": task_token,
            }
        },
        MessageBody=json.dumps(body),
        DelaySeconds=delay_seconds,
    )


@idempotent_function(
    data_keyword_argument="message",
    config=idempotency_config,
    persistence_store=persistence_layer,
)
@tracer.capture_method(capture_response=False)
def process_message(message: dict, task_token: str) -> None:
    """Processes a single message from within the SQS record"""
    logger.info("Idempotency allowed processing.")
    flow_id = message["flowId"]
    manifest_location = message["manifestLocation"]
    with single_metric(
        name="MediaManifestProcessing",
        unit=MetricUnit.Count,
        value=1,
    ) as metric:
        metric.add_dimension(name="manifestLocation", value=manifest_location)
    manifest_path = os.path.dirname(manifest_location)
    manifest = get_manifest(manifest_location)
    if manifest.is_variant:
        raise ValueError("Not a media manifest")
    normalize_byterange_offsets(manifest.segments)
    last_media_sequence = message["lastMediaSequence"]
    if "tsOffset" in message:
        state = {
            "ts_offset": Timestamp.from_str(message["tsOffset"]),
            "last_end": Timestamp.from_str(message["lastEnd"]),
            # Messages queued before ptsAnchored existed were anchored as today
            "pts_anchored": message.get("ptsAnchored", True),
            # Messages queued before ptsWraps existed folded any wrap into tsOffset
            "pts_wraps": message.get("ptsWraps", 0),
        }
    else:
        pdt = get_manifest_start_pdt(manifest)
        flow_start = pdt if pdt is not None else Timestamp()
        state = {
            "ts_offset": None,
            "last_end": flow_start,
            "pts_anchored": False,
            "pts_wraps": 0,
        }
    segments = []
    caught_up = True
    for segment in manifest.segments:
        if segment.media_sequence > last_media_sequence:
            if is_out_of_time():
                caught_up = False
                break
            process_segment(state, segment, flow_id, manifest_path, segments)
            last_media_sequence = segment.media_sequence
            if len(segments) == 10:
                send_message_batch(segments)
                segments = []
    send_message_batch(segments)
    # pylint: disable=no-member
    if caught_up and manifest.is_endlist:
        sfn.send_task_success(taskToken=task_token, output=json.dumps({}))
    else:
        sfn.send_task_heartbeat(taskToken=task_token)
        if not caught_up:
            logger.info(
                "Pausing catch-up before the invocation times out",
                last_media_sequence=last_media_sequence,
            )
        queue_poll(
            task_token,
            build_poll_message(message, last_media_sequence, state),
            # Carry straight on with the remaining segments if catch-up was paused
            manifest.target_duration if caught_up else 0,
        )
    return (message["flowId"], message["lastMediaSequence"], message["eventTimestamp"])


@tracer.capture_method(capture_response=False)
def record_handler(record: SQSRecord) -> None:
    """Processes a single SQS record"""
    task_token = record.message_attributes.get("TaskToken", {}).get("stringValue", None)
    if not task_token:
        return
    try:
        process_message(message=record.json_body, task_token=task_token)
    # pylint: disable=broad-exception-caught
    except Exception as ex:
        logger.exception("Failing step function task due to unhandled exception")
        sfn.send_task_failure(
            taskToken=task_token,
            error=type(ex).__name__,
            cause=str(ex),
        )


@logger.inject_lambda_context(log_event=False)
@tracer.capture_lambda_handler(capture_response=False)
# pylint: disable=unused-argument
def lambda_handler(event: SQSEvent, context: LambdaContext) -> dict:
    global invocation_deadline  # pylint: disable=global-statement
    invocation_deadline = (
        time.monotonic()
        + context.get_remaining_time_in_millis() / 1000
        - CATCH_UP_RESERVE_SECONDS
    )
    idempotency_config.register_lambda_context(context)
    return process_partial_response(
        event=event,
        record_handler=record_handler,
        processor=batch_processor,
        context=context,
    )
