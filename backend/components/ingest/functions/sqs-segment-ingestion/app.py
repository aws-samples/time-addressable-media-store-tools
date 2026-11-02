import json
import os
from datetime import datetime
from urllib.parse import urlparse

import boto3
import requests
from aws_lambda_powertools import Logger, Metrics, Tracer, single_metric
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.batch import (
    BatchProcessor,
    EventType,
    process_partial_response,
)
from aws_lambda_powertools.utilities.data_classes.sqs_event import SQSEvent, SQSRecord
from aws_lambda_powertools.utilities.typing import LambdaContext
from botocore.exceptions import ClientError
from mediatimestamp.immutable import TimeRange
from openid_auth import Credentials

tracer = Tracer()
logger = Logger()
metrics = Metrics()
batch_processor = BatchProcessor(event_type=EventType.SQS)

IMAGE_FORMAT = "urn:x-tam:format:image"
s3 = boto3.client("s3")
endpoint = os.environ["TAMS_ENDPOINT"]
creds = Credentials(
    scopes=["tams-api/read", "tams-api/write"],
    secret_arn=os.environ["SECRET_ARN"],
)


class ObjectNotRegisteredError(Exception):
    """An Object id that is allocated in the store but not yet referenced by a segment."""


@tracer.capture_method(capture_response=False)
def object_is_registered(object_id: str) -> bool:
    """True if a segment references the Object. Segments are only registered once their Object upload has succeeded."""
    response = requests.head(
        f"{endpoint}/objects/{object_id}",
        headers={"Authorization": f"Bearer {creds.token()}"},
        timeout=30,
    )
    if response.status_code == 404:
        return False
    response.raise_for_status()
    return True


@tracer.capture_method(capture_response=False)
def segment_is_registered(flow_id: str, timerange: str, object_id: str | None) -> bool:
    """True if the flow already has a segment with this exact timerange, and this object_id when one is supplied.
    Messages can be delivered more than once, and a retried HLS poll resends segments SQS had already accepted."""
    response = requests.get(
        f"{endpoint}/flows/{flow_id}/segments",
        headers={"Authorization": f"Bearer {creds.token()}"},
        params={"timerange": timerange},
        timeout=30,
    )
    response.raise_for_status()
    wanted = TimeRange.from_str(timerange)
    return any(
        TimeRange.from_str(segment["timerange"]) == wanted
        and (object_id is None or segment.get("object_id") == object_id)
        for segment in response.json()
    )


@tracer.capture_method(capture_response=False)
def get_file(source: str, byterange: str | None = None) -> bytes:
    """Reads the content of a file from the supplied source uri"""
    source_parse = urlparse(source)
    range_value = None
    if byterange:
        parts = byterange.split("@")
        byterange_len = int(parts[0])
        byterange_start = int(parts[1]) if len(parts) > 1 else 0
        range_value = f"bytes={byterange_start}-{byterange_start + byterange_len - 1}"
    match source_parse.scheme:
        case "s3":
            params = {
                "Bucket": source_parse.netloc,
                "Key": source_parse.path[1:],
            }
            if range_value:
                params["Range"] = range_value
            try:
                response = s3.get_object(**params)
                return response["Body"].read()
            except s3.exceptions.NoSuchKey as ex:
                logger.error("NoSuchKey", error=ex.response["Error"])
                return None
        case "https" | "http":
            headers = {"Range": range_value} if range_value else None
            response = requests.get(source, headers=headers, timeout=30)
            response.raise_for_status()
            return response.content
        case _:
            raise ValueError(f"Unsupported URL scheme in '{source}'")


@tracer.capture_method(capture_response=False)
def upload_file(flow_id: str, data: bytes, object_id: str | None) -> dict:
    """Uploads a file to the TAMS API"""
    logger.info("Requesting pre-signed PUT URL...")
    get_url = requests.post(
        f"{endpoint}/flows/{flow_id}/storage",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {creds.token()}",
        },
        data=json.dumps({"object_ids": [object_id]} if object_id else {"limit": 1}),
        timeout=30,
    )
    try:
        get_url.raise_for_status()
        logger.info(f"Response status: {get_url.status_code}")
    except requests.exceptions.HTTPError as ex:
        if ex.response.status_code == 404:
            logger.error(ex.response.text)
            return None
        elif ex.response.status_code == 400 and object_id:
            try:
                already_exists = "already exist" in ex.response.json().get(
                    "message", ""
                )
            except (ValueError, KeyError, AttributeError):
                already_exists = False
            if not already_exists:
                raise ex
            # The id is allocated, but only a registered Object is known to be stored.
            # An unregistered one may still be uploading, or its upload may have failed.
            if not object_is_registered(object_id):
                raise ObjectNotRegisteredError(
                    f"Object ID {object_id} is allocated but not registered"
                ) from ex
            logger.info(f"Object ID {object_id} already exists, skipping upload")
            return {"object_id": object_id}
        else:
            raise ex
    media_object = get_url.json()["media_objects"][0]
    logger.info("Using pre-signed URL to put file in S3...")
    put_file = requests.put(
        media_object["put_url"]["url"],
        headers={"Content-Type": media_object["put_url"]["content-type"]},
        data=data,
        timeout=30,
    )
    put_file.raise_for_status()
    logger.info(f"Response status: {put_file.status_code}")
    return media_object


