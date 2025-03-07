import json
import os
from collections import deque
from datetime import datetime
from http import HTTPStatus

import boto3
import requests
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import (
    APIGatewayHttpResolver,
    CORSConfig,
    Response,
)
from aws_lambda_powertools.event_handler.exceptions import (
    InternalServerError,
    ServiceError,
)
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext
from mediatimestamp.immutable import TimeRange
from openid_auth import Credentials

tracer = Tracer()
logger = Logger()
app = APIGatewayHttpResolver(cors=CORSConfig())

ssm = boto3.client("ssm")
endpoint = os.environ["TAMS_ENDPOINT"]
creds = Credentials(
    token_url=os.environ["TOKEN_URL"],
    user_pool_id=os.environ["USER_POOL_ID"],
    client_id=os.environ["CLIENT_ID"],
    scopes=["tams-api/read"],
)
default_hls_segments = os.environ["DEFAULT_HLS_SEGMENTS"]
codec_parameter = os.environ["CODEC_PARAMETER"]


@tracer.capture_method(capture_response=False)
def map_codec(codec):
    get_parameter = ssm.get_parameter(Name=codec_parameter)["Parameter"]
    codecs = json.loads(get_parameter["Value"])
    for c in codecs:
        if codec == c["tams"]:
            return c["hls"]
        if codec == c["hls"]:
            return c["tams"]
    # If TAMS codec supplied parse the mime type and return the second section
    if "/" in codec:
        return codec.split("/")[-1]
    # If no match found return input value
    return codec


@tracer.capture_method(capture_response=False)
def get_avc_codec_string(width, height, fps):
    try:
        # Resolution breakpoints with their corresponding levels
        RESOLUTION_LEVELS = [
            ((3840, 2160), lambda fps: "32"),  # 4K - Level 5.0
            (
                (1920, 1080),
                lambda fps: "2c" if fps > 30 else "28",
            ),  # 1080p - Level 4.4 or 4.0
            ((1280, 720), lambda fps: "1f"),  # 720p - Level 3.1
            ((720, 576), lambda fps: "1f"),  # SD - Level 3.1
            ((352, 288), lambda fps: "1f"),  # CIF - Level 3.1
            ((0, 0), lambda fps: "1f"),  # Fallback - Level 3.1
        ]
        # Find the first resolution breakpoint that matches
        level = next(
            level_func(fps)
            for (max_width, max_height), level_func in RESOLUTION_LEVELS
            if width >= max_width or height >= max_height
        )
        return f".6400{level}"
    # pylint: disable=broad-exception-caught
    except Exception:
        return ".64001f"  # Level 3.1 as minimum default


@tracer.capture_method(capture_response=False)
def get_source(source_id):
    get = requests.get(
        f"{endpoint}/sources/{source_id}",
        headers={
            "Authorization": f"Bearer {creds.token()}",
        },
        timeout=30,
    )
    get.raise_for_status()
    return get.json()


@tracer.capture_method(capture_response=False)
def get_flow(flow_id):
    get = requests.get(
        f"{endpoint}/flows/{flow_id}?include_timerange=true",
        headers={
            "Authorization": f"Bearer {creds.token()}",
        },
        timeout=30,
    )
    get.raise_for_status()
    return get.json()


@tracer.capture_method(capture_response=False)
def get_flows(source_id):
    get = requests.get(
        f"{endpoint}/flows?source_id={source_id}",
        headers={
            "Authorization": f"Bearer {creds.token()}",
        },
        timeout=30,
    )
    get.raise_for_status()
    return get.json()


@tracer.capture_method(capture_response=False)
def get_collected_flows(flows):
    flows_queue = deque(flows)
    flows = {"video_flows": [], "audio_flows": []}
    while flows_queue:
        flow = flows_queue.pop()
        # Check if flow is marked as exclude
        if flow.get("tags", {}).get("hls_exclude", "false").lower() == "true":
            continue
        elif "flow_collection" in flow:
            for collected in flow["flow_collection"]:
                flows_queue.append(get_flow(collected["id"]))
        elif flow["format"] == "urn:x-nmos:format:video":
            flows["video_flows"].append(flow)
        elif flow["format"] == "urn:x-nmos:format:audio":
            flows["audio_flows"].append(flow)
    return flows["video_flows"], flows["audio_flows"]


