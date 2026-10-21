"""Unit tests for the sqs-media-manifest Lambda's segment timing.

Run from the backend folder:
    uv run --with boto3 --with aws-xray-sdk python -m unittest discover -s components/ingest-hls/tests
"""

import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

import m3u8
from mediatimestamp.immutable import TimeRange, Timestamp

COMPONENT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(COMPONENT / "functions" / "sqs-media-manifest"))
sys.path.insert(0, str(COMPONENT / "layers" / "ffprobe"))
os.environ.setdefault("AWS_DEFAULT_REGION", "eu-west-2")
os.environ.setdefault("IDEMPOTENCY_TABLE", "test-table")
os.environ.setdefault("MANIFEST_QUEUE_URL", "https://sqs.example/manifest")
os.environ.setdefault("INGEST_QUEUE_URL", "https://sqs.example/ingest")
os.environ.setdefault("POWERTOOLS_IDEMPOTENCY_DISABLED", "1")
os.environ.setdefault("POWERTOOLS_TRACE_DISABLED", "1")
os.environ.setdefault("POWERTOOLS_METRICS_NAMESPACE", "test")

import app  # noqa: E402  pylint: disable=wrong-import-position

RATE = 90000
SEGMENT = Timestamp.from_count(6 * RATE, RATE)
WRAP_TICKS = 2**33
# Values seen on the MediaLive ingest that stalled at the first wrap
FLOW_START = Timestamp.from_str("1792145456:700000000")


def pts(ticks: int) -> Timestamp:
    return Timestamp.from_count(ticks, RATE)


def build_manifest(count: int, first_sequence: int = 0, endlist: bool = False) -> str:
    lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:6",
        f"#EXT-X-MEDIA-SEQUENCE:{first_sequence}",
        "#EXT-X-PROGRAM-DATE-TIME:2026-10-16T10:10:56.700Z",
    ]
    for i in range(count):
        lines += ["#EXTINF:6.000,", f"seg_{first_sequence + i}.ts"]
    if endlist:
        lines.append("#EXT-X-ENDLIST")
    return "\n".join(lines) + "\n"


def segments(count: int = 1, discontinuity_at: int | None = None) -> list:
    manifest = m3u8.loads(build_manifest(count))
    if discontinuity_at is not None:
        manifest.segments[discontinuity_at].discontinuity = True
    return manifest.segments


