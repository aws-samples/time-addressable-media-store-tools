import sys
from pathlib import Path

from mediatimestamp.immutable import Timestamp

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pts import MPEG_TS_PTS_HALF_RANGE, is_mpeg_ts_pts_wrap, resolve_segment_start

PTS_RATE = 90_000
PTS_WRAP_COUNT = 1 << 33


def pts(count: int) -> Timestamp:
    return Timestamp.from_count(count, PTS_RATE)


def test_reanchors_at_last_end_when_pts_wraps_without_discontinuity() -> None:
    offset = Timestamp.from_str("1700000000:0")
    last_end = offset + pts(PTS_WRAP_COUNT)

    segment_start, new_offset, detected_wrap = resolve_segment_start(
        ts_offset=offset,
        last_end=last_end,
        previous_pts=pts(PTS_WRAP_COUNT - (6 * PTS_RATE)),
        current_pts=Timestamp(),
        discontinuity=False,
    )

    assert detected_wrap is True
    assert segment_start == last_end
    assert new_offset == last_end


def test_preserves_offset_for_normal_forward_pts() -> None:
    offset = Timestamp.from_str("1700000000:0")
    current_pts = pts(106 * PTS_RATE)

    segment_start, new_offset, detected_wrap = resolve_segment_start(
        ts_offset=offset,
        last_end=offset + pts(106 * PTS_RATE),
        previous_pts=pts(100 * PTS_RATE),
        current_pts=current_pts,
        discontinuity=False,
    )

    assert detected_wrap is False
    assert segment_start == offset + current_pts
    assert new_offset == offset


def test_forward_pts_reanchors_when_duration_drift_would_overlap() -> None:
    offset = Timestamp.from_str("1700000000:0")
    current_pts = pts(106 * PTS_RATE)
    last_end = offset + pts(106 * PTS_RATE) + Timestamp.from_str("0:500000000")

    segment_start, new_offset, reanchored = resolve_segment_start(
        ts_offset=offset,
        last_end=last_end,
        previous_pts=pts(100 * PTS_RATE),
        current_pts=current_pts,
        discontinuity=False,
    )

    assert reanchored is True
    assert segment_start == last_end
    assert new_offset == offset + Timestamp.from_str("0:500000000")


def test_small_backward_pts_jump_reanchors_without_calling_it_a_wrap() -> None:
    offset = Timestamp.from_str("1700000000:0")
    current_pts = pts(94 * PTS_RATE)

    segment_start, new_offset, detected_wrap = resolve_segment_start(
        ts_offset=offset,
        last_end=offset + pts(106 * PTS_RATE),
        previous_pts=pts(100 * PTS_RATE),
        current_pts=current_pts,
        discontinuity=False,
    )

    assert detected_wrap is True
    assert is_mpeg_ts_pts_wrap(pts(100 * PTS_RATE), current_pts) is False
    assert segment_start == offset + pts(106 * PTS_RATE)
    assert new_offset == offset + pts(12 * PTS_RATE)


def test_half_range_backward_jump_reanchors_but_is_not_classified_as_wrap() -> None:
    offset = Timestamp.from_str("1700000000:0")
    previous_pts = MPEG_TS_PTS_HALF_RANGE + pts(10)

    segment_start, new_offset, detected_wrap = resolve_segment_start(
        ts_offset=offset,
        last_end=offset + previous_pts,
        previous_pts=previous_pts,
        current_pts=pts(10),
        discontinuity=False,
    )

    assert detected_wrap is True
    assert is_mpeg_ts_pts_wrap(previous_pts, pts(10)) is False
    assert segment_start == offset + previous_pts
    assert new_offset == offset + previous_pts - pts(10)


def test_discontinuity_reanchors_without_reporting_wrap() -> None:
    offset = Timestamp.from_str("1700000000:0")
    last_end = offset + pts(PTS_WRAP_COUNT)
    current_pts = pts(12 * PTS_RATE)

    segment_start, new_offset, detected_wrap = resolve_segment_start(
        ts_offset=offset,
        last_end=last_end,
        previous_pts=pts(PTS_WRAP_COUNT - (6 * PTS_RATE)),
        current_pts=current_pts,
        discontinuity=True,
    )

    assert detected_wrap is False
    assert segment_start == last_end
    assert new_offset == last_end - current_pts


