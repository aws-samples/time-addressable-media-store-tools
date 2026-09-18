from mediatimestamp.immutable import Timestamp

MPEG_TS_PTS_TIMESCALE = 90_000
MPEG_TS_PTS_HALF_RANGE = Timestamp.from_count(1 << 32, MPEG_TS_PTS_TIMESCALE)

# Media with no usable PTS advances purely by probed segment durations, so tiny
# per-segment duration errors integrate into unbounded drift. Explicit
# EXT-X-PROGRAM-DATE-TIME tags are the only recurring source of truth for such
# media. The threshold is large enough to ignore encoder tag jitter and small
# probe/EXTINF disagreement, and small enough that the residual labelling error
# stays well below common lip-sync tolerances.
NO_PTS_PDT_REANCHOR_THRESHOLD = Timestamp.from_nanosec(200_000_000)


def is_mpeg_ts_pts_wrap(
    previous_pts: Timestamp | None,
    current_pts: Timestamp | None,
) -> bool:
    """Return whether a backward PTS jump crossed the 33-bit wrap boundary."""
    if previous_pts is None or current_pts is None:
        return False
    return previous_pts - current_pts > MPEG_TS_PTS_HALF_RANGE


def resolve_segment_start(
    *,
    ts_offset: Timestamp | None,
    last_end: Timestamp,
    previous_pts: Timestamp | None,
    current_pts: Timestamp | None,
    discontinuity: bool,
    anchor_uncertain: bool = False,
) -> tuple[Timestamp, Timestamp, bool]:
    """Map PTS to Flow time and re-anchor unsupported backward clock jumps."""
    wrapped = is_mpeg_ts_pts_wrap(previous_pts, current_pts)
    has_pts = current_pts is not None and current_pts != Timestamp()
    use_current_pts = has_pts or wrapped
    pts_reset = (
        not discontinuity
        and previous_pts is not None
        and current_pts is not None
        and use_current_pts
        and current_pts < previous_pts
    )

    if (
        ts_offset is None
        or discontinuity
        or pts_reset
        or (anchor_uncertain and use_current_pts)
    ):
        file_time_at_region_start = current_pts if use_current_pts else Timestamp()
        ts_offset = last_end - file_time_at_region_start

    segment_start = ts_offset + current_pts if use_current_pts else last_end
    # Probe duration and PTS deltas can differ slightly, especially immediately after
    # a wrap. Never overlap already emitted Flow time: move the anchor forward while
    # preserving the current PTS as the next continuity reference.
    if use_current_pts and segment_start < last_end:
        ts_offset = last_end - current_pts
        segment_start = last_end
        if previous_pts is not None:
            pts_reset = True
    return segment_start, ts_offset, pts_reset


def reconcile_no_pts_program_date_time(
    *,
    segment_start: Timestamp,
    program_date_time: Timestamp | None,
    threshold: Timestamp = NO_PTS_PDT_REANCHOR_THRESHOLD,
) -> tuple[Timestamp, bool, bool]:
    """Re-align duration-accumulated Flow time with the playlist wall clock.

    Only meaningful for segments with no usable PTS, whose start otherwise
    advances by accumulated probe durations alone. Returns
    (segment_start, reanchored, running_ahead):

    - When the playlist's explicit EXT-X-PROGRAM-DATE-TIME is ahead of the
      accumulated position by more than the threshold, re-anchor forward to
      the tag. The label gap left behind is intentional: the tag is truth and
      the accumulated position under-counted real time.
    - When the accumulated position is ahead of the tag by more than the
      threshold, the drift cannot be corrected without overlapping Flow time
      that has already been registered, so keep the position and report
      running_ahead for the caller to surface.
    """
    if program_date_time is None:
        return segment_start, False, False
    if program_date_time - segment_start > threshold:
        return program_date_time, True, False
    if segment_start - program_date_time > threshold:
        return segment_start, False, True
    return segment_start, False, False
