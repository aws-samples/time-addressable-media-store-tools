import { useCallback, useEffect, useRef } from "react";
import {
  ChromingTheme,
  DefaultThemeFloatingControl,
  MainMediaType,
  OmakasePlayer,
  TamsMainMedia,
} from "@byomakase/omakase-player";
import { Mode } from "@cloudscape-design/global-styles";
import { AWS_TAMS_ENDPOINT } from "@/constants";
import {
  buildLanesOnTimeline,
  updateTimelineStyles,
  removeVisualizationLanes,
  reseatThumbnailLane,
  calculateTimerangeFromMainMedia,
  createAuthenticationConfig,
} from "../utils";
import { Subject } from "rxjs";
import type {
  OmakasePlayerApi,
  MarkerTrackLane,
  Marker,
  TamsMainMediaLoadOptions,
  TimelineApi,
  TextLabel,
} from "@byomakase/omakase-player";
import type { Flow } from "@/types/tams";

type UseOmakasePlayerParams = {
  type: string | undefined;
  id: string | undefined;
  accessToken: string | undefined;
  /**
   * Bounded window for the first load, resolved by {@link useInitialLoadTimerange}. `null` means
   * the resource has no resolvable timerange, in which case the library's default VOD window is
   * used. Player construction waits until this is settled.
   */
  initialTimerange: string | null;
  isInitialTimerangeResolved: boolean;
  mode: Mode;
  /**
   * Number of segmentation lanes currently on the timeline. Only used to re-seat the Thumbnails
   * lane below them — react-components' toolbar inserts new segmentation lanes one row too low.
   */
  segmentationLaneCount: number;
  onError: (error: string | null) => void;
  onTimerangeChange: (
    timerange: string | undefined,
    maxTimerange: string | undefined,
  ) => void;
  onSegmentationLaneCreated?: (lane: MarkerTrackLane) => void;
  onMarkerClick?: (marker: Marker) => void;
  onPlayerReady?: (player: OmakasePlayerApi) => void;
  onMediaStartTimeCalculated?: (mediaStartTime: number) => void;
  onFlowsCalculated?: (flows: Flow[]) => void;
};

