import {
  PeriodMarker,
  MarkerApi,
  MarkerAwareApi,
  Marker,
} from "@byomakase/omakase-player";
import { TimeRangeUtil } from "@byomakase/omakase-react-components";
import {
  SEGMENT_PERIOD_MARKER_STYLE,
  SEGMENTATION_PERIOD_MARKER_STYLE,
  DROPDOWN_BUTTON_CONFIG,
  CHEVRON_DOWN_SVG_SOURCE,
  CHEVRON_RIGHT_SVG_SOURCE,
  SUBTITLES_BUTTON_CONFIG,
  CHATBOX_SVG_SOURCE,
  CHATBOX_ACTIVE_SVG_SOURCE,
  SOUND_BUTTON_CONFIG,
} from "./constants";
import type { Flow, Segment } from "@/types/tams";
import {
  ThumbnailLane,
  MarkerLane,
  OmakasePlayerApi,
  SubtitlesLane,
  ImageButton,
} from "@byomakase/omakase-player";
import { THEME } from "./constants";
import { Mode } from "@cloudscape-design/global-styles";
import type { OmakaseTamsPlayer as TamsPlayer } from "@byomakase/omakase-tams-player";
import type { TamsVideo } from "@byomakase/omakase-tams-player";
import type { Video } from "@byomakase/omakase-player/dist/video/model";
// @ts-expect-error - node-webvtt doesn't have type definitions
import * as webvtt from "node-webvtt";

type VttCue = {
  start: number;
  end: number;
  text: string;
  [key: string]: unknown;
};

type VttMetadata = {
  [key: string]: unknown;
};

type TamsMediaDataWithTimerange = NonNullable<TamsVideo["tamsMediaData"]> & {
  timerange?: string;
};

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

