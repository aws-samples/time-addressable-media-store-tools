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
def resolve_child_uri(base_url: str, child_uri: str) -> str:
    """Resolve a (possibly relative) HLS URI against a base manifest URL."""
    if child_uri.startswith("http"):
        return child_uri
    if child_uri.startswith("/"):
        parsed = urlparse(base_url)
        return f"{parsed.scheme}://{parsed.netloc}{child_uri}"
    return f"{base_url}/{child_uri}"


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
def attach_segment_duration(flow: dict, durations: dict) -> dict:
    """Return a flow with segment_duration attached if it owns segments."""
    if flow["id"] not in durations:
        return flow
    return {
        **flow,
        "segment_duration": {
            "numerator": durations[flow["id"]],
            "denominator": 1,
        },
    }


@tracer.capture_method(capture_response=False)
def get_manifest_segment_probe(source: str) -> dict:
    """Probes the first segment of the manifest supplied"""
    manifest_path = os.path.dirname(source)
    manifest = get_manifest(source)
    if manifest.segment_map:
        raise ValueError(
            f"Media manifest '{source}' uses #EXT-X-MAP (init segments / fragmented MP4) which is not supported by this HLS ingester"
        )
    if any(key for key in manifest.keys):
        raise ValueError(
            f"Media manifest '{source}' uses #EXT-X-KEY (segment encryption) which is not supported by this HLS ingester"
        )
    probe_result = None
    if manifest.segments:
        first_segment = manifest.segments[0]
        segment_uri = resolve_child_uri(manifest_path, first_segment.uri)
        probe_result = ffprobe_link(segment_uri, byterange=first_segment.byterange)
    return probe_result or {}


@tracer.capture_method(capture_response=False)
def build_video_flow(
    flow_id: str,
    label: str,
    playlist,
    probe: dict,
    codec: tuple,
) -> dict:
    """Build a TAMS video flow from a playlist + probe result. Does not include container or segment_duration."""
    if playlist.stream_info.frame_rate:
        frame_rate_fract = Fraction(playlist.stream_info.frame_rate).limit_denominator()
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
    return {
        "id": flow_id,
        "label": label,
        "description": f'HLS Import ({os.path.basename(playlist.uri.split("?")[0])})',
        "codec": codec[0],
        "format": "urn:x-nmos:format:video",
        "essence_parameters": {
            **codec[1],
            "frame_rate": {
                "numerator": frame_rate_fract.numerator,
                "denominator": frame_rate_fract.denominator,
            },
            "frame_width": playlist.stream_info.resolution[0],
            "frame_height": playlist.stream_info.resolution[1],
        },
    }


@tracer.capture_method(capture_response=False)
def build_audio_flow(
    flow_id: str,
    label: str,
    playlist,
    probe: dict,
    codec: tuple,
) -> dict:
    """Build a TAMS audio flow from a playlist + probe result. Does not include container or segment_duration."""
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
    return {
        "id": flow_id,
        "label": label,
        "description": f'HLS Import ({os.path.basename(playlist.uri.split("?")[0])})',
        "codec": codec[0],
        "format": "urn:x-nmos:format:audio",
        "essence_parameters": {
            **codec[1],
            "channels": int(audio_stream["channels"]),
            "sample_rate": int(audio_stream["sample_rate"]),
        },
    }


@tracer.capture_method(capture_response=False)
def is_muxed_variant(
    probe: dict, tams_codecs: list, audio_group_id: str | None
) -> bool:
    """Detect whether a variant is muxed (video + audio in one segment stream).

    True when the probe shows both video and audio streams AND the variant has
    multiple codecs in CODECS AND does not reference an AUDIO group (which would
    route audio through a separate #EXT-X-MEDIA rendition)."""
    if audio_group_id or len(tams_codecs) < 2:
        return False
    stream_types = {stream.get("codec_type") for stream in probe.get("streams", [])}
    return "video" in stream_types and "audio" in stream_types


