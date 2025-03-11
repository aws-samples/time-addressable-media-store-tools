import json
import os
from urllib.parse import urlparse

import boto3
import requests
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.utilities.typing import LambdaContext
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
    get_url.raise_for_status()
    logger.info(f"Response status: {get_url.status_code}")
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
def post_segment(flow_id: str, object_id: str, timerange: str) -> None:
    """Register the segment with the TAMS API"""
    segment = {
        "object_id": object_id,
        "timerange": timerange,
    }
    logger.info("Posting segment to TAMS...")
    response = requests.post(
        f"{endpoint}/flows/{flow_id}/segments",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {creds.token()}",
        },
        data=json.dumps(segment),
        timeout=30,
    )
    response.raise_for_status()
    logger.info(f"Response status: {response.status_code}")


@logger.inject_lambda_context(log_event=True)
@tracer.capture_lambda_handler(capture_response=False)
# pylint: disable=unused-argument
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    for record in event["Records"]:
        message = json.loads(record["body"])
        flow_id = message["flow_id"]
        object_id = upload_file(flow_id, get_file(message["uri"]))["object_id"]
        post_segment(flow_id, object_id, message["timerange"])
