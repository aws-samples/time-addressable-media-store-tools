import re
from http import HTTPStatus
from urllib.parse import urlparse
from typing import Callable, Tuple

import boto3
from aws_lambda_powertools.utilities.data_classes.s3_object_event import (
    S3ObjectLambdaEvent,
)

s3_client = boto3.client("s3")


class S3ObjectLambdaResolver:
    def __init__(self):
        self.routes: list[Tuple[str, str, Callable]] = []

    def key(self, path: str):
        def decorator(func: Callable):
            pattern = re.sub(r"<(\w+)>", r"(?P<\1>[^/]+)", path)
            self.routes.append((f"^{pattern}$", path, func))
            return func

        return decorator

    # pylint: disable=unused-argument
    def resolve(self, event, context):
        event = S3ObjectLambdaEvent(event)
        path = urlparse(event.user_request.url).path
        for pattern, _, func in self.routes:
            match = re.match(pattern, path)
            if match:
                response = func(**match.groupdict())
                s3_client.write_get_object_response(
                    RequestRoute=event.request_route,
                    RequestToken=event.request_token,
                    Body=response.body,
                    StatusCode=response.status_code,
                    ContentType=response.content_type,
                )
                return

        # return 404 if no route matches
        s3_client.write_get_object_response(
            RequestRoute=event.request_route,
            RequestToken=event.request_token,
            StatusCode=HTTPStatus.NOT_FOUND,
        )
