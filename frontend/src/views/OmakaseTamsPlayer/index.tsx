import "@byomakase/omakase-player/dist/style.css";
import "@byomakase/omakase-react-components/dist/omakase-react-components.css";
import "./style.css";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { Box, ColumnLayout, SpaceBetween } from "@cloudscape-design/components";
import {
  OmakaseMarkerListComponent,
  TimeRangeUtil,
} from "@byomakase/omakase-react-components";
import usePreferencesStore from "@/stores/usePreferencesStore";
import { useOmakasePlayer } from "./hooks/useOmakasePlayer";
import MarkerListToolbar from "./components/MarkerListToolbar";
import MarkerListHeader from "./components/MarkerListHeader";
import TimeRangePicker from "./components/TimeRangePicker";
import type {
  OmakasePlayerApi,
  MarkerLane,
  Marker,
  MarkerListApi,
} from "@byomakase/omakase-player";
import type { Flow } from "@/types/tams";
import {
  MARKER_LIST_CONFIG,
  ROW_TEMPLATE_HTML,
  EMPTY_TEMPLATE_HTML,
  HEADER_TEMPLATE_HTML,
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
            <MarkerListToolbar
              omakasePlayer={omakasePlayer}
              sourceMarkerList={sourceMarkerList}
              currentSource={currentSource}
              segmentationLanes={segmentationLanes}
              selectedMarker={selectedMarker}
              mode={mode}
              onSegmentationLanesChange={setSegmentationLanes}
              onSelectedMarkerChange={setSelectedMarker}
              onSourceChange={setCurrentSource}
            />
          )}
        </div>
        {timerange && maxTimerange && (
          <TimeRangePicker
            timerange={timerange}
            maxTimerange={maxTimerange}
            onTimeRangeChange={handleTimeRangePickerChange}
          />
        )}
      </ColumnLayout>
      <div id="omakase-timeline" />
    </SpaceBetween>
  );
};

export default OmakaseTamsPlayer;
