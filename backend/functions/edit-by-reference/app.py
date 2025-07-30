import os
import json
import math
import uuid
from collections import defaultdict
from collections.abc import Generator
from typing import Any
import requests

from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.utilities.data_classes.event_bridge_event import (
    EventBridgeEvent,
)
from aws_lambda_powertools.logging import correlation_paths
from aws_lambda_powertools.utilities.typing import LambdaContext

from mediatimestamp.immutable import TimeRange, Timestamp
from openid_auth import Credentials

tracer = Tracer()
logger = Logger()

endpoint = os.environ["TAMS_ENDPOINT"]
creds = Credentials(
    token_url=os.environ["TOKEN_URL"],
    user_pool_id=os.environ["USER_POOL_ID"],
    client_id=os.environ["CLIENT_ID"],
    scopes=["tams-api/read", "tams-api/write"],
)

FORMAT_AUDIO = "urn:x-nmos:format:audio"
FORMAT_VIDEO = "urn:x-nmos:format:video"
FORMAT_MULTI = "urn:x-nmos:format:multi"
DEFAULT_START_TIME = "0:0"
DEFAULT_DESCRIPTION = "Edit By Reference"


@tracer.capture_method(capture_response=False)
def get_flow(flow_id: str) -> dict[str, Any]:
    """
    Retrieve flow information from the TAMS API.

    Args:
        flow_id: The unique identifier of the flow to retrieve

    Returns:
        The flow data as a dictionary
    """
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
def put_flow(flow: dict[str, Any]) -> None:
    """
    Update or create a flow in the TAMS API.

    Args:
        flow: The flow data to update or create
    """
    put = requests.put(
        f'{endpoint}/flows/{flow["id"]}',
        headers={
            "Authorization": f"Bearer {creds.token()}",
            "Content-Type": "application/json",
        },
        data=json.dumps(flow),
        timeout=30,
    )
    put.raise_for_status()


@tracer.capture_method(capture_response=False)
def get_segments(flow_id: str, timerange: str) -> Generator[dict[str, Any], None, None]:
    """
    Retrieve segments for a flow within a specified timerange.

    Args:
        flow_id: The unique identifier of the flow
        timerange: The timerange string to filter segments

    Yields:
        Segment dictionaries from the TAMS API
    """
    get = requests.get(
        f"{endpoint}/flows/{flow_id}/segments?accept_get_urls=&timerange={timerange}",
        headers={
            "Authorization": f"Bearer {creds.token()}",
        },
        timeout=30,
    )
    get.raise_for_status()
    for segment in get.json():
        yield segment
    while "next" in get.links:
        get = requests.get(
            get.links["next"]["url"],
            headers={
                "Authorization": f"Bearer {creds.token()}",
            },
            timeout=30,
        )
        get.raise_for_status()
        for segment in get.json():
            yield segment


@tracer.capture_method(capture_response=False)
def post_segment_chunk(flow_id: str, segment_chunk: list) -> None:
    """
    Post a chunk of segments to a flow.

    Args:
        flow_id: The unique identifier of the flow
        segment_chunk: A list of segment dictionaries to post
    """
    post = requests.post(
        f"{endpoint}/flows/{flow_id}/segments",
        headers={
            "Authorization": f"Bearer {creds.token()}",
            "Content-Type": "application/json",
        },
        data=json.dumps(segment_chunk),
        timeout=30,
    )
    if post.status_code != 201:
        logger.error(f"Some segments failed to be posted for flow: {flow_id}")
        logger.error("Request body", segment_chunk)
        logger.error("Response body", post.json())
    post.raise_for_status()


@tracer.capture_method(capture_response=False)
def post_segments(flow_id: str, segments: list) -> None:
    """
    Post segments to a flow, handling chunking for large payloads.

    Breaks large segment lists into smaller chunks to avoid API Gateway payload limits.

    Args:
        flow_id: The unique identifier of the flow
        segments: A list of segment dictionaries to post
    """
    max_payload_size = 6 * 1024 * 1024  # API Gateway payload limit (6MB to be safe)
    all_segments_json = json.dumps(segments)
    if len(all_segments_json) <= max_payload_size:
        post_segment_chunk(flow_id, segments)
        return
    chunk = []
    chunk_size = 0
    for segment in segments:
        segment_json = json.dumps(segment)
        if (
            chunk_size + len(segment_json) + 2 > max_payload_size and chunk
        ):  # +2 for [] brackets
            logger.info(f"Posting chunk of {len(chunk)} segments for flow {flow_id}")
            post_segment_chunk(flow_id, chunk)
            chunk = []
            chunk_size = 0
        chunk.append(segment)
        chunk_size += len(segment_json) + 1  # +1 for comma
    if chunk:
        logger.info(f"Posting final chunk of {len(chunk)} segments for flow {flow_id}")
        post_segment_chunk(flow_id, chunk)


