import importlib.util
import inspect
import json
import sys
import types
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import boto3
import pytest
from mediatimestamp.immutable import TimeRange, Timestamp

FUNCTION_DIR = Path(__file__).resolve().parents[1]
PTS_RATE = 90_000
PTS_WRAP_COUNT = 1 << 33


def pts(count: int) -> Timestamp:
    return Timestamp.from_count(count, PTS_RATE)


@pytest.fixture
def app(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("IDEMPOTENCY_TABLE", "test-table")
    monkeypatch.setenv("MANIFEST_QUEUE_URL", "https://sqs.example/manifest")
    monkeypatch.setenv("INGEST_QUEUE_URL", "https://sqs.example/ingest")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")

    clients = {}

    def client(service_name: str):
        clients[service_name] = MagicMock(name=service_name)
        return clients[service_name]

    monkeypatch.setattr(boto3, "client", client)
    monkeypatch.setattr(boto3, "resource", MagicMock())

    ffprobe = types.ModuleType("ffprobe")
    ffprobe.ffprobe_link = MagicMock()
    monkeypatch.setitem(sys.modules, "ffprobe", ffprobe)
    monkeypatch.syspath_prepend(str(FUNCTION_DIR))

    spec = importlib.util.spec_from_file_location(
        "sqs_media_manifest_app",
        FUNCTION_DIR / "app.py",
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module._test_clients = clients
    return module


def test_process_segment_reanchors_wrapped_pts_at_last_end(app, monkeypatch) -> None:
    offset = Timestamp.from_str("1700000000:0")
    last_end = offset + pts(PTS_WRAP_COUNT)
    duration = pts(6 * PTS_RATE)
    state = {
        "ts_offset": offset,
        "last_end": last_end,
        "last_pts": pts(PTS_WRAP_COUNT - (6 * PTS_RATE)),
        "pts_anchor_uncertain": False,
    }
    segment = SimpleNamespace(
        uri="segment.ts",
        byterange=None,
        duration=6,
        discontinuity=False,
    )
    records = []
    monkeypatch.setattr(app, "probe_segment", lambda *_: (Timestamp(), duration))

    app.process_segment(state, segment, "flow-id", "s3://bucket/live", records)

    timerange = TimeRange.from_str(records[0]["timerange"])
    assert timerange.start == last_end
    assert state["last_end"] == last_end + duration
    assert state["ts_offset"] == last_end
    assert state["last_pts"] == Timestamp()


def test_process_message_persists_last_pts_for_the_next_poll(
    app,
    monkeypatch,
) -> None:
    segment = SimpleNamespace(
        media_sequence=1,
        uri="segment.ts",
        byterange=None,
        duration=6,
        discontinuity=False,
    )
    manifest = SimpleNamespace(
        is_variant=False,
        is_endlist=False,
        segments=[segment],
        target_duration=6,
    )
    monkeypatch.setattr(app, "get_manifest", lambda *_: manifest)
    monkeypatch.setattr(app, "get_manifest_start_pdt", lambda *_: 1_700_000_000)
    monkeypatch.setattr(
        app,
        "probe_segment",
        lambda *_: (pts(100 * PTS_RATE), pts(6 * PTS_RATE)),
    )
    monkeypatch.setattr(app, "send_message_batch", MagicMock())
    monkeypatch.setattr(app.time, "time", lambda: 2.0)

    @contextmanager
    def fake_single_metric(**_kwargs):
        yield MagicMock()

    monkeypatch.setattr(app, "single_metric", fake_single_metric)
    process_message = inspect.unwrap(app.process_message)
    process_message(
        message={
            "flowId": "flow-id",
            "manifestLocation": "s3://bucket/live/index.m3u8",
            "lastMediaSequence": 0,
            "eventTimestamp": 1,
        },
        task_token="task-token",
    )

    send_call = app._test_clients["sqs"].send_message.call_args.kwargs
    next_message = json.loads(send_call["MessageBody"])
    assert next_message["lastPts"] == str(pts(100 * PTS_RATE))
    assert next_message["eventTimestamp"] == 2000


def test_process_segment_keeps_last_valid_pts_after_probe_failure(
    app,
    monkeypatch,
) -> None:
    previous_pts = pts(PTS_WRAP_COUNT - (6 * PTS_RATE))
    offset = Timestamp.from_str("1700000000:0")
    state = {
        "ts_offset": offset,
        "last_end": offset + pts(PTS_WRAP_COUNT),
        "last_pts": previous_pts,
        "pts_anchor_uncertain": False,
    }
    segment = SimpleNamespace(
        uri="segment.ts",
        byterange=None,
        duration=6,
        discontinuity=False,
    )
    monkeypatch.setattr(
        app,
        "probe_segment",
        lambda *_: (None, pts(6 * PTS_RATE)),
    )

    app.process_segment(state, segment, "flow-id", "s3://bucket/live", [])

    assert state["last_pts"] is None
    assert state["pts_anchor_uncertain"] is True


def test_zero_pts_without_wrap_does_not_poison_the_next_valid_pts(
    app,
    monkeypatch,
) -> None:
    offset = Timestamp.from_str("1700000000:0")
    duration = pts(6 * PTS_RATE)
    state = {
        "ts_offset": offset,
        "last_end": offset + pts(106 * PTS_RATE),
        "last_pts": pts(100 * PTS_RATE),
        "pts_anchor_uncertain": False,
    }
    segment = SimpleNamespace(
        uri="segment.ts",
        byterange=None,
        duration=6,
        discontinuity=False,
    )
    monkeypatch.setattr(
        app,
        "probe_segment",
        MagicMock(
            side_effect=[
                (Timestamp(), duration),
                (pts(112 * PTS_RATE), duration),
            ]
        ),
    )
    records = []

    app.process_segment(state, segment, "flow-id", "s3://bucket/live", records)
    app.process_segment(state, segment, "flow-id", "s3://bucket/live", records)

    first = TimeRange.from_str(records[0]["timerange"])
    second = TimeRange.from_str(records[1]["timerange"])
    assert first.start == offset + pts(106 * PTS_RATE)
    assert second.start == first.end
    assert state["last_pts"] == pts(112 * PTS_RATE)
    assert state["pts_anchor_uncertain"] is False


def test_valid_pts_reanchors_after_a_missing_pts_start(
    app,
    monkeypatch,
) -> None:
    flow_start = Timestamp.from_str("1700000000:0")
    duration = pts(6 * PTS_RATE)
    state = {
        "ts_offset": None,
        "last_end": flow_start,
        "last_pts": None,
        "pts_anchor_uncertain": False,
    }
    segment = SimpleNamespace(
        uri="segment.ts",
        byterange=None,
        duration=6,
        discontinuity=False,
    )
    monkeypatch.setattr(
        app,
        "probe_segment",
        MagicMock(
            side_effect=[
                (None, duration),
                (pts(1000 * PTS_RATE), duration),
            ]
        ),
    )
    records = []

    app.process_segment(state, segment, "flow-id", "s3://bucket/live", records)
    app.process_segment(state, segment, "flow-id", "s3://bucket/live", records)

    first = TimeRange.from_str(records[0]["timerange"])
    second = TimeRange.from_str(records[1]["timerange"])
    assert first.start == flow_start
    assert second.start == first.end
    assert state["last_pts"] == pts(1000 * PTS_RATE)


@pytest.mark.parametrize("missing_pts", [None, Timestamp()])
def test_reanchors_after_missing_pts_when_duration_drift_would_overlap(
    app,
    monkeypatch,
    missing_pts,
) -> None:
    offset = Timestamp.from_str("1700000000:0")
    duration = pts(6 * PTS_RATE)
    state = {
        "ts_offset": offset,
        "last_end": offset + pts(100 * PTS_RATE),
        "last_pts": pts(100 * PTS_RATE),
        "pts_anchor_uncertain": False,
    }
    segment = SimpleNamespace(
        uri="segment.ts",
        byterange=None,
        duration=6,
        discontinuity=False,
    )
    monkeypatch.setattr(
        app,
        "probe_segment",
        MagicMock(
            side_effect=[
                (missing_pts, duration),
                (pts(int(105.9 * PTS_RATE)), duration),
            ]
        ),
    )
    records = []

    app.process_segment(state, segment, "flow-id", "s3://bucket/live", records)
    first_end = TimeRange.from_str(records[0]["timerange"]).end
    assert state["pts_anchor_uncertain"] is True

    app.process_segment(state, segment, "flow-id", "s3://bucket/live", records)

    second = TimeRange.from_str(records[1]["timerange"])
    assert second.start == first_end
    assert state["last_pts"] == pts(int(105.9 * PTS_RATE))
    assert state["pts_anchor_uncertain"] is False


def test_send_message_batch_retries_only_failed_entries(app, monkeypatch) -> None:
    monkeypatch.setattr(app.time, "sleep", MagicMock())
    sqs = app._test_clients["sqs"]
    sqs.send_message_batch.side_effect = [
        {
            "Successful": [{"Id": "0"}],
            "Failed": [{"Id": "1", "SenderFault": False, "Code": "Throttled"}],
        },
        {"Successful": [{"Id": "1"}], "Failed": []},
    ]

    app.send_message_batch([{"segment": 0}, {"segment": 1}])

    assert sqs.send_message_batch.call_count == 2
    assert [
        entry["Id"]
        for entry in sqs.send_message_batch.call_args_list[0].kwargs["Entries"]
    ] == [
        "0",
        "1",
    ]
    assert [
        entry["Id"]
        for entry in sqs.send_message_batch.call_args_list[1].kwargs["Entries"]
    ] == ["1"]


def test_send_message_batch_raises_after_retry_exhaustion(app, monkeypatch) -> None:
    monkeypatch.setattr(app.time, "sleep", MagicMock())
    sqs = app._test_clients["sqs"]
    sqs.send_message_batch.return_value = {
        "Failed": [{"Id": "0", "SenderFault": False, "Code": "InternalError"}]
    }

    with pytest.raises(RuntimeError, match="retries exhausted"):
        app.send_message_batch([{"segment": 0}])

    assert sqs.send_message_batch.call_count == app.MAX_BATCH_SEND_ATTEMPTS


def test_empty_playlist_does_not_serialize_none_as_an_offset(app, monkeypatch) -> None:
    manifest = SimpleNamespace(
        is_variant=False,
        is_endlist=False,
        segments=[],
        target_duration=6,
    )
    monkeypatch.setattr(app, "get_manifest", lambda *_: manifest)
    monkeypatch.setattr(app, "get_manifest_start_pdt", lambda *_: 1_700_000_000)
    monkeypatch.setattr(app, "send_message_batch", MagicMock())
    monkeypatch.setattr(app.time, "time", lambda: 2.0)

    @contextmanager
    def fake_single_metric(**_kwargs):
        yield MagicMock()

    monkeypatch.setattr(app, "single_metric", fake_single_metric)
    process_message = inspect.unwrap(app.process_message)
    process_message(
        message={
            "flowId": "flow-id",
            "manifestLocation": "s3://bucket/live/index.m3u8",
            "lastMediaSequence": 0,
            "eventTimestamp": 1,
        },
        task_token="task-token",
    )

    next_message = json.loads(
        app._test_clients["sqs"].send_message.call_args.kwargs["MessageBody"]
    )
    assert "tsOffset" not in next_message
    assert "lastEnd" not in next_message
    assert next_message["eventTimestamp"] == 2000


def test_unchanged_playlist_self_polls_keep_heartbeating_and_requeueing(
    app,
    monkeypatch,
) -> None:
    manifest = SimpleNamespace(
        is_variant=False,
        is_endlist=False,
        segments=[],
        target_duration=6,
    )
    monkeypatch.setattr(app, "get_manifest", lambda *_: manifest)
    monkeypatch.setattr(app, "get_manifest_start_pdt", lambda *_: 1_700_000_000)
    monkeypatch.setattr(app, "normalize_byterange_offsets", lambda *_: None)
    monkeypatch.setattr(app, "send_message_batch", MagicMock())
    timestamps = iter([2.0, 3.0])
    monkeypatch.setattr(app.time, "time", lambda: next(timestamps))

    @contextmanager
    def fake_single_metric(**_kwargs):
        yield MagicMock()

    monkeypatch.setattr(app, "single_metric", fake_single_metric)
    process_message = inspect.unwrap(app.process_message)
    first_message = {
        "flowId": "flow-id",
        "manifestLocation": "s3://bucket/live/index.m3u8",
        "lastMediaSequence": 0,
        "eventTimestamp": 1,
    }

    process_message(message=first_message, task_token="task-token")
    second_message = json.loads(
        app._test_clients["sqs"].send_message.call_args.kwargs["MessageBody"]
    )
    process_message(message=second_message, task_token="task-token")
    third_message = json.loads(
        app._test_clients["sqs"].send_message.call_args.kwargs["MessageBody"]
    )

    assert app._test_clients["stepfunctions"].send_task_heartbeat.call_count == 2
    assert app._test_clients["sqs"].send_message.call_count == 2
    assert second_message["lastMediaSequence"] == first_message["lastMediaSequence"]
    assert third_message["lastMediaSequence"] == first_message["lastMediaSequence"]
    assert second_message["eventTimestamp"] == 2000
    assert third_message["eventTimestamp"] == 3000
    assert (
        second_message["flowId"],
        second_message["lastMediaSequence"],
        second_message["eventTimestamp"],
    ) != (
        first_message["flowId"],
        first_message["lastMediaSequence"],
        first_message["eventTimestamp"],
    )


def test_exact_delivery_keeps_the_same_idempotency_identity(app) -> None:
    message = {
        "flowId": "flow-id",
        "lastMediaSequence": 42,
        "eventTimestamp": 1234,
    }
    duplicate = dict(message)

    assert (
        app.idempotency_config.event_key_jmespath
        == '["flowId", "lastMediaSequence", "eventTimestamp"]'
    )
    assert (
        duplicate["flowId"],
        duplicate["lastMediaSequence"],
        duplicate["eventTimestamp"],
    ) == (
        message["flowId"],
        message["lastMediaSequence"],
        message["eventTimestamp"],
    )


def test_poll_timestamp_advances_when_clock_does_not(app, monkeypatch) -> None:
    monkeypatch.setattr(app.time, "time", lambda: 1.0)

    assert app.next_poll_event_timestamp(1000) == 1001
