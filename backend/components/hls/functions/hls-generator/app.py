import json
import os
from collections import defaultdict, deque
from datetime import datetime
from functools import lru_cache
from http import HTTPStatus
from urllib.parse import urlparse, quote

import boto3
import m3u8
import requests
from botocore.auth import SigV4QueryAuth
from botocore.awsrequest import AWSRequest
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.event_handler import LambdaFunctionUrlResolver, Response
from aws_lambda_powertools.utilities.typing import LambdaContext
from mediatimestamp.immutable import TimeRange
from openid_auth import Credentials

tracer = Tracer()
logger = Logger()
app = LambdaFunctionUrlResolver()

ssm = boto3.client("ssm")

endpoint = os.environ["TAMS_ENDPOINT"]
secret_arn = os.environ["SECRET_ARN"]
default_hls_segments = os.environ["DEFAULT_HLS_SEGMENTS"]
codec_parameter = os.environ["CODEC_PARAMETER"]


@lru_cache()
def get_creds():
    return Credentials(
        scopes=["tams-api/read"],
        secret_arn=secret_arn,
    )


@lru_cache()
def get_function_url():
    """Discover this Lambda's Function URL at runtime"""
    function_name = os.environ.get("AWS_LAMBDA_FUNCTION_NAME", "")
    if not function_name:
        return None
    try:
        lambda_client = boto3.client("lambda")
        response = lambda_client.get_function_url_config(FunctionName=function_name)
        return response.get("FunctionUrl")
    # pylint: disable=broad-exception-caught
    except Exception as ex:
        logger.warning("Could not get function URL")
        logger.exception(ex)
        return None


@tracer.capture_method(capture_response=False)
def get_signed_url(obj, expires_in=600):
    """Generate presigned URL for Lambda Function URL path"""
    function_url = get_function_url()
    if not function_url:
        raise RuntimeError(
            "Lambda Function URL is not configured or accessible; cannot generate signed URLs"
        )

    region = os.environ["AWS_REGION"]
    # Encode path segments but keep slashes
    encoded_obj = "/".join(quote(segment, safe="") for segment in obj.split("/"))
    full_url = f"{function_url.rstrip('/')}/{encoded_obj}"

    # Get credentials from Lambda execution role
    session = boto3.Session()
    credentials = session.get_credentials().get_frozen_credentials()

    # Create request for signing
    request = AWSRequest(method="GET", url=full_url)
    parsed = urlparse(full_url)
    request.headers["Host"] = parsed.netloc

    # Sign with query string auth (adds signature as URL params)
    SigV4QueryAuth(credentials, "lambda", region, expires=expires_in).add_auth(request)

    return request.url


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
    if codec not in codec_mappings:
        logger.warning(
            f"Flow '{flow.get('id', '?')}' has codec '{codec}' which is not mapped in HlsCodecsParameter; falling back to derived value"
        )
    mapped_codec = codec_mappings.get(codec, codec.split("/")[-1])
    essence_parameter_handlers = {
        "avc1": get_avc1_codec_string,
        "mp4a": get_mp4a_codec_string,
    }
    if mapped_codec not in essence_parameter_handlers:
        logger.warning(
            f"Flow '{flow.get('id', '?')}' mapped codec '{mapped_codec}' has no essence-parameter handler; emitting bare codec name"
        )
    return essence_parameter_handlers.get(mapped_codec, lambda x: mapped_codec)(
        essence_parameters
    )


@tracer.capture_method(capture_response=False)
def get_avc1_codec_string(essence_parameters):
    avc_parameters = essence_parameters.get("avc_parameters", {})
    missing = [
        key for key in ("profile", "flags", "level") if key not in avc_parameters
    ]
    if missing:
        logger.warning(
            f"avc1 essence parameters missing {missing}; using defaults (profile=100, flags=0, level=31)"
        )
    profile = f'{avc_parameters.get("profile", 100):02x}'
    flags = f'{avc_parameters.get("flags", 0):02x}'
    level = f'{avc_parameters.get("level", 31):02x}'
    return f"avc1.{profile}{flags}{level}"


@tracer.capture_method(capture_response=False)
def get_mp4a_codec_string(essence_parameters):
    codec_parameters = essence_parameters.get("codec_parameters", {})
    if "mp4_oti" not in codec_parameters:
        logger.warning(
            "mp4a codec_parameters missing 'mp4_oti'; using default (2 = AAC-LC)"
        )
    aot = codec_parameters.get("mp4_oti", 2)
    return f"mp4a.40.{aot}"


