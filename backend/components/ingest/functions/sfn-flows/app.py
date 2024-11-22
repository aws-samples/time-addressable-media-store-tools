import json
import os
import uuid

import requests
from channel import Channel
from job import Job
from openid_auth import Credentials

endpoint = os.environ["TAMS_ENDPOINT"]
creds = Credentials(
    token_url=os.environ["TOKEN_URL"],
    user_pool_id=os.environ["USER_POOL_ID"],
    client_id=os.environ["CLIENT_ID"],
    scopes=["tams-api/write"],
)


def put_flow(flow):
    print(json.dumps(flow))
    put = requests.put(
        f'{endpoint}/flows/{flow["id"]}',
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {creds.token()}",
        },
        data=json.dumps(flow),
        timeout=30,
    )
    put.raise_for_status()
    print(put.status_code)
    print(json.dumps(put.json()))


def put_source_description(source_id, description):
    print(source_id, description)
    put = requests.put(
        f"{endpoint}/sources/{source_id}/description",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {creds.token()}",
        },
        data=json.dumps(description),
        timeout=30,
    )
    put.raise_for_status()
    print(put.status_code)


def process_multi_essence(
    multi_essence, label, description, event_id, source_ids, flows
):
    if multi_essence:
        flow = {
            "id": str(uuid.uuid4()),
            "source_id": event_id,
            "label": label,
            "description": description,
            "format": "urn:x-nmos:format:multi",
            "flow_collection": [
                {"id": f["id"], "role": f["format"].split(":")[-1]} for f in flows
            ],
        }
        put_flow(flow)
        for flow_format, source_id in source_ids.items():
            put_source_description(
                source_id, f'{description} - {flow_format.split(":")[-1]}'
            )
    else:
        put_source_description(event_id, description)


def create_tams(flows, event_id, label, description):
    formats = list(set([f["format"] for f in flows]))
    multi_essence = len(formats) > 1
    source_ids = {f: str(uuid.uuid4()) if multi_essence else event_id for f in formats}
    for flow in flows:
        flow["source_id"] = source_ids[flow["format"]]
        put_flow(flow)
    process_multi_essence(
        multi_essence, label, description, event_id, source_ids, flows
    )


# pylint: disable=unused-argument
def lambda_handler(event, context):
    print(json.dumps(event))
    if "ChannelId" in event:
        channel = Channel(event["ChannelId"])
        if not channel.dict:
            return
        flows, source_descriptions, parameters = channel.tams(
            event["Label"], event["Id"]
        )
        for flow in flows:
            put_flow(flow)
        for source_id, description in source_descriptions.items():
            put_source_description(source_id, description)
        return {"parameters": parameters}
    if "detail" in event and event.get("source", "") == "aws.s3":
        job = Job(
            event["detail"]["bucket"]["name"],
            event["detail"]["object"]["key"],
            event["Parameters"]["Id"],
            event["Parameters"]["ExecutionName"],
        )
        event["Parameters"][
            "CopiedUpload"
        ] = f'jobs/{event["Parameters"]["ExecutionName"]}/{job.base64_name}'
        if not job.spec:
            return
        flows, parameters = job.tams()
        create_tams(flows, event["Parameters"]["Id"], job.label, job.description)
        event["JobSpec"] = job.spec
        if job.error:
            event["Error"] = job.error.get("type", "")
            event["Cause"] = job.error.get("message", "")
        event["Flows"] = {"Parameters": parameters}
        return event
