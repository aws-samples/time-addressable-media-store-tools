import json
import os
from urllib.parse import urlparse

import boto3
import requests
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.utilities.typing import LambdaContext
from botocore.exceptions import ClientError
from openid_auth import Credentials

tracer = Tracer()
logger = Logger()

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
            response = s3.get_object(**params)
            return response["Body"].read()
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
            logger.error(ex)
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
            logger.error(ex)
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


@logger.inject_lambda_context(log_event=True)
@tracer.capture_lambda_handler(capture_response=False)
# pylint: disable=unused-argument
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    for record in event.get("Records", []):
        if record.get("eventSource", "") == "aws:sqs":
            message = json.loads(record["body"])
            flow_id = message["flowId"]
            media_object = upload_file(
                flow_id, get_file(message["uri"], message.get("byterange", None))
            )
            if media_object is None:
                logger.error(f"Unable to upload file to flow {flow_id}")
                continue
            if media_object["put_url"]["content-type"].split("/")[0] == "image":
                message["timerange"] = f'{message["timerange"].split("_")[0]}]'
            post_result = post_segment(
                flow_id, media_object["object_id"], message["timerange"]
            )
            if not post_result:
                logger.error(f"Unable to post segment to flow {flow_id}")
                continue
            if message.get("deleteSource", False):
                delete_s3_file(message["uri"])
