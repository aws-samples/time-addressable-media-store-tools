import json
import os
import uuid
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
@lru_cache()
def get_codec_mappings() -> dict:
    """Returns a dictionary of codec mappings from the parameter store"""
    get_parameter = ssm.get_parameter(Name=codec_parameter)["Parameter"]
    codecs_list = json.loads(get_parameter["Value"])
    return {codec["hls"]: codec["tams"] for codec in codecs_list}


@tracer.capture_method(capture_response=False)
def map_codec(hls_codec: str) -> tuple[str, dict]:
    """Maps the HLS codec to a TAMS codec and returns the essence parameters"""
    # Split codec on dot (handle if not present)
    codec, codec_string = (
        hls_codec.split(".", 1) if "." in hls_codec else (hls_codec, "")
    )
    codec_mappings = get_codec_mappings()
    mapped_codec = codec_mappings.get(codec, f"unknown/{codec}")
    essence_parameter_handlers = {
        "avc1": get_avc1_essence_parameters,
        "mp4a": get_mp4a_essence_parameters,
    }
    # Process codec_string into essence_parameters
    essence_parameters = essence_parameter_handlers.get(codec, lambda x: {})(
        codec_string
    )
    return mapped_codec, essence_parameters


@tracer.capture_method(capture_response=False)
def get_avc1_essence_parameters(codec_string: str) -> dict:
    """Parses a supplied avc1 codec string into TAMS essence parameters"""
    string_iter = iter(
        [codec_string[i : i + 2] for i in range(0, len(codec_string), 2)]
    )
    profile = int(next(string_iter, "64"), 16)
    flags = int(next(string_iter, "00"), 16)
    level = int(next(string_iter, "1f"), 16)
    return {"avc_parameters": {"profile": profile, "flags": flags, "level": level}}


@tracer.capture_method(capture_response=False)
def get_mp4a_essence_parameters(codec_string: str) -> dict:
    """Parses a supplied mp4a codec string into TAMS essence parameters"""
    string_iter = iter(codec_string.split("."))
    oti = int(next(string_iter, "40"), 16)
    return {"codec_parameters": {"mp4_oti": oti}}


@tracer.capture_method(capture_response=False)
def get_manifest(source: str) -> m3u8.M3U8:
    """Parses an m3u8 manifest from the supplied source uri"""
    file_content = get_file(source)
    if not file_content:
        return None
    return m3u8.loads(file_content.decode("utf-8"))


@tracer.capture_method(capture_response=False)
def get_file(source: str) -> bytes:
    """Reads the content of a file from the supplied source uri"""
    source_parse = urlparse(source)
    match source_parse.scheme:
        case "s3":
            try:
                response = s3.get_object(
                    Bucket=source_parse.netloc, Key=source_parse.path[1:]
                )
                return response["Body"].read()
            except ClientError as e:
                if e.response["Error"]["Code"] == "NoSuchKey":
                    return None
                else:
                    raise e
        case "https" | "http":
            response = requests.get(source, timeout=30)
            return response.content


@tracer.capture_method(capture_response=False)
def get_flow_segment_durations(flow_manifests: dict) -> dict:
    """Returns flow target durations from the media manifests supplied"""
    segment_durations = {}
    for manifest_uri in flow_manifests.values():
        manifest = get_manifest(manifest_uri)
        # pylint: disable=no-member
        if manifest.target_duration:
            segment_durations[manifest_uri] = manifest.target_duration
    return {
        flow: segment_durations[manifest] for flow, manifest in flow_manifests.items()
    }


@tracer.capture_method(capture_response=False)
def get_manifest_segment_probe(source: str) -> dict:
    """Probes the first segment of the manifest supplied"""
    manifest_path = os.path.dirname(source)
    manifest = get_manifest(source)
    probe_result = None
    if manifest.segments:
        segment_uri = (
            manifest.segments[0].uri
            if manifest.segments[0].uri.startswith("http")
            else f"{manifest_path}/{manifest.segments[0].uri}"
        )
        probe_result = ffprobe_link(segment_uri)
    return probe_result or {}


