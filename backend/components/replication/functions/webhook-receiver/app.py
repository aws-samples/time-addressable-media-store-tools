import os
import json
import boto3

from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.event_handler.openapi.params import Path, Body
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext
from typing_extensions import Annotated

tracer = Tracer()
logger = Logger()
app = APIGatewayRestResolver(enable_validation=True)

sqs = boto3.client("sqs")
queue_url = os.environ["QUEUE_URL"]


@app.post("/<id>")
@tracer.capture_method(capture_response=False)
def process_webhook_event(
    payload: Annotated[dict, Body()], _: Annotated[str, Path(alias="id")]
):
    if payload["event_type"] != "flows/segments_added":
        # Only process segments_added events received
        return
    event = payload["event"]
    entries = []
    for segment in event["segments"]:
        if not segment.get("get_urls"):
            # Skip if not get_urls are provided
            continue
        urls = [
            get_url["url"]
            for get_url in segment["get_urls"]
            if get_url.get("presigned", False)
        ]
        if len(urls) == 0:
            # Skip if no presigned urls are provided
            continue
        message_body = {
            "flowId": event["flow_id"],
            "timerange": segment["timerange"],
            "uri": urls[0],
            "deleteSource": False,
            "objectId": segment["object_id"],
        }
        entries.append(
            {"Id": message_body["objectId"], "MessageBody": json.dumps(message_body)}
        )
    if len(entries) == 0:
        # Only send messages if messages exist
        return
    sqs.send_message_batch(QueueUrl=queue_url, Entries=entries)
    return


@logger.inject_lambda_context(
    log_event=True, correlation_id_path=correlation_paths.API_GATEWAY_REST
)
@tracer.capture_lambda_handler(capture_response=False)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
