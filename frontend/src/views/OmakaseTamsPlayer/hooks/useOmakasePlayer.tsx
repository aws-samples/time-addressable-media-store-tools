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
import { INITIAL_LOAD_MAX_SECONDS } from "../constants";
import {
  buildLanesOnTimeline,
  updateTimelineStyles,
  removeVisualizationLanes,
  reseatThumbnailLane,
  calculateTimerangeFromMainMedia,
  createAuthenticationConfig,
  snapshotSegmentationTracks,
} from "../utils";
import { Subject } from "rxjs";
import type {
  OmakasePlayerApi,
  MarkerTrack,
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
  /**
   * Markers dropped because the newly loaded window could not hold them in full. The view uses this
   * to clear a selection that no longer exists.
   */
  onMarkersDiscarded?: (markerIds: string[]) => void;
  onPlayerReady?: (player: OmakasePlayerApi) => void;
  onMediaStartTimeCalculated?: (mediaStartTime: number) => void;
  onFlowsCalculated?: (flows: Flow[]) => void;
};

export const useOmakasePlayer = ({
  type,
  id,
  accessToken,
  mode,
  segmentationLaneCount,
  onError,
  onTimerangeChange,
  onSegmentationLaneCreated,
  onMarkerClick,
  onMarkersDiscarded,
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
  // Each segmentation lane's MarkerTrack, keyed by lane id. A timerange reload clears the track
  // repository and detaches these tracks from their lanes — the lanes survive, their tracks do not —
  // so they are captured just before the load and re-registered by `restoreSegmentationTrack`. The
  // lanes themselves are read back off the timeline, which is what makes the toolbar's lanes behave
  // the same as the one built here.
  const segmentationTracksRef = useRef<Map<string, MarkerTrack>>(new Map());
  // `tamsMetadata.mediaStartTime` of the media the lanes were last built for. Marker temporals are
  // relative to it, so the delta against the incoming window is what re-anchors them.
  const markerMediaStartTimeRef = useRef<number | undefined>(undefined);
  // Id of the media the lanes were last built for, used to ignore the library's stale rebuild
  // trigger. See `buildLanes`.
  const builtForMediaIdRef = useRef<string | undefined>(undefined);

  const callbacks = {
    onError,
    onTimerangeChange,
    onSegmentationLaneCreated,
    onMarkerClick,
    onMarkersDiscarded,
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

  /**
   * (Re)builds the timeline lanes for whatever media is currently loaded.
   *
   * Called from two places, and de-duplicated by media id because both fire per load:
   *
   * 1. `handleTimelineCreated` — genuine timeline creation, plus the library's refire of
   *    `onTimelineCreatedCallback` on every `PLAYER_MAIN_MEDIA_LOADED`.
   * 2. `loadMedia`'s subscriber — where the new `TamsMainMedia` has just been assigned.
   *
   * Route 1 is NOT safe to build from on a reload. `PLAYER_MAIN_MEDIA_LOADED` is emitted inside
   * `_loadMainMedia`, i.e. before `loadMainMedia`'s subscriber runs, so `mainMediaRef.current` still
   * holds the PREVIOUS media and everything derived from `tamsMetadata` — the marker rebase delta and
   * the segment visualisation lanes — would be built from the outgoing window. The id check makes
   * that call a no-op (the previous media is already built for) and lets route 2, which sees the
   * fresh media, do the work.
   */
  const buildLanes = useCallback(() => {
    const player = playerRef.current;
    const mainMedia = mainMediaRef.current;
    const timeline = timelineRef.current;
    if (!player || !mainMedia || !timeline) return;
    if (builtForMediaIdRef.current === mainMedia.id) return;

    const destroy$ = swapLanesDestroy();
    removeVisualizationLanes(timeline, visualizationLaneIdsRef.current, player);

    const built = buildLanesOnTimeline({
      timeline,
      mainMedia,
      player,
      mode: modeRef.current,
      destroy$,
      segmentationTracks: segmentationTracksRef.current,
      previousMediaStartTime: markerMediaStartTimeRef.current,
      onSegmentationLaneCreated: callbacksRef.current.onSegmentationLaneCreated,
      onMarkerClick: callbacksRef.current.onMarkerClick,
    });
    textLabelsRef.current = built.textLabels;
    visualizationLaneIdsRef.current = built.visualizationLaneIds;
    if (built.discardedMarkerIds.length) {
      callbacksRef.current.onMarkersDiscarded?.(built.discardedMarkerIds);
    }
    markerMediaStartTimeRef.current = mainMedia.tamsMetadata?.mediaStartTime;
    builtForMediaIdRef.current = mainMedia.id;
  }, [swapLanesDestroy]);

  // OmakasePlayerTimelineComponent captures onTimelineCreatedCallback in a
  // mount-time effect closure, so we must pass a ref-stable function that
  // delegates to the latest implementation to avoid stale closures.
  const buildLanesRef = useRef(buildLanes);
  useEffect(() => {
    buildLanesRef.current = buildLanes;
  });

  const handleTimelineCreated = useCallback((timeline: TimelineApi) => {
    timelineRef.current = timeline;
    buildLanesRef.current();
  }, []);

  const loadMedia = useCallback(
    (tamsUrl: string, options: TamsMainMediaLoadOptions) => {
      const player = playerRef.current;
      if (!player) return;

      // Last chance to see the segmentation lanes' tracks: `loadMainMedia` unloads first, and
      // `unloadMainMedia` clears the track repository, which detaches every track from its lane.
      if (timelineRef.current) {
        segmentationTracksRef.current = snapshotSegmentationTracks(
          timelineRef.current,
        );
      }

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

            // Build the lanes here rather than from the timeline callback: this is the first point
            // at which the new media's `tamsMetadata` is readable. See `buildLanes`. On the very
            // first load there is no timeline yet, so this is a no-op and creation drives the build.
            buildLanesRef.current();

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
    // `duration` is the window length, not a metadata override — ignore what
    // `BaseMainMediaLoadOptions` says about it and read `TamsMainMediaLoadOptions` instead. It ends
    // up as `playback.windowDuration`, which the fetch turns into a timerange anchored at the END of
    // the resource (`convertDurationToTimerange`), i.e. the LAST 300 s. That is 0.25.4's
    // `TamsVideoLoadOptions.duration: 300` behaviour, and our guard rail against opening a very
    // large flow unbounded and paging every one of its segments.
    //
    // Note it also selects `TamsPlaybackMode.CONTINUOUS` (live). Today that always gets downgraded
    // to VOD, because the ingesting check that would keep it live is broken in
    // `1.1.2-SNAPSHOT.1788521000` — reported to byomakase as round 2 §1. When they fix it, an
    // INGESTING flow loaded here will genuinely resolve to live, which the timeline does not yet
    // support: revisit this call alongside the live-timeline work, and retest after any version bump.
    loadMedia(tamsUrl, {
      returnTamsMediaData: true,
      duration: INITIAL_LOAD_MAX_SECONDS,
    });

    return () => {
      lanesDestroyRef.current?.next();
      lanesDestroyRef.current?.complete();
      lanesDestroyRef.current = null;
      timelineRef.current = null;
      textLabelsRef.current = new Map();
      visualizationLaneIdsRef.current = [];
      segmentationTracksRef.current = new Map();
      markerMediaStartTimeRef.current = undefined;
      builtForMediaIdRef.current = undefined;
      playerRef.current?.destroy();
      playerRef.current = null;
      mainMediaRef.current = null;
    };
  }, [type, id, loadMedia]);

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
