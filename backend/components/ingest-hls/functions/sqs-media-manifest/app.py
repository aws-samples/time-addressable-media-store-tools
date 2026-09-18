import json
import os
import time
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

from pts import (
    is_mpeg_ts_pts_wrap,
    reconcile_no_pts_program_date_time,
    resolve_segment_start,
)

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
MAX_BATCH_SEND_ATTEMPTS = 3


def next_poll_event_timestamp(previous_timestamp: int) -> int:
    """Return a unique attempt timestamp for a worker-created poll."""
    return max(int(time.time() * 1000), int(previous_timestamp) + 1)


@tracer.capture_method(capture_response=False)
def send_message_batch(messages: list) -> None:
    """Send every segment message, retrying partial SQS batch failures."""
    if not messages:
        return
    pending = [
        {"Id": str(i), "MessageBody": json.dumps(message)}
        for i, message in enumerate(messages)
    ]
    for attempt in range(MAX_BATCH_SEND_ATTEMPTS):
        response = sqs.send_message_batch(QueueUrl=ingest_queue_url, Entries=pending)
        failed = response.get("Failed") or []
        if not failed:
            return
        if any(item.get("SenderFault") for item in failed):
            raise RuntimeError("SQS rejected one or more segment messages")
        failed_ids = {str(item.get("Id")) for item in failed}
        pending = [entry for entry in pending if entry["Id"] in failed_ids]
        if not pending:
            raise RuntimeError("SQS returned malformed batch failure details")
        if attempt + 1 < MAX_BATCH_SEND_ATTEMPTS:
            time.sleep(0.1 * (2**attempt))
    raise RuntimeError("SQS segment message retries exhausted")


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
    """Returns the first segment's EXT-X-PROGRAM-DATE-TIME as a Timestamp, or None if absent."""
    if not manifest.segments:
        return None
    program_date_time = manifest.segments[0].program_date_time
    if not program_date_time:
        return None
    return datetime_to_timestamp(program_date_time)


def datetime_to_timestamp(value) -> Timestamp:
    """Converts a datetime to a mediatimestamp Timestamp, preserving sub-second precision."""
    return Timestamp.from_nanosec(int(round(value.timestamp() * 1_000_000_000)))


@tracer.capture_method(capture_response=False)
def probe_segment(
    segment_uri: str,
    byterange: str | None,
    extinf_duration: float,
) -> tuple[Timestamp | None, Timestamp]:
    """Probes the segment and returns (start_pts, duration). start_pts is None if ffprobe doesn't report it; duration falls back to #EXTINF on probe failure."""
    try:
        probe_result = ffprobe_link(segment_uri, byterange=byterange) or {}
        streams = probe_result.get("streams", [])
        if not streams:
            raise ValueError("ffprobe returned no streams")
        probe_stream = streams[0]
        rate = 1 / Fraction(probe_stream["time_base"])
        duration = Timestamp.from_count(probe_stream["duration_ts"], rate)
        start_pts = (
            Timestamp.from_count(probe_stream["start_pts"], rate)
            if "start_pts" in probe_stream
            else None
        )
        return start_pts, duration
    except (KeyError, ValueError, TypeError) as ex:
        logger.warning(
            "Segment probe incomplete, falling back to #EXTINF",
            segment_scheme=urlparse(segment_uri).scheme or "unknown",
            error=str(ex),
        )
        return None, Timestamp.from_nanosec(int(extinf_duration * 1_000_000_000))


