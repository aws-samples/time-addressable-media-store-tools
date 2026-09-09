import {
  ImageButton,
  MarkerTrack,
  MarkerTrackLane,
  MarkerTrackLaneEventType,
  MarkerType,
  MediaTemporalFormat,
  PlayerAudioType,
  PlayerTextType,
  ScrollbarLane,
  TextLabel,
  TextTrackLane,
  ThumbnailTrackLane,
  TimedItemTemporalType,
  TimedItemTemporalUtil,
  TimedItemsTrackEventType,
  TimelineNodeEventType,
  TimelineSlotType,
  TrackSource,
  TrackType,
} from "@byomakase/omakase-player";
import type {
  Marker,
  MarkerArgs,
  MarkerState,
  MarkerStyle,
  MarkerTrackLaneStyle,
  OmakasePlayerApi,
  TamsMainMedia,
  TextTrack,
  ThumbnailTrack,
  TimedItemTemporal,
  TimelineApi,
} from "@byomakase/omakase-player";
import { TimeRangeUtil } from "@byomakase/omakase-react-components";
import {
  SEGMENT_MARKER_LANE_STYLE,
  SEGMENTATION_MARKER_LANE_STYLE,
  DROPDOWN_BUTTON_CONFIG,
  CHEVRON_DOWN_SVG_SOURCE,
  CHEVRON_RIGHT_SVG_SOURCE,
  SUBTITLES_BUTTON_CONFIG,
  CHATBOX_SVG_SOURCE,
  CHATBOX_ACTIVE_SVG_SOURCE,
  SOUND_ACTIVE_BUTTON_SOURCE,
  SOUND_INACTIVE_BUTTON_SOURCE,
  SOUND_BUTTON_CONFIG,
  THEME,
  LANE_LABEL_CONFIG,
} from "./constants";
import type { Flow, Segment } from "@/types/tams";
import { Mode } from "@cloudscape-design/global-styles";
import { filter, type Observable, takeUntil } from "rxjs";

// omakase-react-components 2.0 dropped these helpers along with its TAMS adapter. The
// resolution order has to stay identical, because it is how the TAMS→HLS bridge names each
// rendition, and the rendition name is what surfaces as the player track's `label` — our only
// join key from a TAMS flow back to its player track.
const resolveTextManifestName = (flow: Flow) =>
  flow.tags?.hls_name || flow.label || flow.description || "subtitles";

const resolveAudioManifestName = (flow: Flow) =>
  flow.tags?.hls_name || flow.label || flow.description || "audio";

// Distinguishes TAMS segment-visualization marker tracks from the user's segmentation tracks.
// Lane ids are library-generated uuids in 1.x, so identity lives on the track instead.
const SEGMENT_TRACK_ATTR = "tamsSegments";

const isSegmentTrack = (track: MarkerTrack) =>
  track.customAttrs?.[SEGMENT_TRACK_ATTR] === true;

export const laneTrack = (lane: MarkerTrackLane): MarkerTrack | undefined =>
  lane.getTracks().at(0);

// 1.x temporals carry seconds as strings.
const spanTemporal = (start: number, end: number): TimedItemTemporal => ({
  type: TimedItemTemporalType.SPAN,
  start: String(start),
  end: String(end),
});

// Moves a temporal along the time axis, preserving its type. Not clamped to `0..duration`, because
// the caller decides what to do with a temporal that lands outside the window rather than quietly
// distorting it — see `rebaseMarkersOnTrack`, which discards those markers.
const shiftTemporal = (
  temporal: TimedItemTemporal,
  delta: number,
): TimedItemTemporal => {
  const shift = (value: string) => String(Number(value) + delta);
  switch (temporal.type) {
    case TimedItemTemporalType.MOMENT:
      return { ...temporal, time: shift(temporal.time) };
    case TimedItemTemporalType.SPAN:
      return {
        ...temporal,
        start: shift(temporal.start),
        end: shift(temporal.end),
      };
    case TimedItemTemporalType.SPAN_START:
      return { ...temporal, start: shift(temporal.start) };
    case TimedItemTemporalType.SPAN_END:
      return { ...temporal, end: shift(temporal.end) };
  }
};

export const markerStart = (marker: Marker | MarkerState) =>
  TimedItemTemporalUtil.extractStartTime(marker.temporal);

export const markerEnd = (marker: Marker | MarkerState) =>
  TimedItemTemporalUtil.extractEndTime(marker.temporal);

export const isSpanningMarker = (marker: Marker | MarkerState) =>
  marker.markerType === MarkerType.SPANNING_MARKER;

const makeColorCycler = (colors: string[]) => {
  let i = 0;
  return () => colors[i++ % colors.length];
};

const flowFormatSorting = (a: Flow, b: Flow) => {
  if (a === b) return 0;
  if (a.format === "urn:x-nmos:format:multi") return -1;
  if (b.format === "urn:x-nmos:format:multi") return 1;
  if (a.format === "urn:x-nmos:format:video") return -1;
  if (b.format === "urn:x-nmos:format:video") return 1;
  if (a.format === "urn:x-nmos:format:audio") return -1;
  if (b.format === "urn:x-nmos:format:audio") return 1;
  return 0;
};

const segmentToMarker = (
  segment: Segment,
  mediaStartTime: number,
  videoDuration: number,
): MarkerArgs | null => {
  // Parse the segment timerange
  const timerange = TimeRangeUtil.parseTimeRange(segment.timerange);

  let start: number | undefined;
  let end: number | undefined;

  // Calculate start time relative to video timeline
  if (timerange.start) {
    start = TimeRangeUtil.timeMomentToSeconds(timerange.start) - mediaStartTime;
    if (start < 0) {
      start = 0;
    }
  }

  // Calculate end time relative to video timeline
  if (timerange.end) {
    end = TimeRangeUtil.timeMomentToSeconds(timerange.end) - mediaStartTime;

    // Clip to video duration
    if (end > videoDuration) {
      end = videoDuration - 0.001;

      // If start is beyond the clipped end, invalidate
      if (start !== undefined && start > end) {
        start = undefined;
      }
    }

    // If end is negative, marker is outside video timeline
    if (end < 0) {
      end = undefined;
      start = undefined;
    }
  }

  // Only create marker if we have valid start and end times
  if (start === undefined || end === undefined) {
    return null;
  }

  return { temporal: spanTemporal(start, end) };
};

