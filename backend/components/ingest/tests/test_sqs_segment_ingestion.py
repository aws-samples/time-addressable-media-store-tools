"""Unit tests for the sqs-segment-ingestion Lambda's handling of duplicates.

Run from the backend folder:
    uv run --with boto3 --with aws-xray-sdk --with mediatimestamp python -m unittest discover -s components/ingest/tests
"""

import json
import os
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

import requests

COMPONENT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(COMPONENT / "functions" / "sqs-segment-ingestion"))
os.environ.setdefault("AWS_DEFAULT_REGION", "eu-west-2")
os.environ.setdefault("TAMS_ENDPOINT", "https://tams.example")
os.environ.setdefault("SECRET_ARN", "arn:aws:secretsmanager:eu-west-2:0:secret:test")
os.environ.setdefault("POWERTOOLS_TRACE_DISABLED", "1")
os.environ.setdefault("POWERTOOLS_METRICS_NAMESPACE", "test")
# The real Credentials reads a secret when constructed
sys.modules["openid_auth"] = types.SimpleNamespace(
    Credentials=lambda **_: mock.Mock(token=lambda: "token")
)

import app  # noqa: E402  pylint: disable=wrong-import-position

FLOW_ID = "00000000-0000-4000-8000-000000000001"
TIMERANGE = "[10:0_16:0)"
INIT_ID = "00000000-0000-5000-8000-0000000000aa"


def response(status: int, body=None) -> requests.Response:
    result = requests.Response()
    result.status_code = status
    result.url = "https://tams.example"
    result._content = json.dumps(body).encode() if body is not None else b""  # pylint: disable=protected-access
    return result


class FakeTams:
    """Answers the TAMS API calls record_handler makes, and records what it was sent."""

    def __init__(self, registered_segments=None, allocated=(), registered_objects=()):
        self.registered_segments = registered_segments or []
        self.allocated = set(allocated)
        self.registered_objects = set(registered_objects)
        self.posted_segments = []
        self.put_urls = []
        self.new_ids = 0

    def get(self, url, **kwargs):
        if url.endswith("/segments"):
            return response(200, self.registered_segments)
        return response(200, {"format": "urn:x-tam:format:video"})

    def head(self, url, **kwargs):
        object_id = url.rsplit("/", 1)[1]
        return response(200 if object_id in self.registered_objects else 404)

    def post(self, url, data=None, **kwargs):
        body = json.loads(data)
        if url.endswith("/segments"):
            self.posted_segments.append(body)
            return response(201)
        object_ids = body.get("object_ids")
        if object_ids and set(object_ids) & self.allocated:
            return response(
                400, {"message": "If object_ids supplied, some or all already exist."}
            )
        if not object_ids:
            self.new_ids += 1
            object_ids = [f"new-{self.new_ids}"]
        self.allocated.update(object_ids)
        return response(
            201,
            {
                "media_objects": [
                    {
                        "object_id": object_id,
                        "put_url": {
                            "url": f"https://s3.example/{object_id}",
                            "content-type": "video/mp2t",
                        },
                    }
                    for object_id in object_ids
                ]
            },
        )

    def put(self, url, **kwargs):
        self.put_urls.append(url)
        return response(200)


class RecordHandlerTest(unittest.TestCase):
    def handle(self, tams: FakeTams, **message) -> types.SimpleNamespace:
        """Runs record_handler on one message, returning the get_file and delete_s3_file mocks."""
        body = {
            "flowId": FLOW_ID,
            "timerange": TIMERANGE,
            "uri": "s3://source/seg_1.ts",
            **message,
        }
        record = mock.Mock(
            body=json.dumps(body),
            attributes=mock.Mock(
                sent_timestamp="0", approximate_first_receive_timestamp="0"
            ),
        )
        with (
            mock.patch.object(app.requests, "get", side_effect=tams.get),
            mock.patch.object(app.requests, "head", side_effect=tams.head),
            mock.patch.object(app.requests, "post", side_effect=tams.post),
            mock.patch.object(app.requests, "put", side_effect=tams.put),
            mock.patch.object(app, "get_file", return_value=b"media") as get_file,
            mock.patch.object(app, "delete_s3_file") as delete_s3_file,
        ):
            app.record_handler(record)
        return types.SimpleNamespace(get_file=get_file, delete_s3_file=delete_s3_file)

    def test_registered_segment_is_skipped(self) -> None:
        tams = FakeTams(
            registered_segments=[{"timerange": "[10:0_16:0)", "object_id": "a"}]
        )
        calls = self.handle(tams, deleteSource=True)
        calls.get_file.assert_not_called()
        self.assertEqual(tams.allocated, set())
        self.assertEqual(tams.posted_segments, [])
        calls.delete_s3_file.assert_called_once_with("s3://source/seg_1.ts")

    def test_timerange_match_is_exact(self) -> None:
        # An overlapping segment is not a duplicate, so this still goes on to TAMS
        tams = FakeTams(
            registered_segments=[{"timerange": "[10:0_16:500000000)", "object_id": "a"}]
        )
        self.handle(tams)
        self.assertEqual(len(tams.posted_segments), 1)

    def test_different_object_id_is_not_a_duplicate(self) -> None:
        tams = FakeTams(
            registered_segments=[{"timerange": TIMERANGE, "object_id": "a"}]
        )
        self.handle(tams, object_id="b")
        self.assertEqual(len(tams.posted_segments), 1)

    def test_registered_object_is_not_uploaded_again(self) -> None:
        tams = FakeTams(allocated={"a"}, registered_objects={"a"})
        self.handle(tams, object_id="a")
        self.assertEqual(tams.put_urls, [])
        self.assertEqual(tams.posted_segments[0]["object_id"], "a")

    def test_allocated_object_that_is_not_registered_fails_the_message(self) -> None:
        # Registering against it would point the segment at an Object that may not exist
        tams = FakeTams(allocated={"a"})
        with self.assertRaises(app.ObjectNotRegisteredError):
            self.handle(tams, object_id="a")
        self.assertEqual(tams.posted_segments, [])

    def test_registered_init_object_is_reused(self) -> None:
        tams = FakeTams(allocated={INIT_ID}, registered_objects={INIT_ID})
        self.handle(tams, initUri="s3://source/init.mp4", initObjectId=INIT_ID)
        self.assertEqual(tams.put_urls, ["https://s3.example/new-1"])
        self.assertEqual(tams.posted_segments[0]["init_object_id"], INIT_ID)

    def test_init_object_that_is_not_registered_is_uploaded_under_a_new_id(
        self,
    ) -> None:
        tams = FakeTams(allocated={INIT_ID})
        self.handle(tams, initUri="s3://source/init.mp4", initObjectId=INIT_ID)
        self.assertEqual(
            tams.put_urls, ["https://s3.example/new-1", "https://s3.example/new-2"]
        )
        self.assertEqual(tams.posted_segments[0]["init_object_id"], "new-2")


if __name__ == "__main__":
    unittest.main()
