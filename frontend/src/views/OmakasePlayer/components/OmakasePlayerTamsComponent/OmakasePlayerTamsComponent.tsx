import React, { useMemo, useRef, useState } from "react";
import { useEffect } from "react";
import "./style.css";

import {
  ImageButton,
  Marker,
  MarkerLane,
  MarkerListApi,
  OmakasePlayer,
  PeriodMarker,
  TextLabel,
  TimelineApi,
  VideoLoadOptions,
} from "@byomakase/omakase-player";

import {
  OmakaseMarkerListComponent,
  OmakasePlayerTimelineBuilder,
  OmakasePlayerTimelineComponent,
  OmakasePlayerTimelineControlsToolbar,
  OmakaseTamsPlayerComponent,
  OmakaseTimeRangePicker,
  TimeRangeUtil,
} from "@byomakase/omakase-react-components";
import {
  Flow,
  FlowSegment,
  VideoFlow,
} from "@byomakase/omakase-react-components";
import {
  HIGHLIGHTED_PERIOD_MARKER_STYLE,
  MARKER_LANE_STYLE,
  MARKER_LANE_TEXT_LABEL_STYLE,
  MARKER_LIST_CONFIG,
  PERIOD_MARKER_STYLE,
  SCRUBBER_LANE_STYLE,
  SEGMENT_PERIOD_MARKER_STYLE,
  SOUND_BUTTON_CONFIG,
  TIMELINE_CONFIG,
  TIMELINE_LANE_STYLE,
  VARIABLES,
} from "./constants";
import { ColorResolver } from "./color-resolver";

import RowTemplate from "./OmakaseMarkerListComponentTemplates/RowTemplate";
import HeaderTemplate from "./OmakaseMarkerListComponentTemplates/HeaderTemplate";
import OmakaseSegmentationHeader from "../OmakaseSegmentation/OmakaseSegmentationHeader";
import EmptyTemplate from "./OmakaseMarkerListComponentTemplates/EmptyTemplate";
import { TimecodeUtil } from "../../util/timecode-util";
import { TAMSThumbnailUtil } from "../../util/tams-thumbnail-util";

type OmakasePlayerTamsComponentProps = {
  sourceId: string;
  flow: Flow;
  childFlows: Flow[];
  flowsSegments: Map<string, FlowSegment[]>;
  timeRange: string;
  maxTimeRange: string;
  displayConfig: Partial<DisplayConfig>;
  setTimeRange: React.Dispatch<React.SetStateAction<string>>;
};

export type DisplayConfig = {
  displayTimeline: boolean;
  displayMLC: boolean;
  displayVideoSegments: boolean;
  displayAudioSegments: boolean;
};

type VideoInfo = {
  ffom: string | undefined;
  markerOffset: number;
  fps: number;
  dropFrame: boolean;
};

function resolveDisplayConfig(
  partialConfig: Partial<DisplayConfig>
): DisplayConfig {
  return {
    displayTimeline: partialConfig.displayTimeline ?? true,
    displayMLC: partialConfig.displayMLC ?? true,
    displayVideoSegments: partialConfig.displayVideoSegments ?? true,
    displayAudioSegments: partialConfig.displayAudioSegments ?? true,
  };
}

function flowFormatSorting(a: Flow, b: Flow) {
  if (a === b) return 0;
  if (a.format === "urn:x-nmos:format:video") return -1;
  if (b.format === "urn:x-nmos:format:video") return 1;
  if (a.format === "urn:x-nmos:format:audio") return -1;
  if (b.format === "urn:x-nmos:format:audio") return 1;
  return 1; // Any other string is considered the biggest
}