const fetchVttUtf8 = async (url: string): Promise<string> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${url}`);
  const buffer = await res.arrayBuffer();
  return new TextDecoder("utf-8").decode(buffer);
};

const formatSecondsToVttTimestamp = (seconds: number): string => {
  if (seconds < 0) seconds = 0;

  const h = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");

  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");

  const s = (seconds % 60).toFixed(3).padStart(6, "0");

  return `${h}:${m}:${s}`;
};

const mergeVttManifest = async (
  manifestUrl: string,
  videoDuration: number,
): Promise<string> => {
  const manifestRes = await fetch(manifestUrl);
  if (!manifestRes.ok) {
    throw new Error(
      `Failed to fetch manifest: ${manifestRes.status} ${manifestRes.statusText}`,
    );
  }

  const manifestText = await manifestRes.text();
  if (!manifestText.trim()) throw new Error("Empty manifest text");

  const vttUrls: string[] = [];
  const lines = manifestText.split("\n");

  const masterUrl = new URL(manifestUrl);
  const host = `${
    masterUrl.protocol === "blob:" ? masterUrl.protocol : ""
  }${masterUrl.origin}`;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const vttUrl = `${host}/${trimmed}`;
      vttUrls.push(vttUrl);
    }
  }

  if (!vttUrls.length) throw new Error("No VTT files found in manifest");

  const contents = await Promise.all(vttUrls.map(fetchVttUtf8));

  const allCues: VttCue[] = [];
  let metadata: VttMetadata | undefined;

  for (const text of contents) {
    const parsed = webvtt.parse(text, { strict: false, meta: true });

    if (!metadata) metadata = parsed.meta;

    for (const cue of parsed.cues) {
      allCues.push({
        ...cue,
        start: Math.max(0, Math.min(cue.start, videoDuration)),
        end: Math.max(0, Math.min(cue.end, videoDuration)),
      });
    }
  }

  const final: string[] = [];
  final.push("WEBVTT");

  if (metadata?.["X-TIMESTAMP-MAP=LOCAL"]) {
    final.push(`X-TIMESTAMP-MAP=LOCAL${metadata["X-TIMESTAMP-MAP=LOCAL"]}`);
    final.push("");
  } else {
    final.push("");
  }

  for (const cue of allCues) {
    final.push(
      `${formatSecondsToVttTimestamp(cue.start)} --> ${formatSecondsToVttTimestamp(cue.end)}`,
    );
    final.push(cue.text);
    final.push("");
  }

  const vtt = final.join("\n").trim() + "\n";
  const blob = new Blob([vtt], { type: "text/vtt" });
  return URL.createObjectURL(blob);
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
  subtitlesLaneId: string,
  label: string,
) => {
  mergeVttManifest(textUrl, player.video.getDuration())
    .then((vttUrl) => {
      subtitlesLane.loadVtt(vttUrl);
      player.subtitles
        .createVttTrack({
          id: subtitlesLaneId,
          src: vttUrl,
          label,
          language: "en",
          default: false,
        })
        .subscribe({
          error: (err) => console.error("Error creating subtitle track:", err),
        });
    })
    .catch((err) => console.error("Error loading subtitle VTT:", err));
};

const addSubtitleLaneControls = (
  subtitlesLane: SubtitlesLane,
  markerLane: MarkerLane,
  player: TamsPlayer,
  subtitlesLaneId: string,
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
    const active = player.subtitles.getActiveTrack();
    if (active?.id !== subtitlesLaneId) {
      player.subtitles.showTrack(subtitlesLaneId).subscribe({
        error: (err) => console.error("Error showing subtitle track:", err),
      });
    } else if (active?.hidden) {
      player.subtitles.showActiveTrack().subscribe();
    } else {
      player.subtitles.hideActiveTrack().subscribe();
    }
  });
  player.subtitles.onShow$.subscribe((event) => {
    if (event.currentTrack?.id === subtitlesLaneId) {
      subtitlesButton.setImage({ src: CHATBOX_ACTIVE_SVG_SOURCE });
    } else if (subtitlesButton.getImage()?.src !== CHATBOX_SVG_SOURCE) {
      subtitlesButton.setImage({ src: CHATBOX_SVG_SOURCE });
    }
  });
  player.subtitles.onHide$.subscribe((event) => {
    if (event.currentTrack?.id === subtitlesLaneId) {
      subtitlesButton.setImage({ src: CHATBOX_SVG_SOURCE });
    }
  });
  subtitlesLane.addTimelineNode({
    width: SUBTITLES_BUTTON_CONFIG.width!,
    height: SUBTITLES_BUTTON_CONFIG.height!,
    justify: "start",
    margin: [0, 0, 0, 5],
    timelineNode: subtitlesButton,
  });
};

const addAudioLaneControls = (
  markerLane: MarkerLane,
  flow: Flow,
  player: TamsPlayer,
) => {
  const flowLabel = flow.description || flow.label;
  const iconFor = (activeLabel: string | undefined) =>
    activeLabel === flowLabel
      ? "/sound-active-button.svg"
      : "/sound-inactive-button.svg";

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
  player.audio.onAudioSwitched$.subscribe((event) => {
    soundButton.setImage({ src: iconFor(event.activeAudioTrack.label) });
  });
  markerLane.addTimelineNode({
    width: SOUND_BUTTON_CONFIG.width!,
    height: SOUND_BUTTON_CONFIG.height!,
    justify: "start",
    margin: [0, 0, 0, 10],
    timelineNode: soundButton,
  });
};

export const createTimelineWithLanes = (
  video: TamsVideo | Video,
  player: TamsPlayer,
  mode: Mode,
  onSegmentationLaneCreated?: (lane: MarkerLane) => void,
  onMarkerClick?: (marker: Marker) => void,
) => {
  player
    .createTimeline({
      timelineHTMLElementId: "omakase-timeline",
      style: THEME[mode].timelineStyle,
    })
    .subscribe({
      next: (timelineApi) => {
        timelineApi.getScrubberLane().style = THEME[mode].scrubberLaneStyle;

        // Create segmentation marker lane
        const segmentationLaneId = "segmentation";
        const segmentationLane = new MarkerLane({
          id: segmentationLaneId,
          description: "Segmentation",
          style: THEME[mode].timelineLaneStyle,
        });
        timelineApi.addTimelineLane(segmentationLane);

        // Helper function to check if marker overlaps with other markers
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

        // Create default segmentation marker spanning the video
        const segmentationMarker = new PeriodMarker({
          timeObservation: {
            start: 0,
            end: player.video.getDuration(),
          },
          editable: true,
          style: {
            ...SEGMENTATION_PERIOD_MARKER_STYLE,
            color: THEME[mode].colors.segmentationMarker,
          },
        });

        segmentationMarker.onClick$.subscribe({
          next: () => onMarkerClick?.(segmentationMarker),
        });

        segmentationLane.addMarker(segmentationMarker);
        onMarkerClick?.(segmentationMarker);

        // Prevent marker overlap
        segmentationLane.onMarkerUpdate$.subscribe({
          next: (markerUpdateEvent) => {
            if (
              checkMarkerOverlap(
                segmentationLane,
                markerUpdateEvent.marker as PeriodMarker,
              )
            ) {
              markerUpdateEvent.marker.timeObservation =
                markerUpdateEvent.oldValue.timeObservation;
            }
          },
        });

        // Add thumbnail lane if available (only on TamsVideo)
        if ("thumbnailVttTrackUrl" in video && video.thumbnailVttTrackUrl) {
          const thumbnailLane = new ThumbnailLane({
            description: "Thumbnails",
            vttUrl: video.thumbnailVttTrackUrl,
            style: THEME[mode].thumbnailLaneStyle,
          });
          timelineApi.addTimelineLane(thumbnailLane);

          // Load thumbnail VTT file for marker list
          player.timeline!.loadThumbnailVttFileFromUrl(
            video.thumbnailVttTrackUrl,
          );
        }

        // Add segment visualization lanes for any flow that has segments
        if ("tamsMediaData" in video && video.tamsMediaData?.flowsSegments) {
          const flowsSegmentsMap = video.tamsMediaData.flowsSegments;
          const primaryFlow = video.tamsMediaData.flow;
          const subflows = video.tamsMediaData.subflows ?? [];
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
              !isSubtitleFlow(flow)
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
                description: label,
                style: THEME[mode].subtitlesLaneStyle,
              });
              timelineApi.addTimelineLane(subtitlesLane);

              const markerLane = new MarkerLane({
                id: `marker-lane-${flow.id}`,
                description: `${label} Segments`,
                style: THEME[mode].timelineLaneStyle,
                minimized: true,
              });
              timelineApi.addTimelineLane(markerLane);

              addSegmentMarkersToLane(
                markerLane,
                segments,
                mediaStartTime,
                videoDuration,
                mode,
              );
              loadAndRegisterSubtitles(
                subtitlesLane,
                player,
                textUrl,
                subtitlesLaneId,
                label,
              );
              addSubtitleLaneControls(
                subtitlesLane,
                markerLane,
                player,
                subtitlesLaneId,
              );
              return;
            }

            const markerLane = new MarkerLane({
              id: `marker-lane-${flow.id}`,
              description: label,
              style: THEME[mode].timelineLaneStyle,
            });
            timelineApi.addTimelineLane(markerLane);

            addSegmentMarkersToLane(
              markerLane,
              segments,
              mediaStartTime,
              videoDuration,
              mode,
            );
            if (isAudioFlow(flow)) {
              addAudioLaneControls(markerLane, flow, player);
            }
          });
        }

        // Notify callback of segmentation lane creation
        if (onSegmentationLaneCreated) {
          onSegmentationLaneCreated(segmentationLane);
        }
      },
      error: (err) => {
        console.error("Error creating timeline:", err);
      },
    });
};

export const calculateTimerangeFromVideo = (
  video: TamsVideo | Video,
): { timerange: string; maxTimerange: string } | null => {
  if (!("tamsMediaData" in video) || !video.tamsMediaData) {
    return null;
  }

  const timerangeStr = (video.tamsMediaData as TamsMediaDataWithTimerange)
    .timerange;
  if (!timerangeStr) {
    return null;
  }
  // Check if video has required properties
  if (
    !video.duration ||
    !("mediaStartTime" in video) ||
    video.mediaStartTime === undefined
  ) {
    return null;
  }

  try {
    const parsedTimerange = TimeRangeUtil.parseTimeRange(timerangeStr);
    if (!parsedTimerange.end || !parsedTimerange.start) {
      return null;
    }

    const endSeconds = TimeRangeUtil.timeMomentToSeconds(parsedTimerange.end);
    const startSeconds = Math.max(0, endSeconds - video.duration);

    const startMoment = TimeRangeUtil.secondsToTimeMoment(startSeconds);
    const endMoment = TimeRangeUtil.secondsToTimeMoment(endSeconds);

    const calculatedRange = TimeRangeUtil.toTimeRange(
      startMoment,
      endMoment,
      true,
      false,
    );
    const currentTimerange = TimeRangeUtil.formatTimeRangeExpr(calculatedRange);

    return {
      timerange: currentTimerange,
      maxTimerange: timerangeStr,
    };
  } catch (err) {
    console.error("Failed to parse timerange:", err);
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
