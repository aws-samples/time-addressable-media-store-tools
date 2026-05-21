import { useCallback, useEffect, useRef } from "react";
import {
  OmakaseTamsPlayer as TamsPlayer,
  TamsVideo,
  TamsVideoLoadOptions,
} from "@byomakase/omakase-tams-player";
import { Mode } from "@cloudscape-design/global-styles";
import { AWS_TAMS_ENDPOINT } from "@/constants";
import {
  createTimelineWithLanes,
  calculateTimerangeFromVideo,
  createAuthenticationConfig,
  snapshotSegmentationLanes,
} from "../utils";
import { Subject } from "rxjs";
import type {
  OmakasePlayerApi,
  MarkerLane,
  Marker,
} from "@byomakase/omakase-player";
import type { Video } from "@byomakase/omakase-player/dist/video/model";
import type { Flow } from "@/types/tams";
import type { SegmentationLaneSnapshot } from "../types";

type UseOmakasePlayerParams = {
  type: string | undefined;
  id: string | undefined;
  accessToken: string | undefined;
  mode: Mode;
  segmentationLanes: MarkerLane[];
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
  segmentationLanes,
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
  const timelineDestroyRef = useRef<Subject<void> | null>(null);
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
  const segmentationLanesRef = useRef(segmentationLanes);
  const accessTokenRef = useRef(accessToken);
  useEffect(() => {
    callbacksRef.current = callbacks;
    modeRef.current = mode;
    segmentationLanesRef.current = segmentationLanes;
    accessTokenRef.current = accessToken;
  });

  const swapTimelineDestroy = useCallback(() => {
    timelineDestroyRef.current?.next();
    timelineDestroyRef.current?.complete();
    const next$ = new Subject<void>();
    timelineDestroyRef.current = next$;
    return next$;
  }, []);

  const loadAndBuildTimeline = useCallback(
    (tamsUrl: string, options: TamsVideoLoadOptions, segmentationSnapshot?: SegmentationLaneSnapshot[]) => {
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

          player.timeline?.destroy();
          const destroy$ = swapTimelineDestroy();
          createTimelineWithLanes({
            video,
            player,
            mode: modeRef.current,
            destroy$,
            onSegmentationLaneCreated: cb.onSegmentationLaneCreated,
            onMarkerClick: cb.onMarkerClick,
            segmentationSnapshot,
          });

          cb.onPlayerReady?.(player);
        },
        error: (err) => {
          console.error("Error loading TAMS video:", err);
          callbacksRef.current.onError(err.message || "Failed to load video");
        },
      });
    },
    [swapTimelineDestroy],
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
    loadAndBuildTimeline(tamsUrl, {
      returnTamsMediaData: true,
      duration: 300,
    });

    return () => {
      timelineDestroyRef.current?.next();
      timelineDestroyRef.current?.complete();
      timelineDestroyRef.current = null;
      playerRef.current?.destroy();
      playerRef.current = null;
      videoDataRef.current = null;
    };
  }, [type, id, loadAndBuildTimeline]);

  useEffect(() => {
    if (!accessToken || !playerRef.current) return;
    playerRef.current.setAuthentication(createAuthenticationConfig(accessToken));
  }, [accessToken]);

  useEffect(() => {
    const player = playerRef.current;
    const video = videoDataRef.current;
    if (!player || !video) return;

    const snapshot = snapshotSegmentationLanes(segmentationLanesRef.current);

    player.timeline?.destroy();
    const destroy$ = swapTimelineDestroy();
    createTimelineWithLanes({
      video,
      player,
      mode,
      destroy$,
      onSegmentationLaneCreated: callbacksRef.current.onSegmentationLaneCreated,
      onMarkerClick: callbacksRef.current.onMarkerClick,
      segmentationSnapshot: snapshot,
    });
  }, [mode, swapTimelineDestroy]);

  const reloadWithTimerange = useCallback(
    (timerange: string) => {
      if (!type || !id) return;
      const snapshot = snapshotSegmentationLanes(segmentationLanesRef.current);
      const tamsUrl = `${AWS_TAMS_ENDPOINT}/${type}/${id}`;
      loadAndBuildTimeline(tamsUrl, {
        returnTamsMediaData: true,
        timerange,
      }, snapshot);
    },
    [type, id, loadAndBuildTimeline],
  );

  return { playerRef, reloadWithTimerange };
};
