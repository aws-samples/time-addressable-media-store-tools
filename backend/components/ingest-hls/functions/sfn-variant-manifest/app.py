import json
import os
import uuid
import time
from datetime import datetime
from fractions import Fraction
from functools import lru_cache
from urllib.parse import urlparse

import boto3
import m3u8
import requests
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.utilities.typing import LambdaContext
from botocore.exceptions import ClientError
from ffprobe import ffprobe_link

tracer = Tracer()
logger = Logger()

ssm = boto3.client("ssm")
s3 = boto3.client("s3")
codec_parameter = os.environ["CODEC_PARAMETER"]
containers_parameter = os.environ["CONTAINERS_PARAMETER"]


@tracer.capture_method(capture_response=False)
@lru_cache()
def get_containers_mappings() -> dict:
    """Returns a dictionary of containers mappings from the parameter store"""
    get_parameter = ssm.get_parameter(Name=containers_parameter)["Parameter"]
    return json.loads(get_parameter["Value"])


@tracer.capture_method(capture_response=False)
def map_container(probe: dict) -> str:
    """Maps the format_name found from FFprobe to a TAMS container mime type"""
    format_name = probe.get("format", {}).get("format_name", None)
    if not format_name:
        raise ValueError("Unable to determine container format from media segments")
    mappings = get_containers_mappings()
    if not mappings.get(format_name):
        raise ValueError(
            f"Unsupported container format '{format_name}' found in media segments"
        )
    return mappings[format_name]


@tracer.capture_method(capture_response=False)
@lru_cache()
def _get_codecs_list() -> list:
    """Returns the raw list of codec mappings from the parameter store"""
    get_parameter = ssm.get_parameter(Name=codec_parameter)["Parameter"]
    return json.loads(get_parameter["Value"])


@tracer.capture_method(capture_response=False)
@lru_cache()
def get_codec_mappings() -> dict:
    """Returns a dictionary mapping HLS codec identifiers to TAMS codec MIME types"""
    return {codec["hls"]: codec["tams"] for codec in _get_codecs_list()}


@tracer.capture_method(capture_response=False)
@lru_cache()
def get_ffprobe_codec_mappings() -> dict:
    """Returns a dictionary mapping ffprobe codec_name values to TAMS codec MIME types"""
    return {codec["ffprobe"]: codec["tams"] for codec in _get_codecs_list()}


@tracer.capture_method(capture_response=False)
def map_codec(hls_codec: str) -> tuple[str, dict]:
    """Maps the HLS codec to a TAMS codec and returns the essence parameters"""
    codec, codec_string = (
        hls_codec.split(".", 1) if "." in hls_codec else (hls_codec, "")
    )
    codec_mappings = get_codec_mappings()
    if not codec_mappings.get(codec):
        raise ValueError(f"Unsupported codec '{codec}' found in HLS manifest")
    mapped_codec = codec_mappings[codec]
    essence_parameter_handlers = {
        "avc1": get_avc1_essence_parameters,
        "mp4a": get_mp4a_essence_parameters,
    }
    if codec not in essence_parameter_handlers:
        raise ValueError(f"No essence parameter handler for codec '{codec}'")
    essence_parameters = essence_parameter_handlers[codec](codec_string)
    return mapped_codec, essence_parameters


@tracer.capture_method(capture_response=False)
def get_avc1_essence_parameters(codec_string: str) -> dict:
    """Parses a supplied avc1 codec string into TAMS essence parameters"""
    try:
        if "." in codec_string:
            parts = codec_string.split(".")
            if len(parts) == 2:
                profile, level = int(parts[0]), int(parts[1])
                flags = 0
            elif len(parts) == 3:
                profile, flags, level = (int(p) for p in parts)
            else:
                raise ValueError
        elif len(codec_string) == 6:
            profile = int(codec_string[0:2], 16)
            flags = int(codec_string[2:4], 16)
            level = int(codec_string[4:6], 16)
        else:
            raise ValueError
    except ValueError as ex:
        raise ValueError(f"Unexpected avc1 codec string '{codec_string}'") from ex
    return {"avc_parameters": {"profile": profile, "flags": flags, "level": level}}


