import "@byomakase/omakase-player/dist/style.css";
import "@byomakase/omakase-react-components/dist/omakase-react-components.css";
import "./style.css";
import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { Box, ColumnLayout, SpaceBetween } from "@cloudscape-design/components";
import { AWS_TAMS_ENDPOINT } from "@/constants";
import usePreferencesStore from "@/stores/usePreferencesStore";
import { useOmakasePlayer } from "./hooks/useOmakasePlayer";
import MarkerListAndExport from "./components/MarkerListAndExport";
import MarkerListToolbar from "./components/MarkerListToolbar";
import TimeRangePicker from "./components/TimeRangePicker";
import { createTimeRangeChangeHandler } from "./utils";
import type {
  OmakasePlayerApi,
  MarkerLane,
  Marker,
  MarkerListApi,
} from "@byomakase/omakase-player";
import type { Flow } from "@/types/tams";

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

  const handleTimerangeChange = useCallback(
    (
      currentTimerange: string | undefined,
      maxTimerangeStr: string | undefined,
    ) => {
      setTimerange(currentTimerange);
      setMaxTimerange(maxTimerangeStr);
    },
    [],
  );

  const handleSegmentationLaneCreated = useCallback((lane: MarkerLane) => {
    setSegmentationLanes((prev) => {
      // Check if lane with this ID already exists (e.g., after theme change)
      const existingIndex = prev.findIndex((l) => l.id === lane.id);
      if (existingIndex >= 0) {
        // Replace existing lane with new instance
        const updated = [...prev];
        updated[existingIndex] = lane;
        return updated;
      }
      // New lane, append it
      return [...prev, lane];
    });
    setCurrentSource((prev) => {
      // If current source matches the lane ID, update to new instance
      if (prev?.id === lane.id) {
        return lane;
      }
      // Otherwise, set if no source exists
      return prev || lane;
    });
  }, []);

  const playerRef = useOmakasePlayer({
    type,
    id,
    accessToken: auth.user?.access_token,
    mode,
    onError: setError,
    onTimerangeChange: handleTimerangeChange,
    onSegmentationLaneCreated: handleSegmentationLaneCreated,
    onPlayerReady: setOmakasePlayer,
    onMediaStartTimeCalculated: setMediaStartTime,
    onFlowsCalculated: setFlows,
  });

  const handleTimeRangePickerChange = useCallback(
    (start: number, end: number) => {
      const tamsUrl = `${AWS_TAMS_ENDPOINT}/${type}/${id}`;
      const handler = createTimeRangeChangeHandler(
        playerRef,
        tamsUrl,
        mode,
        setTimerange,
        handleSegmentationLaneCreated,
      );
      handler(start, end);
    },
    [type, id, mode, playerRef, handleSegmentationLaneCreated],
  );

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
    <SpaceBetween size="l">
      <ColumnLayout columns={2}>
        <div>
          {omakasePlayer && currentSource && (
            <MarkerListAndExport
              omakasePlayer={omakasePlayer}
              currentSource={currentSource}
              segmentationLanes={segmentationLanes}
              sourceMarkerList={sourceMarkerList}
              flows={flows}
              mediaStartTime={mediaStartTime}
              sourceId={id || ""}
              onSourceChange={setCurrentSource}
              onMarkerListCreated={(markerList) =>
                setSourceMarkerList((prev) =>
                  prev === markerList ? prev : markerList,
                )
              }
              onSegmentationLanesChange={setSegmentationLanes}
            />
          )}
        </div>
        <div id="omakase-video-container" />
      </ColumnLayout>
      <ColumnLayout columns={2}>
        <div>
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
        <div className="time-range-picker-wrapper">
          {timerange && maxTimerange && (
            <TimeRangePicker
              timerange={timerange}
              maxTimerange={maxTimerange}
              onTimeRangeChange={handleTimeRangePickerChange}
            />
          )}
        </div>
      </ColumnLayout>
      <div id="omakase-timeline" />
    </SpaceBetween>
  );
};

export default OmakaseTamsPlayer;