const isMuxedFlow = (f: Flow) => f.format === "urn:x-nmos:format:multi"; // Multi flows are only muxed when they have segments (pre-filtered by flowsWithSegments)
const isVideoFlow = (f: Flow) => f.format === "urn:x-nmos:format:video";
const isAudioFlow = (f: Flow) => f.format === "urn:x-nmos:format:audio";
const isSubtitleFlow = (f: Flow) =>
  f.format === "urn:x-nmos:format:data" && f.container === "text/vtt";

// Markers only carry `markerColor` per instance in 1.x, and it has to go through the UI style
// cascade as an id rule to survive marker view components being recreated on zoom and scroll.
const applyMarkerColor = (
  player: OmakasePlayerApi,
  markerId: string,
  markerColor: string,
) => player.ui.updateStyleRule<MarkerStyle>({ id: markerId, style: { markerColor } });

const applySegmentMarkerColors = (
  player: OmakasePlayerApi,
  track: MarkerTrack,
  mode: Mode,
) => {
  const nextColor = makeColorCycler(THEME[mode].markerColors);
  for (const marker of track.timedItems) {
    applyMarkerColor(player, marker.id, nextColor());
  }
};

const addSegmentMarkersToLane = (
  lane: MarkerTrackLane,
  segments: Segment[],
  mediaStartTime: number,
  videoDuration: number,
  mode: Mode,
  player: OmakasePlayerApi,
) => {
  const markers = segments
    .map((segment) => segmentToMarker(segment, mediaStartTime, videoDuration))
    .filter((marker): marker is MarkerArgs => marker !== null);

  // 0.25.4 marked each segment marker `editable: false`; editability is a track-level concern
  // in 1.x. Deliberately no `label` — the first track's label would become the lane description,
  // and these lanes are labelled by their own TextLabel node.
  const track = new MarkerTrack({
    timedItemsLocked: true,
    customAttrs: { [SEGMENT_TRACK_ATTR]: true },
  });
  player.track.add(track);
  track.addTimedItems(markers);
  lane.addTrack(track, { style: SEGMENT_MARKER_LANE_STYLE });

  applySegmentMarkerColors(player, track, mode);
};

// Marks a cue whose times this app has already moved onto the media timeline, so the cues a later
// segment read delivers are rebased once and only once.
const REBASED_CUE_ATTR = "tamsRebasedToMediaTime";

/**
 * Moves fetched subtitle cues from absolute TAMS time onto the media timeline.
 *
 * The store's subtitle segments are verbatim source WebVTT: cue times are the programme's own times,
 * which for a TAMS resource starting at time zero are also absolute TAMS seconds, under a
 * `X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:<n>` header. So the cues reach the lane on absolute
 * time — e.g. 311..687 s against a media timeline of 0..304.5 s, which puts every one of them past
 * the end of the visible range, and `TextTrackLane.adjustCueVisualizations` silently draws none.
 *
 * The library's own correction cannot fire for such a file. `mapCues` offsets every cue by
 * `VttUtil.resolveCueTimeOffset(map, shift) = Math.max(0, local - (shift ?? 0))`; `LOCAL` is zero so
 * `local` is 0, the registered shift is positive, and the clamp turns the whole thing into 0. The
 * shift itself is `mediaStartTime - flowStartTime` (114.414 here), which even unclamped would leave
 * the cues a further `flowStartTime` too late. What is needed is `-mediaStartTime`, which is exactly
 * the rebasing `segmentToMarker` does for the segment markers, applied to the cues instead.
 *
 * Returns whether anything changed, so the caller can skip a redundant render.
 */
const rebaseSubtitleCues = (
  textTrack: TextTrack,
  mediaStartTime: number,
  videoDuration: number,
): boolean => {
  const outOfWindowIds: string[] = [];
  let changed = false;

  for (const cue of textTrack.timedItems) {
    if (cue.data[REBASED_CUE_ATTR]) continue;

    const absoluteStart = TimedItemTemporalUtil.extractStartTime(cue.temporal);
    const absoluteEnd = TimedItemTemporalUtil.extractEndTime(cue.temporal);
    if (absoluteStart === undefined || absoluteEnd === undefined) continue;

    const start = absoluteStart - mediaStartTime;
    const end = absoluteEnd - mediaStartTime;

    // A subtitle flow can cover more than the loaded window at either end.
    if (end <= 0 || start >= videoDuration) {
      outOfWindowIds.push(cue.id);
      continue;
    }

    textTrack.updateTimedItem(cue.id, {
      temporal: spanTemporal(
        Math.max(0, start),
        Math.min(videoDuration, end),
      ),
      data: { ...cue.data, [REBASED_CUE_ATTR]: true },
    });
    changed = true;
  }

  if (outOfWindowIds.length) {
    textTrack.deleteTimedItems(outOfWindowIds);
    changed = true;
  }

  return changed;
};

const addSubtitleLaneControls = (
  subtitlesLane: TextTrackLane,
  markerLane: MarkerTrackLane,
  player: OmakasePlayerApi,
  flow: Flow,
  destroy$: Observable<void>,
) => {
  const dropdownButton = new ImageButton({
    ...DROPDOWN_BUTTON_CONFIG,
    src: CHEVRON_RIGHT_SVG_SOURCE,
  });
  dropdownButton.onEvent$
    .pipe(filter((e) => e.type === TimelineNodeEventType.TIMELINE_NODE_CLICK))
    .subscribe(() => {
      markerLane.toggleMinimizeMaximize();
      dropdownButton.setImage({
        src: markerLane.isMinimized()
          ? CHEVRON_RIGHT_SVG_SOURCE
          : CHEVRON_DOWN_SVG_SOURCE,
      });
    });
  subtitlesLane.addTimelineNode({
    width: DROPDOWN_BUTTON_CONFIG.width!,
    height: DROPDOWN_BUTTON_CONFIG.height!,
    justify: "start",
    margin: [0, 0, 0, 5],
    timelineNode: dropdownButton,
  });

  const flowLabel = resolveTextManifestName(flow);
  const findTrack = () =>
    player.player.text.getTracks().find((t) => t.label === flowLabel);

  const subtitlesButton = new ImageButton({
    ...SUBTITLES_BUTTON_CONFIG,
    src: CHATBOX_SVG_SOURCE,
  });
  subtitlesButton.onEvent$
    .pipe(filter((e) => e.type === TimelineNodeEventType.TIMELINE_NODE_CLICK))
    .subscribe(() => {
      const track = findTrack();
      if (!track) return;
      const state = player.player.text.state.tracks[PlayerTextType.MAIN].find(
        (t) => t.trackId === track.id,
      );
      if (!state?.active) {
        player.player.text.switchTrack(track.id, true).subscribe({
          error: (err) => console.error("Error showing subtitle track:", err),
        });
      } else if (!player.player.text.shown) {
        player.player.text.show().subscribe();
      } else {
        player.player.text.hide().subscribe();
      }
    });

  // 1.x replaces the onShow$/onHide$ pair with one event stream plus a state snapshot, so the
  // icon is recomputed from state rather than driven off the event payload.
  const refreshIcon = () => {
    const track = findTrack();
    const state = track
      ? player.player.text.state.tracks[PlayerTextType.MAIN].find(
          (t) => t.trackId === track.id,
        )
      : undefined;
    const src =
      state?.active && player.player.text.shown
        ? CHATBOX_ACTIVE_SVG_SOURCE
        : CHATBOX_SVG_SOURCE;
    if (subtitlesButton.getImage()?.src !== src) {
      subtitlesButton.setImage({ src });
    }
  };
  player.player.text.onEvent$.pipe(takeUntil(destroy$)).subscribe(refreshIcon);

  subtitlesLane.addTimelineNode({
    width: SUBTITLES_BUTTON_CONFIG.width!,
    height: SUBTITLES_BUTTON_CONFIG.height!,
    justify: "start",
    margin: [0, 0, 0, 10],
    timelineNode: subtitlesButton,
  });
};

