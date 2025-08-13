import json
import os
from collections import defaultdict
from http import HTTPStatus

import boto3
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import APIGatewayHttpResolver, CORSConfig
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

tracer = Tracer()
logger = Logger()
app = APIGatewayHttpResolver(cors=CORSConfig())

events = boto3.client("events")
sfn = boto3.client("stepfunctions")
queue_arn = os.environ["QUEUE_ARN"]
ffmpeg_batch_arn = os.environ["FFMPEG_BATCH_ARN"]
ffmpeg_export_arn = os.environ["FFMPEG_EXPORT_ARN"]
ffmpeg_rule_arn = os.environ["FFMPEG_RULE_ARN"]
event_bus_name = os.environ["EVENT_BUS_NAME"]
rule_id_prefix = "ffmpeg-flow-segments-"


@app.get("/ffmpeg-rules")
@tracer.capture_method(capture_response=False)
def list_ffmpeg_rules():
    rules = get_rule_names()
    rule_targets = [
        {
            "id": rule[len(rule_id_prefix) :],
            "targets": [parse_rule_target(target) for target in get_rule_targets(rule)],
        }
        for rule in rules
    ]
    return rule_targets


@app.put("/ffmpeg-rules/<flowId>/<outputFlowId>")
@tracer.capture_method(capture_response=False)
def put_ffmpeg_rule(flowId: str, outputFlowId: str):
    requestBody = json.loads(app.current_event.body)
    rule_name = f"{rule_id_prefix}{flowId}"
    rules = get_rule_names()
    start_execution = sfn.start_sync_execution(
        stateMachineArn=ffmpeg_rule_arn,
        input=json.dumps(
            {
                "inputFlow": flowId,
                "createRule": rule_name not in rules,
                "ruleName": rule_name,
                "outputFlowId": outputFlowId,
                "requestBody": requestBody,
            }
        ),
    )
    print(start_execution)
    return None, HTTPStatus.CREATED.value


@app.delete("/ffmpeg-rules/<flowId>/<outputFlowId>")
@tracer.capture_method(capture_response=False)
def delete_ffmpeg_rule(flowId: str, outputFlowId: str):
    rule_name = f"{rule_id_prefix}{flowId}"
    events.remove_targets(
        Rule=rule_name,
        EventBusName=event_bus_name,
        Ids=[outputFlowId],
    )
    targets = get_rule_targets(rule_name)
    if len(targets) == 0:
        events.delete_rule(
            Name=rule_name,
            EventBusName=event_bus_name,
        )
    return None, HTTPStatus.NO_CONTENT.value


@app.get("/ffmpeg-jobs")
@tracer.capture_method(capture_response=False)
def list_ffmpeg_jobs():
    flow_jobs = defaultdict(list)
    for execution_arn in get_executions(ffmpeg_batch_arn):
        input_flow, job_target = get_job_details(execution_arn)
        flow_jobs[input_flow].append(job_target)
    return [
        {"id": flow_id, "targets": targets} for flow_id, targets in flow_jobs.items()
    ]


@app.get("/ffmpeg-exports")
@tracer.capture_method(capture_response=False)
def list_ffmpeg_exports():
    return [
        get_export_details(execution_arn)
        for execution_arn in get_executions(ffmpeg_export_arn)
    ]


@logger.inject_lambda_context(
    log_event=True, correlation_id_path=correlation_paths.API_GATEWAY_HTTP
)
@tracer.capture_lambda_handler(capture_response=False)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)


@tracer.capture_method(capture_response=False)
def get_rule_names():
    list_rules = events.list_rule_names_by_target(
        TargetArn=queue_arn, EventBusName=event_bus_name
    )
    rules = list_rules["RuleNames"]
    while "NextToken" in list_rules:
        list_rules = events.list_rule_names_by_target(
            TargetArn=queue_arn,
            EventBusName=event_bus_name,
            NextToken=list_rules["NextToken"],
        )
        rules.extend(list_rules["RuleNames"])
    return rules


@tracer.capture_method(capture_response=False)
def get_rule_targets(rule_name):
    list_targets = events.list_targets_by_rule(
        Rule=rule_name,
        EventBusName=event_bus_name,
    )
    targets = list_targets["Targets"]
    while "NextToken" in list_targets:
        list_targets = events.list_targets_by_rule(
            Rule=rule_name,
            EventBusName=event_bus_name,
            NextToken=list_targets["NextToken"],
        )
        targets.extend(list_targets["Targets"])
    return targets


@tracer.capture_method(capture_response=False)
def parse_rule_target(target):
    input_template = json.loads(
        target.get("InputTransformer", {})
        .get("InputTemplate", "")
        .replace("<segments>", '"<segments>"')
    )
    for attr in ("segments", "outputBucket", "outputPrefix"):
        input_template.pop(attr, None)
    return input_template


@tracer.capture_method(capture_response=False)
def get_executions(state_machine_arn):
    list_executions = sfn.list_executions(stateMachineArn=state_machine_arn)
    for execution in list_executions["executions"]:
        yield execution["executionArn"]
    while "NextToken" in list_executions:
        list_executions = sfn.list_executions(
            stateMachineArn=state_machine_arn,
            NextToken=list_executions["NextToken"],
        )
        for execution in list_executions["executions"]:
            yield execution["executionArn"]


@tracer.capture_method(capture_response=False)
def get_job_details(execution_arn):
    describe_execution = sfn.describe_execution(executionArn=execution_arn)
    job_input = json.loads(describe_execution["input"])
    return job_input["inputFlow"], {
        "executionArn": describe_execution["executionArn"],
        "status": describe_execution["status"],
        "startDate": describe_execution["startDate"].strftime("%Y-%m-%d %H:%M:%S"),
        "stopDate": (
            describe_execution["stopDate"].strftime("%Y-%m-%d %H:%M:%S")
            if describe_execution.get("stopDate")
            else ""
        ),
        "sourceTimerange": job_input["sourceTimerange"],
        "ffmpeg": job_input["ffmpeg"],
        "outputFlow": job_input["outputFlow"],
    }


@tracer.capture_method(capture_response=False)
def get_export_details(execution_arn):
    describe_execution = sfn.describe_execution(executionArn=execution_arn)
    job_input = json.loads(describe_execution["input"])
    return {
        "executionArn": describe_execution["executionArn"],
        "status": describe_execution["status"],
        "startDate": describe_execution["startDate"].strftime("%Y-%m-%d %H:%M:%S"),
        "stopDate": (
            describe_execution["stopDate"].strftime("%Y-%m-%d %H:%M:%S")
            if describe_execution.get("stopDate")
            else ""
        ),
        "timerange": job_input.get("timerange", ""),
        "flowIds": job_input.get("flowIds", []),
        "ffmpeg": job_input.get("ffmpeg", {}),
        "output": json.loads(describe_execution.get("output", "{}")).get(
            "s3Object", {}
        ),
    }
