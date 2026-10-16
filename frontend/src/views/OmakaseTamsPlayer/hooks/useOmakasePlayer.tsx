import { useCallback, useEffect, useRef } from "react";
import {
  ChromingTheme,
  DefaultThemeFloatingControl,
  MainMediaEventType,
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
  calculateTimerangeFromMainMedia,
  createAuthenticationConfig,
  snapshotSegmentationTracks,
} from "../utils";
import { filter, Subject, type Subscription } from "rxjs";
import type {
  OmakasePlayerApi,
  MarkerTrack,
  MarkerTrackLane,
  Marker,
  TamsMainMediaLoadOptions,
  TimelineApi,
  TextLabel,
  ThumbnailTrack,
} from "@byomakase/omakase-player";
import type { Flow } from "@/types/tams";

type UseOmakasePlayerParams = {
  type: string | undefined;
  id: string | undefined;
  accessToken: string | undefined;
  mode: Mode;
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
  /**
   * The thumbnail track the lanes were just built with. Every load registers a new one, and the
   * marker list resolves its thumbnail track once, at creation, so it has to be rebuilt for it.
   */
  onThumbnailTrackChange?: (track: ThumbnailTrack | undefined) => void;
  onMediaStartTimeCalculated?: (mediaStartTime: number) => void;
  onFlowsCalculated?: (flows: Flow[]) => void;
};

export const useOmakasePlayer = ({
  type,
  id,
  accessToken,
  mode,
  onError,
  onTimerangeChange,
  onSegmentationLaneCreated,
  onMarkerClick,
  onMarkersDiscarded,
  onPlayerReady,
  onThumbnailTrackChange,
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
  // Held for the same reason: by the time the next build runs, the load has detached these tracks
  // from their lanes. See `removeVisualizationLanes`.
  const segmentTracksRef = useRef<MarkerTrack[]>([]);
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
  // Live playback keeps growing the loaded media after load; see `subscribeToLiveUpdates`.
  const refreshSegmentLanesRef = useRef<(() => void) | undefined>(undefined);
  const liveUpdatesRef = useRef<Subscription | undefined>(undefined);

  const callbacks = {
    onError,
    onTimerangeChange,
    onSegmentationLaneCreated,
    onMarkerClick,
    onMarkersDiscarded,
    onPlayerReady,
    onThumbnailTrackChange,
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
    removeVisualizationLanes(
      timeline,
      visualizationLaneIdsRef.current,
      segmentTracksRef.current,
      player,
    );

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
    segmentTracksRef.current = built.segmentTracks;
    refreshSegmentLanesRef.current = built.refreshSegmentLanes;
    callbacksRef.current.onThumbnailTrackChange?.(built.thumbnailTrack);
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

  /**
   * Follows a live media as it grows. The player polls the store and, after every rewrite of the
   * playlists, appends the new segments to `tamsMediaData.flowsSegments` in place and emits
   * `MAIN_MEDIA_UPDATED` with a refreshed `tamsMetadata.timerange`. The segment lanes and the time
   * range selector were both built from the load-time values, so both are refreshed from here.
   * A VOD media never updates after load, so it gets no subscription.
   */
  const subscribeToLiveUpdates = useCallback((mainMedia: TamsMainMedia) => {
    liveUpdatesRef.current?.unsubscribe();
    liveUpdatesRef.current = undefined;
    // `TamsPlaybackMode` is not exported, hence the string comparison.
    if (String(mainMedia.tamsMetadata?.playbackMode) === "VOD") return;

    liveUpdatesRef.current = mainMedia.onEvent$
      .pipe(
        filter((event) => event.type === MainMediaEventType.MAIN_MEDIA_UPDATED),
      )
      .subscribe(() => {
        refreshSegmentLanesRef.current?.();
        const timerangeData = calculateTimerangeFromMainMedia(mainMedia);
        if (timerangeData) {
          callbacksRef.current.onTimerangeChange(
            timerangeData.timerange,
            timerangeData.maxTimerange,
          );
        }
      });
  }, []);

  const loadMedia = useCallback(
    (tamsUrl: string, options: TamsMainMediaLoadOptions) => {
      const player = playerRef.current;
      if (!player) return;

      // The outgoing media's live updates must not reach the lanes built for the incoming one.
      liveUpdatesRef.current?.unsubscribe();
      liveUpdatesRef.current = undefined;

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
            subscribeToLiveUpdates(mainMedia);

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
    [subscribeToLiveUpdates],
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
    // It also selects `TamsPlaybackMode.CONTINUOUS`: an INGESTING flow plays as a sliding live
    // window of this length, and anything else is downgraded to VOD. Live growth is followed by
    // `subscribeToLiveUpdates`.
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
      segmentTracksRef.current = [];
      segmentationTracksRef.current = new Map();
      markerMediaStartTimeRef.current = undefined;
      builtForMediaIdRef.current = undefined;
      liveUpdatesRef.current?.unsubscribe();
      liveUpdatesRef.current = undefined;
      refreshSegmentLanesRef.current = undefined;
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
