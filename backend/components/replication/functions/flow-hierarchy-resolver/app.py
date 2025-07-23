import json
from typing import Any
import requests
import boto3

from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.utilities.typing import LambdaContext

from openid_auth import Credentials

tracer = Tracer()
logger = Logger()

eventbridge = boto3.client("events")
secrets_manager = boto3.client("secretsmanager")


@tracer.capture_method(capture_response=False)
def get_flow(creds: Credentials, endpoint: str, flow_id: str) -> dict[str, Any]:
    """
    Retrieve flow information from the TAMS API.

    Args:
        creds: The OAuth2 creds object from which to retrieve the access token
        endpoint: The TAMS API endpoint to use
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
def get_flows_by_source(
    creds: Credentials, endpoint: str, source_id: str
) -> list[dict[str, Any]]:
    """
    Retrieve flow information for the supplied source_id from the TAMS API.

    Args:
        creds: The OAuth2 creds object from which to retrieve the access token
        endpoint: The TAMS API endpoint to use
        source_id: The unique identifier of the source to retrieve the flows for

    Returns:
        A list of flow data as a dictionary
    """
    get = requests.get(
        f"{endpoint}/flows?source_id={source_id}",
        headers={
            "Authorization": f"Bearer {creds.token()}",
        },
        timeout=30,
    )
    get.raise_for_status()
    return get.json()


@tracer.capture_method
def resolve_flow_hierarchy(
    creds: Credentials,
    endpoint: str,
    flow_id: str,
    flow_tree: dict[str, dict[str, Any]] = None,
) -> dict[str, dict[str, Any]]:
    """
    Recursively resolve the full hierarchy tree from an initial flow_id.

    Args:
        creds: The OAuth2 creds object from which to retrieve the access token
        endpoint: The TAMS API endpoint to use
        flow_id: The unique identifier of the flow to start with
        flow_tree: Dictionary to store the flow hierarchy (used in recursion)

    Returns:
        Dictionary containing the full flow hierarchy tree
    """
    # Initialize flow_tree if this is the first call
    if flow_tree is None:
        flow_tree = {}

    # Skip if we've already processed this flow
    if flow_id in flow_tree:
        return flow_tree

    # Get flow details
    flow_details = get_flow(creds, endpoint, flow_id)
    flow_tree[flow_id] = flow_details

    # Check if this flow has a flow_collection
    if "flow_collection" in flow_details and flow_details["flow_collection"]:
        for child_flow in flow_details["flow_collection"]:
            if "id" in child_flow:
                # Recursively process each child flow
                resolve_flow_hierarchy(creds, endpoint, child_flow["id"], flow_tree)

    return flow_tree


@tracer.capture_method(capture_response=False)
def get_connection_secret_values(connection_arn: str) -> dict[str, str]:
    """
    Get token_url and client_id from AWS Secrets Manager based on EventBridge Connection ARN.

    Args:
        connection_arn: The ARN of the EventBridge connection

    Returns:
        Dictionary containing token_url and client_id
    """
    if not connection_arn:
        raise ValueError("Connection ARN is required")

    # Parse the ARN to get the connection name
    connection_name = connection_arn.split("/")[1]

    # Get connection details
    connection_response = eventbridge.describe_connection(Name=connection_name)

    # Extract the secret ARN from the connection
    secret_arn = connection_response.get("SecretArn")
    if not secret_arn:
        raise ValueError(f"Secret ARN not found in connection: {connection_arn}")

    # Get the secret value
    secret_response = secrets_manager.get_secret_value(SecretId=secret_arn)

    # Parse the secret value
    secret_string = secret_response.get("SecretString")
    if not secret_string:
        raise ValueError(f"Secret value not found for secret: {secret_arn}")

    secret_data = json.loads(secret_string)

    # Extract and return the required values
    return {
        "token_url": secret_data.get("authorization_endpoint"),
        "client_id": secret_data.get("client_id"),
        "client_secret": secret_data.get("client_secret"),
    }


@logger.inject_lambda_context(log_event=True)
@tracer.capture_lambda_handler
# pylint: disable=unused-argument
def lambda_handler(
    event: dict[str, Any], context: LambdaContext
) -> dict[str, dict[str, Any]]:
    oauth_creds = get_connection_secret_values(event["originConnectionArn"])
    creds = Credentials(
        token_url=oauth_creds["token_url"],
        client_id=oauth_creds["client_id"],
        client_secret=oauth_creds["client_secret"],
        scopes=["tams-api/read"],
    )

    source_id = event.pop("sourceId", None)
    flow_id = event.pop("flowId", None)
    endpoint = event["originEndpoint"]

    flows = {}
    if source_id:
        flows = get_flows_by_source(creds, endpoint, source_id)
        for flow in flows:
            flows.update(resolve_flow_hierarchy(creds, endpoint, flow["id"], flows))
    elif flow_id:
        flows = resolve_flow_hierarchy(creds, endpoint, flow_id)
    return {**event, "flows": list(flows.values())}
