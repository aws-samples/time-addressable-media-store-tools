import json
import os
from urllib.parse import urlparse

import boto3
import m3u8
import requests
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.utilities.typing import LambdaContext
from mediatimestamp.immutable import TimeRange, Timestamp

tracer = Tracer()
logger = Logger()

sqs = boto3.client("sqs")
s3 = boto3.client("s3")
queue_url = os.environ["QUEUE_URL"]


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
def send_message_batch(messages: list) -> None:
    """Sends a batch of messages to the SQS queue"""
    if not messages:
        return
    entries = [
        {"Id": str(i), "MessageBody": json.dumps(message)}
        for i, message in enumerate(messages)
    ]
    sqs.send_message_batch(QueueUrl=queue_url, Entries=entries)


@logger.inject_lambda_context(log_event=True)
@tracer.capture_lambda_handler(capture_response=False)
# pylint: disable=unused-argument
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    flow_id = event["flow_id"]
    manifest_location = event["manifest_location"]
    manifest_path = os.path.dirname(manifest_location)
    manifest = get_manifest(manifest_location)
    if manifest.is_variant:
        raise ValueError("Not a media manifest")
    last_media_sequence = event.get("last_media_sequence", 0)
    last_timestamp = Timestamp.from_str(event.get("last_timestamp", "0:0"))
    messages = []
    for segment in manifest.segments:
        if segment.media_sequence > last_media_sequence:
            segment_start = last_timestamp
            segment_end = Timestamp.from_nanosec(
                segment_start.to_nanosec() + (segment.duration * 1000000000)
            )
            timerange = TimeRange(segment_start, segment_end, TimeRange.INCLUDE_START)
            messages.append(
                {
                    "flow_id": flow_id,
                    "timerange": str(timerange),
                    "uri": (
                        segment.uri
                        if segment.uri.startswith("http")
                        else f"{manifest_path}/{segment.uri}"
                    ),
                }
            )
            last_timestamp = segment_end
            last_media_sequence = segment.media_sequence
            if len(messages) == 10:
                send_message_batch(messages)
                messages = []
    send_message_batch(messages)
    # pylint: disable=no-member
    if not manifest.is_endlist:
        return {
            **event,
            "last_media_sequence": last_media_sequence,
            "last_timestamp": str(last_timestamp),
        }
    return {}