class SegmentTimingTest(unittest.TestCase):
    """Drives process_segment with a scripted sequence of probe results."""

    def setUp(self) -> None:
        self.state = {}
        self.segment_ts_offsets = []

    def run_segments(self, probes: list, state: dict | None = None, **kwargs) -> list:
        state = state or {
            "ts_offset": None,
            "last_end": FLOW_START,
            "pts_anchored": False,
            "pts_wraps": 0,
        }
        self.state = state
        out = []
        with mock.patch.object(app, "probe_segment", side_effect=probes):
            for segment in segments(len(probes), **kwargs):
                app.process_segment(state, segment, "flow", "s3://bucket/path", out)
        self.segment_ts_offsets = [
            Timestamp.from_str(s["ts_offset"]) if "ts_offset" in s else Timestamp()
            for s in out
        ]
        return [TimeRange.from_str(s["timerange"]) for s in out]

    def assert_contiguous(self, timeranges: list) -> None:
        for previous, current in zip(timeranges, timeranges[1:]):
            self.assertEqual(previous.end, current.start)

    def test_forward_pts_keeps_a_single_offset(self) -> None:
        base = 10_000 * RATE
        timeranges = self.run_segments(
            [(pts(base + i * 6 * RATE), SEGMENT, True) for i in range(3)]
        )
        self.assert_contiguous(timeranges)
        self.assertEqual(timeranges[0].start, FLOW_START)
        self.assertEqual(self.state["ts_offset"], FLOW_START - pts(base))

    def test_mpegts_wrap_is_exactly_contiguous(self) -> None:
        # The segment after the wrap must start on the previous end to the nanosecond:
        # TAMS rejects even a 1ns overlap, which is what adding a rounded wrap duration
        # to ts_offset produced on the live MediaLive soak test.
        for after_wrap in (1, 3000, 27000, 186006):
            with self.subTest(after_wrap=after_wrap):
                before_wrap = WRAP_TICKS - 6 * RATE + after_wrap
                timeranges = self.run_segments(
                    [
                        (pts(before_wrap), SEGMENT, True),
                        (pts(after_wrap), SEGMENT, True),
                        (pts(after_wrap + 6 * RATE), SEGMENT, True),
                    ]
                )
                self.assert_contiguous(timeranges)
                self.assertEqual(self.state["ts_offset"], FLOW_START - pts(before_wrap))
                self.assertEqual(self.state["pts_wraps"], 1)
                self.assertEqual(
                    self.segment_ts_offsets[-1],
                    self.state["ts_offset"] + pts(WRAP_TICKS),
                )

    def test_soak_test_wrap_is_exactly_contiguous(self) -> None:
        # Segments 15907/15908 from the MediaLive soak test, where 15908 was rejected by
        # TAMS for overlapping 15907 by 1ns.
        state = {
            "ts_offset": Timestamp.from_str("1792419287:367000000"),
            "last_end": Timestamp.from_str("1792514725:667000000"),
            "pts_anchored": True,
            "pts_wraps": 0,
        }
        timeranges = self.run_segments(
            [(pts(8589447000), SEGMENT, True), (pts(52408), SEGMENT, True)],
            state=state,
        )
        self.assertEqual(
            str(timeranges[0]), "[1792514725:667000000_1792514731:667000000)"
        )
        self.assertEqual(timeranges[1].start, timeranges[0].end)

    def test_wrap_detected_after_a_zero_pts_segment(self) -> None:
        state = {
            "ts_offset": FLOW_START,
            "last_end": FLOW_START + pts(WRAP_TICKS),
            "pts_anchored": True,
            "pts_wraps": 0,
        }
        timeranges = self.run_segments([(pts(0), SEGMENT, True)], state=state)
        # PTS 0 counts as "no usable PTS", so it carries on from last_end
        self.assertEqual(timeranges[0].start, FLOW_START + pts(WRAP_TICKS))
        timeranges = self.run_segments([(pts(6 * RATE), SEGMENT, True)], state=state)
        self.assertEqual(timeranges[0].start, FLOW_START + pts(WRAP_TICKS + 6 * RATE))
        self.assertEqual(state["ts_offset"], FLOW_START)
        self.assertEqual(state["pts_wraps"], 1)

    def test_second_wrap_stays_exactly_contiguous(self) -> None:
        after_wrap = 27000
        state = {
            "ts_offset": FLOW_START,
            "last_end": FLOW_START + pts(2 * WRAP_TICKS + after_wrap),
            "pts_anchored": True,
            "pts_wraps": 1,
        }
        timeranges = self.run_segments([(pts(after_wrap), SEGMENT, True)], state=state)
        self.assertEqual(timeranges[0].start, state["last_end"] - SEGMENT)
        self.assertEqual(state["pts_wraps"], 2)

    def test_new_region_resets_the_wrap_count(self) -> None:
        state = {
            "ts_offset": FLOW_START,
            "last_end": FLOW_START + pts(WRAP_TICKS + 6 * RATE),
            "pts_anchored": True,
            "pts_wraps": 1,
        }
        timeranges = self.run_segments(
            [(pts(500 * RATE), SEGMENT, True)], state=state, discontinuity_at=0
        )
        self.assertEqual(timeranges[0].start, FLOW_START + pts(WRAP_TICKS + 6 * RATE))
        self.assertEqual(state["pts_wraps"], 0)
        self.assertEqual(self.segment_ts_offsets[-1], state["ts_offset"])

    def test_wrap_is_not_applied_to_non_mpegts_media(self) -> None:
        # fMP4 / CMAF timestamps are 64-bit and never wrap. A huge backward jump is a
        # clock reset, so it starts a new region instead of adding an MPEG-TS wrap.
        start = WRAP_TICKS - 6 * RATE
        timeranges = self.run_segments(
            [(pts(start), SEGMENT, False), (pts(1000), SEGMENT, False)]
        )
        self.assert_contiguous(timeranges)
        self.assertEqual(self.state["ts_offset"], timeranges[1].start - pts(1000))

    def test_backward_jump_without_discontinuity_starts_new_region(self) -> None:
        base = 50_000 * RATE
        reset = 3 * 3600 * RATE
        timeranges = self.run_segments(
            [
                (pts(base), SEGMENT, True),
                (pts(base + 6 * RATE), SEGMENT, True),
                (pts(base - reset), SEGMENT, True),
                (pts(base - reset + 6 * RATE), SEGMENT, True),
            ]
        )
        self.assert_contiguous(timeranges)
        self.assertEqual(
            self.state["ts_offset"], timeranges[2].start - pts(base - reset)
        )

    def test_small_overlap_is_left_for_tams_to_reject(self) -> None:
        # Only a segment lying wholly inside registered time is treated as a reset.
        # A partial overlap keeps the PTS mapping rather than ratcheting the anchor.
        base = 50_000 * RATE
        timeranges = self.run_segments(
            [(pts(base), SEGMENT, True), (pts(base + 5 * RATE), SEGMENT, True)]
        )
        self.assertLess(timeranges[1].start, timeranges[0].end)
        self.assertEqual(self.state["ts_offset"], FLOW_START - pts(base))

    def test_discontinuity_still_starts_new_region(self) -> None:
        timeranges = self.run_segments(
            [(pts(90 * RATE), SEGMENT, True), (pts(500 * RATE), SEGMENT, True)],
            discontinuity_at=1,
        )
        self.assert_contiguous(timeranges)
        self.assertEqual(self.state["ts_offset"], timeranges[1].start - pts(500 * RATE))

    def test_region_anchored_without_pts_reanchors_on_first_real_pts(self) -> None:
        timeranges = self.run_segments(
            [
                (None, SEGMENT, False),
                (pts(36_000 * RATE), SEGMENT, True),
                (pts(36_006 * RATE), SEGMENT, True),
            ]
        )
        # Without re-anchoring the second segment would land 10 hours in the future
        self.assert_contiguous(timeranges)
        self.assertTrue(self.state["pts_anchored"])

    def test_probe_failure_mid_region_keeps_the_pts_anchor(self) -> None:
        base = 1_000 * RATE
        timeranges = self.run_segments(
            [
                (pts(base), SEGMENT, True),
                (None, SEGMENT, False),
                (pts(base + 12 * RATE), SEGMENT, True),
            ]
        )
        self.assert_contiguous(timeranges)
        self.assertEqual(self.state["ts_offset"], FLOW_START - pts(base))

    def test_media_without_pts_accumulates_durations(self) -> None:
        timeranges = self.run_segments([(None, SEGMENT, False)] * 3)
        self.assert_contiguous(timeranges)
        self.assertEqual(timeranges[0].start, FLOW_START)
        self.assertFalse(self.state["pts_anchored"])