def test_zero_pts_without_wrap_remains_contiguous_fallback() -> None:
    offset = Timestamp.from_str("1700000000:0")
    last_end = offset + pts(6 * PTS_RATE)

    segment_start, new_offset, detected_wrap = resolve_segment_start(
        ts_offset=offset,
        last_end=last_end,
        previous_pts=Timestamp(),
        current_pts=Timestamp(),
        discontinuity=False,
    )

    assert detected_wrap is False
    assert segment_start == last_end
    assert new_offset == offset


def test_missing_pts_remains_contiguous_fallback() -> None:
    offset = Timestamp.from_str("1700000000:0")
    last_end = offset + pts(6 * PTS_RATE)

    segment_start, new_offset, detected_wrap = resolve_segment_start(
        ts_offset=offset,
        last_end=last_end,
        previous_pts=pts(6 * PTS_RATE),
        current_pts=None,
        discontinuity=False,
    )

    assert detected_wrap is False
    assert segment_start == last_end
    assert new_offset == offset


def test_first_valid_pts_reanchors_old_state_without_last_pts() -> None:
    old_offset = Timestamp.from_str("1700000000:0")
    last_end = old_offset + pts(100 * PTS_RATE)
    current_pts = pts(6 * PTS_RATE)

    segment_start, new_offset, detected_wrap = resolve_segment_start(
        ts_offset=old_offset,
        last_end=last_end,
        previous_pts=None,
        current_pts=current_pts,
        discontinuity=False,
    )

    assert detected_wrap is False
    assert segment_start == last_end
    assert new_offset == last_end - current_pts


def test_old_state_without_last_pts_preserves_a_forward_mapping() -> None:
    old_offset = Timestamp.from_str("1700000000:0")
    last_end = old_offset + pts(100 * PTS_RATE)
    current_pts = pts(106 * PTS_RATE)

    segment_start, new_offset, detected_wrap = resolve_segment_start(
        ts_offset=old_offset,
        last_end=last_end,
        previous_pts=None,
        current_pts=current_pts,
        discontinuity=False,
    )

    assert detected_wrap is False
    assert segment_start == old_offset + current_pts
    assert new_offset == old_offset


def test_uncertain_anchor_reanchors_even_when_old_mapping_is_forward() -> None:
    old_offset = Timestamp.from_str("1700000000:0")
    last_end = old_offset + pts(100 * PTS_RATE)
    current_pts = pts(106 * PTS_RATE)

    segment_start, new_offset, detected_wrap = resolve_segment_start(
        ts_offset=old_offset,
        last_end=last_end,
        previous_pts=None,
        current_pts=current_pts,
        discontinuity=False,
        anchor_uncertain=True,
    )

    assert detected_wrap is False
    assert segment_start == last_end
    assert new_offset == last_end - current_pts


def test_zero_without_wrap_does_not_replace_a_valid_pts_anchor() -> None:
    offset = Timestamp.from_str("1700000000:0")
    last_end = offset + pts(106 * PTS_RATE)

    segment_start, new_offset, detected_wrap = resolve_segment_start(
        ts_offset=offset,
        last_end=last_end,
        previous_pts=pts(100 * PTS_RATE),
        current_pts=Timestamp(),
        discontinuity=False,
    )

    assert detected_wrap is False
    assert segment_start == last_end
    assert new_offset == offset


def test_refuses_a_range_before_last_end_when_prior_pts_is_unavailable() -> None:
    offset = Timestamp.from_str("1700000000:0")

    segment_start, new_offset, detected_wrap = resolve_segment_start(
        ts_offset=offset,
        last_end=offset + pts(100 * PTS_RATE),
        previous_pts=None,
        current_pts=pts(94 * PTS_RATE),
        discontinuity=False,
    )

    assert detected_wrap is False
    assert segment_start == offset + pts(100 * PTS_RATE)
    assert new_offset == offset + pts(6 * PTS_RATE)