@tracer.capture_method(capture_response=False)
def initialize_flow_data(
    flow_id: str,
    edit_payload: dict[str, Any],
    flows: dict[str, dict[str, Any]],
    format_source_ids: dict[str, str],
) -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    """
    Initialize flow data for a new flow based on an existing flow.

    Args:
        flow_id: The unique identifier of the flow
        edit_payload: The edit payload containing configuration
        flows: Dictionary of existing flows
        format_source_ids: Dictionary of existing format source IDs

    Returns:
        A tuple containing (updated_flows, updated_format_source_ids)
    """
    updated_flows = flows.copy()
    updated_format_source_ids = format_source_ids.copy()

    if not updated_flows.get(flow_id):
        flow_data = get_flow(flow_id)
        # Generate new source_id per flow format
        if not updated_format_source_ids.get(flow_data["format"]):
            updated_format_source_ids[flow_data["format"]] = str(uuid.uuid4())
        updated_flows[flow_id] = {
            **flow_data,
            "id": str(uuid.uuid4()),
            "source_id": updated_format_source_ids[flow_data["format"]],
            "label": edit_payload["configuration"].get("label", ""),
            "description": DEFAULT_DESCRIPTION,
        }

    return updated_flows, updated_format_source_ids


@tracer.capture_method(capture_response=False)
def get_flow_rate(flow: dict[str, Any]) -> float | None:
    """
    Determine the rate for a flow based on its format.

    Args:
        flow: The flow data dictionary

    Returns:
        The calculated rate as a float, or None if rate cannot be determined
    """
    if flow["format"] == FORMAT_AUDIO:
        return float(flow["essence_parameters"].get("sample_rate", 0))
    elif flow["format"] == FORMAT_VIDEO:
        frame_rate = flow["essence_parameters"].get("frame_rate")
        if frame_rate:
            return float(frame_rate["numerator"] / frame_rate.get("denominator", 1))
    return None


@tracer.capture_method(capture_response=False)
def calculate_sample_adjustments(
    rate: float | None,
    old_timerange: TimeRange,
    intersection_timerange: TimeRange,
    new_timerange: TimeRange,
    sample_offset: int,
) -> tuple[int, int | None]:
    """
    Calculate sample offset and count adjustments based on timeranges.

    Args:
        rate: The flow rate
        old_timerange: The original timerange
        intersection_timerange: The intersection timerange
        new_timerange: The new timerange
        sample_offset: The original sample offset

    Returns:
        A tuple of (adjusted_sample_offset, sample_count)
    """
    sample_count = None

    if not rate or old_timerange == intersection_timerange:
        return sample_offset, sample_count

    if old_timerange.start != intersection_timerange.start:
        sample_offset += math.floor(
            rate * (intersection_timerange.start - old_timerange.start).to_float()
        )

    if old_timerange.length != new_timerange.length:
        sample_count = math.floor(rate * intersection_timerange.length.to_float())

    return sample_offset, sample_count


@tracer.capture_method(capture_response=False)
def calculate_segment_timeranges(
    segment: dict[str, Any], edit_timerange: str, next_start: Timestamp
) -> tuple[TimeRange, TimeRange, TimeRange]:
    """
    Calculate the various timeranges needed for segment processing.

    Args:
        segment: The segment dictionary containing timerange information
        edit_timerange: The timerange string from the edit operation
        next_start: The timestamp to use as the start of the new timerange

    Returns:
        A tuple of (old_timerange, intersection_timerange, new_timerange)
    """
    old_timerange = TimeRange.from_str(segment["timerange"])
    intersection_timerange = old_timerange.intersect_with(
        TimeRange.from_str(edit_timerange)
    )
    new_timerange = TimeRange(
        start=next_start,
        end=intersection_timerange.length + next_start,
        inclusivity=intersection_timerange.inclusivity,
    )
    return old_timerange, intersection_timerange, new_timerange


@tracer.capture_method(capture_response=False)
def build_new_segment(
    segment: dict[str, Any],
    new_timerange: TimeRange,
    new_ts_offset: Timestamp,
    sample_offset: int,
    sample_count: int = None,
) -> dict[str, Any]:
    """
    Build a new segment object with the calculated values.

    Args:
        segment: The original segment dictionary
        new_timerange: The calculated new timerange for the segment
        new_ts_offset: The calculated new timestamp offset
        sample_offset: The calculated sample offset
        sample_count: The calculated sample count (optional)

    Returns:
        A new segment dictionary with updated values
    """
    return {
        "object_id": segment["object_id"],
        "timerange": str(new_timerange),
        **({"ts_offset": str(new_ts_offset)} if str(new_ts_offset) != "0:0" else {}),
        **({"sample_offset": sample_offset} if sample_offset != 0 else {}),
        **({"sample_count": sample_count} if sample_count else {}),
    }


