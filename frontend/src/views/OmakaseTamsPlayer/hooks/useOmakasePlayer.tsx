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
} from "@/views/OmakaseTamsPlayer/utils";
import type {
  OmakasePlayerApi,
  MarkerLane,
  Marker,
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
  useEffect(() => {
    callbacksRef.current = callbacks;
    modeRef.current = mode;
  });

  const loadAndBuildTimeline = useCallback(
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

          player.timeline?.destroy();
          createTimelineWithLanes(
            video,
            player,
            modeRef.current,
            cb.onSegmentationLaneCreated,
            cb.onMarkerClick,
          );

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
    if (!accessToken || !type || !id) return;

    const player = new TamsPlayer({
      playerHTMLElementId: "omakase-video-container",
    });
    playerRef.current = player;

    player.setTamsEndpoint(AWS_TAMS_ENDPOINT);
    player.setAuthentication(createAuthenticationConfig(accessToken));

    const tamsUrl = `${AWS_TAMS_ENDPOINT}/${type}/${id}`;
    loadAndBuildTimeline(tamsUrl, {
      returnTamsMediaData: true,
      duration: 300,
    });

    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
      videoDataRef.current = null;
    };
  }, [type, id, accessToken, loadAndBuildTimeline]);

  useEffect(() => {
    const player = playerRef.current;
    const video = videoDataRef.current;
    if (!player || !video) return;

    player.timeline?.destroy();
    createTimelineWithLanes(
      video,
      player,
      mode,
      callbacksRef.current.onSegmentationLaneCreated,
      callbacksRef.current.onMarkerClick,
    );
  }, [mode]);

  const reloadWithTimerange = useCallback(
    (timerange: string) => {
      if (!type || !id) return;
      const tamsUrl = `${AWS_TAMS_ENDPOINT}/${type}/${id}`;
      loadAndBuildTimeline(tamsUrl, {
        returnTamsMediaData: true,
        timerange,
      });
    },
    [type, id, loadAndBuildTimeline],
  );

  return { playerRef, reloadWithTimerange };
};
