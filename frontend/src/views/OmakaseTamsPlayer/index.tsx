import "@byomakase/omakase-player/dist/omakase-player.css";
import "@byomakase/omakase-react-components/dist/omakase-react-components.css";
import "./style.css";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams } from "react-router";
import { useAuth } from "react-oidc-context";
import { Box, Grid } from "@cloudscape-design/components";
import {
  OmakaseMarkerListComponent,
  OmakasePlayerTimelineComponent,
  TimeRangeUtil,
  OmakasePlayerTimelineControlsToolbar,
  OmakaseTimeRangeSelectorComponent,
} from "@byomakase/omakase-react-components";
import usePreferencesStore from "@/stores/usePreferencesStore";
import { useMarkerFocusStyles } from "./hooks/useMarkerFocusStyles";
import { useOmakasePlayer } from "./hooks/useOmakasePlayer";
import { usePlayerHotkeys } from "./hooks/usePlayerHotkeys";
import MarkerListHeader from "./components/MarkerListHeader";
import {
  applySegmentationMarkerColors,
  laneTrack,
  renumberSegmentationLanes,
  reseatSegmentationLanes,
  segmentationLaneStyleFor,
} from "./utils";
import { MarkerListEventType, TrackSource } from "@byomakase/omakase-player";
import type {
  OmakasePlayerApi,
  MarkerListConfig,
  MarkerTrackLane,
  Marker,
  MarkerListApi,
  ThumbnailTrack,
} from "@byomakase/omakase-player";
import type { Flow } from "@/types/tams";
import {
  SEGMENTATION_MARKER_SHAPE,
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
  const [segmentationLanes, setSegmentationLanes] = useState<MarkerTrackLane[]>(
    [],
  );
  const [selectedMarker, setSelectedMarker] = useState<Marker | undefined>();
  const [sourceMarkerList, setSourceMarkerList] = useState<
    MarkerListApi | undefined
  >();
  const [currentSource, setCurrentSource] = useState<
    MarkerTrackLane | undefined
  >();
  const [mediaStartTime, setMediaStartTime] = useState<number>(0);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [thumbnailTrack, setThumbnailTrack] = useState<
    ThumbnailTrack | undefined
  >();
  const segmentationLanesRef = useRef(segmentationLanes);
  const currentSourceRef = useRef(currentSource);
  const selectedMarkerRef = useRef(selectedMarker);
  const rangeSelectorWrapperRef = useRef<HTMLDivElement>(null);

  // Marker selection is entirely app state in omakase-player 1.x — the lane and marker list no
  // longer hold a selected marker, so there is nothing to mirror onto them. What still belongs
  // here is the app's own behaviour: re-clicking the selected marker deselects it, and clicking a
  // marker in another segmentation lane switches the active tab to that lane.
  const setSelectedMarkerWithSync = useCallback<
    React.Dispatch<React.SetStateAction<Marker | undefined>>
  >((action) => {
    if (typeof action !== "function" && action) {
      if (selectedMarkerRef.current?.id === action.id) {
        setSelectedMarker(undefined);
        return;
      }
      const owning = segmentationLanesRef.current.find((lane) =>
        laneTrack(lane)?.getTimedItem(action.id),
      );
      if (owning && currentSourceRef.current?.id !== owning.id) {
        setCurrentSource(owning);
      }
    }
    setSelectedMarker(action);
  }, []);

  // A timerange change drops any marker the new window cannot hold in full, so a selection can
  // outlive the marker it points at. Clearing it keeps the marker list, the lane and the toolbar's
  // set-in/set-out buttons agreeing on what is selected.
  const handleMarkersDiscarded = useCallback((markerIds: string[]) => {
    setSelectedMarker((prev) =>
      prev && markerIds.includes(prev.id) ? undefined : prev,
    );
  }, []);

  const handleSegmentationTabClick = useCallback((lane: MarkerTrackLane) => {
    setCurrentSource(lane);
    setSelectedMarker(undefined);
  }, []);

  useEffect(() => {
    segmentationLanesRef.current = segmentationLanes;
    currentSourceRef.current = currentSource;
    selectedMarkerRef.current = selectedMarker;
  }, [segmentationLanes, currentSource, selectedMarker]);

  useEffect(() => {
    renumberSegmentationLanes(segmentationLanes);
  }, [segmentationLanes]);

  // The toolbar adds new segmentation lanes one row too low (see `reseatSegmentationLanes`), so the
  // setters it is handed put the lanes back in order on the way into state. Its add button calls
  // `setSegmentationLanes` and then `setSource` with the lane it just built, so the replacements are
  // remembered for that second call.
  const reseatedLanesRef = useRef(new Map<MarkerTrackLane, MarkerTrackLane>());
  const setToolbarSegmentationLanes = useCallback<
    React.Dispatch<React.SetStateAction<MarkerTrackLane[]>>
  >(
    (action) => {
      const lanes =
        typeof action === "function"
          ? action(segmentationLanesRef.current)
          : action;
      const timeline = omakasePlayer?.timeline;
      const replaced = timeline
        ? reseatSegmentationLanes(timeline, lanes, mode)
        : new Map<MarkerTrackLane, MarkerTrackLane>();
      reseatedLanesRef.current = replaced;
      setSegmentationLanes(lanes.map((lane) => replaced.get(lane) ?? lane));
    },
    [omakasePlayer, mode],
  );
  const setToolbarSource = useCallback<
    React.Dispatch<React.SetStateAction<MarkerTrackLane | undefined>>
  >((action) => {
    setCurrentSource((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      return next && (reseatedLanesRef.current.get(next) ?? next);
    });
  }, []);

  // Covers lanes created by the toolbar as well as the first one built with the timeline: the
  // toolbar only sets a lane-level style, which the marker list's colour bar never sees.
  useEffect(() => {
    if (!omakasePlayer) return;
    applySegmentationMarkerColors(omakasePlayer, segmentationLanes, mode);
  }, [omakasePlayer, segmentationLanes, mode]);

  useEffect(() => {
    if (!sourceMarkerList) return;
    const sub = sourceMarkerList.onEvent$.subscribe({
      next: (event) => {
        if (event.type !== MarkerListEventType.MARKER_LIST_ITEM_CLICK) return;
        const source = currentSourceRef.current;
        const marker = source
          ? laneTrack(source)?.getTimedItem(event.data.item.id)
          : undefined;
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

  // The toolbar's old `constants` bag became two flat style props. Marker shape and colour now
  // live on the lane style (MarkerTrackLaneStyle extends MarkerOnMarkerTrackLaneStyle), so the
  // lane style carries what PERIOD_MARKER_STYLE used to, and splitMarkerStyle replaces
  // HIGHLIGHTED_PERIOD_MARKER_STYLE as the per-marker id rule for the second half of a split.
  const segmentationLaneStyle = useMemo(
    () => segmentationLaneStyleFor(mode),
    [mode],
  );

  // Shape without `markerRenderType`: the toolbar writes this as a marker-id rule, the same cascade
  // level `useMarkerFocusStyles` writes to, so carrying it would let a split clobber the selected
  // marker's `spanning-over-all-lanes` band. The lane style already supplies `default`.
  const splitMarkerStyle = useMemo(
    () => ({
      ...SEGMENTATION_MARKER_SHAPE,
      markerColor: THEME[mode].colors.segmentationMarkerHighlighted,
    }),
    [mode],
  );

  // The marker list is fed by tracks now rather than by a lane: `source` became `markerTrack`,
  // and the thumbnail VTT file became the player's thumbnail track. `MarkerListMode` is declared
  // but not exported by omakase-player 1.1.2, hence the cast.
  //
  // `OmakaseMarkerListComponent` only rebuilds the list when `markerTrack` changes identity, and the
  // list resolves its thumbnail track once, at creation. Every load registers a new thumbnail track,
  // so `thumbnailTrack` is a dependency here: the fresh `markerTrack` object it produces is what
  // makes a timerange reload rebuild the list against the new window's thumbnails.
  const markerListConfig = useMemo<MarkerListConfig>(() => {
    const markerTrack = currentSource ? laneTrack(currentSource) : undefined;
    return {
      ...MARKER_LIST_CONFIG,
      markerTrack: markerTrack
        ? { source: TrackSource.fromTrack(markerTrack) }
        : undefined,
      thumbnailTrack: thumbnailTrack
        ? { source: TrackSource.fromTrack(thumbnailTrack) }
        : undefined,
      mode: "CUTLIST" as MarkerListConfig["mode"],
    };
  }, [currentSource, thumbnailTrack]);

  const timelineConfig = useMemo(
    () => ({
      htmlElementId: "omakase-timeline",
      style: THEME[mode].timelineStyle,
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

  // A live media calls this on every poll, and each new value remounts the time range selector —
  // see its `key` below. A remount would throw away a range the user has dragged but not yet
  // confirmed, so updates are held back while the selector is showing its confirm / cancel buttons;
  // the next poll after the user resolves the edit catches it up. The selector exposes no edit
  // state, so its own button container's visibility class is the only signal available.
  const handleTimerangeChange = (
    currentTimerange: string | undefined,
    maxTimerangeStr: string | undefined,
  ) => {
    const isEditingRange = !!document.querySelector(
      ".omakase-time-range-selector-button-container:not(.omakase-time-range-selector-invisible)",
    );
    if (isEditingRange) return;
    // Nothing would remount, so nothing would release the height held below.
    if (currentTimerange === timerange && maxTimerangeStr === maxTimerange) {
      return;
    }
    // The remounted component only appends its web component in a post-paint effect, so for a frame
    // it is empty, the row above the timeline collapses and everything below jumps up and back.
    // Holding the space at the height it last rendered at keeps the layout still.
    const wrapper = rangeSelectorWrapperRef.current;
    if (wrapper?.offsetHeight) {
      wrapper.style.minHeight = `${wrapper.offsetHeight}px`;
    }
    setTimerange(currentTimerange);
    setMaxTimerange(maxTimerangeStr);
  };

  // Releases the height `handleTimerangeChange` held, as soon as the remounted selector has drawn
  // something, so the hold only ever spans the empty frame and never pins a stale height.
  useEffect(() => {
    const wrapper = rangeSelectorWrapperRef.current;
    const selector = wrapper?.firstElementChild;
    if (!wrapper?.style.minHeight || !selector) return;
    const observer = new ResizeObserver(() => {
      if (!selector.clientHeight) return;
      wrapper.style.minHeight = "";
      observer.disconnect();
    });
    observer.observe(selector);
    return () => observer.disconnect();
  }, [timerange, maxTimerange]);

  // Only called for a timeline's first segmentation lane, and the view is remounted per media (see
  // the default export), so there is never an earlier lane to keep.
  const handleSegmentationLaneCreated = (lane: MarkerTrackLane) => {
    setSegmentationLanes([lane]);
    setCurrentSource(lane);
  };

  const { reloadWithTimerange, handleTimelineCreated } = useOmakasePlayer({
    type,
    id,
    accessToken: auth.user?.access_token,
    mode,
    onError: setError,
    onTimerangeChange: handleTimerangeChange,
    onSegmentationLaneCreated: handleSegmentationLaneCreated,
    onMarkerClick: setSelectedMarkerWithSync,
    onMarkersDiscarded: handleMarkersDiscarded,
    onPlayerReady: setOmakasePlayer,
    onThumbnailTrackChange: setThumbnailTrack,
    onMediaStartTimeCalculated: setMediaStartTime,
    onFlowsCalculated: setFlows,
  });

  usePlayerHotkeys(omakasePlayer);
  useMarkerFocusStyles(omakasePlayer, selectedMarker);

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
                config={markerListConfig}
                onCreateMarkerListCallback={setSourceMarkerList}
              />
            </>
          )}
        </div>
        <Box>
          <div id="omakase-video-container" />
          <div ref={rangeSelectorWrapperRef}>
            {timerange && maxTimerange && (
              // The component reads its props once, in a mount-only effect, and the web component
              // underneath has no attribute-change handling either — so a new range only shows by
              // remounting it. Matters for live, where both ranges grow after load.
              <OmakaseTimeRangeSelectorComponent
                key={`${timerange}|${maxTimerange}`}
                {...TIME_RANGE_PICKER_CONFIG}
                timeRange={timerange}
                maxTimeRange={maxTimerange}
                onCheckmarkClickCallback={handleTimeRangePickerChange}
              />
            )}
          </div>
        </Box>
      </Grid>
      <Box>
        {omakasePlayer && sourceMarkerList && currentSource && (
          <OmakasePlayerTimelineControlsToolbar
            selectedMarker={selectedMarker}
            omakasePlayer={omakasePlayer}
            setSegmentationLanes={setToolbarSegmentationLanes}
            setSelectedMarker={setSelectedMarkerWithSync}
            onMarkerClickCallback={setSelectedMarkerWithSync}
            segmentationLanes={segmentationLanes}
            source={currentSource}
            setSource={setToolbarSource}
            enableHotKeys={true}
            segmentationLaneStyle={segmentationLaneStyle}
            splitMarkerStyle={splitMarkerStyle}
          />
        )}
      </Box>
      {omakasePlayer && (
        <OmakasePlayerTimelineComponent
          omakasePlayer={omakasePlayer}
          timelineConfig={timelineConfig}
          onTimelineCreatedCallback={handleTimelineCreated}
          enableHotKeys={true}
        />
      )}
    </div>
  );
};

// Keyed by media so that navigating from one flow or source to another starts from fresh state.
// The route element is otherwise reused, and every piece of state above — lanes, selection, marker
// list, ranges — would carry over from a player that has just been destroyed. Lane ids are uuids in
// 1.x, so nothing downstream can tell the old lanes from the new ones.
const OmakaseTamsPlayerRoute = () => {
  const { type, id } = useParams();
  return <OmakaseTamsPlayer key={`${type}/${id}`} />;
};

export default OmakaseTamsPlayerRoute;