@tracer.capture_method(capture_response=False)
def build_variant_multi_flow(
    flow_id: str,
    source_id: str,
    label: str,
    playlist,
    probe: dict,
    per_essence_flows: list,
) -> dict:
    """Build a per-variant multi flow that will own the muxed segments."""
    return {
        "id": flow_id,
        "source_id": source_id,
        "label": label,
        "description": f'HLS Import ({os.path.basename(playlist.uri.split("?")[0])})',
        "format": "urn:x-nmos:format:multi",
        "container": map_container(probe),
        "flow_collection": [
            {"id": f["id"], "role": f["format"].split(":")[-1]}
            for f in per_essence_flows
        ],
    }


@tracer.capture_method(capture_response=False)
def apply_bitrate(
    flow: dict,
    playlist,
) -> None:
    """Attach avg_bit_rate (when the manifest declares AVERAGE-BANDWIDTH) and max_bit_rate to a flow. Mutates flow in place."""
    avg_bit_rate = playlist.stream_info.average_bandwidth
    if avg_bit_rate:
        flow["avg_bit_rate"] = avg_bit_rate
    flow["max_bit_rate"] = playlist.stream_info.bandwidth


@tracer.capture_method(capture_response=False)
def build_audio_media_flow(
    flow_id: str,
    label: str,
    media,
    probe: dict,
    codec: tuple,
    channels: int,
    tags: dict,
) -> dict:
    """Build a TAMS audio flow from an #EXT-X-MEDIA AUDIO rendition + probe result."""
    audio_stream = next(
        (
            stream
            for stream in probe.get("streams", [])
            if stream["codec_type"] == "audio"
        ),
        {},
    )
    if not audio_stream.get("sample_rate"):
        raise ValueError(
            f"Audio media '{media.uri}' - unable to determine sample_rate from media segments"
        )
    flow = {
        "id": flow_id,
        "label": label,
        "description": f"HLS Import ({os.path.basename(media.uri.split('?')[0])})",
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
    return flow


@tracer.capture_method(capture_response=False)
def build_subtitle_flow(
    flow_id: str,
    label: str,
    media,
    probe: dict,
    codec: tuple,
    tags: dict,
) -> dict:
    """Build a TAMS subtitle flow from an #EXT-X-MEDIA SUBTITLES rendition + probe result."""
    return {
        "id": flow_id,
        "label": label,
        "description": f"HLS Import ({os.path.basename(media.uri.split('?')[0])})",
        "codec": codec[0],
        "container": map_container(probe),
        "format": "urn:x-nmos:format:data",
        "essence_parameters": {
            **codec[1],
            "data_type": "urn:x-tams:data:subtitle",
        },
        "tags": tags,
    }


@tracer.capture_method(capture_response=False)
def process_playlists(
    manifest: m3u8.M3U8, manifest_path: str, label: str
) -> tuple[list, list, dict, dict, list]:
    """Parses the supplied manifest playlists to determine TAMS Flows and associated required metadata"""
    flows = []
    variant_multi_flows = []
    flow_manifests = {}
    audio_codecs = {}
    warnings = []
    variant_multi_source_id = str(uuid.uuid4())
    for playlist in manifest.playlists:
        playlist_manifest_url = resolve_child_uri(manifest_path, playlist.uri)
        probe = get_manifest_segment_probe(playlist_manifest_url)
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
        # Identify codecs by their TAMS format prefix rather than by position,
        # because HLS manifests are free to list CODECS in any order.
        video_codec = next((c for c in tams_codecs if c[0].startswith("video/")), None)
        audio_codec = next((c for c in tams_codecs if c[0].startswith("audio/")), None)
        if is_muxed_variant(probe, tams_codecs, audio_group_id):
            if not video_codec or not audio_codec:
                raise ValueError(
                    f"Playlist '{playlist.uri}' detected as muxed but could not identify video and audio codecs from CODECS '{playlist.stream_info.codecs}'"
                )
            # Muxed variant: build two metadata-only per-essence flows and a per-variant multi
            video_flow = build_video_flow(
                str(uuid.uuid4()), label, playlist, probe, video_codec
            )
            audio_flow = build_audio_flow(
                str(uuid.uuid4()), label, playlist, probe, audio_codec
            )
            flows.append(video_flow)
            flows.append(audio_flow)
            multi_flow_id = str(uuid.uuid4())
            flow_manifests[multi_flow_id] = playlist_manifest_url
            multi_flow = build_variant_multi_flow(
                multi_flow_id,
                variant_multi_source_id,
                label,
                playlist,
                probe,
                [video_flow, audio_flow],
            )
            apply_bitrate(multi_flow, playlist)
            variant_multi_flows.append(multi_flow)
            continue
        # Single-essence variant (existing behaviour)
        if audio_group_id and audio_codec:
            audio_codecs[audio_group_id] = audio_codec
        elif len(tams_codecs) >= 2:
            warnings.append(
                {
                    "manifestUrl": playlist_manifest_url,
                    "message": f"Playlist '{playlist.uri}' declares multiple codecs in CODECS but has no AUDIO group and not all codecs are represented in the media segments",
                }
            )
        flow_id = str(uuid.uuid4())
        flow_manifests[flow_id] = playlist_manifest_url
        # Assume Video Stream if resolution is specified, Audio Stream otherwise
        if playlist.stream_info.resolution:
            flow = build_video_flow(flow_id, label, playlist, probe, video_codec)
        else:
            flow = build_audio_flow(flow_id, label, playlist, probe, audio_codec)
        flow["container"] = map_container(probe)
        apply_bitrate(flow, playlist)
        flows.append(flow)
    return flows, variant_multi_flows, flow_manifests, audio_codecs, warnings


@tracer.capture_method(capture_response=False)
def resolve_audio_rendition_codec(
    media, probe_audio_stream: dict, audio_codecs: dict
) -> tuple:
    """Determine the TAMS codec for an #EXT-X-MEDIA AUDIO rendition, preferring the group mapping and falling back to ffprobe."""
    if media.group_id in audio_codecs:
        return audio_codecs[media.group_id]
    codec_name = probe_audio_stream.get("codec_name")
    if not codec_name:
        raise ValueError(
            f"Audio media '{media.uri}' - unable to determine codec from media segments"
        )
    ffprobe_mappings = get_ffprobe_codec_mappings()
    if codec_name not in ffprobe_mappings:
        raise ValueError(
            f"Audio media '{media.uri}' - unsupported codec '{codec_name}' reported by ffprobe"
        )
    return (ffprobe_mappings[codec_name], {})


@tracer.capture_method(capture_response=False)
def resolve_subtitle_codec(media, probe_subtitle_stream: dict) -> tuple:
    """Determine the TAMS codec for an #EXT-X-MEDIA SUBTITLES rendition via ffprobe."""
    codec_name = probe_subtitle_stream.get("codec_name")
    if not codec_name:
        raise ValueError(
            f"Subtitle media '{media.uri}' - unable to determine codec from media segments"
        )
    ffprobe_mappings = get_ffprobe_codec_mappings()
    if codec_name not in ffprobe_mappings:
        raise ValueError(
            f"Subtitle media '{media.uri}' - unsupported codec '{codec_name}' reported by ffprobe"
        )
    return (ffprobe_mappings[codec_name], {})


@tracer.capture_method(capture_response=False)
def resolve_audio_channels(media, probe_audio_stream: dict) -> int:
    """Determine channel count for an audio rendition, preferring the manifest and falling back to ffprobe."""
    if hasattr(media, "channels") and media.channels:
        return int(media.channels)
    if probe_audio_stream.get("channels"):
        return int(probe_audio_stream["channels"])
    raise ValueError(
        f"Audio media '{media.uri}' - unable to determine channel count from media segments or #EXT-X-MEDIA"
    )


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
        flow_manifests[flow_id] = resolve_child_uri(manifest_path, media.uri)
        probe = get_manifest_segment_probe(flow_manifests[flow_id])
        tags = {
            f"hls_{attr}": getattr(media, attr)
            for attr in ["language", "name", "autoselect", "default", "forced"]
            if getattr(media, attr, None)
        }
        match media.type:
            case "AUDIO":
                audio_stream = next(
                    (s for s in probe.get("streams", []) if s["codec_type"] == "audio"),
                    {},
                )
                codec = resolve_audio_rendition_codec(media, audio_stream, audio_codecs)
                channels = resolve_audio_channels(media, audio_stream)
                flows.append(
                    build_audio_media_flow(
                        flow_id, label, media, probe, codec, channels, tags
                    )
                )
            case "SUBTITLES":
                subtitle_stream = next(
                    (
                        s
                        for s in probe.get("streams", [])
                        if s["codec_type"] == "subtitle"
                    ),
                    {},
                )
                codec = resolve_subtitle_codec(media, subtitle_stream)
                flows.append(
                    build_subtitle_flow(flow_id, label, media, probe, codec, tags)
                )
    return flows, flow_manifests, warnings


@tracer.capture_method(capture_response=False)
def assign_source_ids(flows: list) -> None:
    """Assigns one source_id per format across the supplied flows. Mutates flows in place."""
    formats = {f["format"] for f in flows}
    source_ids = {fmt: str(uuid.uuid4()) for fmt in formats}
    for flow in flows:
        flow["source_id"] = source_ids[flow["format"]]


@tracer.capture_method(capture_response=False)
def build_top_level_multi(
    label: str, description: str, collection_members: list
) -> dict:
    """Builds a top-level multi flow. Assumes collection members already have source_ids assigned."""
    return {
        "id": str(uuid.uuid4()),
        "source_id": str(uuid.uuid4()),
        "label": label,
        "description": description,
        "format": "urn:x-nmos:format:multi",
        "flow_collection": [
            {"id": f["id"], "role": f["format"].split(":")[-1]}
            for f in collection_members
        ],
    }


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
    if not manifest.is_variant:
        raise ValueError(
            f"Manifest '{manifest_location}' is a media manifest. This workflow requires a variant/master manifest."
        )
    (
        playlist_flows,
        variant_multi_flows,
        playlist_flow_manifests,
        audio_codecs,
        playlist_warnings,
    ) = process_playlists(manifest, manifest_path, label)
    media_flows, media_flow_manifests, media_warnings = process_media(
        manifest, manifest_path, label, audio_codecs
    )
    flow_manifests = {**playlist_flow_manifests, **media_flow_manifests}
    flow_segment_durations = get_flow_segment_durations(flow_manifests)
    flows = [
        attach_segment_duration(f, flow_segment_durations)
        for f in [*playlist_flows, *media_flows]
    ]
    variant_multi_flows_with_duration = [
        attach_segment_duration(m, flow_segment_durations) for m in variant_multi_flows
    ]
    if not flows and not variant_multi_flows_with_duration:
        raise ValueError(
            f"Variant manifest '{manifest_location}' contains no video or audio streams (no playlists or media groups found)"
        )
    # Determine which per-essence flows are already collected by a per-variant multi
    muxed_flow_ids = {
        entry["id"]
        for multi in variant_multi_flows_with_duration
        for entry in multi["flow_collection"]
    }
    standalone_flows = [f for f in flows if f["id"] not in muxed_flow_ids]
    # Assign source_ids to all per-essence flows (one per format, shared across muxed + standalone).
    # Per-variant multis already have their own shared source_id from process_playlists.
    assign_source_ids(flows)
    asset_description = (
        f'HLS Import ({os.path.basename(manifest_location).split("?")[0]})'
    )
    # Top-level multi collapse logic based on how many per-variant multis we produced
    if len(variant_multi_flows_with_duration) == 0:
        # No muxed variants — top-level multi collects per-essence flows
        top_level = build_top_level_multi(label, asset_description, flows)
        multi_flows = [top_level]
    elif len(variant_multi_flows_with_duration) == 1:
        # Single muxed variant — the per-variant multi IS the top-level multi.
        # Extend its flow_collection with any standalone flows (subtitles etc.)
        collapsed = variant_multi_flows_with_duration[0]
        for flow in standalone_flows:
            collapsed["flow_collection"].append(
                {"id": flow["id"], "role": flow["format"].split(":")[-1]}
            )
        collapsed["description"] = asset_description
        multi_flows = [collapsed]
    else:
        # Two or more muxed variants — three-level hierarchy.
        # Top-level multi collects per-variant multis + any standalone flows.
        # Order matters: per-variant multis must be created before the top-level references them.
        top_level = build_top_level_multi(
            label,
            asset_description,
            [*variant_multi_flows_with_duration, *standalone_flows],
        )
        multi_flows = [*variant_multi_flows_with_duration, top_level]
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