@tracer.capture_method(capture_response=False)
def get_collection_hls(flows):
    video_flows, audio_flows = get_collected_flows(flows)
    video_flows.sort(key=lambda k: k["max_bit_rate"], reverse=True)
    m3u8_content = "#EXTM3U\n"
    m3u8_content += "#EXT-X-VERSION:3\n"
    m3u8_content += "#EXT-X-INDEPENDENT-SEGMENTS\n"
    audio_codec = map_codec(audio_flows[0]["codec"]) if audio_flows else None
    for flow in video_flows:
        width = flow["essence_parameters"]["frame_width"]
        height = flow["essence_parameters"]["frame_height"]
        frame_rate = flow["essence_parameters"]["frame_rate"]["numerator"] / flow[
            "essence_parameters"
        ]["frame_rate"].get("denominator", 1)
        codecs = map_codec(flow["codec"])
        if codecs.startswith("avc1"):
            codecs += get_avc_codec_string(width, height, frame_rate)
        if audio_codec:
            codecs += ",{audio_codec}"
        m3u8_content += f'#EXT-X-STREAM-INF:BANDWIDTH={flow["max_bit_rate"]},AVERAGE-BANDWIDTH={flow["avg_bit_rate"]},CODECS="{codecs}",RESOLUTION={flow["essence_parameters"]["frame_width"]}x{flow["essence_parameters"]["frame_height"]},FRAME-RATE={frame_rate:.3f}'
        if audio_codec:
            m3u8_content += ',AUDIO="audio"'
        m3u8_content += "\n"
        m3u8_content += f'/flows/{flow["id"]}/output.m3u8\n'
    for i, flow in enumerate(audio_flows):
        m3u8_content += f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="{flow["description"]}",DEFAULT={"YES" if i == 0 else "NO"},AUTOSELECT=YES,CHANNELS="{flow["essence_parameters"]["channels"]}",URI="/flows/{flow["id"]}/output.m3u8"\n'
    return m3u8_content


@app.get("/sources/<sourceId>/output.m3u8")
@tracer.capture_method(capture_response=False)
def get_source_hls(sourceId: str):
    source = get_source(sourceId)
    if source.get("tags", {}).get("hls_exclude", "false").lower() == "true":
        raise ServiceError(
            HTTPStatus.NOT_ACCEPTABLE, "Source is tagged as hls_exclude"
        )  # 406
    try:
        flows = get_flows(sourceId)
        m3u8_content = get_collection_hls(flows)
        return Response(
            status_code=HTTPStatus.OK.value,  # 200
            content_type="application/vnd.apple.mpegurl",
            body=m3u8_content,
        )
    except Exception as e:
        logger.warning(e)
        raise InternalServerError(
            "Unable to generate HLS manifest, check server logs for details."
        ) from e  # HTTP 500