function resolveVideoInfo(
  flows: Flow[],
  flowSegments: Map<string, FlowSegment[]>,
  requestedTimeRange: string
): VideoInfo {
  const sortedStartTimeAndFramerate = flows
    .filter((flow) => flowSegments.get(flow.id)!.length > 0)
    .map((flow) => {
      const segments = flowSegments.get(flow.id)!;
      let frameRate;
      let dropFrame = false;

      if (flow.format === "urn:x-nmos:format:video") {
        flow as VideoFlow;
        const frameRateParameters = flow.essence_parameters.frame_rate;

        if (frameRateParameters) {
          frameRate =
            frameRateParameters.numerator /
            (frameRateParameters.denominator ?? 1);

          if (
            (frameRateParameters.numerator === 60000 ||
              frameRateParameters.numerator === 30000) &&
            frameRateParameters.denominator === 1001
          ) {
            dropFrame = true;
          }
        }
      }

      return {
        start: TimeRangeUtil.timeMomentToSeconds(
          TimeRangeUtil.parseTimeRange(segments.at(0)!.timerange).start!
        ),
        frameRate: frameRate,
        dropFrame: dropFrame,
      };
    })
    .sort((a, b) => a.start - b.start);

  const videoStartTimeAndFrameRate = sortedStartTimeAndFramerate.find(
    (timeAndFrameRate) => timeAndFrameRate.frameRate !== undefined
  );

  const start =
    videoStartTimeAndFrameRate?.start ??
    sortedStartTimeAndFramerate.at(0)!.start;
  const date = new Date(start * 1000);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const milliseconds = date.getUTCMilliseconds();

  const realStart = hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;

  if (videoStartTimeAndFrameRate === undefined) {
    return {
      ffom: TimecodeUtil.formatToTimecode(realStart, 100, false),
      markerOffset: start,
      fps: 100,
      dropFrame: false,
    };
  }

  return {
    ffom: TimecodeUtil.formatToTimecode(
      realStart,
      videoStartTimeAndFrameRate.frameRate!,
      videoStartTimeAndFrameRate.dropFrame
    ),
    markerOffset: videoStartTimeAndFrameRate.start,
    fps: videoStartTimeAndFrameRate.frameRate!,
    dropFrame: videoStartTimeAndFrameRate.dropFrame,
  };
}

function segmentToMarker(
  segment: FlowSegment,
  markerOffset: number,
  videoLength: number
) {
  const timerange = TimeRangeUtil.parseTimeRange(segment.timerange);
  let start, end;
  if (timerange.start) {
    start = TimeRangeUtil.timeMomentToSeconds(timerange.start) - markerOffset;
    if (start < 0) {
      start = 0;
    }
  }
  if (timerange.end) {
    end = TimeRangeUtil.timeMomentToSeconds(timerange.end) - markerOffset;

    if (end > videoLength) {
      end = videoLength - 0.001;

      if (start !== undefined && start > end) {
        start = undefined;
      }
    }

    if (end < 0) {
      //if the end is negative as well it means this marker does not intersect video timeline
      end = undefined;
      start = undefined;
    }
  }

  return new PeriodMarker({
    timeObservation: {
      start: start,
      end: end,
    },
    editable: false,
    style: SEGMENT_PERIOD_MARKER_STYLE,
  });
}

