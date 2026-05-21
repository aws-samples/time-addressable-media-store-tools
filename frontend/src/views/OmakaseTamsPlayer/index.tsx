import "@byomakase/omakase-player/dist/style.css";
import "@byomakase/omakase-react-components/dist/omakase-react-components.css";
import "./style.css";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import { Box, Grid } from "@cloudscape-design/components";
import {
  OmakaseMarkerListComponent,
  TimeRangeUtil,
  OmakasePlayerTimelineControlsToolbar,
  OmakaseTimeRangeSelectorComponent,
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
  const segmentationLanesRef = useRef(segmentationLanes);
  const currentSourceRef = useRef(currentSource);

  const setSelectedMarkerWithSync = useCallback<
    React.Dispatch<React.SetStateAction<Marker | undefined>>
  >((action) => {
    // Function-form actions (used by the toolbar to clear selection on marker
    // delete) skip the lane/source sync — clearing doesn't need a tab switch
    // and the dispatch path doesn't have the new marker to look up.
    if (typeof action !== "function" && action) {
      // If clicking the already-selected marker, deselect it
      if (segmentationLanesRef.current.some(
        (l) => l.getSelectedMarker()?.id === action.id
      )) {
        const owning = segmentationLanesRef.current.find((l) =>
          l.getMarker(action.id),
        );
        if (owning?.getSelectedMarker()?.id === action.id) {
          owning.toggleMarker(action.id);
        }
        setSelectedMarker(undefined);
        return;
      }
      const owning = segmentationLanesRef.current.find((l) =>
        l.getMarker(action.id),
      );
      if (owning) {
        if (owning.getSelectedMarker()?.id !== action.id) {
          owning.toggleMarker(action.id);
        }
        if (currentSourceRef.current?.id !== owning.id) {
          setCurrentSource(owning);
        }
      }
    }
    setSelectedMarker(action);
  }, []);

  const handleSegmentationTabClick = useCallback((lane: MarkerLane) => {
    setCurrentSource(lane);
    setSelectedMarker(undefined);
  }, []);

  useEffect(() => {
    segmentationLanesRef.current = segmentationLanes;
    currentSourceRef.current = currentSource;
  }, [segmentationLanes, currentSource]);

  useEffect(() => {
    renumberSegmentationLanes(segmentationLanes);
  }, [segmentationLanes]);

  useEffect(() => {
    // Mirror selectedMarker onto external player state. The wrapper handles
    // user-driven clicks at the click site, but selections that originate
    // outside the wrapper (e.g. the initial default marker created during
    // timeline construction) need this fallback because the wrapper can't
    // toggle the lane until segmentationLanes state reflects it.
    segmentationLanes.forEach((lane) => {
      const laneSelected = lane.getSelectedMarker();
      if (laneSelected && laneSelected.id !== selectedMarker?.id) {
        lane.toggleMarker(laneSelected.id);
      }
    });

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

    if (sourceMarkerList) {
      const wantId =
        selectedMarker && currentSource?.getMarker(selectedMarker.id)
          ? selectedMarker.id
          : undefined;
      const listSelected = sourceMarkerList.getSelectedMarker();
      if (listSelected && listSelected.id !== wantId) {
        sourceMarkerList.toggleMarker(listSelected.id);
      }
    }
  }, [selectedMarker, segmentationLanes, sourceMarkerList, currentSource]);

  useEffect(() => {
    if (!sourceMarkerList) return;
    const sub = sourceMarkerList.onMarkerClick$.subscribe({
      next: (event) => {
        const marker = currentSourceRef.current?.getMarker(event.marker.id);
        if (marker) setSelectedMarkerWithSync(marker);
      },
    });
    return () => sub.unsubscribe();
  }, [sourceMarkerList, setSelectedMarkerWithSync]);

  useEffect(() => {
    if (!omakasePlayer || !sourceMarkerList || !currentSource) return;

    const labels = [
      "Go to Marker Start ( [ )",
      "Go to Marker End ( ] )",
      "Set Marker Start to Playhead ( i )",
      "Set Marker End to Playhead ( o )",
      "Mark In / Out ( m )",
      "Delete Marker ( n )",
      "Split Marker ( . )",
      "Loop Marker ( p )",
      "Rewind 3s & Play ( Cmd/Win+← )",
      "Play 3s & Rewind ( Cmd/Win+→ )",
    ];

    const panel = document.querySelector(
      ".omakase-tams-player .omakase-player-timeline-controls-toolbar > .omakase-player-timeline-controls-toolbar-control-panel:first-child",
    );
    if (!panel) return;

    const buttons = panel.querySelectorAll("button");
    buttons.forEach((btn, i) => {
      if (labels[i]) btn.title = labels[i];
    });
  }, [omakasePlayer, sourceMarkerList, currentSource]);

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

  const paletteVars = {
    "--omakase-background": THEME[mode].colors.background,
    "--omakase-textFill": THEME[mode].text.fill,
    "--omakase-laneBackground": THEME[mode].colors.laneBackground,
    "--omakase-scrollbarHandle": THEME[mode].colors.scrollbarHandle,
    "--omakase-scrollbarBorder": THEME[mode].colors.scrollbarBorder,
  } as React.CSSProperties;

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
    setCurrentSource((prev) => {
      if (!prev || prev.id === lane.id) return lane;
      if (lane.id === "segmentation") return lane;
      return prev;
    });
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
    onMarkerClick: setSelectedMarkerWithSync,
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
      <Grid gridDefinition={[{ colspan: 5 }, { colspan: 7 }]}>
        <div id="omakase-marker-list">
          {omakasePlayer && currentSource && (
            <>
              <MarkerListHeader
                segmentationLanes={segmentationLanes}
                source={currentSource}
                sourceMarkerList={sourceMarkerList}
                onSegmentationClickCallback={handleSegmentationTabClick}
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
        <Box>
          <div id="omakase-video-container" />
          {timerange && maxTimerange && (
            <OmakaseTimeRangeSelectorComponent
              {...TIME_RANGE_PICKER_CONFIG}
              timeRange={timerange}
              maxTimeRange={maxTimerange}
              onCheckmarkClickCallback={handleTimeRangePickerChange}
            />
          )}
        </Box>
      </Grid>
      <Box>
        {omakasePlayer && sourceMarkerList && currentSource && (
          <OmakasePlayerTimelineControlsToolbar
            selectedMarker={selectedMarker}
            omakasePlayer={omakasePlayer}
            setSegmentationLanes={setSegmentationLanes}
            setSelectedMarker={setSelectedMarkerWithSync}
            onMarkerClickCallback={setSelectedMarkerWithSync}
            segmentationLanes={segmentationLanes}
            source={currentSource}
            setSource={setCurrentSource}
            enableHotKeys={true}
            constants={toolbarConstants}
          />
        )}
      </Box>
      <div id="omakase-timeline" />
    </div>
  );
};

export default OmakaseTamsPlayer;