const addAudioLaneControls = (
  markerLane: MarkerTrackLane,
  flow: Flow,
  player: OmakasePlayerApi,
  destroy$: Observable<void>,
) => {
  const flowLabel = resolveAudioManifestName(flow);

  // PlayerAudioTrackState carries only the track id, so the label has to be joined back
  // through the track list.
  const activeLabel = () => {
    const active = player.player.audio.state.tracks[PlayerAudioType.MAIN].find(
      (t) => t.active,
    );
    if (!active) return undefined;
    return player.player.audio.getTracks().find((t) => t.id === active.trackId)
      ?.label;
  };
  const iconFor = (label: string | undefined) =>
    label === flowLabel
      ? SOUND_ACTIVE_BUTTON_SOURCE
      : SOUND_INACTIVE_BUTTON_SOURCE;

  const soundButton = new ImageButton({
    ...SOUND_BUTTON_CONFIG,
    src: iconFor(activeLabel()),
  });
  soundButton.onEvent$
    .pipe(filter((e) => e.type === TimelineNodeEventType.TIMELINE_NODE_CLICK))
    .subscribe(() => {
      const target = player.player.audio
        .getTracks()
        .find((t) => t.label === flowLabel);
      if (target) player.player.audio.switchTrack(target.id).subscribe();
    });
  player.player.audio.onEvent$.pipe(takeUntil(destroy$)).subscribe(() => {
    soundButton.setImage({ src: iconFor(activeLabel()) });
  });
  markerLane.addTimelineNode({
    width: SOUND_BUTTON_CONFIG.width!,
    height: SOUND_BUTTON_CONFIG.height!,
    justify: "start",
    margin: [0, 10, 0, 10],
    timelineNode: soundButton,
  });
};

const addLaneLabel = (
  lane: MarkerTrackLane | TextTrackLane,
  text: string,
  mode: Mode,
): TextLabel => {
  const label = new TextLabel({
    text,
    style: THEME[mode].markerLaneTextLabelStyle,
  });
  lane.addTimelineNode({
    timelineNode: label,
    justify: "end",
    ...LANE_LABEL_CONFIG,
  });
  return label;
};

const computeMaxTimerangeFromFlows = (flows: Flow[]): string | null => {
  if (!flows.length) return null;

  let minStart: number | null = null;
  let maxEnd: number | null = null;

  for (const flow of flows) {
    if (!flow.timerange) continue;
    const parsed = TimeRangeUtil.parseTimeRange(flow.timerange);
    if (!parsed.start || !parsed.end) continue;

    const startSeconds = TimeRangeUtil.timeMomentToSeconds(parsed.start);
    const endSeconds = TimeRangeUtil.timeMomentToSeconds(parsed.end);

    if (minStart === null || startSeconds < minStart) minStart = startSeconds;
    if (maxEnd === null || endSeconds > maxEnd) maxEnd = endSeconds;
  }

  if (minStart === null || maxEnd === null) return null;

  const startMoment = TimeRangeUtil.secondsToTimeMoment(minStart);
  const endMoment = TimeRangeUtil.secondsToTimeMoment(maxEnd);
  const range = TimeRangeUtil.toTimeRange(startMoment, endMoment, true, true);
  return TimeRangeUtil.formatTimeRangeExpr(range);
};

export const segmentationNameFor = (index: number) =>
  `Segmentation ${index + 1}`;

// A destroyed lane keeps its `prepared` flag but drops its Konva groups, so `updateAttrs` walks
// into `undefined.addChild` inside the library's `createDescriptionTextLabel`. React state can
// still be pointing at lanes from a previous player for a render or two — an HMR update or a
// remount rebuilds the player while `segmentationLanes` still holds the old lanes — so the lane is
// checked for a live layout group before it is written to. There is no public API for this, hence
// the cast.
const isLaneLive = (lane: MarkerTrackLane) =>
  !!(lane as unknown as { mainLeftFlexGroup?: unknown }).mainLeftFlexGroup;

export const renumberSegmentationLanes = (lanes: MarkerTrackLane[]) => {
  lanes.forEach((lane, index) => {
    if (!isLaneLive(lane)) return;
    lane.updateAttrs({ description: segmentationNameFor(index) });
  });
};

export const segmentationLaneStyleFor = (
  mode: Mode,
): Partial<MarkerTrackLaneStyle> => ({
  ...THEME[mode].timelineLaneStyle,
  ...SEGMENTATION_MARKER_LANE_STYLE,
  markerColor: THEME[mode].colors.segmentationMarker,
});

