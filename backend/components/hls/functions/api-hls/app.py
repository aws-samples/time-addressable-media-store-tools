import json
import os
from collections import defaultdict, deque
from datetime import datetime
from functools import lru_cache
from http import HTTPStatus

import boto3
import m3u8
import requests
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import (
    APIGatewayHttpResolver,
    CORSConfig,
    Response,
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


@lru_cache()
def get_codec_mappings():
    get_parameter = ssm.get_parameter(Name=codec_parameter)["Parameter"]
    codecs_list = json.loads(get_parameter["Value"])
    return {codec["tams"]: codec["hls"] for codec in codecs_list}


@tracer.capture_method(capture_response=False)
def map_codec(flow):
    codec = flow["codec"]
    essence_parameters = flow.get("essence_parameters", {})
    codec_mappings = get_codec_mappings()
    mapped_codec = codec_mappings.get(codec, codec.split("/")[-1])
    essence_parameter_handlers = {
        "avc1": get_avc1_codec_string,
        "mp4a": get_mp4a_codec_string,
    }
    return essence_parameter_handlers.get(mapped_codec, lambda x: mapped_codec)(
        essence_parameters
    )


@tracer.capture_method(capture_response=False)
def get_avc1_codec_string(essence_parameters):
    avc_parameters = essence_parameters.get("avc_parameters", {})
    profile = f'{avc_parameters.get("profile", 100):02x}'
    flags = f'{avc_parameters.get("flags", 00):02x}'
    level = f'{avc_parameters.get("level", 31):02x}'
    return f"avc1.{profile}{flags}{level}"


@tracer.capture_method(capture_response=False)
def get_mp4a_codec_string(essence_parameters):
    codec_parameters = essence_parameters.get("avc_parameters", {})
    oti = hex(codec_parameters.get("mp4_oti", 64))[2:]
    return f"mp4a.{oti}.2"


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
def get_segments(flow_id, segment_count):
    limit_query = (
        f"&limit={int(segment_count)}" if segment_count != float("inf") else ""
    )
    get = requests.get(
        f"{endpoint}/flows/{flow_id}/segments?reverse_order=true{limit_query}",
        headers={
            "Authorization": f"Bearer {creds.token()}",
        },
        timeout=30,
    )
    get.raise_for_status()
    count = 0
    for segment in get.json():
        count += 1
        yield segment
        if count >= segment_count:
            break
    while "next" in get.links and count < segment_count:
        get = requests.get(
            get.links["next"]["url"],
            headers={
                "Authorization": f"Bearer {creds.token()}",
            },
            timeout=30,
        )
        get.raise_for_status()
        for segment in get.json():
            count += 1
            yield segment
            if count >= segment_count:
                break


@tracer.capture_method(capture_response=False)
def get_collected_flows(flows):
    flows_queue = deque(flows)
    flows_dict = defaultdict(list)
    while flows_queue:
        flow = flows_queue.pop()
        # Check if flow is marked as exclude
        if flow.get("tags", {}).get("hls_exclude", "false").lower() == "true":
            continue
        elif flow.get("flow_collection"):
            for collected in flow["flow_collection"]:
                # Only add it if not already processed to avoid duplicates and loops
                if collected["id"] not in set(
                    v["id"] for ft in flows_dict.values() for v in ft
                ):
                    flows_queue.append(get_flow(collected["id"]))
        else:
            flows_dict[flow["format"].split(":")[3]].append(flow)
    return flows_dict


@tracer.capture_method(capture_response=False)
def get_collection_hls(video_flows, audio_flows):
    domain_name = app.current_event.request_context.domain_name
    video_flows.sort(key=lambda k: k["max_bit_rate"], reverse=True)
    manifest = m3u8.M3U8()
    manifest.version = 4
    manifest.is_independent_segments = True
    first_audio = None
    # Use Stream for Audio if no Video present
    if len(video_flows) == 0:
        for flow in audio_flows:
            manifest.add_playlist(
                m3u8.Playlist(
                    stream_info={
                        "bandwidth": flow["max_bit_rate"],
                        "average_bandwidth": flow["avg_bit_rate"],
                        "codecs": map_codec(flow),
                    },
                    uri=f'https://{domain_name}/flows/{flow["id"]}/segments/manifest.m3u8',
                    media=m3u8.MediaList([]),
                    base_uri=None,
                )
            )
        return manifest.dumps()
    # Use Media for Audio if Video present
    for i, flow in enumerate(audio_flows):
        media = m3u8.Media(
            type="AUDIO",
            group_id="audio",
            name=flow["description"],
            default="YES" if i == 0 else "NO",
            autoselect="YES",
            channels=flow["essence_parameters"]["channels"],
            uri=f'https://{domain_name}/flows/{flow["id"]}/segments/manifest.m3u8',
            codecs=map_codec(flow),
        )
        if i == 0:
            first_audio = media
        manifest.add_media(media)
    for flow in video_flows:
        width = flow["essence_parameters"]["frame_width"]
        height = flow["essence_parameters"]["frame_height"]
        frame_rate = flow["essence_parameters"]["frame_rate"]["numerator"] / flow[
            "essence_parameters"
        ]["frame_rate"].get("denominator", 1)
        codecs = map_codec(flow)
        if first_audio:
            codecs += f",{first_audio.extras["codecs"]}"
        manifest.add_playlist(
            m3u8.Playlist(
                stream_info={
                    "bandwidth": flow["max_bit_rate"],
                    "average_bandwidth": flow["avg_bit_rate"],
                    "codecs": codecs,
                    "resolution": f"{width}x{height}",
                    "frame_rate": frame_rate,
                    "audio": first_audio.group_id if first_audio else None,
                },
                uri=f'https://{domain_name}/flows/{flow["id"]}/segments/manifest.m3u8',
                media=m3u8.MediaList([first_audio] if first_audio else []),
                base_uri=None,
            )
        )
    return manifest.dumps()


@app.get("/sources/<sourceId>/manifest.m3u8")
@tracer.capture_method(capture_response=False)
def get_source_hls(sourceId: str):
    manifest = m3u8.M3U8()
    manifest.version = 4
    try:
        flows = get_flows(sourceId)
        flows_dict = get_collected_flows(flows)
        m3u8_content = get_collection_hls(flows_dict["video"], flows_dict["audio"])
        return Response(
            status_code=HTTPStatus.OK.value,  # 200
            content_type="application/vnd.apple.mpegurl",
            body=m3u8_content,
        )
    # pylint: disable=broad-exception-caught
    except Exception as ex:
        logger.error(ex)
    return Response(
        status_code=HTTPStatus.OK.value,  # 200
        content_type="application/vnd.apple.mpegurl",
        body=manifest.dumps(),
    )


@app.get("/flows/<flowId>/manifest.m3u8")
@tracer.capture_method(capture_response=False)
def get_flow_hls(flowId: str):
    manifest = m3u8.M3U8()
    manifest.version = 4
    try:
        flow = get_flow(flowId)
        flows = []
        if flow.get("container"):
            flows.append(get_flow(flowId))
        if flow.get("flow_collection"):
            flows.extend(
                [get_flow(collected["id"]) for collected in flow["flow_collection"]]
            )
        flows_dict = get_collected_flows(flows)
        m3u8_content = get_collection_hls(flows_dict["video"], flows_dict["audio"])
        return Response(
            status_code=HTTPStatus.OK.value,  # 200
            content_type="application/vnd.apple.mpegurl",
            body=m3u8_content,
        )
    # pylint: disable=broad-exception-caught
    except Exception as ex:
        logger.error(ex)
    return Response(
        status_code=HTTPStatus.OK.value,  # 200
        content_type="application/vnd.apple.mpegurl",
        body=manifest.dumps(),
    )


@app.get("/flows/<flowId>/segments/manifest.m3u8")
@tracer.capture_method(capture_response=False)
def get_segments_hls(flowId: str):
    manifest = m3u8.M3U8()
    manifest.version = 4
    try:
        flow = get_flow(flowId)
        flow_created_epoch = datetime.strptime(
            flow["created"], "%Y-%m-%dT%H:%M:%SZ"
        ).timestamp()
        flow_segment_duration = flow.get(
            "segment_duration", {"numerator": 0, "denominator": 1}
        )
        flow_segment_duration_float = flow_segment_duration[
            "numerator"
        ] / flow_segment_duration.get("denominator", 1)
        hls_segment_count = float(
            flow.get("tags", {}).get("hls_segments", default_hls_segments)
        )
        flow_ingesting = flow.get("tags", {}).get("flow_status", "") == "ingesting"
        segments = list(get_segments(flowId, hls_segment_count))[
            ::-1
        ]  # Need to reverse segments for correct playing order
        first_segment_timestamp = TimeRange.from_str(segments[0]["timerange"])
        if (
            flow_segment_duration_float > 0
        ):  # Zero value would be where Flow does not have segment_duration specified
            manifest.target_duration = flow_segment_duration_float
        if flow_ingesting:
            manifest.media_sequence = int(
                (first_segment_timestamp.start.to_float() - flow_created_epoch)
                / flow_segment_duration_float
            )
        else:
            manifest.media_sequence = 1
        manifest.program_date_time = f'{datetime.fromtimestamp(first_segment_timestamp.start.to_float()).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3]}+00:00'
        manifest.playlist_type = "EVENT" if flow_ingesting else "VOD"
        prev_ts_offset = ""
        for segment in segments:
            presigned_urls = [
                get_url["url"]
                for get_url in segment["get_urls"]
                if "s3.presigned" in get_url["label"]
            ]
            segment_duration = TimeRange.from_str(
                segment["timerange"]
            ).length.to_unix_float()
            ts_offset = segment.get("ts_offset", "")
            manifest.add_segment(
                segment=m3u8.Segment(
                    duration=segment_duration,
                    uri=f"{presigned_urls[0]}",
                    discontinuity=(prev_ts_offset != ts_offset),
                )
            )
            prev_ts_offset = ts_offset
        if not flow_ingesting:
            manifest.is_endlist = True
    # pylint: disable=broad-exception-caught
    except Exception as ex:
        logger.error(ex)
    return Response(
        status_code=HTTPStatus.OK.value,  # 200
        content_type="application/vnd.apple.mpegurl",
        body=manifest.dumps(),
    )


@logger.inject_lambda_context(
    log_event=True, correlation_id_path=correlation_paths.API_GATEWAY_HTTP
)
@tracer.capture_lambda_handler(capture_response=False)
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    return app.resolve(event, context)