@tracer.capture_method(capture_response=False)
def get_hls_props(flow, flow_pos):
    prefix = "hls_"
    tagged_props = {
        k[len(prefix) :]: v
        for k, v in flow.get("tags", {}).items()
        if k.startswith(prefix)
        and k[len(prefix) :] in ["language", "name", "autoselect", "default", "forced"]
    }
    if "name" not in tagged_props:
        # Prefer the language tag if present; it's what users actually recognise in rendition pickers.
        # Fall back to description only as a last resort.
        tagged_props["name"] = tagged_props.get("language") or flow["description"]
    if "default" not in tagged_props:
        tagged_props["default"] = "YES" if flow_pos == 0 else "NO"
    if "autoselect" not in tagged_props:
        tagged_props["autoselect"] = "YES"
    return tagged_props


@tracer.capture_method(capture_response=False)
def get_flow(flow_id):
    get = requests.get(
        f"{endpoint}/flows/{flow_id}",
        headers={
            "Authorization": f"Bearer {get_creds().token()}",
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
            "Authorization": f"Bearer {get_creds().token()}",
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
            "Authorization": f"Bearer {get_creds().token()}",
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
                "Authorization": f"Bearer {get_creds().token()}",
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
    flows_by_id = {}
    visited = set()
    while flows_queue:
        flow = flows_queue.pop()
        if flow["id"] in visited:
            continue
        visited.add(flow["id"])
        flows_by_id[flow["id"]] = flow
        # Check if flow is marked as exclude
        if flow.get("tags", {}).get("hls_exclude", "false").lower() == "true":
            continue
        # A flow is a leaf (segment-owning) if it has a container. Classify it.
        # Flows without a container are pure collection wrappers (e.g. the top-level multi).
        if flow.get("container"):
            if flow["format"] == "urn:x-nmos:format:multi":
                flows_dict["muxed"].append(flow)
            elif (
                flow["format"] == "urn:x-nmos:format:data"
                and flow.get("essence_parameters", {}).get("data_type", "")
                == "urn:x-tams:data:subtitle"
            ):
                flows_dict["subtitle"].append(flow)
            else:
                flows_dict[flow["format"].split(":")[3]].append(flow)
        # Enqueue any collection members regardless of whether the parent was a leaf.
        # This is important for muxed-collapse: a single muxed multi can have both its
        # metadata-only V+A AND standalone subtitle/audio members in its flow_collection.
        if flow.get("flow_collection"):
            for collected in flow["flow_collection"]:
                if collected["id"] not in visited:
                    flows_queue.append(get_flow(collected["id"]))
    return flows_dict, flows_by_id


@tracer.capture_method(capture_response=False)
def get_collection_hls(
    video_flows, audio_flows, subtitle_flows, muxed_flows, flows_by_id
):
    # Sort by max_bit_rate descending (highest quality first)
    # TAMS spec: max_bit_rate is optional, default to 0 for flows without bit rate info
    video_flows.sort(key=lambda k: k.get("max_bit_rate", 0), reverse=True)
    manifest = m3u8.M3U8()
    manifest.version = 4
    manifest.is_independent_segments = True
    # Use Stream for Audio if no Video or Muxed present
    if len(video_flows) == 0 and len(muxed_flows) == 0:
        # Subtitles (if any) are rendered as #EXT-X-MEDIA:TYPE=SUBTITLES groups
        first_subtitle = None
        for i, flow in enumerate(subtitle_flows):
            media = m3u8.Media(
                **get_hls_props(flow, i),
                type="SUBTITLES",
                group_id="subs",
                uri=get_signed_url(f'flows/{flow["id"]}/segments/manifest.m3u8'),
            )
            if i == 0:
                first_subtitle = media
            manifest.add_media(media)
        for flow in audio_flows:
            # TAMS spec: max_bit_rate/avg_bit_rate are optional, default to 0
            stream_info = {
                "bandwidth": flow.get("max_bit_rate", 0),
                "average_bandwidth": flow.get("avg_bit_rate", 0),
                "codecs": map_codec(flow),
            }
            if first_subtitle:
                stream_info["subtitles"] = first_subtitle.group_id
            manifest.add_playlist(
                m3u8.Playlist(
                    stream_info=stream_info,
                    uri=get_signed_url(f'flows/{flow["id"]}/segments/manifest.m3u8'),
                    media=m3u8.MediaList(
                        [media for media in [first_subtitle] if media]
                    ),
                    base_uri=None,
                )
            )
        return manifest.dumps()
    # Use Media for Audio if Video present
    first_subtitle = None
    for i, flow in enumerate(subtitle_flows):
        media = m3u8.Media(
            **get_hls_props(flow, i),
            type="SUBTITLES",
            group_id="subs",
            uri=get_signed_url(f'flows/{flow["id"]}/segments/manifest.m3u8'),
        )
        if i == 0:
            first_subtitle = media
        manifest.add_media(media)
    # Use Media for Audio if Video present (but not for muxed content - audio is inside the segments)
    first_audio = None
    if len(muxed_flows) == 0:
        for i, flow in enumerate(audio_flows):
            media = m3u8.Media(
                **get_hls_props(flow, i),
                type="AUDIO",
                group_id="audio",
                channels=flow["essence_parameters"]["channels"],
                uri=get_signed_url(f'flows/{flow["id"]}/segments/manifest.m3u8'),
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
        # TAMS spec: max_bit_rate/avg_bit_rate are optional, default to 0
        stream_info = {
            "bandwidth": flow.get("max_bit_rate", 0),
            "average_bandwidth": flow.get("avg_bit_rate", 0),
            "codecs": codecs,
            "resolution": f"{width}x{height}",
            "frame_rate": frame_rate,
        }
        if first_audio:
            stream_info["audio"] = first_audio.group_id
        if first_subtitle:
            stream_info["subtitles"] = first_subtitle.group_id
        manifest.add_playlist(
            m3u8.Playlist(
                stream_info=stream_info,
                uri=get_signed_url(f'flows/{flow["id"]}/segments/manifest.m3u8'),
                media=m3u8.MediaList(
                    [media for media in [first_audio, first_subtitle] if media]
                ),
                base_uri=None,
            )
        )
    # Render muxed variants: one STREAM-INF per variant with multi-codec CODECS
    muxed_flows.sort(key=lambda k: k.get("max_bit_rate", 0), reverse=True)
    for flow in muxed_flows:
        # Resolve the per-essence flows referenced in flow_collection
        collected = [flows_by_id[c["id"]] for c in flow.get("flow_collection", [])]
        video_member = next(
            (f for f in collected if f["format"] == "urn:x-nmos:format:video"), None
        )
        audio_member = next(
            (f for f in collected if f["format"] == "urn:x-nmos:format:audio"), None
        )
        codec_parts = []
        if video_member:
            codec_parts.append(map_codec(video_member))
        if audio_member:
            codec_parts.append(map_codec(audio_member))
        codecs = ",".join(codec_parts)
        stream_info = {
            "bandwidth": flow.get("max_bit_rate", 0),
            "average_bandwidth": flow.get("avg_bit_rate", 0),
            "codecs": codecs,
        }
        if first_subtitle:
            stream_info["subtitles"] = first_subtitle.group_id
        if video_member:
            width = video_member["essence_parameters"]["frame_width"]
            height = video_member["essence_parameters"]["frame_height"]
            frame_rate_num = video_member["essence_parameters"]["frame_rate"][
                "numerator"
            ]
            frame_rate_den = video_member["essence_parameters"]["frame_rate"].get(
                "denominator", 1
            )
            stream_info["resolution"] = f"{width}x{height}"
            stream_info["frame_rate"] = frame_rate_num / frame_rate_den
        manifest.add_playlist(
            m3u8.Playlist(
                stream_info=stream_info,
                uri=get_signed_url(f'flows/{flow["id"]}/segments/manifest.m3u8'),
                media=m3u8.MediaList([media for media in [first_subtitle] if media]),
                base_uri=None,
            )
        )
    return manifest.dumps()


@app.get("/sources/<sourceId>/manifest.m3u8")
@tracer.capture_method(capture_response=False)
def get_source_hls(sourceId: str):
    try:
        flows = get_flows(sourceId)
        flows_dict, flows_by_id = get_collected_flows(flows)
        m3u8_content = get_collection_hls(
            flows_dict["video"],
            flows_dict["audio"],
            flows_dict["subtitle"],
            flows_dict["muxed"],
            flows_by_id,
        )
        return Response(
            status_code=HTTPStatus.OK.value,
            content_type="application/vnd.apple.mpegurl",
            body=m3u8_content,
        )
    except requests.HTTPError as ex:
        if ex.response.status_code == HTTPStatus.NOT_FOUND.value:
            return Response(status_code=HTTPStatus.NOT_FOUND.value)
        logger.exception("Error generating source manifest")
        return Response(status_code=HTTPStatus.INTERNAL_SERVER_ERROR.value)
    # pylint: disable=broad-exception-caught
    except Exception:
        logger.exception("Error generating source manifest")
        return Response(status_code=HTTPStatus.INTERNAL_SERVER_ERROR.value)


@app.get("/flows/<flowId>/manifest.m3u8")
@tracer.capture_method(capture_response=False)
def get_flow_hls(flowId: str):
    try:
        flow = get_flow(flowId)
        flows_dict, flows_by_id = get_collected_flows([flow])
        m3u8_content = get_collection_hls(
            flows_dict["video"],
            flows_dict["audio"],
            flows_dict["subtitle"],
            flows_dict["muxed"],
            flows_by_id,
        )
        return Response(
            status_code=HTTPStatus.OK.value,
            content_type="application/vnd.apple.mpegurl",
            body=m3u8_content,
        )
    except requests.HTTPError as ex:
        if ex.response.status_code == HTTPStatus.NOT_FOUND.value:
            return Response(status_code=HTTPStatus.NOT_FOUND.value)
        logger.exception("Error generating flow manifest")
        return Response(status_code=HTTPStatus.INTERNAL_SERVER_ERROR.value)
    # pylint: disable=broad-exception-caught
    except Exception:
        logger.exception("Error generating flow manifest")
        return Response(status_code=HTTPStatus.INTERNAL_SERVER_ERROR.value)


@app.get("/flows/<flowId>/segments/manifest.m3u8")
@tracer.capture_method(capture_response=False)
def get_segments_hls(flowId: str):
    try:
        manifest = m3u8.M3U8()
        manifest.version = 4
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
        if (
            flow_segment_duration_float > 0
        ):  # Zero value would be where Flow does not have segment_duration specified
            manifest.target_duration = flow_segment_duration_float
        if segments:
            first_segment_timestamp = TimeRange.from_str(segments[0]["timerange"])
            if flow_ingesting and flow_segment_duration_float > 0:
                manifest.media_sequence = int(
                    (first_segment_timestamp.start.to_float() - flow_created_epoch)
                    / flow_segment_duration_float
                )
            else:
                manifest.media_sequence = 1
            manifest.program_date_time = f'{datetime.fromtimestamp(first_segment_timestamp.start.to_float()).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3]}+00:00'
        manifest.playlist_type = "EVENT" if flow_ingesting else "VOD"
        prev_ts_offset = None
        for segment in segments:
            presigned_urls = [
                get_url["url"]
                for get_url in segment["get_urls"]
                if get_url.get("presigned", False)
            ]
            segment_duration = TimeRange.from_str(
                segment["timerange"]
            ).length.to_unix_float()
            ts_offset = segment.get("ts_offset", "")
            is_discontinuity = (
                prev_ts_offset is not None and prev_ts_offset != ts_offset
            )
            manifest.add_segment(
                segment=m3u8.Segment(
                    duration=segment_duration,
                    uri=f"{presigned_urls[0]}",
                    discontinuity=is_discontinuity,
                )
            )
            prev_ts_offset = ts_offset
        if not flow_ingesting:
            manifest.is_endlist = True
        return Response(
            status_code=HTTPStatus.OK.value,
            content_type="application/vnd.apple.mpegurl",
            body=manifest.dumps(),
        )
    except requests.HTTPError as ex:
        if ex.response.status_code == HTTPStatus.NOT_FOUND.value:
            return Response(status_code=HTTPStatus.NOT_FOUND.value)
        logger.exception("Error generating segments manifest")
        return Response(status_code=HTTPStatus.INTERNAL_SERVER_ERROR.value)
    # pylint: disable=broad-exception-caught
    except Exception:
        logger.exception("Error generating segments manifest")
        return Response(status_code=HTTPStatus.INTERNAL_SERVER_ERROR.value)


@logger.inject_lambda_context(log_event=True)
@tracer.capture_lambda_handler(capture_response=False)
# pylint: disable=unused-argument
def lambda_handler(event, context: LambdaContext) -> dict:
    return app.resolve(event, context)
