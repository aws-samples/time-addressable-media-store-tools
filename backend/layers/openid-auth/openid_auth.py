import json
from datetime import datetime, timedelta
import requests
import boto3
from botocore.exceptions import BotoCoreError, ClientError


class Credentials:
    def __init__(
        self,
        scopes: list[str],
        token_url: str = None,
        client_id: str = None,
        client_secret: str = None,
        user_pool_id: str = None,
        secret_arn: str = None,
    ) -> None:
        if sum((bool(client_secret), bool(user_pool_id), bool(secret_arn))) != 1:
            raise ValueError(
                "Exactly one of client_secret, user_pool_id or secret_arn must be provided"
            )
        self._token_url = token_url
        self._user_pool_id = user_pool_id
        self._client_id = client_id
        self._scope = " ".join(scopes)
        self._client_secret = client_secret
        self._secret_arn = secret_arn
        self._access_token = None
        self._expires_at = None

        if self._secret_arn:
            self._get_secret_values()
        elif self._user_pool_id:
            self._get_client_secret()

        if not self._client_secret or not self._token_url or not self._client_id:
            raise ValueError("Failed to obtain required credentials")

    def token(self) -> str:
        if (
            self._access_token is None
            or self._expires_at is None
            or (self._expires_at and self._expires_at < datetime.now())
        ):
            self._request_token()
        return self._access_token

    def _get_client_secret(self):
        """Get client secret from Cognito"""
        try:
            client = boto3.client("cognito-idp")
            user_pool_client = client.describe_user_pool_client(
                UserPoolId=self._user_pool_id, ClientId=self._client_id
            )
            self._client_secret = user_pool_client["UserPoolClient"]["ClientSecret"]
        except (BotoCoreError, ClientError):
            return

    def _get_secret_values(self):
        """Get secret value from Secrets Manager"""
        try:
            client = boto3.client("secretsmanager")
            secret_response = client.get_secret_value(SecretId=self._secret_arn)
        except (BotoCoreError, ClientError):
            return
        secret_string = secret_response.get("SecretString")
        if not secret_string:
            raise ValueError("Secret value not found for secret")
        try:
            secret_data = json.loads(secret_string)
            self._token_url = secret_data.get("authorization_endpoint")
            self._client_id = secret_data.get("client_id")
            self._client_secret = secret_data.get("client_secret")
        except json.JSONDecodeError as e:
            raise ValueError("Secret value not valid json") from e

    def _request_token(self):
        """Request access token"""
        form_data = {
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            "grant_type": "client_credentials",
            "scope": self._scope,
        }
        resp = requests.post(self._token_url, data=form_data, timeout=30)
        resp.raise_for_status()
        token_response = resp.json()
        self._access_token = token_response["access_token"]
        self._expires_at = datetime.now() + timedelta(
            seconds=(
                token_response["expires_in"] - 30
            )  # 30 seconds of overlap with expiry
        )