// The marker list resolves a row's colour bar through a SHORTER style cascade than the timeline
// does: class defaults -> the marker TRACK id -> the marker id. The lane id is not in it, so a
// lane-level `markerColor` reaches the timeline marker but leaves the list's colour bar on the
// library default (teal). The marker track id is the only rule level both surfaces share, so
// writing the colour there is what keeps the two in step — and it re-applies on a theme change.
export const applySegmentationMarkerColors = (
  player: OmakasePlayerApi,
  lanes: MarkerTrackLane[],
  mode: Mode,
) => {
  const markerColor = THEME[mode].colors.segmentationMarker;
  for (const lane of lanes) {
    const track = laneTrack(lane);
    if (track) {
      player.ui.updateStyleRule<MarkerStyle>({
        id: track.id,
        style: { markerColor },
      });
    }
  }
};

// Removes segment visualization lanes but preserves segmentation lanes, which hold user-created
// markers that must persist across timerange reloads. Lane ids are library-generated uuids in
// 1.x, so the caller passes back the ids the previous build returned.
export const removeVisualizationLanes = (
  timeline: TimelineApi,
  laneIds: string[],
  player: OmakasePlayerApi,
) => {
  if (!laneIds.length) return;
  for (const laneId of laneIds) {
    const lane = timeline.getTimelineLane(laneId);
    if (!(lane instanceof MarkerTrackLane)) continue;
    for (const track of lane.getTracks()) {
      const markerIds = new Set(track.timedItems.map((marker) => marker.id));
      player.ui.removeStyleRules(
        (rule) => "id" in rule && markerIds.has(rule.id),
      );
      player.track.delete(track.id);
    }
  }
  timeline.removeTimelineLanes(laneIds);
};

const checkMarkerOverlap = (
  track: MarkerTrack,
  checkedMarker: Marker,
): boolean => {
  const start = markerStart(checkedMarker);
  const end = markerEnd(checkedMarker);
  if (start == null || end == null) return false;

  return track.timedItems.some((other) => {
    if (other.id === checkedMarker.id) return false;
    if (!isSpanningMarker(other)) return false;
    const otherStart = markerStart(other);
    const otherEnd = markerEnd(other);
    if (otherStart == null || otherEnd == null) return false;
    return start < otherEnd && end > otherStart;
  });
};

const createSegmentationLane = (
  timeline: TimelineApi,
  player: OmakasePlayerApi,
  mode: Mode,
  onMarkerClick?: (marker: Marker) => void,
): MarkerTrackLane => {
  const lane = new MarkerTrackLane({
    description: segmentationNameFor(0),
    style: segmentationLaneStyleFor(mode),
  });
  const track = new MarkerTrack();
  player.track.add(track);
  lane.addTrack(track);
  timeline.addTimelineLane(lane);

  // Temporals are relative media seconds, so this spans whatever window is loaded at creation.
  // Across a later timerange reload it keeps that absolute span, and is discarded if the new window
  // cannot hold it — which, spanning a whole window as it does, is any window but this one. See
  // `rebaseMarkersOnTrack`.
  track.addTimedItems({
    temporal: spanTemporal(0, player.player.getDuration()),
  });
  const defaultMarker = track.timedItems.at(0);
  if (defaultMarker) setTimeout(() => onMarkerClick?.(defaultMarker));

  return lane;
};

/**
 * The segmentation lanes currently on the timeline — the one built here plus any the toolbar's
 * "add segmentation lane" button created.
 *
 * Discovered from the timeline rather than tracked in app state, so the toolbar's lanes are treated
 * exactly like the first one. `MarkerTrackLane` is also the class used for the per-flow segment
 * visualisation lanes, so those are excluded: by their track while they still have one, and
 * otherwise by construction, because the caller destroys and rebuilds them on every lane build
 * before this runs.
 */
const segmentationLanesOnTimeline = (timeline: TimelineApi): MarkerTrackLane[] =>
  timeline
    .getTimelineLanes()
    .filter(
      (lane): lane is MarkerTrackLane =>
        lane instanceof MarkerTrackLane &&
        !lane.getTracks().some(isSegmentTrack),
    );

/**
 * Records the `MarkerTrack` behind every segmentation lane, keyed by lane id.
 *
 * Must be called BEFORE `player.loadMainMedia`, which is what wipes the track repository and
 * detaches these tracks from their lanes — afterwards there is nothing left to enumerate. The
 * returned map is what `buildLanesOnTimeline` re-attaches from. See `restoreSegmentationTrack`.
 */
export const snapshotSegmentationTracks = (
  timeline: TimelineApi,
): Map<string, MarkerTrack> => {
  const snapshot = new Map<string, MarkerTrack>();
  for (const lane of segmentationLanesOnTimeline(timeline)) {
    const track = laneTrack(lane);
    if (track) snapshot.set(lane.id, track);
  }
  return snapshot;
};

/**
 * Puts a segmentation lane's `MarkerTrack` back after a timerange reload.
 *
 * `Player.loadMainMedia` unloads first, and `unloadMainMedia` does `_trackRepository.clear()`. That
 * emits `TRACK_DELETED` for every track, and `TrackLane.trySetOnTrackDeleted` responds by calling
 * `removeTrack`, which splices the track out of the lane's `_tracks` and calls `onTrackRemoved` →
 * `clearContent()`. So the deliberately-reused segmentation lane comes back with NO track at all:
 * `laneTrack(lane)` is undefined, the lane draws as an empty row, and `wireSegmentationLane` bails at
 * its guard — which also means no marker-click subscription, so the lane is inert as well as blank and
 * the toolbar's marker buttons have nothing selected to act on.
 *
 * The track object itself is not destroyed — `Repository._delete` only drops it from a Map — so the
 * instance we hold still carries every timed item. Re-adding it to the repository and the lane
 * restores the user's markers intact. `TrackLane.addTrack` calls `render()` when the lane can render,
 * which recreates the marker views as part of the same call.
 */
const restoreSegmentationTrack = (
  player: OmakasePlayerApi,
  lane: MarkerTrackLane,
  rememberedTrack: MarkerTrack,
) => {
  // A lane that still has its track has not been through a reload — nothing to restore.
  if (laneTrack(lane)) return;

  player.track.add(rememberedTrack);
  lane.addTrack(rememberedTrack);
};

// Floating-point slack for the containment test below. Window bounds come from segment boundaries
// and a marker authored at exactly the window edge must not be discarded by a rounding artefact.
const WINDOW_CONTAINMENT_EPSILON = 1e-6;

