import json
import os
from http import HTTPStatus

import boto3
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, CORSConfig
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

tracer = Tracer()
logger = Logger()
app = APIGatewayRestResolver(cors=CORSConfig())


@app.get("/job-ingestion")
@tracer.capture_method(capture_response=False)
def get_job_ingestions():
    mc = boto3.client("mediaconvert")
    paginator = mc.get_paginator("list_jobs")
    jobs = []
    for page in paginator.paginate(Queue=os.environ["MEDIACONVERT_QUEUE"]):
        for job in page["Jobs"]:
            list_tags = mc.list_tags_for_resource(Arn=job["Arn"])
            source_id = list_tags["ResourceTags"]["Tags"].get("source_id", None)
            trigger_key = list_tags["ResourceTags"]["Tags"].get("trigger_key", None)
            if source_id:
                jobs.append(
                    {
                        "Id": job["Id"],
                        "Status": job["Status"],
                        "Input": (
                            "/".join(trigger_key.split("/")[1:])
                            if trigger_key
                            else "/".join(
                                job["Settings"]["Inputs"][0]["FileInput"].split("/")[3:]
                            )
                        ),
                        "SourceId": source_id,
                        "JobPercentComplete": job.get("JobPercentComplete", None),
                    }
                )
    return (
        json.dumps(jobs),
        HTTPStatus.OK.value,
    )  # 200


@logger.inject_lambda_context(
    log_event=True, correlation_id_path=correlation_paths.API_GATEWAY_REST
)
@tracer.capture_lambda_handler(capture_response=False)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
