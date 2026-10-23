"""Unit tests for the sqs-media-manifest Lambda's segment timing.

Run from the backend folder:
    uv run --with boto3 --with aws-xray-sdk python -m unittest discover -s components/ingest-hls/tests
"""

import json
import os
import sys
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import m3u8
import requests
from aws_lambda_powertools.utilities.data_classes.sqs_event import SQSRecord
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


def pdt_tag(seconds_after_start: float) -> str:
    """An EXT-X-PROGRAM-DATE-TIME value this many seconds after FLOW_START"""
    value = datetime(2026, 10, 16, 10, 10, 56, 700000, tzinfo=timezone.utc)
    value += timedelta(seconds=seconds_after_start)
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def build_manifest(
    count: int,
    first_sequence: int = 0,
    endlist: bool = False,
    pdt_at: dict | None = None,
) -> str:
    lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:6",
        f"#EXT-X-MEDIA-SEQUENCE:{first_sequence}",
        "#EXT-X-PROGRAM-DATE-TIME:2026-10-16T10:10:56.700Z",
    ]
    for i in range(count):
        if pdt_at and i in pdt_at:
            lines.append(f"#EXT-X-PROGRAM-DATE-TIME:{pdt_at[i]}")
        lines += ["#EXTINF:6.000,", f"seg_{first_sequence + i}.ts"]
    if endlist:
        lines.append("#EXT-X-ENDLIST")
    return "\n".join(lines) + "\n"


def segments(
    count: int = 1, discontinuity_at: int | None = None, pdt_at: dict | None = None
) -> list:
    manifest = m3u8.loads(build_manifest(count, pdt_at=pdt_at))
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

    def test_partial_overlap_is_trimmed_not_rejected(self) -> None:
        # A segment that partly overlaps the previous one has its start trimmed, so
        # TAMS accepts it. Its end and ts_offset keep following the PTS.
        base = 50_000 * RATE
        timeranges = self.run_segments(
            [
                (pts(base), SEGMENT, True),
                (pts(base + 5 * RATE), SEGMENT, True),
                (pts(base + 11 * RATE), SEGMENT, True),
            ]
        )
        self.assert_contiguous(timeranges)
        self.assertEqual(timeranges[1].end, FLOW_START + pts(11 * RATE))
        self.assertEqual(self.state["ts_offset"], FLOW_START - pts(base))

    def test_persistent_small_overlaps_neither_stall_nor_drift(self) -> None:
        # A source whose probed durations always run one frame longer than its PTS
        # steps must keep ingesting, without the timeline creeping ahead of the PTS.
        step = 6 * RATE
        frame = Timestamp.from_count(1, 50)
        base = 1_000 * RATE
        timeranges = self.run_segments(
            [(pts(base + i * step), SEGMENT + frame, True) for i in range(20)]
        )
        self.assert_contiguous(timeranges)
        # Each end is one frame past its PTS position; the error never accumulates
        self.assertEqual(
            timeranges[-1].end, FLOW_START + pts(19 * step) + SEGMENT + frame
        )
        self.assertEqual(self.state["ts_offset"], FLOW_START - pts(base))

    def test_ffprobe_negative_pts_before_the_wrap_is_normalised(self) -> None:
        # Real start_pts/duration_ts from a clip cut 42s before the wrap. ffprobe shifts
        # files that start within 60s of the wrap negative, then the true wrap follows.
        probes = [
            (-3808592, 693000),
            (-3115592, 450000),
            (-2665592, 786600),
            (-1878992, 450000),
            (-1428992, 450000),
            (-978992, 442800),
            (-536192, 529200),
            (-6992, 574200),
            (567208, 509400),
            (1076608, 592200),
            (1668808, 743400),
        ]
        timeranges = self.run_segments(
            [(pts(start), pts(length), True) for start, length in probes]
        )
        self.assert_contiguous(timeranges)
        self.assertEqual(self.state["pts_wraps"], 1)
        # The ts_offset sent to TAMS maps the PTS actually in each file
        self.assertEqual(
            self.segment_ts_offsets[0], FLOW_START - pts(WRAP_TICKS - 3808592)
        )
        self.assertEqual(
            self.segment_ts_offsets[8] - self.segment_ts_offsets[7], pts(WRAP_TICKS)
        )

    def test_ffprobe_shift_mid_region_is_not_mistaken_for_a_wrap(self) -> None:
        # Segments starting 66s and then 60s before the wrap: ffprobe reports the first
        # as positive and the second as negative, but they are contiguous media.
        first = WRAP_TICKS - 66 * RATE
        timeranges = self.run_segments(
            [
                (pts(first), SEGMENT, True),
                (pts(first + 6 * RATE - WRAP_TICKS), SEGMENT, True),
            ]
        )
        self.assert_contiguous(timeranges)
        self.assertEqual(self.state["pts_wraps"], 0)

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

    def test_media_without_pts_moves_forward_to_program_date_time(self) -> None:
        # Probed durations run 150 ms short, so by the tag on the third segment the
        # summed start is 300 ms behind the playlist clock
        short = Timestamp.from_millisec(5_850)
        timeranges = self.run_segments(
            [(None, short, False)] * 3, pdt_at={2: pdt_tag(12)}
        )
        self.assertEqual(timeranges[1].start, FLOW_START + short)
        self.assertEqual(timeranges[2].start, FLOW_START + pts(12 * RATE))
        self.assertEqual(self.state["ts_offset"], timeranges[2].start)

    def test_media_without_pts_within_threshold_stays_contiguous(self) -> None:
        short = Timestamp.from_millisec(5_950)
        timeranges = self.run_segments(
            [(None, short, False)] * 3, pdt_at={2: pdt_tag(12)}
        )
        self.assert_contiguous(timeranges)

    def test_media_without_pts_running_ahead_is_not_rewound(self) -> None:
        # 300 ms ahead of the tag, but moving back would overlap registered time
        long = Timestamp.from_millisec(6_150)
        timeranges = self.run_segments(
            [(None, long, False)] * 3, pdt_at={2: pdt_tag(12)}
        )
        self.assert_contiguous(timeranges)

    def test_discontinuity_keeps_placement_of_media_without_pts(self) -> None:
        # A 30 s outage behind a discontinuity. PTS media starts the new region at
        # the previous end, so media without PTS must too, or the Flows would split.
        timeranges = self.run_segments(
            [(None, SEGMENT, False)] * 3,
            discontinuity_at=1,
            pdt_at={1: pdt_tag(36), 2: pdt_tag(42)},
        )
        self.assert_contiguous(timeranges)

    def test_probe_failure_in_pts_region_ignores_program_date_time(self) -> None:
        # Failed probes in a PTS region carry on from the previous end. Following the
        # tags there (the second is 1 s off) would replace the PTS offset.
        base = 1_000 * RATE
        timeranges = self.run_segments(
            [
                (pts(base), SEGMENT, True),
                (None, SEGMENT, False),
                (pts(base + 12 * RATE), SEGMENT, True),
                (None, SEGMENT, False),
                (pts(base + 24 * RATE), SEGMENT, True),
            ],
            pdt_at={1: pdt_tag(6), 3: pdt_tag(19)},
        )
        self.assert_contiguous(timeranges)
        self.assertEqual(self.state["ts_offset"], FLOW_START - pts(base))


