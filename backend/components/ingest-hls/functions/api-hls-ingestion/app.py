import os
from pathlib import Path
from urllib.parse import urlparse

import boto3
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import APIGatewayHttpResolver, CORSConfig
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext
from botocore.exceptions import ClientError

tracer = Tracer()
logger = Logger()
app = APIGatewayHttpResolver(cors=CORSConfig())

mc = boto3.client("mediaconvert")
ml = boto3.client("medialive")
s3 = boto3.client("s3")
sfn = boto3.client("stepfunctions")
state_machine_arn = os.environ["STATE_MACHINE_ARN"]
mediaconvert_queue = os.environ["MEDIACONVERT_QUEUE"]


@tracer.capture_method(capture_response=False)
def find_key_with_s3_value(obj, key):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key and v.lower().startswith("s3://"):
                yield v
            yield from find_key_with_s3_value(v, key)
    elif isinstance(obj, list):
        for item in obj:
            yield from find_key_with_s3_value(item, key)


@tracer.capture_method(capture_response=False)
def manifest_exists(uri):
    try:
        uri_parse = urlparse(uri)
        s3.head_object(
            Bucket=uri_parse.netloc,
            Key=uri_parse.path[1:],
        )
        return True
    except ClientError as ex:
        if ex.response["Error"]["Code"] == "404":
            return False
        raise ex


@app.get("/job-ingestion")
@tracer.capture_method(capture_response=False)
def get_job_ingestions():
    paginator = mc.get_paginator("list_jobs")
    jobs = []
    for page in paginator.paginate(Queue=mediaconvert_queue):
        for job in page["Jobs"]:
            first_input = (
                job.get("Settings", {}).get("Inputs", [{}])[0].get("FileInput", "")
            )
            destination_location = next(find_key_with_s3_value(job, "Destination"))
            input_file = os.path.basename(first_input)
            manifest_uri = f"{destination_location}{Path(input_file).stem}.m3u8"
            jobs.append(
                {
                    "id": job["Id"],
                    "fileName": input_file,
                    "manifestUri": manifest_uri,
                    "manifestExists": manifest_exists(manifest_uri),
                    "status": job["Status"],
                    "JobPercentComplete": job.get("JobPercentComplete", None),
                }
            )
    return jobs


@app.get("/channel-ingestion")
@tracer.capture_method(capture_response=False)
def get_channel_ingestions():
    paginator = ml.get_paginator("list_channels")
    channels = []
    for page in paginator.paginate():
        for channel in page["Channels"]:
            destination_location = next(find_key_with_s3_value(channel, "Url"))
            manifest_uri = f"{destination_location}.m3u8"
            channels.append(
                {
                    "id": channel["Id"],
                    "name": channel["Name"],
                    "manifestUri": manifest_uri,
                    "manifestExists": manifest_exists(manifest_uri),
                    "state": channel["State"],
                }
            )
    return channels


@app.get("/workflows")
@tracer.capture_method(capture_response=False)
def get_workflows():
    paginator = sfn.get_paginator("list_executions")
    workflows = []
    for page in paginator.paginate(stateMachineArn=state_machine_arn):
        for execution in page["executions"]:
            try:
                elemental_service, elemental_id = (
                    execution["name"].rsplit("-", 1)[0].split("-", 1)
                )
                workflows.append(
                    {
                        "executionArn": execution["executionArn"],
                        "elementalService": elemental_service,
                        "elementalId": elemental_id,
                        "status": execution["status"],
                        "startDate": execution["startDate"].strftime(
                            "%Y-%m-%dT%H:%M:%SZ"
                        ),
                        "stopDate": (
                            execution["stopDate"].strftime("%Y-%m-%dT%H:%M:%SZ")
                            if execution.get("stopDate")
                            else None
                        ),
                    }
                )
            # pylint: disable=broad-exception-caught
            except Exception as ex:
                logger.error(ex)
                continue
    return workflows


@logger.inject_lambda_context(
    log_event=True, correlation_id_path=correlation_paths.API_GATEWAY_HTTP
)
@tracer.capture_lambda_handler(capture_response=False)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