@tracer.capture_method(capture_response=False)
def get_new_flows_and_segments(
    edit_payload: dict[str, Any],
) -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    """
    Generate new flows and segments based on an edit payload.

    Creates new flows and segments by referencing existing flows and applying
    the edit operations specified in the payload.

    Args:
        edit_payload: The edit payload containing edit operations

    Returns:
        A tuple containing (flows_dict, segments_dict) where:
        - flows_dict: Dictionary mapping original flow IDs to new flow data
        - segments_dict: Dictionary mapping new flow IDs to lists of segment data
    """
    flows = {}
    flow_segments = defaultdict(list)
    format_source_ids = {}

    # Set start of all new segments per flow to be as per edit payload
    next_start = {
        flow_id: Timestamp.from_str(
            edit_payload["configuration"].get("start", DEFAULT_START_TIME)
        )
        for flow_id in set(
            flow_id
            for edit_item in edit_payload["edit"]
            for flow_id in edit_item["flows"]
        )
    }

    for edit_item in edit_payload["edit"]:
        for flow_id in edit_item["flows"]:
            # Initialize flow data if needed
            flows, format_source_ids = initialize_flow_data(
                flow_id, edit_payload, flows, format_source_ids
            )

            # Get rate for this flow
            rate = get_flow_rate(flows[flow_id])

            # Process segments for this flow and edit item
            for segment in get_segments(flow_id, edit_item["timerange"]):
                # Calculate timeranges
                old_timerange, intersection_timerange, new_timerange = (
                    calculate_segment_timeranges(
                        segment, edit_item["timerange"], next_start[flow_id]
                    )
                )

                # Update next start time
                next_start[flow_id] = new_timerange.end

                # Calculate offsets
                old_ts_offset = Timestamp.from_str(segment.get("ts_offset", "0:0"))
                new_ts_offset = (
                    old_ts_offset + new_timerange.start - intersection_timerange.start
                )

                # Handle sample offsets and counts
                sample_offset = segment.get("sample_offset", 0)
                sample_offset, sample_count = calculate_sample_adjustments(
                    rate,
                    old_timerange,
                    intersection_timerange,
                    new_timerange,
                    sample_offset,
                )

                # Create and store the new segment
                new_segment = build_new_segment(
                    segment, new_timerange, new_ts_offset, sample_offset, sample_count
                )
                flow_segments[flows[flow_id]["id"]].append(new_segment)

    return flows, dict(flow_segments)


@tracer.capture_method(capture_response=False)
def create_multi_flow(
    flows: dict[str, dict[str, Any]], edit_payload: dict[str, Any]
) -> dict[str, Any] | None:
    """
    Create a multi-flow if multiple formats exist.

    Args:
        flows: Dictionary of flows
        edit_payload: The edit payload

    Returns:
        A multi-flow dictionary or None if not needed
    """
    formats = set(flow_data["format"] for flow_data in flows.values())

    if len(formats) <= 1:
        return None

    label = edit_payload["configuration"].get("label", "Unnamed Edit")

    return {
        "id": str(uuid.uuid4()),
        "source_id": str(uuid.uuid4()),
        "label": label,
        "description": DEFAULT_DESCRIPTION,
        "format": FORMAT_MULTI,
        "flow_collection": [
            {"id": flow["id"], "role": flow["format"].split(":")[-1]}
            for flow in flows.values()
        ],
    }


@logger.inject_lambda_context(
    log_event=True, correlation_id_path=correlation_paths.EVENT_BRIDGE
)
@tracer.capture_lambda_handler(capture_response=False)
# pylint: disable=unused-argument
def lambda_handler(event: EventBridgeEvent, context: LambdaContext) -> None:
    edit_payload = event["detail"]
    new_flows, new_segments = get_new_flows_and_segments(edit_payload)

    # Create multi-flow if needed
    multi_flow = create_multi_flow(new_flows, edit_payload)

    # Create new flows
    for flow in new_flows.values():
        put_flow(flow)

    # Create new Multi flow
    if multi_flow:
        put_flow(multi_flow)

    # Create new Segments
    for flow_id, segments in new_segments.items():
        if segments:
            post_segments(flow_id, segments)