/**
 * Re-anchors a marker track's temporals to the window now loading, and discards any marker the new
 * window cannot hold in full. Returns the ids discarded.
 *
 * Marker temporals are relative media seconds — 0 is whatever the loaded window starts at
 * (`tamsMetadata.mediaStartTime`). A marker authored as 0..300 in the window starting at 414 means
 * absolute 414..714. Reload the first 300 s and the same relative 0..300 would now mean absolute
 * 0..300, silently redefining the marker. Shifting every temporal by `previousStart - nextStart`
 * keeps the absolute span fixed, which is what the marker list, the playhead and the timerange
 * export all assume.
 *
 * Caller must pass the FRESH `mediaStartTime`. The library refires the timeline-created callback
 * from inside `_loadMainMedia`, before `loadMainMedia`'s subscriber has swapped in the new
 * `TamsMainMedia`, so anything reading the app's held media at that point gets the PREVIOUS
 * window's metadata and computes a delta of zero. See `useOmakasePlayer`'s build gate.
 *
 * Markers that do not end up wholly inside `[0, duration]` are DELETED rather than kept as
 * out-of-window data, because the library cannot represent them either way:
 * - Before the window (negative relative time) is fatal. `OmakasePlayerTimelineControlsToolbar`
 *   converts the selected marker's start and end to frame counts on every playback progress event,
 *   and `TimeUtil.constrainTime` throws `Time must be positive` — an uncaught error in a React
 *   effect, so the app comes down.
 * - Past the end of the window is merely broken. `MarkerTrackLane.createMarkerViewComponents` culls
 *   any timed item failing `touchesTimeRange` against the visible range, and
 *   `handleTimedItemsUpdated` only refreshes views that already exist, so a culled marker can never
 *   get its view back.
 *
 * Deleting is therefore the one behaviour that is consistent at both ends and cannot mislead: what
 * the lane shows, what the marker list shows and what gets exported always agree.
 */
const rebaseMarkersOnTrack = (
  track: MarkerTrack,
  delta: number,
  duration: number,
): string[] => {
  const isWithinWindow = (time: number | undefined) =>
    time === undefined ||
    (time >= -WINDOW_CONTAINMENT_EPSILON &&
      time <= duration + WINDOW_CONTAINMENT_EPSILON);

  // Snapshotted because `updateTimedItem` re-sorts the track's live `timedItems` array.
  const rebased = track.timedItems.map((item) => ({
    id: item.id,
    temporal: shiftTemporal(item.temporal, delta),
  }));

  const discarded: string[] = [];
  for (const { id, temporal } of rebased) {
    const within =
      isWithinWindow(TimedItemTemporalUtil.extractStartTime(temporal)) &&
      isWithinWindow(TimedItemTemporalUtil.extractEndTime(temporal));
    if (!within) {
      discarded.push(id);
    } else if (delta) {
      track.updateTimedItem(id, { temporal });
    }
  }
  if (discarded.length) track.deleteTimedItems(discarded);
  return discarded;
};

/**
 * Wires a segmentation lane's marker-click and overlap-guard subscriptions.
 *
 * Called for every segmentation lane on EVERY lane build, not just when a lane is created. A timerange reload rebuilds the
 * lanes, and `swapLanesDestroy` completes the previous `destroy$` first — which tears the two
 * subscriptions down. The segmentation lane itself is deliberately reused so the user's markers
 * survive the reload, so it never passes through `createSegmentationLane` again: wiring only at
 * creation left every marker click dropped after the first reload, and the overlap guard dead with
 * it. Must run AFTER `restoreSegmentationTrack`, or the `laneTrack` guard below short-circuits and
 * nothing gets wired. The library gates click dispatch on there being a live subscriber
 * (`if (!this._onEvent$.observed) return;` in `MarkerTrackLane.handleTimecodeClick`), and for a
 * spanning marker that is the only path a body click takes, so an unsubscribed lane swallows
 * selection entirely.
 */
const wireSegmentationLane = (
  lane: MarkerTrackLane,
  destroy$: Observable<void>,
  onMarkerClick?: (marker: Marker) => void,
) => {
  const track = laneTrack(lane);
  if (!track) return;

  // Revert marker edits that would overlap another marker — the library doesn't enforce
  // non-overlap constraints natively. No 1.x timed-item event carries the previous value, so the
  // last known-good temporal is cached per marker. Seeded from the markers already on the track,
  // because on a re-wire no ADD event will ever fire again for markers created before it.
  const lastGoodTemporal = new Map<string, TimedItemTemporal>(
    track.timedItems.map((item) => [item.id, item.temporal]),
  );
  track.onEvent$.pipe(takeUntil(destroy$)).subscribe({
    next: (event) => {
      if (event.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED) {
        for (const item of event.data.updatedTimedItems) {
          lastGoodTemporal.set(item.id, item.temporal);
        }
      } else if (
        event.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED
      ) {
        for (const item of event.data.updatedTimedItems) {
          lastGoodTemporal.delete(item.id);
        }
      } else if (
        event.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED
      ) {
        for (const item of event.data.updatedTimedItems) {
          const marker = track.getTimedItem(item.id);
          if (!marker) continue;
          if (checkMarkerOverlap(track, marker)) {
            const lastGood = lastGoodTemporal.get(item.id);
            if (lastGood) track.updateTimedItem(item.id, { temporal: lastGood });
          } else {
            lastGoodTemporal.set(item.id, marker.temporal);
          }
        }
      }
    },
  });

  lane.onEvent$
    .pipe(
      filter(
        (event) =>
          event.type ===
          MarkerTrackLaneEventType.TIMELINE_MARKER_TRACK_LANE_ITEM_CLICK,
      ),
      takeUntil(destroy$),
    )
    .subscribe({
      next: (event) => {
        const marker = track.getTimedItem(event.data.item.id);
        if (marker) onMarkerClick?.(marker);
      },
    });
};

const createThumbnailLane = (mode: Mode) =>
  new ThumbnailTrackLane({
    description: "Thumbnails",
    style: THEME[mode].thumbnailLaneStyle,
  });

