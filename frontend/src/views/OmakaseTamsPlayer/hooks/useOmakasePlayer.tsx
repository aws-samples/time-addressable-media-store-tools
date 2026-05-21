import { useCallback, useEffect, useRef } from "react";
import {
  OmakaseTamsPlayer as TamsPlayer,
  TamsVideo,
  TamsVideoLoadOptions,
} from "@byomakase/omakase-tams-player";
import { Mode } from "@cloudscape-design/global-styles";
import { AWS_TAMS_ENDPOINT } from "@/constants";
import {
  buildLanesOnTimeline,
  updateTimelineStyles,
  removeVisualizationLanes,
  calculateTimerangeFromVideo,
  createAuthenticationConfig,
} from "../utils";
import { Subject } from "rxjs";
import type {
  OmakasePlayerApi,
  MarkerLane,
  Marker,
  TimelineApi,
  TextLabel,
} from "@byomakase/omakase-player";
import type { Video } from "@byomakase/omakase-player/dist/video/model";
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
  onSegmentationLaneCreated?: (lane: MarkerLane) => void;
  onMarkerClick?: (marker: Marker) => void;
  onPlayerReady?: (player: OmakasePlayerApi) => void;
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
  onPlayerReady,
  onMediaStartTimeCalculated,
  onFlowsCalculated,
}: UseOmakasePlayerParams) => {
  const playerRef = useRef<TamsPlayer | null>(null);
  const videoDataRef = useRef<TamsVideo | Video | null>(null);
  const timelineRef = useRef<TimelineApi | null>(null);
  const textLabelsRef = useRef<Map<string, TextLabel>>(new Map());
  const lanesDestroyRef = useRef<Subject<void> | null>(null);

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
      const video = videoDataRef.current;
      if (!player || !video) return;

      timelineRef.current = timeline;

      const destroy$ = swapLanesDestroy();
      removeVisualizationLanes(timeline);

      const labels = buildLanesOnTimeline({
        timeline,
        video,
        player,
        mode: modeRef.current,
        destroy$,
        onSegmentationLaneCreated: callbacksRef.current.onSegmentationLaneCreated,
        onMarkerClick: callbacksRef.current.onMarkerClick,
      });
      textLabelsRef.current = labels;
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

  const loadVideo = useCallback(
    (tamsUrl: string, options: TamsVideoLoadOptions) => {
      const player = playerRef.current;
      if (!player) return;

      player.loadVideo(tamsUrl, options).subscribe({
        next: (video) => {
          videoDataRef.current = video;
          const cb = callbacksRef.current;

          const timerangeData = calculateTimerangeFromVideo(video);
          if (timerangeData) {
            cb.onTimerangeChange(
              timerangeData.timerange,
              timerangeData.maxTimerange,
            );
          }

          if ("mediaStartTime" in video && video.mediaStartTime !== undefined) {
            cb.onMediaStartTimeCalculated?.(video.mediaStartTime);
          }

          if ("tamsMediaData" in video && video.tamsMediaData?.subflows) {
            cb.onFlowsCalculated?.(video.tamsMediaData.subflows);
          }

          cb.onPlayerReady?.(player);
        },
        error: (err) => {
          console.error("Error loading TAMS video:", err);
          callbacksRef.current.onError(err.message || "Failed to load video");
        },
      });
    },
    [],
  );

  useEffect(() => {
    if (!accessTokenRef.current || !type || !id) return;

    const player = new TamsPlayer({
      playerHTMLElementId: "omakase-video-container",
    });
    playerRef.current = player;

    player.setTamsEndpoint(AWS_TAMS_ENDPOINT);
    player.setAuthentication(createAuthenticationConfig(accessTokenRef.current));

    const tamsUrl = `${AWS_TAMS_ENDPOINT}/${type}/${id}`;
    loadVideo(tamsUrl, {
      returnTamsMediaData: true,
      duration: 300,
    });

    return () => {
      lanesDestroyRef.current?.next();
      lanesDestroyRef.current?.complete();
      lanesDestroyRef.current = null;
      timelineRef.current = null;
      textLabelsRef.current = new Map();
      playerRef.current?.destroy();
      playerRef.current = null;
      videoDataRef.current = null;
    };
  }, [type, id, loadVideo]);

  useEffect(() => {
    if (!accessToken || !playerRef.current) return;
    playerRef.current.setAuthentication(createAuthenticationConfig(accessToken));
  }, [accessToken]);

  // Theme changes update styles in-place rather than destroying/recreating the
  // timeline, which preserves segmentation lane state and marker selections.
  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    updateTimelineStyles(timeline, mode, textLabelsRef.current);
  }, [mode]);

  const reloadWithTimerange = useCallback(
    (timerange: string) => {
      if (!type || !id) return;
      const tamsUrl = `${AWS_TAMS_ENDPOINT}/${type}/${id}`;
      loadVideo(tamsUrl, {
        returnTamsMediaData: true,
        timerange,
      });
    },
    [type, id, loadVideo],
  );

  return { playerRef, reloadWithTimerange, handleTimelineCreated };
};