import "@byomakase/omakase-player/dist/style.css";
import "@byomakase/omakase-react-components/dist/omakase-react-components.css";
import "./style.css";
import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { Box, ColumnLayout, SpaceBetween } from "@cloudscape-design/components";
import {
  OmakaseMarkerListComponent,
  TimeRangeUtil,
  OmakasePlayerTimelineControlsToolbar,
  OmakaseTimeRangePicker,
} from "@byomakase/omakase-react-components";
import usePreferencesStore from "@/stores/usePreferencesStore";
import { useOmakasePlayer } from "./hooks/useOmakasePlayer";
import MarkerListHeader from "./components/MarkerListHeader";
import { renumberSegmentationLanes } from "./utils";
import type {
  OmakasePlayerApi,
  MarkerLane,
  Marker,
  MarkerListApi,
} from "@byomakase/omakase-player";
import type { Flow } from "@/types/tams";
import {
  SEGMENTATION_PERIOD_MARKER_STYLE,
  THEME,
  MARKER_LIST_CONFIG,
  ROW_TEMPLATE_HTML,
  EMPTY_TEMPLATE_HTML,
  HEADER_TEMPLATE_HTML,
  TIME_RANGE_PICKER_CONFIG,
} from "./constants";

const OmakaseTamsPlayer = () => {
  const { type, id } = useParams();
  const auth = useAuth();
  const mode = usePreferencesStore((state) => state.mode);
  const [error, setError] = useState<string | null>(null);
  const [timerange, setTimerange] = useState<string | undefined>();
  const [maxTimerange, setMaxTimerange] = useState<string | undefined>();
  const [omakasePlayer, setOmakasePlayer] = useState<
    OmakasePlayerApi | undefined
  >();
  const [segmentationLanes, setSegmentationLanes] = useState<MarkerLane[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<Marker | undefined>();
  const [sourceMarkerList, setSourceMarkerList] = useState<
    MarkerListApi | undefined
  >();
  const [currentSource, setCurrentSource] = useState<MarkerLane | undefined>();
  const [mediaStartTime, setMediaStartTime] = useState<number>(0);
  const [flows, setFlows] = useState<Flow[]>([]);

  useEffect(() => {
    renumberSegmentationLanes(segmentationLanes);
  }, [segmentationLanes]);

  useEffect(() => {
    // Deselect any lane-selected marker that no longer matches selectedMarker
    segmentationLanes.forEach((lane) => {
      const laneSelected = lane.getSelectedMarker();
      if (laneSelected && laneSelected.id !== selectedMarker?.id) {
        lane.toggleMarker(laneSelected.id);
      }
    });

    // Select the right marker on its owning lane (if any)
    if (selectedMarker) {
      const owningLane = segmentationLanes.find((l) =>
        l.getMarker(selectedMarker.id),
      );
      if (
        owningLane &&
        owningLane.getSelectedMarker()?.id !== selectedMarker.id
      ) {
        owningLane.toggleMarker(selectedMarker.id);
      }
    }

    // Sync the marker list (only highlights when selected marker is in currentSource)
    if (sourceMarkerList) {
      const listMarkerIds = new Set(
        sourceMarkerList.getMarkers().map((m) => m.id),
      );
      const listSelected = sourceMarkerList.getSelectedMarker();
      const wantId =
        selectedMarker && currentSource?.getMarker(selectedMarker.id)
          ? selectedMarker.id
          : undefined;

      if (
        listSelected &&
        listSelected.id !== wantId &&
        listMarkerIds.has(listSelected.id)
      ) {
        sourceMarkerList.toggleMarker(listSelected.id);
      }
      if (
        wantId &&
        listMarkerIds.has(wantId) &&
        sourceMarkerList.getSelectedMarker()?.id !== wantId
      ) {
        sourceMarkerList.toggleMarker(wantId);
      }
    }
  }, [selectedMarker, segmentationLanes, sourceMarkerList, currentSource]);

  const paletteVars = {
    "--omakase-background": THEME[mode].colors.background,
    "--omakase-textFill": THEME[mode].text.fill,
    "--omakase-laneBackground": THEME[mode].colors.laneBackground,
    "--omakase-segmentationMarker": THEME[mode].colors.segmentationMarker,
  } as React.CSSProperties;

  const toolbarConstants = useMemo(
    () => ({
      PERIOD_MARKER_STYLE: {
        ...SEGMENTATION_PERIOD_MARKER_STYLE,
        color: THEME[mode].colors.segmentationMarker,
      },
      HIGHLIGHTED_PERIOD_MARKER_STYLE: {
        ...SEGMENTATION_PERIOD_MARKER_STYLE,
        color: THEME[mode].colors.segmentationMarkerHighlighted,
      },
      TIMELINE_LANE_STYLE: THEME[mode].timelineLaneStyle,
      MARKER_LANE_TEXT_LABEL_STYLE: THEME[mode].markerLaneTextLabelStyle,
    }),
    [mode],
  );

  const handleTimerangeChange = (
    currentTimerange: string | undefined,
    maxTimerangeStr: string | undefined,
  ) => {
    setTimerange(currentTimerange);
    setMaxTimerange(maxTimerangeStr);
  };

  const handleSegmentationLaneCreated = (lane: MarkerLane) => {
    setSegmentationLanes((prev) => {
      const idx = prev.findIndex((l) => l.id === lane.id);
      if (idx < 0) return [...prev, lane];
      const next = [...prev];
      next[idx] = lane;
      return next;
    });
    setCurrentSource((prev) => (!prev || prev.id === lane.id ? lane : prev));
  };

  const { reloadWithTimerange } = useOmakasePlayer({
    type,
    id,
    accessToken: auth.user?.access_token,
    mode,
    segmentationLanes,
    onError: setError,
    onTimerangeChange: handleTimerangeChange,
    onSegmentationLaneCreated: handleSegmentationLaneCreated,
    onMarkerClick: setSelectedMarker,
    onPlayerReady: setOmakasePlayer,
    onMediaStartTimeCalculated: setMediaStartTime,
    onFlowsCalculated: setFlows,
  });

  const handleTimeRangePickerChange = (start: number, end: number) => {
    const startMoment = TimeRangeUtil.secondsToTimeMoment(start);
    const endMoment = TimeRangeUtil.secondsToTimeMoment(end);
    const range = TimeRangeUtil.toTimeRange(
      startMoment,
      endMoment,
      true,
      false,
    );
    reloadWithTimerange(TimeRangeUtil.formatTimeRangeExpr(range));
  };

  if (!auth.user?.access_token) {
    return (
      <Box textAlign="center" padding="l">
        Authentication required
      </Box>
    );
  }

  if (error) {
    return (
      <Box textAlign="center" padding="l" color="text-status-error">
        Error: {error}
      </Box>
    );
  }

  return (
    <div className="omakase-tams-player" style={paletteVars}>
      <SpaceBetween size="xs">
        <ColumnLayout columns={2} disableGutters>
          <div id="omakase-marker-list">
            {omakasePlayer && currentSource && (
              <>
                <MarkerListHeader
                  segmentationLanes={segmentationLanes}
                  source={currentSource}
                  sourceMarkerList={sourceMarkerList}
                  onSegmentationClickCallback={setCurrentSource}
                  sourceId={id || ""}
                  flows={flows}
                  markerOffset={mediaStartTime}
                  omakasePlayer={omakasePlayer}
                  onSegmentationLanesChange={setSegmentationLanes}
                />
                <template
                  id="header-template"
                  dangerouslySetInnerHTML={{ __html: HEADER_TEMPLATE_HTML }}
                />
                <template
                  id="row-template"
                  dangerouslySetInnerHTML={{ __html: ROW_TEMPLATE_HTML }}
                />
                <template
                  id="empty-template"
                  dangerouslySetInnerHTML={{ __html: EMPTY_TEMPLATE_HTML }}
                />
                <OmakaseMarkerListComponent
                  omakasePlayer={omakasePlayer}
                  config={{
                    ...MARKER_LIST_CONFIG,
                    source: currentSource,
                    mode: "CUTLIST",
                    thumbnailVttFile: omakasePlayer.timeline?.thumbnailVttFile,
                  }}
                  onCreateMarkerListCallback={setSourceMarkerList}
                />
              </>
            )}
          </div>
          <div id="omakase-video-container" />
        </ColumnLayout>
        <ColumnLayout columns={2} disableGutters>
          <div id="omakase-marker-toolbar">
            {omakasePlayer && sourceMarkerList && currentSource && (
              <OmakasePlayerTimelineControlsToolbar
                selectedMarker={selectedMarker}
                omakasePlayer={omakasePlayer}
                markerListApi={sourceMarkerList}
                setSegmentationLanes={setSegmentationLanes}
                setSelectedMarker={setSelectedMarker}
                onMarkerClickCallback={setSelectedMarker}
                segmentationLanes={segmentationLanes}
                source={currentSource}
                setSource={setCurrentSource}
                enableHotKeys={true}
                constants={toolbarConstants}
              />
            )}
          </div>
          {timerange && maxTimerange && (
            <OmakaseTimeRangePicker
              {...TIME_RANGE_PICKER_CONFIG}
              timeRange={timerange}
              maxTimeRange={maxTimerange}
              onCheckmarkClickCallback={handleTimeRangePickerChange}
            />
          )}
        </ColumnLayout>
        <div id="omakase-timeline" />
      </SpaceBetween>
    </div>
  );
};

export default OmakaseTamsPlayer;