# Real ffprobe output for a raw ADTS AAC segment of 281 frames at 48 kHz (5.994667 s).
# ffprobe estimates duration_ts from the bitrate; the packets give the exact length.
ADTS_TIME_BASE = "1/28224000"
ADTS_FRAME_TICKS = 602112  # 1024 samples at 48 kHz in ADTS_TIME_BASE
ADTS_RATE = 28224000


def adts_probe(frames: int, estimated_ticks: int | None = None, codec_type="audio"):
    """ffprobe_link results for a raw segment of `frames` AAC frames: (plain, packets)."""
    stream = {
        "index": 0,
        "codec_type": codec_type,
        "time_base": ADTS_TIME_BASE,
        "duration_ts": estimated_ticks or frames * ADTS_FRAME_TICKS + 129776,
    }
    plain = {"streams": [stream], "format": {"format_name": "aac"}}
    packets = {
        **plain,
        "packets": [{"stream_index": 0, "duration": str(ADTS_FRAME_TICKS)}] * frames,
    }
    return plain, packets


class ExactAudioDurationTest(unittest.TestCase):
    """Raw audio without PTS takes its duration from its frames, not the bitrate estimate."""

    def probe(self, results: list):
        with mock.patch.object(app, "ffprobe_link", side_effect=results) as link:
            probed = app.probe_segment("s3://bucket/seg.aac", None, 6.0)
        return probed, link

    def test_raw_audio_duration_is_counted_from_frames(self) -> None:
        plain, packets = adts_probe(281, estimated_ticks=169323248)
        (start_pts, duration, is_mpegts), link = self.probe([plain, packets])
        self.assertIsNone(start_pts)
        self.assertFalse(is_mpegts)
        self.assertEqual(
            duration, Timestamp.from_count(281 * ADTS_FRAME_TICKS, ADTS_RATE)
        )
        self.assertEqual(link.call_args_list[1].kwargs["show_packets"], True)

    def test_audio_with_pts_is_probed_once(self) -> None:
        stream = {
            "index": 0,
            "codec_type": "audio",
            "time_base": "1/90000",
            "start_pts": 126000,
            "duration_ts": 540000,
        }
        (start_pts, duration, _), link = self.probe(
            [{"streams": [stream], "format": {"format_name": "mpegts"}}]
        )
        self.assertEqual(start_pts, pts(126000))
        self.assertEqual(duration, SEGMENT)
        self.assertEqual(link.call_count, 1)

    def test_subtitles_without_pts_keep_the_probed_duration(self) -> None:
        plain, _ = adts_probe(281, codec_type="subtitle")
        (_, duration, _), link = self.probe([plain])
        self.assertEqual(link.call_count, 1)
        self.assertEqual(
            duration,
            Timestamp.from_count(plain["streams"][0]["duration_ts"], ADTS_RATE),
        )

    def test_failed_frame_count_keeps_the_estimate(self) -> None:
        plain, _ = adts_probe(281, estimated_ticks=169323248)
        (_, duration, _), _ = self.probe([plain, None])
        self.assertEqual(duration, Timestamp.from_count(169323248, ADTS_RATE))

    def test_an_hour_of_medialive_audio_stays_on_the_playlist_clock(self) -> None:
        # MediaLive cuts 48 kHz AAC into 6.016 / 5.99467 s segments (282, 281, 281, 281
        # frames) and tags each with its program date time, rounded to the millisecond.
        # Every bitrate estimate is 20 ms long, which used to run ahead without limit.
        frames = [282, 281, 281, 281] * 150
        starts, ticks = [], 0
        for count in frames:
            starts.append(Timestamp.from_count(ticks, ADTS_RATE))
            ticks += count * ADTS_FRAME_TICKS
        pdt_at = {i: pdt_tag(round(float(start), 3)) for i, start in enumerate(starts)}
        results = []
        for count in frames:
            results += adts_probe(
                count, estimated_ticks=count * ADTS_FRAME_TICKS + 564480
            )
        state = {
            "ts_offset": None,
            "last_end": FLOW_START,
            "pts_anchored": False,
            "pts_wraps": 0,
            "pdt_offset": None,
        }
        out = []
        with (
            mock.patch.object(app, "ffprobe_link", side_effect=results),
            mock.patch.object(app.logger, "warning") as warning,
        ):
            for segment in segments(len(frames), pdt_at=pdt_at):
                app.process_segment(state, segment, "flow", "s3://bucket/path", out)
        timeranges = [TimeRange.from_str(s["timerange"]) for s in out]
        # 281 frames last 5.99466... s, which rounds to the nanosecond, so the sum loses
        # under a nanosecond per segment (about 7 microseconds a day) and stays contiguous.
        self.assertEqual(len(timeranges), len(frames))
        for timerange, start in zip(timeranges, starts):
            error = timerange.start - (FLOW_START + start)
            self.assertLess(abs(error.to_nanosec()), 1_000)
        error = timeranges[-1].end - (
            FLOW_START + Timestamp.from_count(ticks, ADTS_RATE)
        )
        self.assertLess(abs(error.to_nanosec()), 1_000)
        warning.assert_not_called()
        self.assertEqual(state["ts_offset"], FLOW_START)