@tracer.capture_method(capture_response=False)
def get_mp4a_essence_parameters(codec_string: str) -> dict:
    """Parses a supplied mp4a codec string into TAMS essence parameters"""
    parts = codec_string.split(".")
    if len(parts) != 2:
        raise ValueError(f"Unexpected mp4a codec string '{codec_string}'")
    try:
        aot = int(parts[1])
    except ValueError as ex:
        raise ValueError(f"Unexpected mp4a codec string '{codec_string}'") from ex
    return {"codec_parameters": {"mp4_oti": aot}}


@tracer.capture_method(capture_response=False)
def get_manifest(source: str) -> m3u8.M3U8:
    """Parses an m3u8 manifest from the supplied source uri"""
    file_content = get_file(source)
    if not file_content:
        raise ValueError(f"Unable to retrieve manifest from '{source}'")
    try:
        return m3u8.loads(file_content.decode("utf-8"))
    except KeyError as ex:
        raise ValueError(
            f"Manifest '{source}' is malformed - missing required attribute {ex}"
        ) from ex


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
            response.raise_for_status()
            return response.content
        case _:
            raise ValueError(f"Unsupported URL scheme in '{source}'")


@tracer.capture_method(capture_response=False)
def get_last_modified(source: str) -> int:
    """Gets the Last Modified epoch (as int) of the supplied source uri"""
    source_parse = urlparse(source)
    match source_parse.scheme:
        case "s3":
            try:
                response = s3.head_object(
                    Bucket=source_parse.netloc, Key=source_parse.path[1:]
                )
                return int(response["LastModified"].timestamp())
            except ClientError as ex:
                if ex.response["Error"]["Code"] == "404":
                    raise s3.exceptions.NoSuchKey(
                        ex.response["Error"], "HeadObject"
                    ) from ex
                else:
                    raise ex
        case "https" | "http":
            response = requests.head(source, timeout=30)
            response.raise_for_status()
            if response.headers.get("Last-Modified"):
                return int(
                    datetime.strptime(
                        response.headers["Last-Modified"], "%a, %d %b %Y %H:%M:%S %Z"
                    ).timestamp()
                )
            return 0
        case _:
            raise ValueError(f"Unsupported URL scheme in '{source}'")


@tracer.capture_method(capture_response=False)
def get_flow_segment_durations(flow_manifests: dict) -> dict:
    """Returns flow target durations from the media manifests supplied"""
    segment_durations = {}
    for flow_id, manifest_uri in flow_manifests.items():
        manifest = get_manifest(manifest_uri)
        # pylint: disable=no-member
        if not manifest.target_duration:
            raise ValueError(
                f"Media manifest '{manifest_uri}' is missing #EXT-X-TARGETDURATION"
            )
        segment_durations[flow_id] = manifest.target_duration
    return segment_durations


@tracer.capture_method(capture_response=False)
def get_manifest_segment_probe(source: str) -> dict:
    """Probes the first segment of the manifest supplied"""
    manifest_path = os.path.dirname(source)
    manifest = get_manifest(source)
    if manifest.segment_map:
        raise ValueError(
            f"Media manifest '{source}' uses #EXT-X-MAP (init segments / fragmented MP4) which is not supported by this HLS ingester"
        )
    probe_result = None
    if manifest.segments:
        first_segment = manifest.segments[0]
        segment_uri = f"{manifest_path}/{first_segment.uri}"
        if first_segment.uri.startswith("http"):
            segment_uri = first_segment.uri
        elif first_segment.uri.startswith("/"):
            path_parse = urlparse(manifest_path)
            segment_uri = (
                f"{path_parse.scheme}://{path_parse.netloc}{first_segment.uri}"
            )
        probe_result = ffprobe_link(segment_uri, byterange=first_segment.byterange)
    return probe_result or {}