function buildTimeline(
  omakasePlayer: OmakasePlayer,
  timeline: TimelineApi,
  childFlows: Flow[],
  childFlowsSegments: Map<string, FlowSegment[]>,
  markerLaneMap: Map<string, string>,
  timerange: string,
  markerOffset: number,
  config: DisplayConfig,
  onMarkerClickCallback: (marker: Marker) => void,
  addMLCSourceCallback: (markerSource: MarkerLane) => void,
  setSegmentationLanes: React.Dispatch<React.SetStateAction<MarkerLane[]>>
) {
  const timelineBuilder = new OmakasePlayerTimelineBuilder(omakasePlayer);

  const checkMarkerOverlap = (
    lane: MarkerLane,
    checkedMarker: PeriodMarker
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
          return overlaps || (newStart < markerEnd && newEnd > markerStart);
        }
      }
      return overlaps;
    }, false);
  };

  const thumbnailFlow =
    TAMSThumbnailUtil.resolveLowestQualityImageFlow(childFlows);

  const segmentationLaneId = "segmentation";
  timelineBuilder.addMarkerLane({
    id: segmentationLaneId,
    description: "Segmentation",
    style: TIMELINE_LANE_STYLE,
  });

  const parsedTimeRange = TimeRangeUtil.parseTimeRange(timerange);
  const start = Math.max(
    TimeRangeUtil.timeMomentToSeconds(parsedTimeRange.start!) - markerOffset,
    0
  );
  const end = Math.min(
    TimeRangeUtil.timeMomentToSeconds(parsedTimeRange.end!) - markerOffset,
    omakasePlayer.video.getDuration()
  );

  const segmentationMarker = new PeriodMarker({
    timeObservation: {
      start: Math.max(0, start),
      end: end,
    },
    editable: true,
    style: PERIOD_MARKER_STYLE,
  });

  omakasePlayer.video.seekToTime(start);

  segmentationMarker.onClick$.subscribe({
    next: () => onMarkerClickCallback(segmentationMarker),
  });

  timelineBuilder.addMarkers(segmentationLaneId, [segmentationMarker]);
  markerLaneMap.set(segmentationMarker.id, segmentationLaneId);

  if (thumbnailFlow) {
    const vttUrl = TAMSThumbnailUtil.generateThumbnailVttBlob(
      childFlowsSegments.get(thumbnailFlow.id)!,
      omakasePlayer.video.getDuration() + markerOffset,
      markerOffset
    );

    const thumbnailLaneId = "thumbanil-lane";

    timelineBuilder.addThumbnailLane({
      id: thumbnailLaneId,
      vttUrl: vttUrl,
      style: TIMELINE_LANE_STYLE,
      description: "Thumbnails",
    });

    omakasePlayer.timeline!.loadThumbnailVttFileFromUrl(vttUrl);
  }

  childFlows.forEach((flow) => {
    if (
      flow.format !== "urn:x-nmos:format:audio" &&
      flow.format !== "urn:x-nmos:format:video"
    ) {
      return;
    }

    if (
      flow.format === "urn:x-nmos:format:audio" &&
      !config.displayAudioSegments
    ) {
      return;
    }

    if (
      flow.format === "urn:x-nmos:format:video" &&
      !config.displayVideoSegments
    ) {
      return;
    }

    const segments = childFlowsSegments.get(flow.id);

    const markerLaneId = `marker-lane-${flow.id}`;
    const colorResolver = new ColorResolver(VARIABLES.markerColors);

    timelineBuilder.addMarkerLane({
      id: markerLaneId,
      // description: flow.description ?? "Segmentation",
      style: TIMELINE_LANE_STYLE,
    });

    if (segments?.length) {
      const markers = segments
        ?.map((segment) =>
          segmentToMarker(
            segment,
            markerOffset,
            omakasePlayer.video.getDuration()
          )
        )
        .filter(
          (marker) =>
            marker.timeObservation.start != undefined &&
            marker.timeObservation.end != undefined
        );

      markers.forEach((marker) => {
        marker.style.color = colorResolver.color;
      });
      timelineBuilder.addMarkers(markerLaneId, markers);
    }

    const label = new TextLabel({
      text: flow.description ?? "Segments",
      style: MARKER_LANE_TEXT_LABEL_STYLE,
    });

    const labelConstructionData = {
      node: label,
      config: {
        justify: "end" as "end",
        timelineNode: label,
        width: 150,
        height: 42,
        margin: [0, 0, 0, 10],
      },
    };

    timelineBuilder.addTimelineNode(markerLaneId, labelConstructionData);

    if (flow.format === "urn:x-nmos:format:audio") {
      const buttonImageSrc =
        omakasePlayer.audio.getActiveAudioTrack()?.label === flow.description
          ? "/sound-active-button.svg"
          : "/sound-inactive-button.svg";

      const soundControlButton = new ImageButton({
        ...SOUND_BUTTON_CONFIG,
        src: buttonImageSrc,
      });

      soundControlButton.onClick$.subscribe({
        next: () => {
          const audioTrack = omakasePlayer.audio
            .getAudioTracks()
            .find((track) => track.label === flow.description)!;
          omakasePlayer.audio.setActiveAudioTrack(audioTrack.id);
        },
      });

      omakasePlayer.audio.onAudioSwitched$.subscribe({
        next: (audioSwitchedEvent) => {
          const buttonImageSrc =
            audioSwitchedEvent.activeAudioTrack.label === flow.description
              ? "/sound-active-button.svg"
              : "/sound-inactive-button.svg";
          soundControlButton.setImage({
            ...SOUND_BUTTON_CONFIG,
            src: buttonImageSrc,
          });
        },
      });

      const buttonConstructionData = {
        node: soundControlButton,
        config: {
          height: soundControlButton.config.height!,
          width: soundControlButton.config.width!,
          justify: "start" as "start",
          timelineNode: soundControlButton,
          margin: [0, 10, 0, 10],
        },
      };

      timelineBuilder.addTimelineNode(markerLaneId, buttonConstructionData);
    }
  });

  timeline.getScrubberLane().style = SCRUBBER_LANE_STYLE;

  timelineBuilder.buildAttachedTimeline(timeline);

  const segmentationLane = timeline.getTimelineLane(
    segmentationLaneId
  )! as MarkerLane;

  segmentationLane.onMarkerUpdate$.subscribe({
    next: (markerUpdateEvent) => {
      if (
        checkMarkerOverlap(
          segmentationLane,
          markerUpdateEvent.marker as PeriodMarker
        )
      ) {
        markerUpdateEvent.marker.timeObservation =
          markerUpdateEvent.oldValue.timeObservation;
      }
    },
  });

  setSegmentationLanes((prevLanes) => [...prevLanes, segmentationLane]);
  addMLCSourceCallback(segmentationLane);

  setTimeout(() => onMarkerClickCallback(segmentationMarker));
}