@tracer.capture_method(capture_response=False)
def process_playlists(
    manifest: m3u8.M3U8, manifest_path: str, label: str
) -> tuple[list, dict, dict]:
    """Parses the supplied manifest playlists to determine TAMS Flows and associated required metadata"""
    flows = []
    flow_manifests = {}
    audio_codecs = {}
    for playlist in manifest.playlists:
        flow_id = str(uuid.uuid4())
        flow_manifests[flow_id] = (
            playlist.uri
            if playlist.uri.startswith("http")
            else f"{manifest_path}/{playlist.uri}"
        )
        probe = get_manifest_segment_probe(flow_manifests[flow_id])
        format_name = probe.get("format", {}).get("format_name", None)
        container = (
            get_containers_mappings()[format_name] if format_name else "video/mp2t"
        )
        audio_group_id = next(
            (media.group_id for media in playlist.media if media.type == "AUDIO"),
            None,
        )
        tams_codecs = [
            map_codec(codec) for codec in playlist.stream_info.codecs.split(",")
        ]
        if audio_group_id:
            audio_codecs[audio_group_id] = tams_codecs[1]
        flow = {
            "id": flow_id,
            "label": label,
            "description": f"HLS Import ({os.path.basename(playlist.uri)})",
            "codec": tams_codecs[0][0],
            "container": container,
            "avg_bit_rate": playlist.stream_info.average_bandwidth,
            "max_bit_rate": playlist.stream_info.bandwidth,
        }
        # Assume Video Stream if resolution is specified
        if playlist.stream_info.resolution:
            frame_rate_fract = Fraction(
                playlist.stream_info.frame_rate
            ).limit_denominator()
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
            flow["format"] = "urn:x-nmos:format:audio"
            flow["essence_parameters"] = {
                **tams_codecs[0][1],
                "channels": audio_stream.get("channels", 2),
                "sample_rate": int(audio_stream.get("sample_rate", "48000")),
            }
        flows.append(flow)
    return flows, flow_manifests, audio_codecs


@tracer.capture_method(capture_response=False)
def process_media(
    manifest: m3u8.M3U8, manifest_path: str, label: str, audio_codecs: dict
) -> tuple[list, dict]:
    """Parses the supplied manifest media to determine TAMS Flows and associated required metadata"""
    flows = []
    flow_manifests = {}
    for media in manifest.media:
        if media.type == "AUDIO":
            flow_id = str(uuid.uuid4())
            flow_manifests[flow_id] = (
                media.uri
                if media.uri.startswith("http")
                else f"{manifest_path}/{media.uri}"
            )
            probe = get_manifest_segment_probe(flow_manifests[flow_id])
            format_name = probe.get("format", {}).get("format_name", None)
            container = (
                get_containers_mappings()[format_name] if format_name else "video/mp2t"
            )
            audio_stream = next(
                (
                    stream
                    for stream in probe.get("streams", [])
                    if stream["codec_type"] == "audio"
                ),
                {},
            )
            codec = audio_codecs[media.group_id]
            flow = {
                "id": flow_id,
                "label": label,
                "description": f"HLS Import ({os.path.basename(media.uri)})",
                "codec": codec[0],
                "container": container,
                "format": "urn:x-nmos:format:audio",
                "essence_parameters": {
                    **codec[1],
                    "channels": media.channels,
                    "sample_rate": int(audio_stream.get("sample_rate", "48000")),
                },
            }
            if audio_stream.get("bit_rate"):
                flow["avg_bit_rate"] = int(audio_stream["bit_rate"])
                flow["max_bit_rate"] = int(audio_stream["bit_rate"])
            flows.append(flow)
    return flows, flow_manifests


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
    manifest_location = event["manifest_location"]
    manifest_path = os.path.dirname(manifest_location)
    manifest = get_manifest(manifest_location)
    if not manifest:
        return {
            "flows": [],
            "multiFlows": [],
            "flowManifests": [],
        }
    # Parse all playlists in manifest
    playlist_flows, playlist_flow_manifests, audio_codecs = process_playlists(
        manifest, manifest_path, label
    )
    # Parse all media in manifest
    media_flows, media_flow_manifests = process_media(
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
    # Set Source Ids and add multi if required
    multi_flows = set_source_and_multi(
        label, f"HLS Import ({os.path.basename(manifest_location)})", flows
    )
    return {
        "flows": flows,
        "multiFlows": multi_flows,
        "flowManifests": [
            {"id": flow_id, "uri": uri} for flow_id, uri in flow_manifests.items()
        ],
    }