@tracer.capture_method(capture_response=False)
def process_playlists(
    manifest: m3u8.M3U8, manifest_path: str, label: str
) -> tuple[list, dict, dict, list]:
    """Parses the supplied manifest playlists to determine TAMS Flows and associated required metadata"""
    flows = []
    flow_manifests = {}
    audio_codecs = {}
    warnings = []
    for playlist in manifest.playlists:
        flow_id = str(uuid.uuid4())
        flow_manifests[flow_id] = f"{manifest_path}/{playlist.uri}"
        if playlist.uri.startswith("http"):
            flow_manifests[flow_id] = playlist.uri
        elif playlist.uri.startswith("/"):
            path_parse = urlparse(manifest_path)
            flow_manifests[flow_id] = (
                f"{path_parse.scheme}://{path_parse.netloc}{playlist.uri}"
            )
        probe = get_manifest_segment_probe(flow_manifests[flow_id])
        audio_group_id = next(
            (media.group_id for media in playlist.media if media.type == "AUDIO"),
            None,
        )
        if not playlist.stream_info.codecs:
            raise ValueError(
                f"Playlist '{playlist.uri}' is missing CODECS attribute in #EXT-X-STREAM-INF"
            )
        try:
            tams_codecs = [
                map_codec(codec) for codec in playlist.stream_info.codecs.split(",")
            ]
        except ValueError as ex:
            raise ValueError(
                f"Playlist '{playlist.uri}' has invalid CODECS attribute: {ex}"
            ) from ex
        if audio_group_id and len(tams_codecs) >= 2:
            audio_codecs[audio_group_id] = tams_codecs[1]
        elif len(tams_codecs) >= 2:
            warnings.append(
                {
                    "manifestUrl": flow_manifests[flow_id],
                    "message": f"Playlist '{playlist.uri}' declares multiple codecs in CODECS but has no AUDIO group - only the first codec was used (muxed variants are not yet supported)",
                }
            )
        flow = {
            "id": flow_id,
            "label": label,
            "description": f'HLS Import ({os.path.basename(playlist.uri.split("?")[0])})',
            "codec": tams_codecs[0][0],
            "container": map_container(probe),
        }
        avg_bit_rate = playlist.stream_info.average_bandwidth
        if not avg_bit_rate:
            warnings.append(
                {
                    "manifestUrl": flow_manifests[flow_id],
                    "message": f"Playlist '{playlist.uri}' missing AVERAGE BANDWIDTH - bitrate information unavailable",
                }
            )
        else:
            flow["avg_bit_rate"] = avg_bit_rate
        flow["max_bit_rate"] = playlist.stream_info.bandwidth
        # Assume Video Stream if resolution is specified
        if playlist.stream_info.resolution:
            if playlist.stream_info.frame_rate:
                frame_rate_fract = Fraction(
                    playlist.stream_info.frame_rate
                ).limit_denominator()
            else:
                video_stream = next(
                    (
                        stream
                        for stream in probe.get("streams", [])
                        if stream["codec_type"] == "video"
                    ),
                    {},
                )
                probe_frame_rate = video_stream.get("r_frame_rate") or video_stream.get(
                    "avg_frame_rate"
                )
                if not probe_frame_rate or probe_frame_rate == "0/0":
                    raise ValueError(
                        f"Video stream '{playlist.uri}' - unable to determine frame rate from media segments or #EXT-X-STREAM-INF"
                    )
                frame_rate_fract = Fraction(probe_frame_rate).limit_denominator()
            flow["format"] = "urn:x-nmos:format:video"
            flow["essence_parameters"] = {
                **tams_codecs[0][1],
                "frame_rate": {
                    "numerator": frame_rate_fract.numerator,
                    "denominator": frame_rate_fract.denominator,
                },
                "frame_width": playlist.stream_info.resolution[0],
                "frame_height": playlist.stream_info.resolution[1],
            }
        # Assume Audio Stream if resolution is not specified
        else:
            # Audio Stream
            audio_stream = next(
                (
                    stream
                    for stream in probe.get("streams", [])
                    if stream["codec_type"] == "audio"
                ),
                {},
            )
            if not audio_stream.get("channels"):
                raise ValueError(
                    f"Audio stream '{playlist.uri}' - unable to determine channel count from media segments"
                )
            if not audio_stream.get("sample_rate"):
                raise ValueError(
                    f"Audio stream '{playlist.uri}' - unable to determine sample_rate from media segments"
                )
            flow["format"] = "urn:x-nmos:format:audio"
            flow["essence_parameters"] = {
                **tams_codecs[0][1],
                "channels": int(audio_stream["channels"]),
                "sample_rate": int(audio_stream["sample_rate"]),
            }
        flows.append(flow)
    return flows, flow_manifests, audio_codecs, warnings