class ProcessMessageTest(unittest.TestCase):
    """Drives process_message to check what is carried between polls."""

    def setUp(self) -> None:
        self.sent_segments = []
        self.sfn = None
        self.delay_seconds = None

    def poll(
        self,
        message: dict,
        manifest_text: str,
        probes: list,
        out_of_time: list | None = None,
    ) -> dict | None:
        with (
            mock.patch.object(
                app, "get_manifest", return_value=m3u8.loads(manifest_text)
            ),
            mock.patch.object(app, "probe_segment", side_effect=probes),
            mock.patch.object(app, "send_message_batch") as send_batch,
            mock.patch.object(app, "sfn") as sfn,
            mock.patch.object(app, "sqs") as sqs,
            mock.patch.object(
                app, "is_out_of_time", side_effect=out_of_time or (lambda: False)
            ),
        ):
            app.process_message(message=message, task_token="token", progress={})
        self.sfn = sfn
        self.sent_segments = [
            s for call in send_batch.call_args_list for s in call.args[0]
        ]
        if not sqs.send_message.called:
            self.delay_seconds = None
            return None
        self.delay_seconds = sqs.send_message.call_args.kwargs["DelaySeconds"]
        return json.loads(sqs.send_message.call_args.kwargs["MessageBody"])

    def first_message(self) -> dict:
        return {
            "flowId": "flow",
            "manifestLocation": "s3://bucket/path/index.m3u8",
            "lastMediaSequence": -1,
            "eventTimestamp": 0,
        }

    def test_long_catch_up_pauses_and_resumes_without_waiting(self) -> None:
        manifest = build_manifest(5, endlist=True)
        probes = [(pts(1000 * RATE + i * 6 * RATE), SEGMENT, True) for i in range(5)]
        next_message = self.poll(
            self.first_message(),
            manifest,
            probes[:2],
            out_of_time=[False, False, True],
        )
        # Paused after two segments: re-queued immediately, not completed
        self.assertEqual(len(self.sent_segments), 2)
        self.assertEqual(next_message["lastMediaSequence"], 1)
        self.assertEqual(self.delay_seconds, 0)
        self.sfn.send_task_success.assert_not_called()
        first_part_end = TimeRange.from_str(self.sent_segments[-1]["timerange"]).end
        # The next poll picks up the remaining segments and then completes
        self.assertIsNone(self.poll(next_message, manifest, probes[2:]))
        self.assertEqual(len(self.sent_segments), 3)
        resumed_start = TimeRange.from_str(self.sent_segments[0]["timerange"]).start
        self.assertEqual(resumed_start, first_part_end)
        self.sfn.send_task_success.assert_called_once()

    def test_caught_up_poll_waits_a_target_duration(self) -> None:
        self.poll(self.first_message(), build_manifest(1), [(pts(RATE), SEGMENT, True)])
        self.assertEqual(self.delay_seconds, 6)

    def test_out_of_time_follows_the_invocation_deadline(self) -> None:
        with mock.patch.object(app, "invocation_deadline", None):
            self.assertFalse(app.is_out_of_time())
        with mock.patch.object(app, "invocation_deadline", time.monotonic() + 60):
            self.assertFalse(app.is_out_of_time())
        with mock.patch.object(app, "invocation_deadline", time.monotonic() - 1):
            self.assertTrue(app.is_out_of_time())

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

    def test_program_date_time_baseline_survives_between_polls(self) -> None:
        short = Timestamp.from_millisec(5_750)
        next_message = self.poll(
            self.first_message(), build_manifest(1), [(None, short, False)]
        )
        self.assertEqual(next_message["pdtOffset"], str(Timestamp()))
        next_message = self.poll(
            next_message,
            build_manifest(2, pdt_at={1: pdt_tag(6)}),
            [(None, short, False)],
        )
        timerange = TimeRange.from_str(self.sent_segments[0]["timerange"])
        self.assertEqual(timerange.start, FLOW_START + SEGMENT)
        self.assertEqual(next_message["tsOffset"], str(FLOW_START + SEGMENT))

    def test_messages_without_pdt_offset_take_a_new_baseline(self) -> None:
        # An ingest already running when this ships keeps its placement rather
        # than jumping to the playlist clock at the next tag
        message = {
            **self.first_message(),
            "lastMediaSequence": 0,
            "tsOffset": str(FLOW_START),
            "lastEnd": str(FLOW_START + SEGMENT),
            "ptsAnchored": False,
        }
        next_message = self.poll(
            message,
            build_manifest(2, pdt_at={1: pdt_tag(9)}),
            [(None, SEGMENT, False)],
        )
        timerange = TimeRange.from_str(self.sent_segments[0]["timerange"])
        self.assertEqual(timerange.start, FLOW_START + SEGMENT)
        self.assertEqual(
            Timestamp.from_str(next_message["pdtOffset"]), SEGMENT - pts(9 * RATE)
        )

    def test_flow_start_keeps_sub_second_precision(self) -> None:
        manifest = m3u8.loads(build_manifest(1))
        self.assertEqual(app.get_manifest_start_pdt(manifest), FLOW_START)


