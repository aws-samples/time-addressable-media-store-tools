import os
import json
from datetime import datetime
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
eb = boto3.client("events")
queue_url = os.environ["QUEUE_URL"]
event_bus_name = os.environ["EVENT_BUS_NAME"]


@tracer.capture_method(capture_response=False)
def segments_added(event):
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
        # Copy all segment fields except get_urls (which is source-store specific)
        message_body = {k: v for k, v in segment.items() if k != "get_urls"}
        # Add/override operational fields
        message_body.update({
            "flowId": event["flow_id"],
            "uri": urls[0],
            "deleteSource": False,
        })
        entries.append(
            {"Id": message_body["objectId"], "MessageBody": json.dumps(message_body)}
        )
    if len(entries) == 0:
        # Only send messages if messages exist
        return
    sqs.send_message_batch(QueueUrl=queue_url, Entries=entries)


@tracer.capture_method(capture_response=False)
def put_event(path_id, payload):
    eb.put_events(
        Entries=[
            {
                "EventBusName": event_bus_name,
                "Time": datetime.fromisoformat(payload["event_timestamp"]),
                "Source": "replication",
                "DetailType": payload["event_type"],
                "Detail": json.dumps(payload["event"]),
                "Resources": [path_id],
            },
        ],
    )


@app.post("/<id>")
@tracer.capture_method(capture_response=False)
def process_webhook_event(
    payload: Annotated[dict, Body()], path_id: Annotated[str, Path(alias="id")]
):
    match payload["event_type"]:
        case "flows/segments_added":
            segments_added(payload["event"])
        case _:
            put_event(path_id, payload)


@logger.inject_lambda_context(
    log_event=True, correlation_id_path=correlation_paths.API_GATEWAY_REST
)
@tracer.capture_lambda_handler(capture_response=False)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
