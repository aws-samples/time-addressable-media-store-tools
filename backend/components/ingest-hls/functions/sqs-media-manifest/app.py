import json
import os
import time
from urllib.parse import urlparse
from fractions import Fraction

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
from aws_lambda_powertools.utilities.typing import LambdaContext
from aws_lambda_powertools.utilities.idempotency.persistence.datarecord import (
    DataRecord,
)
from mediatimestamp.immutable import TimeRange, Timestamp
from ffprobe import ffprobe_link

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
def get_manifest_start_pdt(manifest: m3u8.M3U8) -> int | None:
    """Returns the first segment's EXT-X-PROGRAM-DATE-TIME as a unix epoch int, or None if absent."""
    if not manifest.segments:
        return None
    program_date_time = manifest.segments[0].program_date_time
    if not program_date_time:
        return None
    return int(program_date_time.timestamp())


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
            segment_uri=segment_uri,
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
    """Processes one HLS segment and appends its TAMS record to `segments`; `state` (keys: ts_offset, last_end) is mutated in place to carry the contiguous-region anchor, with ts_offset recomputed only on a new region (first segment or segment.discontinuity)."""
    segment_uri = f"{manifest_path}/{segment.uri}"
    if segment.uri.startswith("http"):
        segment_uri = segment.uri
    elif segment.uri.startswith("/"):
        path_parse = urlparse(manifest_path)
        segment_uri = f"{path_parse.scheme}://{path_parse.netloc}{segment.uri}"

    start_pts, duration = probe_segment(
        segment_uri, segment.byterange, segment.duration
    )

    is_new_region = state["ts_offset"] is None or segment.discontinuity
    if is_new_region:
        file_time_at_region_start = start_pts if start_pts is not None else Timestamp()
        state["ts_offset"] = state["last_end"] - file_time_at_region_start

    if start_pts is not None:
        seg_start = state["ts_offset"] + start_pts
    else:
        seg_start = state["last_end"]
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
    last_media_sequence = message["lastMediaSequence"]
    if "tsOffset" in message:
        state = {
            "ts_offset": Timestamp.from_str(message["tsOffset"]),
            "last_end": Timestamp.from_str(message["lastEnd"]),
        }
    else:
        pdt = get_manifest_start_pdt(manifest)
        flow_start = Timestamp.from_str(f"{pdt}:0") if pdt is not None else Timestamp()
        state = {"ts_offset": None, "last_end": flow_start}
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
        sqs.send_message(
            QueueUrl=manifest_queue_url,
            MessageAttributes={
                "TaskToken": {
                    "DataType": "String",
                    "StringValue": task_token,
                }
            },
            MessageBody=json.dumps(
                {
                    **message,
                    "lastMediaSequence": last_media_sequence,
                    "tsOffset": str(state["ts_offset"]),
                    "lastEnd": str(state["last_end"]),
                    "eventTimestamp": int(time.time() * 1000),
                }
            ),
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


@logger.inject_lambda_context(log_event=True)
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