// TAMS registers a thumbnail track during loadMainMedia but never loads it: the registration hook
// only adds the track to the repository, so it arrives with an empty timed-item list and nothing in
// the library ever fetches its VTT. Loading it here is what fills the timeline lane, both hover
// previews and the marker list's thumbnail column — they all read the same track.
const wireThumbnailTrack = (player: OmakasePlayerApi, track: ThumbnailTrack) => {
  // The video's own progress-bar preview holds a separate chroming-side reference, and refreshes it
  // only on timed-item UPDATE events — never on the ADD events a first load emits. So it has to be
  // handed the track after its thumbnails are in, not before.
  const setChromingThumbnailTrack = () =>
    player.chroming.setThumbnailTrack(TrackSource.fromTrack(track)).subscribe({
      error: (err) =>
        console.error("Error setting chroming thumbnail track:", err),
    });

  // `OpStageStatus` is `declare enum` rather than exported in omakase-player 1.1.2, so the load
  // status is compared as a string. Loading a track that is not NOT_STARTED throws.
  if (String(track.loadStage.status) !== "NOT_STARTED") {
    setChromingThumbnailTrack();
    return;
  }

  // `loadThumbnailTrack` exists on the implementation but not on the public `OmakaseTrackApi`, so
  // the track is loaded through `load` with a track source instead — that resolves the registered
  // track and hands it to the same thumbnail-track loader.
  player.track.load(TrackSource.fromTrack(track)).subscribe({
    next: setChromingThumbnailTrack,
    error: (err) => console.error("Error loading thumbnail track:", err),
  });
};

/**
 * Puts the Thumbnails lane back directly below the segmentation lanes.
 *
 * react-components' toolbar inserts a new segmentation lane at
 * `min(segmentationLanes.length + 1, mainSlotLaneCount)`. The `+1` assumes the scrubber occupies
 * MAIN index 0, but the scrubber lives in the HEADER slot — so MAIN index 0 is already
 * `Segmentation 1` and every toolbar-created lane lands one row too low, below the Thumbnails lane.
 *
 * omakase-player has no lane move API, so the order is restored by rebuilding the Thumbnails lane
 * at the right index. It is the one that gets rebuilt because it holds no state of its own beyond
 * the shared thumbnail track, whereas `removeTimelineLane` destroys the lane it removes and the
 * segmentation lanes hold the user's markers.
 *
 * Returns the old and new lane ids when the lane moved, so the caller can keep its lane-id
 * bookkeeping in step, or undefined when nothing needed doing.
 */
export const reseatThumbnailLane = (
  timeline: TimelineApi,
  player: OmakasePlayerApi,
  mode: Mode,
  expectedIndex: number,
): { previousId: string; laneId: string } | undefined => {
  const lanes = timeline.getTimelineLanes();
  const currentIndex = lanes.findIndex(
    (lane) => lane instanceof ThumbnailTrackLane,
  );
  if (currentIndex < 0 || currentIndex === expectedIndex) return undefined;

  const thumbnailTrack = player.track.findFirst(
    (track) => track.trackType === TrackType.THUMBNAIL_TRACK,
  ) as ThumbnailTrack | undefined;
  if (!thumbnailTrack) return undefined;

  const previousId = lanes[currentIndex].id;
  timeline.removeTimelineLane(previousId);

  const thumbnailLane = createThumbnailLane(mode);
  timeline.addTimelineLane(thumbnailLane, {
    index: Math.min(expectedIndex, lanes.length - 1),
  });
  thumbnailLane.setTrack(thumbnailTrack);

  return { previousId, laneId: thumbnailLane.id };
};

/**
 * Adds the horizontal zoom scrollbar to the timeline footer, once.
 *
 * In 0.25.4 the scrollbar was part of the timeline and drawn in the footer automatically, styled
 * through `TimelineStyle`'s `scrollbar*` keys. In 1.x it is a `ScrollbarLane` the app has to add,
 * so those keys alone did nothing and the scrollbar — with it, drag-to-pan while zoomed — went
 * missing. It goes in the FOOTER slot, which is where the timeline used to draw it.
 *
 * It holds no per-load state, so unlike the visualization lanes it is created once and left alone
 * across timerange reloads.
 */
const addScrollbarLane = (timeline: TimelineApi, mode: Mode) => {
  const footerLanes = timeline.getTimelineLanes(TimelineSlotType.FOOTER);
  if (footerLanes.some((lane) => lane instanceof ScrollbarLane)) return;

  timeline.addTimelineLane(
    new ScrollbarLane({ style: THEME[mode].scrollbarLaneStyle }),
    { slot: TimelineSlotType.FOOTER },
  );
};