@tracer.capture_method(capture_response=False)
def process_media(
    manifest: m3u8.M3U8, manifest_path: str, label: str, audio_codecs: dict
) -> tuple[list, dict, list]:
    """Parses the supplied manifest media to determine TAMS Flows and associated required metadata"""
    flows = []
    flow_manifests = {}
    warnings = []
    for media in manifest.media:
        flow_id = str(uuid.uuid4())
        flow_manifests[flow_id] = f"{manifest_path}/{media.uri}"
        if media.uri.startswith("http"):
            flow_manifests[flow_id] = media.uri
        elif media.uri.startswith("/"):
            path_parse = urlparse(manifest_path)
            flow_manifests[flow_id] = (
                f"{path_parse.scheme}://{path_parse.netloc}{media.uri}"
            )
        probe = get_manifest_segment_probe(flow_manifests[flow_id])
        tags = {}
        for attr in ["language", "name", "autoselect", "default", "forced"]:
            if getattr(media, attr, None):
                tags[f"hls_{attr}"] = getattr(media, attr)
        match media.type:
            case "AUDIO":
                audio_stream = next(
                    (
                        stream
                        for stream in probe.get("streams", [])
                        if stream["codec_type"] == "audio"
                    ),
                    {},
                )
                if media.group_id in audio_codecs:
                    codec = audio_codecs[media.group_id]
                else:
                    codec_name = audio_stream.get("codec_name")
                    if not codec_name:
                        raise ValueError(
                            f"Audio media '{media.uri}' - unable to determine codec from media segments"
                        )
                    ffprobe_mappings = get_ffprobe_codec_mappings()
                    if codec_name not in ffprobe_mappings:
                        raise ValueError(
                            f"Audio media '{media.uri}' - unsupported codec '{codec_name}' reported by ffprobe"
                        )
                    codec = (ffprobe_mappings[codec_name], {})
                if hasattr(media, "channels") and media.channels:
                    channels = int(media.channels)
                elif audio_stream.get("channels"):
                    channels = int(audio_stream["channels"])
                else:
                    raise ValueError(
                        f"Audio media '{media.uri}' - unable to determine channel count from media segments or #EXT-X-MEDIA"
                    )
                if not audio_stream.get("sample_rate"):
                    raise ValueError(
                        f"Audio media '{media.uri}' - unable to determine sample_rate from media segments"
                    )
                flow = {
                    "id": flow_id,
                    "label": label,
                    "description": f"HLS Import ({os.path.basename(media.uri.split("?")[0])})",
                    "codec": codec[0],
                    "container": map_container(probe),
                    "format": "urn:x-nmos:format:audio",
                    "essence_parameters": {
                        **codec[1],
                        "channels": channels,
                        "sample_rate": int(audio_stream["sample_rate"]),
                    },
                    "tags": tags,
                }
                if audio_stream.get("bit_rate"):
                    flow["avg_bit_rate"] = int(audio_stream["bit_rate"])
                    flow["max_bit_rate"] = int(audio_stream["bit_rate"])
                flows.append(flow)
            case "SUBTITLES":
                subtitle_stream = next(
                    (
                        stream
                        for stream in probe.get("streams", [])
                        if stream["codec_type"] == "subtitle"
                    ),
                    {},
                )
                codec_name = subtitle_stream.get("codec_name")
                if not codec_name:
                    raise ValueError(
                        f"Subtitle media '{media.uri}' - unable to determine codec from media segments"
                    )
                ffprobe_mappings = get_ffprobe_codec_mappings()
                if codec_name not in ffprobe_mappings:
                    raise ValueError(
                        f"Subtitle media '{media.uri}' - unsupported codec '{codec_name}' reported by ffprobe"
                    )
                codec = (ffprobe_mappings[codec_name], {})
                flow = {
                    "id": flow_id,
                    "label": label,
                    "description": f"HLS Import ({os.path.basename(media.uri.split("?")[0])})",
                    "codec": codec[0],
                    "container": map_container(probe),
                    "format": "urn:x-nmos:format:data",
                    "essence_parameters": {
                        **codec[1],
                        "data_type": "urn:x-tams:data:subtitle",
                    },
                    "tags": tags,
                }
                flows.append(flow)
    return flows, flow_manifests, warnings