@app.get("/flows/<flowId>/output.m3u8")
@tracer.capture_method(capture_response=False)
def get_flow_hls(flowId: str):
    flow = get_flow(flowId)
    if flow.get("tags", {}).get("hls_exclude", "false").lower() == "true":
        raise ServiceError(
            HTTPStatus.NOT_ACCEPTABLE, "Flow is tagged as hls_exclude"
        )  # 406
    try:
        if "flow_collection" in flow and len(flow["flow_collection"]) > 0:
            m3u8_content = get_collection_hls(
                get_flow(collected["id"]) for collected in flow["flow_collection"]
            )
        else:
            flow = get_flow(flowId)
            flow_created_epoch = datetime.strptime(
                flow["created"], "%Y-%m-%dT%H:%M:%SZ"
            ).timestamp()
            flow_segment_duration = flow.get(
                "segment_duration", {"numerator": 0, "denominator": 1}
            )
            flow_segment_duration_float = (
                flow_segment_duration["numerator"]
                / flow_segment_duration["denominator"]
            )
            hls_segment_count = float(
                flow.get("tags", {}).get("hls_segments", default_hls_segments)
            )
            flow_ingesting = flow.get("tags", {}).get("flow_status", "") == "ingesting"
            limit_query = (
                f"&limit={int(hls_segment_count)}"
                if hls_segment_count != float("inf")
                else ""
            )
            get_segments = requests.get(
                f"{endpoint}/flows/{flowId}/segments?reverse_order=true{limit_query}",
                headers={
                    "Authorization": f"Bearer {creds.token()}",
                },
                timeout=30,
            )
            get_segments.raise_for_status()
            segments = get_segments.json()
            while "next" in get_segments.links and len(segments) < hls_segment_count:
                get_segments = requests.get(
                    get_segments.links["next"]["url"],
                    headers={
                        "Authorization": f"Bearer {creds.token()}",
                    },
                    timeout=30,
                )
                get_segments.raise_for_status()
                segments.extend(get_segments.json())
            hls_segments = segments[
                0 : (
                    len(segments)
                    if hls_segment_count == float("inf")
                    else int(hls_segment_count)
                )
            ][::-1]
            media_sequence = 1
            first_segment_timestamp = TimeRange.from_str(hls_segments[0]["timerange"])
            target_duration = (
                first_segment_timestamp.length.to_unix_float()
            )  # Assuming target duration from the first segment only.
            if flow_segment_duration_float > 0:
                media_sequence = int(
                    (first_segment_timestamp.start.to_float() - flow_created_epoch)
                    / flow_segment_duration_float
                )
            program_date_time = datetime.fromtimestamp(
                first_segment_timestamp.start.to_float()
            ).strftime("%Y-%m-%dT%H:%M:%S.%f")
            m3u8_content = "#EXTM3U\n"
            m3u8_content += "#EXT-X-VERSION:3\n"
            m3u8_content += f"#EXT-X-TARGETDURATION:{target_duration}\n"
            m3u8_content += f"#EXT-X-MEDIA-SEQUENCE:{media_sequence}\n"
            m3u8_content += f"#EXT-X-PROGRAM-DATE-TIME:{program_date_time[:-3]}+00:00\n"
            if not flow_ingesting:
                m3u8_content += "#EXT-X-PLAYLIST-TYPE:VOD\n"
            else:
                m3u8_content += "#EXT-X-PLAYLIST-TYPE:EVENT\n"
            prev_ts_offset = ""
            for segment in hls_segments:
                presigned_urls = [
                    get_url["url"]
                    for get_url in segment["get_urls"]
                    if "s3.presigned" in get_url["label"]
                ]
                segment_duration = TimeRange.from_str(
                    segment["timerange"]
                ).length.to_unix_float()
                ts_offset = segment.get("ts_offset", "")
                if prev_ts_offset != ts_offset:
                    m3u8_content += "#EXT-X-DISCONTINUITY\n"
                    prev_ts_offset = ts_offset
                m3u8_content += f"#EXTINF:{segment_duration},\n"
                m3u8_content += f"{presigned_urls[0]}\n"
            if not flow_ingesting:
                m3u8_content += "#EXT-X-ENDLIST\n"
        return Response(
            status_code=HTTPStatus.OK.value,  # 200
            content_type="application/vnd.apple.mpegurl",
            body=m3u8_content,
        )
    except Exception as e:
        logger.warning(e)
        raise InternalServerError(
            "Unable to generate HLS manifest, check server logs for details."
        ) from e  # HTTP 500


@logger.inject_lambda_context(
    log_event=True, correlation_id_path=correlation_paths.API_GATEWAY_HTTP
)
@tracer.capture_lambda_handler(capture_response=False)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