@tracer.capture_method(capture_response=False)
def post_segment(flow_id: str, segment_data: dict) -> bool:
    """Register the segment with the TAMS API"""
    # Exclude operational fields that are not part of the TAMS segment schema
    excluded_fields = {
        "flowId",
        "uri",
        "deleteSource",
        "byterange",
        "initUri",
        "initByterange",
        "initObjectId",
    }
    segment = {k: v for k, v in segment_data.items() if k not in excluded_fields}

    logger.info("Posting segment to TAMS...")
    post = requests.post(
        f"{endpoint}/flows/{flow_id}/segments",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {creds.token()}",
        },
        data=json.dumps(segment),
        timeout=30,
    )
    try:
        post.raise_for_status()
        logger.info(f"Response status: {post.status_code}")
    except requests.exceptions.HTTPError as ex:
        if ex.response.status_code == 400:
            logger.error(ex.response.text, body=segment)
            return False
        else:
            raise ex
    return True


@tracer.capture_method(capture_response=False)
def delete_s3_file(source: str) -> None:
    """Attempts to delete the S3 file using the supplied source uri, logs error without raising if unable to do so."""
    source_parse = urlparse(source)
    match source_parse.scheme:
        case "s3":
            try:
                s3.delete_object(Bucket=source_parse.netloc, Key=source_parse.path[1:])
            except ClientError as ex:
                logger.error(ex)


@tracer.capture_method(capture_response=False)
def get_flow_format(flow_id: str) -> str:
    """Get the format of a flow"""
    response = requests.get(
        f"{endpoint}/flows/{flow_id}",
        headers={"Authorization": f"Bearer {creds.token()}"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["format"]


@tracer.capture_method(capture_response=False)
def record_handler(record: SQSRecord) -> None:
    """Processes a single SQS record"""
    message = json.loads(record.body)
    sent_timestamp = datetime.fromtimestamp(
        int(record.attributes.sent_timestamp) / 1000
    )
    first_receive_timestamp = datetime.fromtimestamp(
        int(record.attributes.approximate_first_receive_timestamp) / 1000
    )
    receive_delta_seconds = (first_receive_timestamp - sent_timestamp).total_seconds()
    logger.info(f"Approximate receive delta: {receive_delta_seconds}")
    with single_metric(
        name="SQSIngestReceiveDelta",
        unit=MetricUnit.Seconds,
        value=receive_delta_seconds,
    ) as metric:
        metric.add_dimension(
            name="base_uri", value="/".join(message["uri"].split("/")[:-1])
        )
    flow_id = message["flowId"]
    flow_format = get_flow_format(flow_id)
    if flow_format == IMAGE_FORMAT and "_" in message["timerange"]:
        message["timerange"] = f"{message['timerange'].split('_')[0]}]"
    # Checked before uploading, so a duplicate message does not store another Object
    if segment_is_registered(flow_id, message["timerange"], message.get("object_id")):
        logger.info(
            "Segment is already registered, skipping",
            timerange=message["timerange"],
        )
        if message.get("deleteSource", False):
            delete_s3_file(message["uri"])
        return
    file_data = get_file(message["uri"], message.get("byterange"))
    if not file_data:
        raise ValueError(f"Unable to read source file {message['uri']}")
    media_object = upload_file(flow_id, file_data, message.get("object_id"))
    if media_object is None:
        raise ValueError(f"Unable to upload file to flow {flow_id}")
    # Update object_id in message to use the actual uploaded object_id
    message["object_id"] = media_object["object_id"]
    # For fragmented MP4 / CMAF (TAMS AppNote 0024) the media segment references an
    # initialisation Object. Upload it (deterministic object_id makes the upload idempotent
    # and reused across every segment that shares this init) and link it on the segment.
    init_object_id = message.get("initObjectId")
    if init_object_id:
        init_data = get_file(message["initUri"], message.get("initByterange"))
        if not init_data:
            raise ValueError(f"Unable to read init segment {message['initUri']}")
        try:
            init_object = upload_file(flow_id, init_data, init_object_id)
        except ObjectNotRegisteredError:
            # Another invocation may still be uploading it, or its upload failed. Store
            # this segment's init under a new id rather than reference one never stored.
            logger.warning(
                "Init object is allocated but not registered, uploading a copy",
                init_object_id=init_object_id,
            )
            init_object = upload_file(flow_id, init_data, None)
        if init_object is None:
            raise ValueError(f"Unable to upload init segment to flow {flow_id}")
        message["init_object_id"] = init_object["object_id"]
    post_result = post_segment(flow_id, message)
    if not post_result:
        raise ValueError(f"Unable to post segment to flow {flow_id}")
    if message.get("deleteSource", False):
        delete_s3_file(message["uri"])


@logger.inject_lambda_context(log_event=True)
@tracer.capture_lambda_handler(capture_response=False)
@metrics.log_metrics(capture_cold_start_metric=True)
# pylint: disable=unused-argument
def lambda_handler(event: SQSEvent, context: LambdaContext) -> dict:
    return process_partial_response(
        event=event,
        record_handler=record_handler,
        processor=batch_processor,
        context=context,
    )
