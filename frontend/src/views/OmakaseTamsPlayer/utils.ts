import {
  PeriodMarker,
  MarkerApi,
  MarkerAwareApi,
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

class ColorCycler {
  private index = 0;

  constructor(private colors: string[]) {}

  getNext(): string {
    const color = this.colors[this.index];
    this.index = (this.index + 1) % this.colors.length;
    return color;
  }
}

const flowFormatSorting = (a: Flow, b: Flow) => {
  if (a === b) return 0;
  if (a.format === "urn:x-nmos:format:multi") return -1;
  if (b.format === "urn:x-nmos:format:multi") return 1;
  if (a.format === "urn:x-nmos:format:video") return -1;
  if (b.format === "urn:x-nmos:format:video") return 1;
  if (a.format === "urn:x-nmos:format:audio") return -1;
  if (b.format === "urn:x-nmos:format:audio") return 1;
  return 1; // Any other format is considered last
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
      color,
      ...SEGMENT_PERIOD_MARKER_STYLE,
    },
  });
};

export const createTimelineWithLanes = (
  video: TamsVideo | Video,
  player: TamsPlayer,
  mode: Mode,
  onSegmentationLaneCreated?: (lane: MarkerLane) => void,
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
        ): boolean => {
          return lane.getMarkers().reduce((overlaps, marker) => {
            if (checkedMarker.id === marker.id) {
              return overlaps;
            }
            if (
              marker instanceof PeriodMarker &&
              marker.timeObservation.start != undefined &&
              marker.timeObservation.end != undefined
            ) {
              const timeObservation = checkedMarker.timeObservation;
              const markerStart = marker.timeObservation.start!;
              const markerEnd = marker.timeObservation.end!;
              const newStart = timeObservation.start;
              const newEnd = timeObservation.end;

              if (newStart != undefined && newEnd != undefined) {
                // Standard overlap check
                return (
                  overlaps || (newStart < markerEnd && newEnd > markerStart)
                );
              }
            }
            return overlaps;
          }, false);
        };

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

        segmentationLane.addMarker(segmentationMarker);

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
          const allFlows = primaryFlow ? [primaryFlow, ...subflows] : subflows;

          const flowsWithSegments = allFlows.filter((f) => {
            const segments = flowsSegmentsMap.get(f.id);
            return segments && segments.length > 0;
          });

          const sortedFlows = [...flowsWithSegments].sort(flowFormatSorting);

          sortedFlows.forEach((flow: Flow) => {
            // Only show video, audio, and subtitle flows
            const isVideo = flow.format === "urn:x-nmos:format:video";
            const isAudio = flow.format === "urn:x-nmos:format:audio";
            const isSubtitle =
              flow.format === "urn:x-nmos:format:data" &&
              flow.container === "text/vtt";

            if (!isVideo && !isAudio && !isSubtitle) {
              return;
            }

            // Get segments for this flow (flowsSegments is a Map)
            const flowSegments = video.tamsMediaData?.flowsSegments?.get(
              flow.id,
            );
            if (!flowSegments || flowSegments.length === 0) {
              return;
            }

            // For subtitle flows, create both SubtitlesLane and MarkerLane
            if (isSubtitle && "textUrls" in video && video.textUrls) {
              const textUrl = video.textUrls.get(flow.id);
              if (textUrl) {
                const subtitlesLaneId = `subtitles-lane-${flow.id}`;
                const markerLaneId = `marker-lane-${flow.id}`;

                // Create SubtitlesLane for actual subtitle display
                const subtitlesLane = new SubtitlesLane({
                  id: subtitlesLaneId,
                  description:
                    flow.description || flow.label || `Subtitles ${flow.id}`,
                  style: THEME[mode].subtitlesLaneStyle,
                });

                timelineApi.addTimelineLane(subtitlesLane);

                // Load VTT data asynchronously and register as subtitle track
                mergeVttManifest(textUrl, player.video.getDuration())
                  .then((vttUrl) => {
                    subtitlesLane.loadVtt(vttUrl);
                    // Create subtitle track in player
                    player.subtitles
                      .createVttTrack({
                        id: subtitlesLaneId,
                        src: vttUrl,
                        label:
                          flow.description ||
                          flow.label ||
                          `Subtitles ${flow.id}`,
                        language: "en",
                        default: false,
                      })
                      .subscribe({
                        next: () =>
                          console.log(
                            "Subtitle track created:",
                            subtitlesLaneId,
                          ),
                        error: (err) =>
                          console.error("Error creating subtitle track:", err),
                      });
                  })
                  .catch((err) => {
                    console.error("Error loading subtitle VTT:", err);
                  });

                // Create minimized MarkerLane for segments
                const flowMarkerLane = new MarkerLane({
                  id: markerLaneId,
                  description: `${flow.description || flow.label || flow.id} Segments`,
                  style: THEME[mode].timelineLaneStyle,
                  minimized: true,
                });

                timelineApi.addTimelineLane(flowMarkerLane);

                // Add segment markers
                const colorCycler = new ColorCycler(THEME[mode].markerColors);
                flowSegments.forEach((segment) => {
                  const markerColor = colorCycler.getNext();
                  const marker = segmentToMarker(
                    segment,
                    video.mediaStartTime,
                    player.video.getDuration(),
                    markerColor,
                  );

                  if (marker) {
                    flowMarkerLane.addMarker(marker);
                  }
                });

                // Create dropdown button to toggle marker lane visibility
                const dropdownButton = new ImageButton({
                  ...DROPDOWN_BUTTON_CONFIG,
                  src: CHEVRON_RIGHT_SVG_SOURCE,
                });

                // Subscribe to button clicks to toggle marker lane
                dropdownButton.onClick$.subscribe(() => {
                  flowMarkerLane.toggleMinimizeMaximize();

                  // Update button icon based on new state
                  if (flowMarkerLane.isMinimized()) {
                    dropdownButton.setImage({ src: CHEVRON_RIGHT_SVG_SOURCE });
                  } else {
                    dropdownButton.setImage({ src: CHEVRON_DOWN_SVG_SOURCE });
                  }
                });

                // Add dropdown button to subtitle lane's left pane
                subtitlesLane.addTimelineNode({
                  width: DROPDOWN_BUTTON_CONFIG.width!,
                  height: DROPDOWN_BUTTON_CONFIG.height!,
                  justify: "start",
                  margin: [0, 0, 0, 5],
                  timelineNode: dropdownButton,
                });

                // Create subtitles button to show/hide subtitles
                const subtitlesButton = new ImageButton({
                  ...SUBTITLES_BUTTON_CONFIG,
                  src: CHATBOX_SVG_SOURCE,
                });

                // Subscribe to button clicks to toggle subtitle visibility
                subtitlesButton.onClick$.subscribe(() => {
                  const activeTrack = player.subtitles.getActiveTrack();

                  if (activeTrack?.id !== subtitlesLaneId) {
                    // Show this subtitle track
                    player.subtitles.showTrack(subtitlesLaneId).subscribe({
                      next: () =>
                        console.log("Showing subtitle track:", subtitlesLaneId),
                      error: (err) =>
                        console.error("Error showing subtitle track:", err),
                    });
                  } else if (activeTrack?.hidden) {
                    // Unhide active track
                    player.subtitles.showActiveTrack().subscribe();
                  } else {
                    // Hide active track
                    player.subtitles.hideActiveTrack().subscribe();
                  }
                });

                // Subscribe to subtitle show/hide events to update button icon
                player.subtitles.onShow$.subscribe((event) => {
                  if (event.currentTrack?.id === subtitlesLaneId) {
                    subtitlesButton.setImage({
                      src: CHATBOX_ACTIVE_SVG_SOURCE,
                    });
                  } else if (
                    subtitlesButton.getImage()?.src !== CHATBOX_SVG_SOURCE
                  ) {
                    subtitlesButton.setImage({ src: CHATBOX_SVG_SOURCE });
                  }
                });

                player.subtitles.onHide$.subscribe((event) => {
                  if (event.currentTrack?.id === subtitlesLaneId) {
                    subtitlesButton.setImage({ src: CHATBOX_SVG_SOURCE });
                  }
                });

                // Add subtitles button to subtitle lane's left pane
                subtitlesLane.addTimelineNode({
                  width: SUBTITLES_BUTTON_CONFIG.width!,
                  height: SUBTITLES_BUTTON_CONFIG.height!,
                  justify: "start",
                  margin: [0, 0, 0, 5],
                  timelineNode: subtitlesButton,
                });

                return;
              }
            }

            // For non-subtitle flows, create MarkerLane
            const flowMarkerLane = new MarkerLane({
              id: `marker-lane-${flow.id}`,
              description: flow.description || flow.label || `Flow ${flow.id}`,
              style: THEME[mode].timelineLaneStyle,
            });

            timelineApi.addTimelineLane(flowMarkerLane);

            // Add segment markers - each segment gets a different color
            const colorCycler = new ColorCycler(THEME[mode].markerColors);
            flowSegments.forEach((segment) => {
              const markerColor = colorCycler.getNext();
              const marker = segmentToMarker(
                segment,
                video.mediaStartTime,
                player.video.getDuration(),
                markerColor,
              );

              // Only add marker if it has valid time observations
              if (marker) {
                flowMarkerLane.addMarker(marker);
              }
            });

            // Add sound button for audio flows
            if (isAudio) {
              const activeAudioTrack = player.audio.getActiveAudioTrack();
              const buttonImageSrc =
                activeAudioTrack?.label === (flow.description || flow.label)
                  ? "/sound-active-button.svg"
                  : "/sound-inactive-button.svg";

              const soundButton = new ImageButton({
                ...SOUND_BUTTON_CONFIG,
                src: buttonImageSrc,
              });

              // Subscribe to button clicks to switch audio track
              soundButton.onClick$.subscribe(() => {
                const audioTracks = player.audio.getAudioTracks();
                const targetTrack = audioTracks.find(
                  (track) => track.label === (flow.description || flow.label),
                );

                if (targetTrack) {
                  player.audio.setActiveAudioTrack(targetTrack.id);
                }
              });

              // Subscribe to audio switch events to update button icon
              player.audio.onAudioSwitched$.subscribe((event) => {
                const buttonImageSrc =
                  event.activeAudioTrack.label ===
                  (flow.description || flow.label)
                    ? "/sound-active-button.svg"
                    : "/sound-inactive-button.svg";
                soundButton.setImage({ src: buttonImageSrc });
              });

              // Add sound button to marker lane's left pane
              flowMarkerLane.addTimelineNode({
                width: SOUND_BUTTON_CONFIG.width!,
                height: SOUND_BUTTON_CONFIG.height!,
                justify: "start",
                margin: [0, 0, 0, 10],
                timelineNode: soundButton,
              });
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
  // Type narrowing: check if this is a TamsVideo with tamsMediaData
  if (!("tamsMediaData" in video) || !video.tamsMediaData) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timerangeStr = (video.tamsMediaData as any).timerange as
    | string
    | undefined;
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

export const createTimeRangeChangeHandler = (
  playerRef: React.RefObject<TamsPlayer | null>,
  tamsUrl: string,
  mode: Mode,
  setTimerange: (timerange: string) => void,
  onSegmentationLaneCreated?: (lane: MarkerLane) => void,
) => {
  return (start: number, end: number) => {
    const startMoment = TimeRangeUtil.secondsToTimeMoment(start);
    const endMoment = TimeRangeUtil.secondsToTimeMoment(end);
    const newTimeRange = TimeRangeUtil.toTimeRange(
      startMoment,
      endMoment,
      true,
      false,
    );
    const formattedTimeRange = TimeRangeUtil.formatTimeRangeExpr(newTimeRange);

    setTimerange(formattedTimeRange);

    // Reload video with new time range
    if (playerRef.current) {
      playerRef.current
        .loadVideo(tamsUrl, {
          returnTamsMediaData: true,
          timerange: formattedTimeRange,
        })
        .subscribe({
          next: (video) => {
            console.log("Video reloaded with new time range");
            if (playerRef.current?.timeline) {
              playerRef.current.timeline.destroy();
            }
            createTimelineWithLanes(
              video,
              playerRef.current!,
              mode,
              onSegmentationLaneCreated,
            );
          },
          error: (err) => console.error("Error reloading video:", err),
        });
    }
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
