import React, { useMemo, useRef, useState } from "react";
import { useEffect } from "react";
import "./style.css";

import {
  Marker,
  MarkerLane,
  MarkerListApi,
  OmakasePlayer,
  PeriodMarker,
  TimelineApi,
} from "@byomakase/omakase-player";

import {
  convertFlowIdToSubtitlesId,
  MediaInfo,
  OmakaseMarkerListComponent,
  OmakasePlayerTimelineBuilder,
  OmakasePlayerTimelineComponent,
  OmakasePlayerTimelineControlsToolbar,
  OmakaseTamsPlayerComponent,
  OmakaseTimeRangePicker,
  TimeRangeUtil,
} from "@byomakase/omakase-react-components";
import { Flow, FlowSegment } from "@byomakase/omakase-react-components";
import {
  HIGHLIGHTED_PERIOD_MARKER_STYLE,
  MARKER_LANE_STYLE,
  MARKER_LANE_TEXT_LABEL_STYLE,
  MARKER_LIST_CONFIG,
  PERIOD_MARKER_STYLE,
  PLAYER_CHROMING,
  SCRUBBER_LANE_STYLE,
  SEGMENT_PERIOD_MARKER_STYLE,
  SUBTITLES_LANE_STYLE,
  TIMELINE_CONFIG,
  TIMELINE_LANE_STYLE,
  VARIABLES,
} from "./constants";
import { ColorResolver } from "./color-resolver";

import RowTemplate from "./OmakaseMarkerListComponentTemplates/RowTemplate";
import HeaderTemplate from "./OmakaseMarkerListComponentTemplates/HeaderTemplate";
import OmakaseSegmentationHeader from "../OmakaseSegmentation/OmakaseSegmentationHeader";
import EmptyTemplate from "./OmakaseMarkerListComponentTemplates/EmptyTemplate";
import { TAMSThumbnailUtil } from "../../util/tams-thumbnail-util";

import {
  createAudioButton,
  createDropdownButton,
  createLabel,
  createSubtitlesButton,
} from "../../util/timeline-util";

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
      flow.format !== "urn:x-nmos:format:video" &&
      !(
        flow.format === "urn:x-nmos:format:data" &&
        flow.container === "text/vtt"
      )
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
    const urls = segments?.map((segment) => segment.get_urls!.at(-1)!.url);

    const markerLaneId = `marker-lane-${flow.id}`;
    let markerLaneMinimized = false;
    let labeledLaneId = markerLaneId;
    const colorResolver = new ColorResolver(VARIABLES.markerColors);

    if (
      flow.format === "urn:x-nmos:format:data" &&
      flow.container === "text/vtt" &&
      urls?.length
    ) {
      const subtitlesLaneId = `subtitles-lane-${flow.id}`;
      labeledLaneId = subtitlesLaneId;

      timelineBuilder.addSubtitlesLane({
        id: subtitlesLaneId,
        vttUrl: omakasePlayer.subtitles
          .getTracks()
          .find((track) => track.id === convertFlowIdToSubtitlesId(flow.id))!
          .src,
        style: SUBTITLES_LANE_STYLE,
      });

      createDropdownButton(timelineBuilder, timeline, subtitlesLaneId, [
        markerLaneId,
      ]);

      createSubtitlesButton(
        timelineBuilder,
        omakasePlayer,
        flow,
        subtitlesLaneId
      );

      markerLaneMinimized = true;
    }

    timelineBuilder.addMarkerLane({
      id: markerLaneId,
      style: TIMELINE_LANE_STYLE,
      minimized: markerLaneMinimized,
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

    createLabel(timelineBuilder, flow.description ?? "Segments", labeledLaneId);

    if (flow.format === "urn:x-nmos:format:audio") {
      createAudioButton(timelineBuilder, omakasePlayer, flow, markerLaneId);
    }
  });

  //@ts-ignore
  window.timeline = timeline;
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

    timelineBuilderFlows.sort(flowFormatSorting);

    const [omakasePlayer, setOmakasePlayer] = useState<
      OmakasePlayer | undefined
    >(undefined);

    const [mediaInfo, setMediaInfo] = useState<MediaInfo | undefined>(
      undefined
    );

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
                    markerOffset={mediaInfo!.mediaStartTime}
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
                onVideoLoadedCallback={(omakasePlayer, _, videoInfo) => {
                  setOmakasePlayer((prev) => prev ?? omakasePlayer);
                  setMediaInfo((prev) => prev ?? videoInfo);
                }}
                config={{
                  playerChroming: PLAYER_CHROMING,
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
                mediaInfo!.mediaStartTime,
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
