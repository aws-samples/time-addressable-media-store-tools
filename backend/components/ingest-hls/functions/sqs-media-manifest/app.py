import json
import os
import time
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
from aws_lambda_powertools.utilities.typing import LambdaContext
from aws_lambda_powertools.utilities.idempotency.persistence.datarecord import (
    DataRecord,
)
from mediatimestamp.immutable import TimeRange, Timestamp

tracer = Tracer()
logger = Logger()
metrics = Metrics()
persistence_layer = DynamoDBPersistenceLayer(table_name=os.environ["IDEMPOTENCY_TABLE"])
batch_processor = BatchProcessor(event_type=EventType.SQS)


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
def get_file(source: str) -> bytes:
    """Reads the content of a file from the supplied source uri"""
    source_parse = urlparse(source)
    match source_parse.scheme:
        case "s3":
            response = s3.get_object(
                Bucket=source_parse.netloc, Key=source_parse.path[1:]
            )
            return response["Body"].read()
        case "https" | "http":
            response = requests.get(source, timeout=30)
            return response.content


@tracer.capture_method(capture_response=False)
def process_segment(
    last_timestamp: Timestamp,
    segment: dict,
    flow_id: str,
    manifest_path: str,
    segments: list,
) -> Timestamp:
    segment_start = last_timestamp
    segment_end = Timestamp.from_nanosec(
        segment_start.to_nanosec() + (segment.duration * 1000000000)
    )
    timerange = TimeRange(segment_start, segment_end, TimeRange.INCLUDE_START)
    segment_dict = {
        "flowId": flow_id,
        "timerange": str(timerange),
        "uri": (
            segment.uri
            if segment.uri.startswith("http")
            else f"{manifest_path}/{segment.uri}"
        ),
    }
    if segment.byterange:
        segment_dict["byterange"] = segment.byterange
    segments.append(segment_dict)
    return segment_end


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
    last_timestamp = Timestamp.from_str(message.get("lastTimestamp", "0:0"))
    segments = []
    for segment in manifest.segments:
        if segment.media_sequence > last_media_sequence:
            last_timestamp = process_segment(
                last_timestamp, segment, flow_id, manifest_path, segments
            )
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
                    "lastTimestamp": str(last_timestamp),
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
    if task_token:
        try:
            process_message(message=record.json_body, task_token=task_token)
        # pylint: disable=broad-exception-caught
        except Exception as ex:
            sfn.send_task_failure(taskToken=task_token, error=str(ex))


@logger.inject_lambda_context(log_event=True)
@tracer.capture_lambda_handler(capture_response=False)
# pylint: disable=unused-argument
def lambda_handler(event: SQSEvent, context: LambdaContext) -> dict:
    return process_partial_response(
        event=event,
        record_handler=record_handler,
        processor=batch_processor,
        context=context,
    )