@tracer.capture_method(capture_response=False)
def process_segment(
    state: dict,
    segment,
    flow_id: str,
    manifest_path: str,
    segments: list,
) -> None:
    """Process one HLS segment and append its TAMS record to `segments`."""
    segment_uri = f"{manifest_path}/{segment.uri}"
    if segment.uri.startswith("http"):
        segment_uri = segment.uri
    elif segment.uri.startswith("/"):
        path_parse = urlparse(manifest_path)
        segment_uri = f"{path_parse.scheme}://{path_parse.netloc}{segment.uri}"
    start_pts, duration = probe_segment(
        segment_uri, segment.byterange, segment.duration
    )
    previous_pts = state["last_pts"]
    wrapped = is_mpeg_ts_pts_wrap(previous_pts, start_pts)
    seg_start, state["ts_offset"], pts_reset = resolve_segment_start(
        ts_offset=state["ts_offset"],
        last_end=state["last_end"],
        previous_pts=previous_pts,
        current_pts=start_pts,
        discontinuity=segment.discontinuity,
        anchor_uncertain=state["pts_anchor_uncertain"],
    )
    if pts_reset:
        reset_kind = (
            "33-bit-wrap"
            if wrapped
            else (
                "backward-jump"
                if (
                    previous_pts is not None
                    and start_pts is not None
                    and start_pts < previous_pts
                )
                else "duration-drift"
            )
        )
        logger.warning(
            "Media clock re-anchored at last segment end",
            reset_kind=reset_kind,
            previous_pts=str(previous_pts),
            current_pts=str(start_pts),
            last_end=str(state["last_end"]),
        )
    no_usable_pts = start_pts is None or (start_pts == Timestamp() and not wrapped)
    program_date_time = getattr(segment, "program_date_time", None)
    if no_usable_pts and program_date_time is not None:
        seg_start, pdt_reanchored, running_ahead = reconcile_no_pts_program_date_time(
            segment_start=seg_start,
            program_date_time=datetime_to_timestamp(program_date_time),
        )
        if pdt_reanchored:
            # A re-anchor starts a new accumulation region, exactly like the
            # no-PTS branch of resolve_segment_start: media time zero now maps
            # to the re-anchored Flow time.
            state["ts_offset"] = seg_start
            logger.warning(
                "No-PTS media re-anchored to playlist PROGRAM-DATE-TIME",
                program_date_time=str(program_date_time),
                accumulated_start=str(state["last_end"]),
                segment_start=str(seg_start),
            )
        elif running_ahead:
            logger.warning(
                "No-PTS media runs ahead of playlist PROGRAM-DATE-TIME; "
                "already-registered Flow time cannot be rewound",
                program_date_time=str(program_date_time),
                accumulated_start=str(seg_start),
            )
    seg_end = seg_start + duration
    timerange = TimeRange(seg_start, seg_end, TimeRange.INCLUDE_START)
    segment_dict = {
        "flowId": flow_id,
        "timerange": str(timerange),
        "uri": segment_uri,
    }
    if segment.byterange:
        segment_dict["byterange"] = segment.byterange
    if str(state["ts_offset"]) != "0:0":
        segment_dict["ts_offset"] = str(state["ts_offset"])
    segments.append(segment_dict)
    if start_pts is not None and (start_pts != Timestamp() or wrapped):
        state["last_pts"] = start_pts
        state["pts_anchor_uncertain"] = False
    else:
        state["last_pts"] = None
        state["pts_anchor_uncertain"] = True
    state["last_end"] = seg_end


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
            "last_pts": (
                Timestamp.from_str(message["lastPts"]) if "lastPts" in message else None
            ),
            "pts_anchor_uncertain": message.get("ptsAnchorUncertain", False),
        }
    else:
        pdt = get_manifest_start_pdt(manifest)
        flow_start = pdt if pdt is not None else Timestamp()
        state = {
            "ts_offset": None,
            "last_end": flow_start,
            "last_pts": None,
            "pts_anchor_uncertain": False,
        }
    segments = []
    for segment in manifest.segments:
        if segment.media_sequence > last_media_sequence:
            process_segment(state, segment, flow_id, manifest_path, segments)
            last_media_sequence = segment.media_sequence
            if len(segments) == 10:
                send_message_batch(segments)
                segments = []
    send_message_batch(segments)
    # pylint: disable=no-member
    if manifest.is_endlist:
        sfn.send_task_success(taskToken=task_token, output=json.dumps({}))
    else:
        sfn.send_task_heartbeat(taskToken=task_token)
        next_message = {
            **message,
            "lastMediaSequence": last_media_sequence,
            "eventTimestamp": next_poll_event_timestamp(message["eventTimestamp"]),
        }
        if state["ts_offset"] is not None:
            next_message["tsOffset"] = str(state["ts_offset"])
            next_message["lastEnd"] = str(state["last_end"])
            if state["last_pts"] is not None:
                next_message["lastPts"] = str(state["last_pts"])
            else:
                next_message.pop("lastPts", None)
            if state["pts_anchor_uncertain"]:
                next_message["ptsAnchorUncertain"] = True
            else:
                next_message.pop("ptsAnchorUncertain", None)
        else:
            next_message.pop("tsOffset", None)
            next_message.pop("lastEnd", None)
            next_message.pop("lastPts", None)
            next_message.pop("ptsAnchorUncertain", None)
        sqs.send_message(
            QueueUrl=manifest_queue_url,
            MessageAttributes={
                "TaskToken": {
                    "DataType": "String",
                    "StringValue": task_token,
                }
            },
            MessageBody=json.dumps(next_message),
            DelaySeconds=manifest.target_duration,
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
    idempotency_config.register_lambda_context(context)
    return process_partial_response(
        event=event,
        record_handler=record_handler,
        processor=batch_processor,
        context=context,
    )
