import json
import os
from datetime import datetime
from urllib.parse import urlparse

import boto3
import requests
from aws_lambda_powertools import Logger, Metrics, Tracer, single_metric
from aws_lambda_powertools.metrics import MetricUnit
from aws_lambda_powertools.utilities.data_classes.sqs_event import SQSEvent, SQSRecord
from aws_lambda_powertools.utilities.typing import LambdaContext
from aws_lambda_powertools.utilities.batch import (
    BatchProcessor,
    EventType,
    process_partial_response,
)
from botocore.exceptions import ClientError
from openid_auth import Credentials

tracer = Tracer()
logger = Logger()
metrics = Metrics()
batch_processor = BatchProcessor(event_type=EventType.SQS)

s3 = boto3.client("s3")
endpoint = os.environ["TAMS_ENDPOINT"]
creds = Credentials(
    token_url=os.environ["TOKEN_URL"],
    user_pool_id=os.environ["USER_POOL_ID"],
    client_id=os.environ["CLIENT_ID"],
    scopes=["tams-api/read", "tams-api/write"],
)


@tracer.capture_method(capture_response=False)
def get_file(source: str, byterange: str | None) -> bytes:
    """Reads the content of a file from the supplied source uri"""
    source_parse = urlparse(source)
    if byterange:
        byterange_len, byterange_start = map(int, byterange.split("@"))
        range_string = f"{byterange_start}-{byterange_start + byterange_len}"
    match source_parse.scheme:
        case "s3":
            params = {
                "Bucket": source_parse.netloc,
                "Key": source_parse.path[1:],
            }
            if byterange:
                params["Range"] = range_string
            try:
                response = s3.get_object(**params)
                return response["Body"].read()
            except s3.exceptions.NoSuchKey as ex:
                logger.error("NoSuchKey", error=ex.response["Error"])
                return False
        case "https" | "http":
            headers = {"Range": f"bytes={range_string}"} if byterange else None
            response = requests.get(source, headers=headers, timeout=30)
            return response.content


@tracer.capture_method(capture_response=False)
def upload_file(flow_id: str, data: bytes) -> dict:
    """Uploads a file to the TAMS API"""
    logger.info("Requesting pre-signed PUT URL...")
    get_url = requests.post(
        f"{endpoint}/flows/{flow_id}/storage",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {creds.token()}",
        },
        data=json.dumps({"limit": 1}),
        timeout=30,
    )
    try:
        get_url.raise_for_status()
        logger.info(f"Response status: {get_url.status_code}")
    except requests.exceptions.HTTPError as ex:
        if ex.response.status_code == 404:
            logger.error(ex.response.text)
            return None
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
def post_segment(flow_id: str, object_id: str, timerange: str) -> bool:
    """Register the segment with the TAMS API"""
    segment = {
        "object_id": object_id,
        "timerange": timerange,
    }
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
    file_data = get_file(message["uri"], message.get("byterange", None))
    if not file_data:
        raise ValueError(f'Unable to read source file {message["uri"]}')
    media_object = upload_file(flow_id, file_data)
    if media_object is None:
        raise ValueError(f"Unable to upload file to flow {flow_id}")
    if media_object["put_url"]["content-type"].split("/")[0] == "image":
        message["timerange"] = f'{message["timerange"].split("_")[0]}]'
    post_result = post_segment(flow_id, media_object["object_id"], message["timerange"])
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