export const buildLanesOnTimeline = ({
  timeline,
  mainMedia,
  player,
  mode,
  destroy$,
  segmentationTracks,
  previousMediaStartTime,
  onSegmentationLaneCreated,
  onMarkerClick,
}: {
  timeline: TimelineApi;
  mainMedia: TamsMainMedia;
  player: OmakasePlayerApi;
  mode: Mode;
  destroy$: Observable<void>;
  // Each segmentation lane's `MarkerTrack`, keyed by lane id, captured before the load wiped the
  // track repository. See `snapshotSegmentationTracks` and `restoreSegmentationTrack`. Empty on a
  // first build.
  segmentationTracks: Map<string, MarkerTrack>;
  // `tamsMetadata.mediaStartTime` of the window the existing markers were authored against, so they
  // can be re-anchored to the window now loading. See `rebaseMarkersOnTrack`.
  previousMediaStartTime: number | undefined;
  onSegmentationLaneCreated?: (lane: MarkerTrackLane) => void;
  onMarkerClick?: (marker: Marker) => void;
}): {
  textLabels: Map<string, TextLabel>;
  visualizationLaneIds: string[];
  discardedMarkerIds: string[];
} => {
  const textLabels = new Map<string, TextLabel>();
  const visualizationLaneIds: string[] = [];

  timeline.scrubberLane.setStyle(THEME[mode].scrubberLaneStyle);
  addScrollbarLane(timeline, mode);

  // Markers the newly loaded window cannot hold in full are discarded — see `rebaseMarkersOnTrack`.
  // Reported back so the view can drop a selection that no longer exists.
  const discardedMarkerIds: string[] = [];

  // Every segmentation lane is handled identically, whether it was created here or by the toolbar.
  // The visualisation lanes have already been destroyed by the caller at this point, so anything
  // `segmentationLanesOnTimeline` returns is a segmentation lane that survived the reload.
  const segmentationLanes = segmentationLanesOnTimeline(timeline);
  if (!segmentationLanes.length) {
    const lane = createSegmentationLane(timeline, player, mode, onMarkerClick);
    onSegmentationLaneCreated?.(lane);
    segmentationLanes.push(lane);
  } else {
    const nextMediaStartTime = mainMedia.tamsMetadata?.mediaStartTime;
    const delta =
      previousMediaStartTime !== undefined && nextMediaStartTime !== undefined
        ? previousMediaStartTime - nextMediaStartTime
        : 0;
    const duration = player.player.getDuration();
    for (const lane of segmentationLanes) {
      const remembered = segmentationTracks.get(lane.id);
      if (!remembered) continue;
      // Re-anchor before re-attaching, so the lane's first render already draws the markers at
      // their corrected positions instead of flashing the previous window's relative ones.
      discardedMarkerIds.push(
        ...rebaseMarkersOnTrack(remembered, delta, duration),
      );
      // The reload wiped the track repository and with it the lane's track — put it back before
      // wiring, or `wireSegmentationLane` bails at its guard and the lane stays blank and inert.
      restoreSegmentationTrack(player, lane, remembered);
    }
  }
  for (const lane of segmentationLanes) {
    wireSegmentationLane(lane, destroy$, onMarkerClick);
  }

  // TAMS builds and registers the thumbnail track itself during loadMainMedia.
  const thumbnailTrack = player.track.findFirst(
    (track) => track.trackType === TrackType.THUMBNAIL_TRACK,
  ) as ThumbnailTrack | undefined;
  if (thumbnailTrack) {
    const thumbnailLane = createThumbnailLane(mode);
    timeline.addTimelineLane(thumbnailLane);
    thumbnailLane.setTrack(thumbnailTrack);
    timeline.setThumbnailTrack(thumbnailTrack);
    wireThumbnailTrack(player, thumbnailTrack);
    visualizationLaneIds.push(thumbnailLane.id);
  }

  // Add segment visualization lanes for any flow that has segments
  const tamsMediaData = mainMedia.tamsMediaData;
  if (tamsMediaData?.flowsSegments) {
    const flowsSegmentsMap = tamsMediaData.flowsSegments;
    const primaryFlow = tamsMediaData.flow as Flow;
    const subflows = [...((tamsMediaData.subflows ?? []) as Flow[])]
      .sort((a, b) => (a.avg_bit_rate || 0) - (b.avg_bit_rate || 0))
      .reverse();
    const flowsWithSegments = [primaryFlow, ...subflows].filter(
      (f) => !!f && !!flowsSegmentsMap.get(f.id)?.length,
    );

    const sortedFlows = [...flowsWithSegments].sort(flowFormatSorting);
    const mediaStartTime = mainMedia.tamsMetadata?.mediaStartTime ?? 0;
    const videoDuration = player.player.getDuration();

    sortedFlows.forEach((flow: Flow) => {
      if (
        !isVideoFlow(flow) &&
        !isAudioFlow(flow) &&
        !isSubtitleFlow(flow) &&
        !isMuxedFlow(flow)
      ) {
        return;
      }

      const segments = flowsSegmentsMap.get(flow.id)!;
      const label = flow.description || flow.label || `Flow ${flow.id}`;

      // The TAMS→HLS bridge turns each subtitle flow into a text track named after the flow, so
      // the flow's manifest name is the join key. TAMS skips the preload path — cues stream into
      // the lane in the background once the raw track is set.
      const textTrack = isSubtitleFlow(flow)
        ? player.player.text
            .getTracks()
            .find((t) => t.label === resolveTextManifestName(flow))
        : undefined;

      if (textTrack) {
        // An empty description is deliberate, not an omission: `BaseTrackLane.tryUpdateDescription`
        // writes the track's own label — the HLS rendition name shown in the video's subtitle
        // picker — into the lane description whenever no description was configured, which would
        // draw it on top of the app's own flow label below. Any non-null value suppresses that.
        const subtitlesLane = new TextTrackLane({
          description: "",
          style: THEME[mode].textTrackLaneStyle,
        });
        timeline.addTimelineLane(subtitlesLane);
        subtitlesLane.setTrack(textTrack);
        // `TextTrackLane` re-renders on timed-item UPDATE and DELETE events but not on ADD, and the
        // TAMS cue reader delivers every cue through `addTimedItems`, which emits ADD. Cues that
        // land before `setTrack` are picked up by the lane itself; these are the ones that stream in
        // afterwards, which for TAMS is all of them. They arrive on absolute TAMS time, so they are
        // rebased onto the media timeline first — see `rebaseSubtitleCues`. That rebasing emits its
        // own UPDATE/DELETE events, which the lane does re-render on, so the explicit render only
        // has to cover the case where nothing needed moving.
        textTrack.onEvent$
          .pipe(
            filter(
              (event) =>
                event.type ===
                TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED,
            ),
            takeUntil(destroy$),
          )
          .subscribe({
            next: () => {
              if (
                !rebaseSubtitleCues(textTrack, mediaStartTime, videoDuration)
              ) {
                subtitlesLane.render();
              }
            },
          });
        // Cues already on the track when the lane was built are rebased too: the reader can deliver
        // a whole segment before the timeline exists.
        rebaseSubtitleCues(textTrack, mediaStartTime, videoDuration);
        visualizationLaneIds.push(subtitlesLane.id);
        const laneLabel = addLaneLabel(subtitlesLane, label, mode);
        textLabels.set(subtitlesLane.id, laneLabel);

        const markerLane = new MarkerTrackLane({
          style: THEME[mode].timelineLaneStyle,
          minimized: true,
        });
        timeline.addTimelineLane(markerLane);
        // `minimized: true` collapses the lane's row but not its markers. In 1.x marker views are
        // drawn in a spanning group on the timeline's surface layer, clipped to the whole slot
        // rather than to the lane's own row, and what actually hides them is an opacity fade
        // derived from `style.height / initialStyle.height`. The config flag zeroes the row's flex
        // height without touching `style.height`, so that ratio stays at 1 and the markers bleed
        // over the neighbouring lane. `minimize()` sets the style height, which is what the fade
        // reads; `maximize()` still restores the original height from `_initialStyle`.
        markerLane.minimize();
        visualizationLaneIds.push(markerLane.id);

        addSegmentMarkersToLane(
          markerLane,
          segments,
          mediaStartTime,
          videoDuration,
          mode,
          player,
        );
        addSubtitleLaneControls(
          subtitlesLane,
          markerLane,
          player,
          flow,
          destroy$,
        );
        return;
      }

      const markerLane = new MarkerTrackLane({
        style: THEME[mode].timelineLaneStyle,
      });
      timeline.addTimelineLane(markerLane);
      visualizationLaneIds.push(markerLane.id);
      const laneLabel = addLaneLabel(markerLane, label, mode);
      textLabels.set(markerLane.id, laneLabel);

      addSegmentMarkersToLane(
        markerLane,
        segments,
        mediaStartTime,
        videoDuration,
        mode,
        player,
      );
      if (isAudioFlow(flow)) {
        addAudioLaneControls(markerLane, flow, player, destroy$);
      }
    });
  }

  return { textLabels, visualizationLaneIds, discardedMarkerIds };
};