def sfn_error(code: str) -> Exception:
    return app.ClientError({"Error": {"Code": code, "Message": code}}, "SfnCall")


class RecordHandlerTest(unittest.TestCase):
    """Drives record_handler to check how failed polls are retried or failed."""

    def setUp(self) -> None:
        self.sfn = None
        self.sqs = None

    def handle(
        self, message: dict, manifest=None, probes=None, sfn_side_effect=None
    ) -> None:
        record = SQSRecord(
            {
                "messageId": "1",
                "body": json.dumps(message),
                "messageAttributes": {
                    "TaskToken": {"stringValue": "token", "dataType": "String"}
                },
            }
        )
        with (
            mock.patch.object(app, "get_manifest", **(manifest or {})),
            mock.patch.object(app, "probe_segment", side_effect=probes or []),
            mock.patch.object(app, "send_message_batch"),
            mock.patch.object(app, "sfn") as sfn,
            mock.patch.object(app, "sqs") as sqs,
            mock.patch.object(app, "is_out_of_time", return_value=False),
        ):
            if sfn_side_effect:
                sfn.send_task_heartbeat.side_effect = sfn_side_effect
                sfn.send_task_failure.side_effect = sfn_side_effect
            app.record_handler(record)
        self.sfn = sfn
        self.sqs = sqs

    def queued(self) -> tuple[dict, int]:
        kwargs = self.sqs.send_message.call_args.kwargs
        return json.loads(kwargs["MessageBody"]), kwargs["DelaySeconds"]

    def message(self, **extra) -> dict:
        return {
            "flowId": "flow",
            "manifestLocation": "s3://bucket/path/index.m3u8",
            "lastMediaSequence": -1,
            "eventTimestamp": 0,
            **extra,
        }

    def test_transient_error_requeues_with_backoff(self) -> None:
        error = {"side_effect": requests.ConnectionError("origin unavailable")}
        self.handle(self.message(), manifest=error)
        body, delay = self.queued()
        self.assertEqual(body["retryCount"], 1)
        self.assertEqual(body["lastMediaSequence"], -1)
        self.assertNotEqual(body["eventTimestamp"], 0)
        self.assertEqual(delay, app.FIRST_RETRY_DELAY_SECONDS)
        self.sfn.send_task_heartbeat.assert_called_once()
        self.sfn.send_task_failure.assert_not_called()

    def test_backoff_is_capped(self) -> None:
        error = {"side_effect": requests.ConnectionError("origin unavailable")}
        self.handle(self.message(retryCount=7), manifest=error)
        body, delay = self.queued()
        self.assertEqual(body["retryCount"], 8)
        self.assertEqual(delay, app.MAX_RETRY_DELAY_SECONDS)

    def test_task_fails_once_retries_are_exhausted(self) -> None:
        error = {"side_effect": requests.ConnectionError("origin unavailable")}
        self.handle(self.message(retryCount=app.MAX_POLL_RETRIES), manifest=error)
        self.sfn.send_task_failure.assert_called_once()
        self.sqs.send_message.assert_not_called()

    def test_permanent_error_fails_the_task_straight_away(self) -> None:
        variant = m3u8.loads("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvideo.m3u8\n")
        self.handle(self.message(), manifest={"return_value": variant})
        self.sfn.send_task_failure.assert_called_once()
        self.assertEqual(
            self.sfn.send_task_failure.call_args.kwargs["error"],
            "PermanentIngestError",
        )
        self.sqs.send_message.assert_not_called()

    def test_retry_resumes_after_segments_already_sent(self) -> None:
        # The 12th probe fails after the first batch of 10 segments has been sent
        probes = [(pts(1000 * RATE + i * 6 * RATE), SEGMENT, True) for i in range(11)]
        probes.append(requests.ConnectionError("segment fetch failed"))
        manifest = {"return_value": m3u8.loads(build_manifest(15))}
        self.handle(self.message(), manifest=manifest, probes=probes)
        body, _ = self.queued()
        self.assertEqual(body["lastMediaSequence"], 9)
        self.assertIn("tsOffset", body)
        self.assertEqual(body["retryCount"], 1)

    def test_successful_poll_clears_the_retry_count(self) -> None:
        manifest = {"return_value": m3u8.loads(build_manifest(1))}
        self.handle(
            self.message(retryCount=3),
            manifest=manifest,
            probes=[(pts(RATE), SEGMENT, True)],
        )
        body, delay = self.queued()
        self.assertNotIn("retryCount", body)
        self.assertEqual(delay, 6)

    def test_ended_task_stops_polling_quietly(self) -> None:
        manifest = {"return_value": m3u8.loads(build_manifest(1))}
        self.handle(
            self.message(),
            manifest=manifest,
            probes=[(pts(RATE), SEGMENT, True)],
            sfn_side_effect=sfn_error("TaskTimedOut"),
        )
        self.sqs.send_message.assert_not_called()
        self.sfn.send_task_failure.assert_not_called()

    def test_failure_to_requeue_is_raised_for_sqs_to_redeliver(self) -> None:
        error = {"side_effect": requests.ConnectionError("origin unavailable")}
        with self.assertRaises(app.ClientError):
            with mock.patch.object(
                app, "queue_poll", side_effect=sfn_error("ServiceUnavailable")
            ):
                self.handle(self.message(), manifest=error)


if __name__ == "__main__":
    unittest.main()