@tracer.capture_method(capture_response=False)
def set_source_and_multi(label: str, description: str, flows: list) -> list:
    """Determine required sources for flows, add source ids and return multi flow if required"""
    formats = set([f["format"] for f in flows])
    source_ids = {f: str(uuid.uuid4()) for f in formats}
    for flow in flows:
        flow["source_id"] = source_ids[flow["format"]]
    if len(formats) == 0:
        return []
    return [
        {
            "id": str(uuid.uuid4()),
            "source_id": str(uuid.uuid4()),
            "label": label,
            "description": description,
            "format": "urn:x-nmos:format:multi",
            "flow_collection": [
                {"id": f["id"], "role": f["format"].split(":")[-1]} for f in flows
            ],
        }
    ]


@logger.inject_lambda_context(log_event=True)
@tracer.capture_lambda_handler(capture_response=False)
# pylint: disable=unused-argument
def lambda_handler(event: dict, context: LambdaContext) -> dict:
    label = event["label"]
    manifest_location = event["manifestLocation"]
    use_epoch = event.get("useEpoch", False)
    flow_start = get_last_modified(manifest_location) if use_epoch else 0
    manifest_path = os.path.dirname(manifest_location)
    manifest = get_manifest(manifest_location)
    # Check if variant manifest
    if not manifest.is_variant:
        raise ValueError(
            f"Manifest '{manifest_location}' is a media manifest. This workflow requires a variant/master manifest."
        )
    playlist_flows, playlist_flow_manifests, audio_codecs, playlist_warnings = (
        process_playlists(manifest, manifest_path, label)
    )
    # Parse all media in manifest
    media_flows, media_flow_manifests, media_warnings = process_media(
        manifest, manifest_path, label, audio_codecs
    )
    flow_manifests = {**playlist_flow_manifests, **media_flow_manifests}
    flow_segment_durations = get_flow_segment_durations(flow_manifests)
    flows = [
        {
            **flow,
            "segment_duration": {
                "numerator": flow_segment_durations[flow["id"]],
                "denominator": 1,
            },
        }
        for flow in [*playlist_flows, *media_flows]
    ]
    if not flows:
        raise ValueError(
            f"Variant manifest '{manifest_location}' contains no video or audio streams (no playlists or media groups found)"
        )
    # Set Source Ids and add multi if required
    multi_flows = set_source_and_multi(
        label,
        f'HLS Import ({os.path.basename(manifest_location).split("?")[0]})',
        flows,
    )
    return {
        "flows": flows,
        "multiFlows": multi_flows,
        "flowManifests": [
            {
                "flowId": flow_id,
                "manifestLocation": uri,
                "lastMediaSequence": -1,
                "lastTimestamp": f"{flow_start}:0",
                "eventTimestamp": int(time.time() * 1000),
            }
            for flow_id, uri in flow_manifests.items()
        ],
        "warnings": [*playlist_warnings, *media_warnings],
    }