export const useOmakasePlayer = ({
  type,
  id,
  accessToken,
  initialTimerange,
  isInitialTimerangeResolved,
  mode,
  segmentationLaneCount,
  onError,
  onTimerangeChange,
  onSegmentationLaneCreated,
  onMarkerClick,
  onPlayerReady,
  onMediaStartTimeCalculated,
  onFlowsCalculated,
}: UseOmakasePlayerParams) => {
  const playerRef = useRef<OmakasePlayer | null>(null);
  const mainMediaRef = useRef<TamsMainMedia | null>(null);
  const timelineRef = useRef<TimelineApi | null>(null);
  const textLabelsRef = useRef<Map<string, TextLabel>>(new Map());
  const lanesDestroyRef = useRef<Subject<void> | null>(null);
  // Lane ids are library-generated uuids in omakase-player 1.x, so the ids to tear down on the
  // next rebuild have to be carried over from the previous build rather than derived by prefix.
  const visualizationLaneIdsRef = useRef<string[]>([]);
  // The segmentation lane holds user-created markers and must outlive a timerange reload, so it
  // is created once and handed back to each subsequent lane build.
  const segmentationLaneRef = useRef<MarkerTrackLane | undefined>(undefined);

  const callbacks = {
    onError,
    onTimerangeChange,
    onSegmentationLaneCreated,
    onMarkerClick,
    onPlayerReady,
    onMediaStartTimeCalculated,
    onFlowsCalculated,
  };
  const callbacksRef = useRef(callbacks);
  const modeRef = useRef(mode);
  const accessTokenRef = useRef(accessToken);
  useEffect(() => {
    callbacksRef.current = callbacks;
    modeRef.current = mode;
    accessTokenRef.current = accessToken;
  });

  // Completes the previous Subject to unsubscribe lane-level RxJS subscriptions
  // (audio switch buttons, subtitle toggle handlers) before rebuilding lanes.
  const swapLanesDestroy = useCallback(() => {
    lanesDestroyRef.current?.next();
    lanesDestroyRef.current?.complete();
    const next$ = new Subject<void>();
    lanesDestroyRef.current = next$;
    return next$;
  }, []);

  const handleTimelineCreatedImpl = useCallback(
    (timeline: TimelineApi) => {
      const player = playerRef.current;
      const mainMedia = mainMediaRef.current;
      if (!player || !mainMedia) return;

      timelineRef.current = timeline;

      const destroy$ = swapLanesDestroy();
      removeVisualizationLanes(
        timeline,
        visualizationLaneIdsRef.current,
        player,
      );

      const built = buildLanesOnTimeline({
        timeline,
        mainMedia,
        player,
        mode: modeRef.current,
        destroy$,
        segmentationLane: segmentationLaneRef.current,
        onSegmentationLaneCreated: (lane) => {
          segmentationLaneRef.current = lane;
          callbacksRef.current.onSegmentationLaneCreated?.(lane);
        },
        onMarkerClick: callbacksRef.current.onMarkerClick,
      });
      textLabelsRef.current = built.textLabels;
      visualizationLaneIdsRef.current = built.visualizationLaneIds;
      segmentationLaneRef.current = built.segmentationLane;
    },
    [swapLanesDestroy],
  );

  // OmakasePlayerTimelineComponent captures onTimelineCreatedCallback in a
  // mount-time effect closure, so we must pass a ref-stable function that
  // delegates to the latest implementation to avoid stale closures.
  const handleTimelineCreatedImplRef = useRef(handleTimelineCreatedImpl);
  useEffect(() => {
    handleTimelineCreatedImplRef.current = handleTimelineCreatedImpl;
  });

  const handleTimelineCreated = useCallback((timeline: TimelineApi) => {
    handleTimelineCreatedImplRef.current(timeline);
  }, []);

  const loadMedia = useCallback(
    (tamsUrl: string, options: TamsMainMediaLoadOptions) => {
      const player = playerRef.current;
      if (!player) return;

      player
        .loadMainMedia(tamsUrl, {
          mainMediaType: MainMediaType.TAMS,
          ...options,
        })
        .subscribe({
          next: (mainMedia) => {
            if (!(mainMedia instanceof TamsMainMedia)) {
              console.error("Loaded media is not a TAMS main media");
              return;
            }
            mainMediaRef.current = mainMedia;
            const cb = callbacksRef.current;

            const timerangeData = calculateTimerangeFromMainMedia(mainMedia);
            if (timerangeData) {
              cb.onTimerangeChange(
                timerangeData.timerange,
                timerangeData.maxTimerange,
              );
            }

            const mediaStartTime = mainMedia.tamsMetadata?.mediaStartTime;
            if (mediaStartTime !== undefined) {
              cb.onMediaStartTimeCalculated?.(mediaStartTime);
            }

            const subflows = mainMedia.tamsMediaData?.subflows;
            if (subflows) {
              cb.onFlowsCalculated?.(subflows as Flow[]);
            }

            cb.onPlayerReady?.(player);
          },
          error: (err) => {
            console.error("Error loading TAMS media:", err);
            callbacksRef.current.onError(
              err.message || "Failed to load video",
            );
          },
        });
    },
    [],
  );

  useEffect(() => {
    if (!accessTokenRef.current || !type || !id) return;
    // Wait for the bounded load window before constructing, so the first load is never unbounded.
    if (!isInitialTimerangeResolved) return;

    // 0.25.4 passed no chroming config, taking its defaults: `alwaysOnFloatingControls: [TIME]` and
    // no VU meter. 1.x defaults that pair to `[VU_METER]` + `isFloatingVuMeterVisible: true`, which
    // would float a VU meter over the video where nothing floats today (the 0.25.4 TIME element is
    // rendered but `d-none`, gated behind the TIME_TOGGLE). Restate 0.25.4's values for parity.
    const player = new OmakasePlayer({
      playerHtmlElementId: "omakase-video-container",
      chromingTheme: ChromingTheme.DEFAULT,
      chromingThemeConfig: {
        alwaysOnFloatingControls: [DefaultThemeFloatingControl.TIME],
        isFloatingVuMeterVisible: false,
      },
    });
    playerRef.current = player;

    player
      .setAuthentication(createAuthenticationConfig(accessTokenRef.current))
      .subscribe({
        error: (err) => console.error("Error setting authentication:", err),
      });

    // TAMS is native to omakase-player 1.x, so the endpoint is no longer configured separately —
    // the whole resource URL is passed to loadMainMedia.
    const tamsUrl = `${AWS_TAMS_ENDPOINT}/${type}/${id}`;
    // Never pass a bare `duration` — in 1.x that selects CONTINUOUS live playback. The cap is
    // expressed as an absolute timerange instead; omitting it falls back to the default VOD window.
    loadMedia(tamsUrl, {
      returnTamsMediaData: true,
      ...(initialTimerange ? { timerange: initialTimerange } : {}),
    });

    return () => {
      lanesDestroyRef.current?.next();
      lanesDestroyRef.current?.complete();
      lanesDestroyRef.current = null;
      timelineRef.current = null;
      textLabelsRef.current = new Map();
      visualizationLaneIdsRef.current = [];
      segmentationLaneRef.current = undefined;
      playerRef.current?.destroy();
      playerRef.current = null;
      mainMediaRef.current = null;
    };
  }, [type, id, loadMedia, initialTimerange, isInitialTimerangeResolved]);

  useEffect(() => {
    if (!accessToken || !playerRef.current) return;
    playerRef.current
      .setAuthentication(createAuthenticationConfig(accessToken))
      .subscribe({
        error: (err) => console.error("Error setting authentication:", err),
      });
  }, [accessToken]);

  // Toolbar-created segmentation lanes land below the Thumbnails lane instead of above it, so the
  // Thumbnails lane is re-seated whenever the segmentation-lane count changes. See
  // `reseatThumbnailLane` for why the Thumbnails lane is the one that moves.
  useEffect(() => {
    const timeline = timelineRef.current;
    const player = playerRef.current;
    if (!timeline || !player) return;
    const moved = reseatThumbnailLane(
      timeline,
      player,
      modeRef.current,
      segmentationLaneCount,
    );
    if (!moved) return;
    visualizationLaneIdsRef.current = visualizationLaneIdsRef.current.map((id) =>
      id === moved.previousId ? moved.laneId : id,
    );
  }, [segmentationLaneCount]);

  // Theme changes update styles in-place rather than destroying/recreating the
  // timeline, which preserves segmentation lane state and marker selections.
  useEffect(() => {
    const timeline = timelineRef.current;
    const player = playerRef.current;
    if (!timeline || !player) return;
    updateTimelineStyles(timeline, mode, textLabelsRef.current, player);
  }, [mode]);

  const reloadWithTimerange = useCallback(
    (timerange: string) => {
      if (!type || !id) return;
      const tamsUrl = `${AWS_TAMS_ENDPOINT}/${type}/${id}`;
      loadMedia(tamsUrl, {
        returnTamsMediaData: true,
        timerange,
      });
    },
    [type, id, loadMedia],
  );

  return { playerRef, reloadWithTimerange, handleTimelineCreated };
};