export const updateTimelineStyles = (
  timeline: TimelineApi,
  mode: Mode,
  textLabels: Map<string, TextLabel>,
  player: OmakasePlayerApi,
) => {
  timeline.setStyle(THEME[mode].timelineStyle);
  timeline.scrubberLane.setStyle(THEME[mode].scrubberLaneStyle);

  for (const lane of timeline.getTimelineLanes()) {
    // Every theme style carries a `height`, which for a collapsed lane would undo the collapse —
    // it is the lane's own style height that keeps a minimized lane hidden (see the nested segment
    // lanes in `buildLanesOnTimeline`). So the collapsed state is re-applied after the restyle.
    const wasMinimized = lane.isMinimized();
    if (lane instanceof ThumbnailTrackLane) {
      lane.setStyle(THEME[mode].thumbnailLaneStyle);
    } else if (lane instanceof TextTrackLane) {
      lane.setStyle(THEME[mode].textTrackLaneStyle);
    } else if (lane instanceof MarkerTrackLane) {
      const segmentTracks = lane.getTracks().filter(isSegmentTrack);
      if (segmentTracks.length) {
        lane.setStyle({
          ...THEME[mode].timelineLaneStyle,
          ...SEGMENT_MARKER_LANE_STYLE,
        });
        for (const track of segmentTracks) {
          applySegmentMarkerColors(player, track, mode);
        }
      } else {
        lane.setStyle(segmentationLaneStyleFor(mode));
      }
    }
    if (wasMinimized && !lane.isMinimized()) lane.minimize();
  }

  // The scrollbar lane lives in the footer slot, which `getTimelineLanes()` does not return.
  for (const lane of timeline.getTimelineLanes(TimelineSlotType.FOOTER)) {
    if (lane instanceof ScrollbarLane) {
      lane.setStyle(THEME[mode].scrollbarLaneStyle);
    }
  }

  for (const label of textLabels.values()) {
    label.style = THEME[mode].markerLaneTextLabelStyle;
  }
};

export const calculateTimerangeFromMainMedia = (
  mainMedia: TamsMainMedia,
): { timerange: string; maxTimerange: string } | null => {
  const tamsMediaData = mainMedia.tamsMediaData;
  const mediaStartTime = mainMedia.tamsMetadata?.mediaStartTime;
  if (!tamsMediaData || !mainMedia.duration || mediaStartTime === undefined) {
    return null;
  }

  const primaryFlow = tamsMediaData.flow as Flow;
  const subflows = (tamsMediaData.subflows ?? []) as Flow[];
  const allFlows = [primaryFlow, ...subflows].filter(
    (f): f is Flow => !!f && !!f.timerange,
  );

  const maxTimerange = computeMaxTimerangeFromFlows(allFlows);
  if (!maxTimerange) {
    return null;
  }

  try {
    const loadedStartSeconds = mediaStartTime;
    const loadedEndSeconds = mediaStartTime + mainMedia.duration;

    const startMoment = TimeRangeUtil.secondsToTimeMoment(loadedStartSeconds);
    const endMoment = TimeRangeUtil.secondsToTimeMoment(loadedEndSeconds);

    const calculatedRange = TimeRangeUtil.toTimeRange(
      startMoment,
      endMoment,
      true,
      false,
    );
    const currentTimerange = TimeRangeUtil.formatTimeRangeExpr(calculatedRange);

    return {
      timerange: currentTimerange,
      maxTimerange,
    };
  } catch (err) {
    console.error("Failed to derive current timerange:", err);
    return null;
  }
};

const isPresignedS3Url = (url: string): boolean => {
  try {
    const params = new URL(url).searchParams;
    const keys = new Set(Array.from(params.keys()).map((k) => k.toLowerCase()));
    // SigV4 pre-signed URL
    if (keys.has("x-amz-signature")) return true;
    // SigV2 pre-signed URL — require both to avoid false positives
    if (keys.has("signature") && keys.has("awsaccesskeyid")) return true;
    return false;
  } catch {
    return false;
  }
};

export const createAuthenticationConfig = (accessToken: string) => {
  return {
    type: "custom" as const,
    headers: (url: string): { headers: { [header: string]: string } } => {
      // Pre-signed URLs already have auth in query params, don't add header
      if (isPresignedS3Url(url)) {
        return { headers: {} };
      }
      // TAMS API requests need Bearer token
      return {
        headers: {
          Authorization: `Bearer ${accessToken || ""}`,
        },
      };
    },
  };
};

export const createEditTimeranges = (
  markers: (Marker | MarkerState)[],
  markerOffset: number,
  omakasePlayer: OmakasePlayerApi,
) => {
  // Replaces 0.25.4's calculateTimeToFrame/calculateFrameToTime round-trip, which ensured a
  // marker's time lines up with the start of its frame in milliseconds.
  const snapToFrame = (time: number) =>
    omakasePlayer.player.convertTime(
      omakasePlayer.player.convertTime(
        time,
        MediaTemporalFormat.SECONDS,
        MediaTemporalFormat.FRAME_COUNT,
      ),
      MediaTemporalFormat.FRAME_COUNT,
      MediaTemporalFormat.SECONDS,
    );

  const timeRanges = markers
    .map((marker) => {
      if (!isSpanningMarker(marker)) {
        return undefined;
      }
      const start = markerStart(marker);
      const end = markerEnd(marker);
      if (start == null || end == null) {
        return undefined;
      }

      const startMoment = TimeRangeUtil.secondsToTimeMoment(
        snapToFrame(start) + markerOffset,
      );
      const endMoment = TimeRangeUtil.secondsToTimeMoment(
        snapToFrame(end) + markerOffset,
      );
      const timeRange = TimeRangeUtil.toTimeRange(
        startMoment,
        endMoment,
        true,
        false,
      );

      return TimeRangeUtil.formatTimeRangeExpr(timeRange);
    })
    .filter((timeRange) => timeRange !== undefined);
  return timeRanges;
};