class ProcessMessageTest(unittest.TestCase):
    """Drives process_message to check what is carried between polls."""

    def setUp(self) -> None:
        self.sent_segments = []

    def poll(self, message: dict, manifest_text: str, probes: list) -> dict:
        with (
            mock.patch.object(
                app, "get_manifest", return_value=m3u8.loads(manifest_text)
            ),
            mock.patch.object(app, "probe_segment", side_effect=probes),
            mock.patch.object(app, "send_message_batch") as send_batch,
            mock.patch.object(app, "sfn"),
            mock.patch.object(app, "sqs") as sqs,
        ):
            app.process_message(message=message, task_token="token")
        self.sent_segments = [
            s for call in send_batch.call_args_list for s in call.args[0]
        ]
        return json.loads(sqs.send_message.call_args.kwargs["MessageBody"])

    def first_message(self) -> dict:
        return {
            "flowId": "flow",
            "manifestLocation": "s3://bucket/path/index.m3u8",
            "lastMediaSequence": -1,
            "eventTimestamp": 0,
        }

    def test_empty_first_poll_does_not_persist_an_anchor(self) -> None:
        next_message = self.poll(self.first_message(), build_manifest(0), [])
        self.assertNotIn("tsOffset", next_message)
        self.assertNotIn("lastEnd", next_message)
        # The following poll takes the first-poll path and anchors normally
        next_message = self.poll(
            next_message, build_manifest(1), [(pts(RATE), SEGMENT, True)]
        )
        self.assertIn("tsOffset", next_message)

    def test_wrap_state_survives_between_polls(self) -> None:
        before_wrap = WRAP_TICKS - 6 * RATE + 27000
        next_message = self.poll(
            self.first_message(), build_manifest(1), [(pts(before_wrap), SEGMENT, True)]
        )
        self.assertTrue(next_message["ptsAnchored"])
        first = TimeRange.from_str(self.sent_segments[0]["timerange"])
        next_message = self.poll(
            next_message, build_manifest(2), [(pts(27000), SEGMENT, True)]
        )
        second = TimeRange.from_str(self.sent_segments[0]["timerange"])
        self.assertEqual(second.start, first.end)
        self.assertEqual(next_message["ptsWraps"], 1)

    def test_messages_from_before_pts_anchored_keep_existing_behaviour(self) -> None:
        message = {
            **self.first_message(),
            "lastMediaSequence": 0,
            "tsOffset": str(FLOW_START),
            "lastEnd": str(FLOW_START + SEGMENT),
        }
        self.poll(message, build_manifest(2), [(pts(6 * RATE), SEGMENT, True)])
        timerange = TimeRange.from_str(self.sent_segments[0]["timerange"])
        self.assertEqual(timerange.start, FLOW_START + SEGMENT)

    def test_flow_start_keeps_sub_second_precision(self) -> None:
        manifest = m3u8.loads(build_manifest(1))
        self.assertEqual(app.get_manifest_start_pdt(manifest), FLOW_START)


if __name__ == "__main__":
    unittest.main()
