import {
  ImageButton,
  MarkerTrack,
  MarkerTrackLane,
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

// Marks the track of the segmentation lane this app creates, as opposed to the ones the toolbar's
// "add segmentation lane" button creates. The toolbar installs its own overlap guard on its tracks
// for its whole lifetime, so ours only goes on the track the toolbar never saw being created.
const APP_SEGMENTATION_TRACK_ATTR = "appSegmentation";

export const laneTrack = (lane: MarkerTrackLane): MarkerTrack | undefined =>
  lane.getTracks().at(0);

// 1.x temporals carry seconds as strings.
const spanTemporal = (start: number, end: number): TimedItemTemporal => ({
  type: TimedItemTemporalType.SPAN,
  start: String(start),
  end: String(end),
});

// Applies `fn` to every time a temporal carries, preserving its type.
const mapTemporal = (
  temporal: TimedItemTemporal,
  fn: (seconds: number) => number,
): TimedItemTemporal => {
  const map = (value: string) => String(fn(Number(value)));
  switch (temporal.type) {
    case TimedItemTemporalType.MOMENT:
      return { ...temporal, time: map(temporal.time) };
    case TimedItemTemporalType.SPAN:
      return {
        ...temporal,
        start: map(temporal.start),
        end: map(temporal.end),
      };
    case TimedItemTemporalType.SPAN_START:
      return { ...temporal, start: map(temporal.start) };
    case TimedItemTemporalType.SPAN_END:
      return { ...temporal, end: map(temporal.end) };
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

// `player.ui` keeps id rules for as long as the app leaves them, independent of the marker's life.
const removeMarkerStyleRules = (
  player: OmakasePlayerApi,
  markerIds: Iterable<string>,
) => {
  const ids = new Set(markerIds);
  if (!ids.size) return;
  player.ui.removeStyleRules((rule) => "id" in rule && ids.has(rule.id));
};

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

// Each segment marker remembers the TAMS timerange it was drawn from, which is what lets a live
// update tell the segments already drawn from the ones that have just arrived or been evicted.
const SEGMENT_TIMERANGE_ATTR = "tamsSegmentTimerange";

const segmentsToMarkers = (
  segments: Segment[],
  mediaStartTime: number,
  videoDuration: number,
): MarkerArgs[] =>
  segments.flatMap((segment) => {
    const marker = segmentToMarker(segment, mediaStartTime, videoDuration);
    return marker
      ? [{ ...marker, data: { [SEGMENT_TIMERANGE_ATTR]: segment.timerange } }]
      : [];
  });

/**
 * Brings a segment track up to date with a live flow's current segment list.
 *
 * In live playback the player keeps polling the store, and appends new segments to — and, for a
 * sliding window, evicts old ones from — the `tamsMediaData.flowsSegments` arrays in place. The
 * markers were built from those arrays once, at load, so without this the lane stops at whatever
 * existed then while the timeline itself grows past it.
 */
const syncSegmentMarkers = (
  track: MarkerTrack,
  segments: Segment[],
  mediaStartTime: number,
  mode: Mode,
  player: OmakasePlayerApi,
) => {
  const current = new Set(segments.map((segment) => segment.timerange));
  const evicted = track.timedItems
    .filter((marker) => !current.has(marker.data?.[SEGMENT_TIMERANGE_ATTR]))
    .map((marker) => marker.id);
  if (evicted.length) {
    track.deleteTimedItems(evicted);
    // Each marker's colour is an id rule; without this a sliding window leaks one per poll.
    removeMarkerStyleRules(player, evicted);
  }

  // At load the markers were clipped to the duration of the moment, and in live the newest segment
  // can run past it — so it was drawn short, leaving a gap before the first segment that arrives
  // afterwards. Restore any such marker to its segment's full length. Snapshotted first, because
  // `updateTimedItem` re-sorts the track's live `timedItems` array.
  const segmentsByTimerange = new Map(
    segments.map((segment) => [segment.timerange, segment]),
  );
  const clipped = track.timedItems.flatMap((marker) => {
    const segment = segmentsByTimerange.get(marker.data?.[SEGMENT_TIMERANGE_ATTR]);
    const full = segment
      ? segmentToMarker(segment, mediaStartTime, Number.POSITIVE_INFINITY)
      : null;
    if (!full) return [];
    const fullEnd = TimedItemTemporalUtil.extractEndTime(full.temporal);
    const end = TimedItemTemporalUtil.extractEndTime(marker.temporal);
    return fullEnd !== undefined && end !== undefined && fullEnd > end
      ? [{ id: marker.id, temporal: full.temporal }]
      : [];
  });
  for (const { id, temporal } of clipped) {
    track.updateTimedItem(id, { temporal });
  }

  const drawn = new Set(
    track.timedItems.map((marker) => marker.data?.[SEGMENT_TIMERANGE_ATTR]),
  );
  // No clipping at the far end: the duration read at load is exactly what live has outgrown.
  const arrived = segmentsToMarkers(
    segments.filter((segment) => !drawn.has(segment.timerange)),
    mediaStartTime,
    Number.POSITIVE_INFINITY,
  );
  if (!arrived.length) return;

  // Continue the colour cycle from the number of markers this track has EVER been given, not the
  // number it holds now: a sliding window evicts one segment for every one that arrives, so the
  // current count stands still and every new segment would get the same colour.
  const colors = THEME[mode].markerColors;
  const added = segmentMarkersAdded.get(track) ?? track.timedItems.length;
  const before = new Set(track.timedItems.map((marker) => marker.id));
  track.addTimedItems(arrived);
  track.timedItems
    .filter((marker) => !before.has(marker.id))
    .forEach((marker, i) =>
      applyMarkerColor(player, marker.id, colors[(added + i) % colors.length]),
    );
  segmentMarkersAdded.set(track, added + arrived.length);
};

// Running count of markers each live segment track has been given — see `syncSegmentMarkers`.
const segmentMarkersAdded = new WeakMap<MarkerTrack, number>();

const addSegmentMarkersToLane = (
  lane: MarkerTrackLane,
  segments: Segment[],
  mediaStartTime: number,
  videoDuration: number,
  mode: Mode,
  player: OmakasePlayerApi,
): MarkerTrack => {
  const markers = segmentsToMarkers(segments, mediaStartTime, videoDuration);

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
  return track;
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
//
// The segment tracks are passed in too rather than read off the lanes: this runs after
// `loadMainMedia` has cleared the track repository, which detaches every track from its lane, so
// `lane.getTracks()` is already empty. The track objects themselves still hold their markers, and
// those markers' colour rules live on in `player.ui` unless removed here.
export const removeVisualizationLanes = (
  timeline: TimelineApi,
  laneIds: string[],
  segmentTracks: MarkerTrack[],
  player: OmakasePlayerApi,
) => {
  for (const track of segmentTracks) {
    removeMarkerStyleRules(
      player,
      track.timedItems.map((marker) => marker.id),
    );
    player.track.delete(track.id);
  }
  if (laneIds.length) timeline.removeTimelineLanes(laneIds);
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
  const track = new MarkerTrack({
    customAttrs: { [APP_SEGMENTATION_TRACK_ATTR]: true },
  });
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
 * `laneTrack(lane)` is undefined and the lane draws as an empty row. The toolbar's marker-click
 * subscription looks the clicked marker up through `laneTrack(lane)` too, so the lane is inert as well
 * as blank and the toolbar's marker buttons have nothing selected to act on.
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

  // A marker kept by the epsilon can still sit a hair outside the window, and a hair below zero is
  // as fatal to the toolbar as a whole second — so kept markers are pinned to the window exactly.
  const clampToWindow = (seconds: number) =>
    Math.min(Math.max(seconds, 0), duration);

  // Snapshotted because `updateTimedItem` re-sorts the track's live `timedItems` array.
  const rebased = track.timedItems.map((item) => ({
    id: item.id,
    original: item.temporal,
    temporal: mapTemporal(item.temporal, (seconds) => seconds + delta),
  }));

  const discarded: string[] = [];
  for (const { id, original, temporal } of rebased) {
    const within =
      isWithinWindow(TimedItemTemporalUtil.extractStartTime(temporal)) &&
      isWithinWindow(TimedItemTemporalUtil.extractEndTime(temporal));
    if (!within) {
      discarded.push(id);
      continue;
    }
    const clamped = mapTemporal(temporal, clampToWindow);
    const moved =
      TimedItemTemporalUtil.extractStartTime(clamped) !==
        TimedItemTemporalUtil.extractStartTime(original) ||
      TimedItemTemporalUtil.extractEndTime(clamped) !==
        TimedItemTemporalUtil.extractEndTime(original);
    if (moved) track.updateTimedItem(id, { temporal: clamped });
  }
  if (discarded.length) track.deleteTimedItems(discarded);
  return discarded;
};

/**
 * Reverts edits that would make a marker overlap another on the same track — the library doesn't
 * enforce non-overlap natively.
 *
 * Only for the segmentation track this app created: the toolbar guards every track it creates, for
 * as long as it is mounted, so guarding those again would only duplicate it. Marker clicks need no
 * wiring here either, because the toolbar subscribes to `TIMELINE_MARKER_TRACK_LANE_ITEM_CLICK` on
 * every lane in its `segmentationLanes` prop.
 *
 * Called on EVERY lane build, not just at creation: a timerange reload completes the previous
 * `destroy$`, tearing this down, while the lane and track are deliberately reused. Must run AFTER
 * `restoreSegmentationTrack`, or the lane has no track to guard.
 */
const guardSegmentationOverlap = (
  lane: MarkerTrackLane,
  destroy$: Observable<void>,
) => {
  const track = laneTrack(lane);
  if (track?.customAttrs?.[APP_SEGMENTATION_TRACK_ATTR] !== true) return;

  // No 1.x timed-item event carries the previous value, so the last known-good temporal is cached
  // per marker. Seeded from the markers already on the track, because on a re-wire no ADD event
  // will ever fire again for markers created before it.
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
 * Moves any segmentation lane that is not at its expected row back into place, by rebuilding it there.
 *
 * react-components' toolbar inserts a new segmentation lane at
 * `min(segmentationLanes.length + 1, mainSlotLaneCount)`. The `+1` assumes the scrubber occupies
 * MAIN index 0, but the scrubber lives in the HEADER slot — so MAIN index 0 is already
 * `Segmentation 1` and every toolbar-created lane lands one row too low, below whichever lane follows
 * the segmentation lanes.
 *
 * omakase-player has no lane move API and `removeTimelineLane` destroys the lane, but not its track,
 * so the lane is rebuilt around the same track: the markers, their colours and the toolbar's overlap
 * guard all live on the track and carry over. The toolbar derives everything else from its
 * `segmentationLanes` / `source` props, so the caller only has to swap the new lane into its state.
 *
 * `lanes` is the app's segmentation lanes in order; lane `i` belongs at MAIN index `i`. Returns each
 * replaced lane mapped to its replacement — empty when every lane was already in place.
 */
export const reseatSegmentationLanes = (
  timeline: TimelineApi,
  lanes: MarkerTrackLane[],
  mode: Mode,
): Map<MarkerTrackLane, MarkerTrackLane> => {
  const replacements = new Map<MarkerTrackLane, MarkerTrackLane>();
  lanes.forEach((lane, expectedIndex) => {
    if (!isLaneLive(lane)) return;
    const currentIndex = timeline
      .getTimelineLanes()
      .findIndex((candidate) => candidate.id === lane.id);
    const track = laneTrack(lane);
    if (currentIndex < 0 || currentIndex === expectedIndex || !track) return;

    timeline.removeTimelineLane(lane.id);
    const replacement = new MarkerTrackLane({
      description: segmentationNameFor(expectedIndex),
      style: segmentationLaneStyleFor(mode),
    });
    replacement.addTrack(track);
    timeline.addTimelineLane(replacement, { index: expectedIndex });
    replacements.set(lane, replacement);
  });
  return replacements;
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
  /** The segment visualisation tracks, for the next build to clean up. See `removeVisualizationLanes`. */
  segmentTracks: MarkerTrack[];
  /** A new one per load, so anything that resolved the previous one has to be handed this. */
  thumbnailTrack: ThumbnailTrack | undefined;
  discardedMarkerIds: string[];
  /** Re-reads the live segment lists into the segment lanes. See `syncSegmentMarkers`. */
  refreshSegmentLanes: () => void;
} => {
  const textLabels = new Map<string, TextLabel>();
  const visualizationLaneIds: string[] = [];
  const segmentTracks: { flowId: string; track: MarkerTrack }[] = [];

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
      // The reload wiped the track repository and with it the lane's track — put it back, or the
      // lane stays blank and inert.
      restoreSegmentationTrack(player, lane, remembered);
    }
  }
  for (const lane of segmentationLanes) {
    guardSegmentationOverlap(lane, destroy$);
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
        // afterwards, which for TAMS is all of them. The reader already delivers them on media time
        // (`TamsSegmentedVttTimedItemsFetcher` applies the window offset), so they need no moving —
        // only drawing.
        textTrack.onEvent$
          .pipe(
            filter(
              (event) =>
                event.type ===
                TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED,
            ),
            takeUntil(destroy$),
          )
          .subscribe({ next: () => subtitlesLane.render() });
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

        segmentTracks.push({
          flowId: flow.id,
          track: addSegmentMarkersToLane(
            markerLane,
            segments,
            mediaStartTime,
            videoDuration,
            mode,
            player,
          ),
        });
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

      segmentTracks.push({
        flowId: flow.id,
        track: addSegmentMarkersToLane(
          markerLane,
          segments,
          mediaStartTime,
          videoDuration,
          mode,
          player,
        ),
      });
      if (isAudioFlow(flow)) {
        addAudioLaneControls(markerLane, flow, player, destroy$);
      }
    });
  }

  const refreshSegmentLanes = () => {
    const flowsSegments = mainMedia.tamsMediaData?.flowsSegments;
    if (!flowsSegments) return;
    const mediaStartTime = mainMedia.tamsMetadata?.mediaStartTime ?? 0;
    for (const { flowId, track } of segmentTracks) {
      const segments = flowsSegments.get(flowId);
      if (segments) {
        syncSegmentMarkers(track, segments, mediaStartTime, mode, player);
      }
    }
  };

  return {
    textLabels,
    visualizationLaneIds,
    segmentTracks: segmentTracks.map(({ track }) => track),
    thumbnailTrack,
    discardedMarkerIds,
    refreshSegmentLanes,
  };
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

  const flowsTimerange = computeMaxTimerangeFromFlows(allFlows);
  if (!flowsTimerange) {
    return null;
  }

  try {
    let loadedStartSeconds = mediaStartTime;
    let loadedEndSeconds = mediaStartTime + mainMedia.duration;

    // In live playback the loaded window moves after load: the player rewrites
    // `tamsMetadata.timerange` from the segments on every poll, while `duration` and the flows'
    // own timeranges stay as they were fetched. So the window is read from the former, and the
    // overall range is stretched to cover it — otherwise it stops at the load-time flow head.
    // `TamsPlaybackMode` is not exported, hence the string comparison.
    const loaded = mainMedia.tamsMetadata?.timerange
      ? TimeRangeUtil.parseTimeRange(mainMedia.tamsMetadata.timerange)
      : undefined;
    const isLive = String(mainMedia.tamsMetadata?.playbackMode) !== "VOD";
    if (isLive && loaded?.start && loaded.end) {
      loadedStartSeconds = TimeRangeUtil.timeMomentToSeconds(loaded.start);
      loadedEndSeconds = TimeRangeUtil.timeMomentToSeconds(loaded.end);
    }

    const flowsRange = TimeRangeUtil.parseTimeRange(flowsTimerange);
    const maxTimerange =
      loadedEndSeconds > TimeRangeUtil.timeMomentToSeconds(flowsRange.end!)
        ? TimeRangeUtil.formatTimeRangeExpr(
            TimeRangeUtil.toTimeRange(
              flowsRange.start!,
              TimeRangeUtil.secondsToTimeMoment(loadedEndSeconds),
              true,
              true,
            ),
          )
        : flowsTimerange;

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
