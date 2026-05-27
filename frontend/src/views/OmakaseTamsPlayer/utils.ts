import {
  PeriodMarker,
  MarkerApi,
  MarkerAwareApi,
  Marker,
} from "@byomakase/omakase-player";
import {
  TimeRangeUtil,
  resolveAudioManifestName,
  resolveTextManifestName,
} from "@byomakase/omakase-react-components";
import {
  SEGMENT_PERIOD_MARKER_STYLE,
  SEGMENTATION_PERIOD_MARKER_STYLE,
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
import {
  ThumbnailLane,
  MarkerLane,
  OmakasePlayerApi,
  SubtitlesLane,
  ImageButton,
  TextLabel,
} from "@byomakase/omakase-player";
import { Mode } from "@cloudscape-design/global-styles";
import { mergeVttManifest } from "./vtt-util";
import type {
  PeriodMarkerStyle,
  TimelineApi,
  TimelineStyle,
} from "@byomakase/omakase-player";
import { type Observable, takeUntil } from "rxjs";
import type { OmakaseTamsPlayer as TamsPlayer } from "@byomakase/omakase-tams-player";
import type { TamsVideo } from "@byomakase/omakase-tams-player";
import type { Video } from "@byomakase/omakase-player/dist/video/model";

export const makeColorCycler = (colors: string[]) => {
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
  color: string,
): PeriodMarker | null => {
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

  return new PeriodMarker({
    timeObservation: {
      start,
      end,
    },
    editable: false,
    style: {
      ...SEGMENT_PERIOD_MARKER_STYLE,
      color,
    },
  });
};

const isMuxedFlow = (f: Flow) => f.format === "urn:x-nmos:format:multi"; // Multi flows are only muxed when they have segments (pre-filtered by flowsWithSegments)
const isVideoFlow = (f: Flow) => f.format === "urn:x-nmos:format:video";
const isAudioFlow = (f: Flow) => f.format === "urn:x-nmos:format:audio";
const isSubtitleFlow = (f: Flow) =>
  f.format === "urn:x-nmos:format:data" && f.container === "text/vtt";

const addSegmentMarkersToLane = (
  lane: MarkerLane,
  segments: Segment[],
  mediaStartTime: number,
  videoDuration: number,
  mode: Mode,
) => {
  const nextColor = makeColorCycler(THEME[mode].markerColors);
  for (const segment of segments) {
    const marker = segmentToMarker(
      segment,
      mediaStartTime,
      videoDuration,
      nextColor(),
    );
    if (marker) lane.addMarker(marker);
  }
};

const loadAndRegisterSubtitles = (
  subtitlesLane: SubtitlesLane,
  player: TamsPlayer,
  textUrl: string,
) => {
  mergeVttManifest(textUrl, player.video.getDuration())
    .then((vttUrl) => {
      subtitlesLane.loadVtt(vttUrl);
    })
    .catch((err) => console.error("Error loading subtitle VTT:", err));
};

const addSubtitleLaneControls = (
  subtitlesLane: SubtitlesLane,
  markerLane: MarkerLane,
  player: TamsPlayer,
  flow: Flow,
  destroy$: Observable<void>,
) => {
  const dropdownButton = new ImageButton({
    ...DROPDOWN_BUTTON_CONFIG,
    src: CHEVRON_RIGHT_SVG_SOURCE,
  });
  dropdownButton.onClick$.subscribe(() => {
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

  const subtitlesButton = new ImageButton({
    ...SUBTITLES_BUTTON_CONFIG,
    src: CHATBOX_SVG_SOURCE,
  });
  subtitlesButton.onClick$.subscribe(() => {
    const track = player.subtitles
      .getTracks()
      .find((t) => t.label === resolveTextManifestName(flow));
    if (!track) return;
    const active = player.subtitles.getActiveTrack();
    if (active?.id !== track.id) {
      player.subtitles.showTrack(track.id).subscribe({
        error: (err) => console.error("Error showing subtitle track:", err),
      });
    } else if (active?.hidden) {
      player.subtitles.showActiveTrack().subscribe();
    } else {
      player.subtitles.hideActiveTrack().subscribe();
    }
  });
  player.subtitles.onShow$.pipe(takeUntil(destroy$)).subscribe((event) => {
    const track = player.subtitles
      .getTracks()
      .find((t) => t.label === resolveTextManifestName(flow));
    if (event.currentTrack?.id === track?.id) {
      subtitlesButton.setImage({ src: CHATBOX_ACTIVE_SVG_SOURCE });
    } else if (subtitlesButton.getImage()?.src !== CHATBOX_SVG_SOURCE) {
      subtitlesButton.setImage({ src: CHATBOX_SVG_SOURCE });
    }
  });
  player.subtitles.onHide$.pipe(takeUntil(destroy$)).subscribe((event) => {
    const track = player.subtitles
      .getTracks()
      .find((t) => t.label === resolveTextManifestName(flow));
    if (event.currentTrack?.id === track?.id) {
      subtitlesButton.setImage({ src: CHATBOX_SVG_SOURCE });
    }
  });
  subtitlesLane.addTimelineNode({
    width: SUBTITLES_BUTTON_CONFIG.width!,
    height: SUBTITLES_BUTTON_CONFIG.height!,
    justify: "start",
    margin: [0, 0, 0, 10],
    timelineNode: subtitlesButton,
  });
};

const addAudioLaneControls = (
  markerLane: MarkerLane,
  flow: Flow,
  player: TamsPlayer,
  destroy$: Observable<void>,
) => {
  const flowLabel = resolveAudioManifestName(flow);
  const iconFor = (activeLabel: string | undefined) =>
    activeLabel === flowLabel
      ? SOUND_ACTIVE_BUTTON_SOURCE
      : SOUND_INACTIVE_BUTTON_SOURCE;

  const soundButton = new ImageButton({
    ...SOUND_BUTTON_CONFIG,
    src: iconFor(player.audio.getActiveAudioTrack()?.label),
  });
  soundButton.onClick$.subscribe(() => {
    const target = player.audio
      .getAudioTracks()
      .find((t) => t.label === flowLabel);
    if (target) player.audio.setActiveAudioTrack(target.id);
  });
  player.audio.onAudioSwitched$.pipe(takeUntil(destroy$)).subscribe((event) => {
    soundButton.setImage({ src: iconFor(event.activeAudioTrack.label) });
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
  lane: MarkerLane | SubtitlesLane,
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

export const renumberSegmentationLanes = (lanes: MarkerLane[]) => {
  lanes.forEach((lane, index) => {
    lane.description = segmentationNameFor(index);
  });
};

// Removes segment visualization lanes but preserves segmentation lanes,
// which hold user-created markers that must persist across timerange reloads.
export const removeVisualizationLanes = (timeline: TimelineApi) => {
  const ids = timeline
    .getTimelineLanes()
    .filter(
      (lane) =>
        lane.id.startsWith("marker-lane-") ||
        lane.id.startsWith("subtitles-lane-") ||
        lane.id === "thumbnail-lane",
    )
    .map((lane) => lane.id);
  if (ids.length) timeline.removeTimelineLanes(ids);
};

export const buildLanesOnTimeline = ({
  timeline,
  video,
  player,
  mode,
  destroy$,
  onSegmentationLaneCreated,
  onMarkerClick,
}: {
  timeline: TimelineApi;
  video: TamsVideo | Video;
  player: TamsPlayer;
  mode: Mode;
  destroy$: Observable<void>;
  onSegmentationLaneCreated?: (lane: MarkerLane) => void;
  onMarkerClick?: (marker: Marker) => void;
}): Map<string, TextLabel> => {
  const textLabels = new Map<string, TextLabel>();

  timeline.getScrubberLane().style = THEME[mode].scrubberLaneStyle;

  // Create segmentation marker lane (only on first call — if it already exists, skip)
  const segmentationLaneId = "segmentation";
  let segmentationLane =
    timeline.getTimelineLane<MarkerLane>(segmentationLaneId);
  const isFirstBuild = !segmentationLane;

  if (isFirstBuild) {
    segmentationLane = new MarkerLane({
      id: segmentationLaneId,
      description: segmentationNameFor(0),
      style: THEME[mode].timelineLaneStyle,
    });
    timeline.addTimelineLane(segmentationLane);

    const checkMarkerOverlap = (
      lane: MarkerLane,
      checkedMarker: PeriodMarker,
    ): boolean =>
      lane.getMarkers().some((m) => {
        if (m.id === checkedMarker.id) return false;
        if (!(m instanceof PeriodMarker)) return false;
        const aS = m.timeObservation.start;
        const aE = m.timeObservation.end;
        const bS = checkedMarker.timeObservation.start;
        const bE = checkedMarker.timeObservation.end;
        if (aS == null || aE == null || bS == null || bE == null) {
          return false;
        }
        return bS < aE && bE > aS;
      });

    const segMarkerColor = THEME[mode].colors.segmentationMarker;

    const defaultMarker = new PeriodMarker({
      timeObservation: { start: 0, end: player.video.getDuration() },
      editable: true,
      style: {
        ...SEGMENTATION_PERIOD_MARKER_STYLE,
        color: segMarkerColor,
      },
    });
    defaultMarker.onClick$
      .pipe(takeUntil(destroy$))
      .subscribe({ next: () => onMarkerClick?.(defaultMarker) });
    segmentationLane.addMarker(defaultMarker);

    // Revert marker edits that would overlap another marker — the library
    // doesn't enforce non-overlap constraints natively.
    segmentationLane.onMarkerUpdate$.pipe(takeUntil(destroy$)).subscribe({
      next: (markerUpdateEvent) => {
        if (
          checkMarkerOverlap(
            segmentationLane!,
            markerUpdateEvent.marker as PeriodMarker,
          )
        ) {
          markerUpdateEvent.marker.timeObservation =
            markerUpdateEvent.oldValue.timeObservation;
        }
      },
    });

    setTimeout(() => onMarkerClick?.(defaultMarker));
    onSegmentationLaneCreated?.(segmentationLane);
  }

  // Add thumbnail lane if available (only on TamsVideo)
  if ("thumbnailVttTrackUrl" in video && video.thumbnailVttTrackUrl) {
    const thumbnailLane = new ThumbnailLane({
      id: "thumbnail-lane",
      description: "Thumbnails",
      vttUrl: video.thumbnailVttTrackUrl,
      style: THEME[mode].thumbnailLaneStyle,
    });
    timeline.addTimelineLane(thumbnailLane);
    timeline.loadThumbnailVttFileFromUrl(video.thumbnailVttTrackUrl);
  }

  // Add segment visualization lanes for any flow that has segments
  if ("tamsMediaData" in video && video.tamsMediaData?.flowsSegments) {
    const flowsSegmentsMap = video.tamsMediaData.flowsSegments;
    const primaryFlow = video.tamsMediaData.flow;
    const subflows = [...(video.tamsMediaData.subflows ?? [])]
      .sort((a, b) => (a.avg_bit_rate || 0) - (b.avg_bit_rate || 0))
      .reverse();
    const flowsWithSegments = [primaryFlow, ...subflows].filter(
      (f) => !!f && !!flowsSegmentsMap.get(f.id)?.length,
    );

    const sortedFlows = [...flowsWithSegments].sort(flowFormatSorting);
    const mediaStartTime = video.mediaStartTime;
    const videoDuration = player.video.getDuration();

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
      const textUrl =
        isSubtitleFlow(flow) && "textUrls" in video
          ? video.textUrls?.get(flow.id)
          : undefined;

      if (textUrl) {
        const subtitlesLaneId = `subtitles-lane-${flow.id}`;
        const subtitlesLane = new SubtitlesLane({
          id: subtitlesLaneId,
          style: THEME[mode].subtitlesLaneStyle,
        });
        timeline.addTimelineLane(subtitlesLane);
        const laneLabel = addLaneLabel(subtitlesLane, label, mode);
        textLabels.set(subtitlesLaneId, laneLabel);

        const markerLane = new MarkerLane({
          id: `marker-lane-${flow.id}`,
          style: THEME[mode].timelineLaneStyle,
          minimized: true,
        });
        timeline.addTimelineLane(markerLane);

        addSegmentMarkersToLane(
          markerLane,
          segments,
          mediaStartTime,
          videoDuration,
          mode,
        );
        loadAndRegisterSubtitles(subtitlesLane, player, textUrl);
        addSubtitleLaneControls(
          subtitlesLane,
          markerLane,
          player,
          flow,
          destroy$,
        );
        return;
      }

      const markerLane = new MarkerLane({
        id: `marker-lane-${flow.id}`,
        style: THEME[mode].timelineLaneStyle,
      });
      timeline.addTimelineLane(markerLane);
      const laneLabel = addLaneLabel(markerLane, label, mode);
      textLabels.set(markerLane.id, laneLabel);

      addSegmentMarkersToLane(
        markerLane,
        segments,
        mediaStartTime,
        videoDuration,
        mode,
      );
      if (isAudioFlow(flow)) {
        addAudioLaneControls(markerLane, flow, player, destroy$);
      }
    });
  }

  return textLabels;
};

export const updateTimelineStyles = (
  timeline: TimelineApi,
  mode: Mode,
  textLabels: Map<string, TextLabel>,
) => {
  timeline.style = THEME[mode].timelineStyle as TimelineStyle;
  timeline.getScrubberLane().style = THEME[mode].scrubberLaneStyle;

  for (const lane of timeline.getTimelineLanes()) {
    if (lane instanceof ThumbnailLane) {
      lane.style = THEME[mode].thumbnailLaneStyle;
    } else if (lane instanceof SubtitlesLane) {
      lane.style = THEME[mode].subtitlesLaneStyle;
    } else if (lane instanceof MarkerLane) {
      lane.style = THEME[mode].timelineLaneStyle;

      if (lane.id === "segmentation" || !lane.id.startsWith("marker-lane-")) {
        const segColor = THEME[mode].colors.segmentationMarker;
        for (const marker of lane.getMarkers()) {
          marker.style = {
            ...SEGMENTATION_PERIOD_MARKER_STYLE,
            color: segColor,
          } as PeriodMarkerStyle;
        }
      } else {
        const nextColor = makeColorCycler(THEME[mode].markerColors);
        for (const marker of lane.getMarkers()) {
          marker.style = {
            ...SEGMENT_PERIOD_MARKER_STYLE,
            color: nextColor(),
          } as PeriodMarkerStyle;
        }
      }
    }
  }

  for (const label of textLabels.values()) {
    label.style = THEME[mode].markerLaneTextLabelStyle;
  }
};

export const calculateTimerangeFromVideo = (
  video: TamsVideo | Video,
): { timerange: string; maxTimerange: string } | null => {
  if (!("tamsMediaData" in video) || !video.tamsMediaData) {
    return null;
  }
  if (
    !video.duration ||
    !("mediaStartTime" in video) ||
    video.mediaStartTime === undefined
  ) {
    return null;
  }

  const primaryFlow = video.tamsMediaData.flow;
  const subflows = video.tamsMediaData.subflows ?? [];
  const allFlows = [primaryFlow, ...subflows].filter(
    (f): f is Flow => !!f && !!f.timerange,
  );

  const maxTimerange = computeMaxTimerangeFromFlows(allFlows);
  if (!maxTimerange) {
    return null;
  }

  try {
    const loadedStartSeconds = video.mediaStartTime;
    const loadedEndSeconds = video.mediaStartTime + video.duration;

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
  source: MarkerAwareApi,
  markerOffset: number,
  omakasePlayer: OmakasePlayerApi,
) => {
  const timeRanges = source
    .getMarkers()
    .map((marker: MarkerApi) => {
      if ("time" in marker.timeObservation) {
        return undefined;
      }
      if (
        marker.timeObservation.start == undefined ||
        marker.timeObservation.end == undefined
      ) {
        return undefined;
      }

      // ensures marker start time lines up with start of the frame in milliseconds
      const startTime = omakasePlayer.video.calculateFrameToTime(
        omakasePlayer.video.calculateTimeToFrame(marker.timeObservation.start),
      );
      const endTime = omakasePlayer.video.calculateFrameToTime(
        omakasePlayer.video.calculateTimeToFrame(marker.timeObservation.end),
      );

      const startMoment = TimeRangeUtil.secondsToTimeMoment(
        startTime + markerOffset,
      );
      const endMoment = TimeRangeUtil.secondsToTimeMoment(
        endTime + markerOffset,
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