function findMarkerLane(markerLanes: MarkerLane[], markerId: string) {
  const lane = markerLanes.find(
    (markerLane) => markerLane.getMarker(markerId) !== undefined
  );
  return lane;
}

const OmakasePlayerTamsComponent = React.memo(
  ({
    sourceId,
    flow,
    childFlows,
    flowsSegments,
    timeRange,
    maxTimeRange,
    setTimeRange,
    displayConfig,
  }: OmakasePlayerTamsComponentProps) => {
    const config = resolveDisplayConfig(displayConfig);

    const timelineBuilderFlows = useMemo(() => {
      const flows = childFlows ? [...childFlows] : [];
      if (flowsSegments.get(flow.id)!.length > 0) {
        flows.unshift(flow);
      }
      return flows;
    }, [childFlows, flowsSegments, flow]);

    const videoInfo = resolveVideoInfo(
      timelineBuilderFlows,
      flowsSegments,
      timeRange
    );

    const videoLoadOptions: VideoLoadOptions = videoInfo.ffom
      ? {
          protocol: "hls",
          ffom: videoInfo.ffom,
          frameRate: videoInfo.fps,
          dropFrame: videoInfo.dropFrame,
        }
      : {
          protocol: "hls",
          frameRate: videoInfo.fps,
          dropFrame: videoInfo.dropFrame,
        };

    timelineBuilderFlows.sort(flowFormatSorting);

    const [omakasePlayer, setOmakasePlayer] = useState<
      OmakasePlayer | undefined
    >(undefined);

    const [selectedMarker, setSelectedMarker] = useState<Marker | undefined>(
      undefined
    );

    const [segementationLanes, setSegmentationLanes] = useState<MarkerLane[]>(
      []
    );

    useEffect(() => {
      if (segementationLanes.length > 1) {
        segementationLanes.at(0)!.description = "Segmentation 1";
      }
    }, [segementationLanes]);

    const [markerList, setMarkerList] = useState<MarkerListApi | undefined>(
      undefined
    );

    const markerLaneMapRef = useRef<Map<string, string>>(new Map());

    const [source, setSource] = useState<MarkerLane | undefined>(undefined);

    const lane = useMemo(
      () =>
        selectedMarker
          ? findMarkerLane(segementationLanes, selectedMarker.id)
          : undefined,
      [selectedMarker, segementationLanes]
    );

    if (lane && source !== lane) {
      lane.toggleMarker(selectedMarker!.id);
      setSource(lane);
    }

    useEffect(() => {
      //sync selected marker state with omp
      if (selectedMarker) {
        segementationLanes
          .filter(
            (segmentationLane) =>
              segmentationLane.getMarker(selectedMarker.id) === undefined
          )
          .forEach((segmentationLane) => {
            const selectedMarker = segmentationLane.getSelectedMarker();
            selectedMarker && segmentationLane.toggleMarker(selectedMarker.id);
          });
        const laneSelectedMarker = lane!.getSelectedMarker();
        if (laneSelectedMarker !== selectedMarker) {
          lane!.toggleMarker(selectedMarker.id);
        }
      } else {
        segementationLanes.forEach((segmentationLane) => {
          const selectedMarker = segmentationLane.getSelectedMarker();
          selectedMarker && segmentationLane.toggleMarker(selectedMarker.id);
        });
      }
    }, [selectedMarker]);

    useEffect(() => {
      if (!markerList) {
        return;
      }

      markerList.onMarkerClick$.subscribe({
        next: (markerClickEvent) => {
          const marker = source!.getMarker(markerClickEvent.marker.id);
          onMarkerClickCallback(marker);
        },
      });
    }, [markerList]);

    const onMarkerClickCallback = (marker: Marker | undefined) => {
      setSelectedMarker((prevSelectedMarker) => {
        if (marker && prevSelectedMarker !== marker) {
          return marker;
        }

        return undefined;
      });
    };

    const addMLCSourceCallback = (source: MarkerLane) => {
      setSource(source);
    };

    const onSegementationClickCallback = (lane: MarkerLane) => {
      setSource(lane);
      onMarkerClickCallback(undefined);
    };

    const onCreateMarkerListCallback = (markerList: MarkerListApi) => {
      setMarkerList((prev) => (prev === markerList ? prev : markerList));
    };

    const onCheckmarkClickCallback = (start: number, end: number) => {
      const startMoment = TimeRangeUtil.secondsToTimeMoment(start);
      const endMoment = TimeRangeUtil.secondsToTimeMoment(end);

      const newTimeRange = TimeRangeUtil.toTimeRange(
        startMoment,
        endMoment,
        true,
        false
      );

      setTimeRange(TimeRangeUtil.formatTimeRangeExpr(newTimeRange));
    };

    return (
      <>
        <div className="north-pole">
          <div className="mlc-cp-container">
            <div>
              {omakasePlayer && omakasePlayer.timeline && config.displayMLC && (
                <>
                  <HeaderTemplate />
                  <RowTemplate />
                  <EmptyTemplate />

                  <OmakaseSegmentationHeader
                    segmentationLanes={segementationLanes}
                    onSegementationClickCallback={onSegementationClickCallback}
                    omakasePlayer={omakasePlayer}
                    source={source}
                    sourceMarkerList={markerList}
                    sourceId={sourceId}
                    flows={timelineBuilderFlows}
                    flowSegments={flowsSegments}
                    markerOffset={videoInfo.markerOffset}
                  />

                  <OmakaseMarkerListComponent
                    omakasePlayer={omakasePlayer}
                    config={{
                      ...MARKER_LIST_CONFIG,
                      source: source,
                      mode: "CUTLIST",
                      thumbnailVttFile:
                        omakasePlayer.timeline!.thumbnailVttFile,
                    }}
                    onCreateMarkerListCallback={(markerList) =>
                      setMarkerList((prev) =>
                        prev === markerList ? prev : markerList
                      )
                    }
                  />
                </>
              )}
            </div>
            <div>
              {omakasePlayer && markerList && (
                <OmakasePlayerTimelineControlsToolbar
                  // key={
                  //   selectedMarker ? (selectedMarker as Marker).id : "undefined"
                  // }
                  selectedMarker={selectedMarker}
                  omakasePlayer={omakasePlayer}
                  markerListApi={markerList}
                  setSegmentationLanes={setSegmentationLanes}
                  setSelectedMarker={setSelectedMarker}
                  onMarkerClickCallback={onMarkerClickCallback}
                  segmentationLanes={segementationLanes}
                  source={source}
                  setSource={setSource}
                  enableHotKeys={true}
                  constants={{
                    PERIOD_MARKER_STYLE: PERIOD_MARKER_STYLE,
                    HIGHLIGHTED_PERIOD_MARKER_STYLE:
                      HIGHLIGHTED_PERIOD_MARKER_STYLE,
                    TIMELINE_LANE_STYLE: MARKER_LANE_STYLE,
                    MARKER_LANE_TEXT_LABEL_STYLE: MARKER_LANE_TEXT_LABEL_STYLE,
                  }}
                ></OmakasePlayerTimelineControlsToolbar>
              )}
            </div>
          </div>
          <div>
            <div className="player-wrapper" style={{ marginBottom: 0 }}>
              <OmakaseTamsPlayerComponent
                flow={flow}
                childFlows={childFlows}
                flowsSegments={flowsSegments}
                videoLoadOptions={videoLoadOptions}
                onVideoLoadedCallback={(omakasePlayer) =>
                  setOmakasePlayer((prev) => prev ?? omakasePlayer)
                }
                config={{
                  playerChroming: {
                    theme: "DEFAULT",
                    themeConfig: {
                      controlBarVisibility: "ENABLED",
                    },
                  },
                }}
                timerange={timeRange}
                enableHotkey={true}
              />
            </div>
            <div className="player-wrapper">
              <OmakaseTimeRangePicker
                numberOfSegments={6}
                maxSliderRange={1800}
                segmentSize={600}
                timeRange={timeRange}
                maxTimeRange={maxTimeRange}
                onCheckmarkClickCallback={onCheckmarkClickCallback}
              />
            </div>
          </div>
        </div>

        {omakasePlayer && config.displayTimeline && (
          <OmakasePlayerTimelineComponent
            omakasePlayer={omakasePlayer}
            timelineConfig={TIMELINE_CONFIG}
            onTimelineCreatedCallback={(timeline) =>
              buildTimeline(
                omakasePlayer,
                timeline,
                timelineBuilderFlows,
                flowsSegments,
                markerLaneMapRef.current,
                timeRange,
                videoInfo.markerOffset,
                config,
                onMarkerClickCallback,
                addMLCSourceCallback,
                setSegmentationLanes
              )
            }
          ></OmakasePlayerTimelineComponent>
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    // skip rerender if flow is the same
    // TODO: PoC only, needs improvement
    return (
      prevProps.flow.id === nextProps.flow.id &&
      prevProps.timeRange === nextProps.timeRange &&
      prevProps.childFlows?.length === nextProps.childFlows?.length
    );
  }
);

export default OmakasePlayerTamsComponent;
