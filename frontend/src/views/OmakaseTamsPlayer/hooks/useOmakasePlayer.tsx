import { useEffect, useRef } from "react";
import {
  OmakaseTamsPlayer as TamsPlayer,
  TamsVideo,
} from "@byomakase/omakase-tams-player";
import { Mode } from "@cloudscape-design/global-styles";
import { AWS_TAMS_ENDPOINT } from "@/constants";
import {
  createTimelineWithLanes,
  calculateTimerangeFromVideo,
  createAuthenticationConfig,
} from "@/views/OmakaseTamsPlayer/utils";
import type { OmakasePlayerApi, MarkerLane } from "@byomakase/omakase-player";
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
  onPlayerReady,
  onMediaStartTimeCalculated,
  onFlowsCalculated,
}: UseOmakasePlayerParams) => {
  const playerRef = useRef<TamsPlayer | null>(null);
  const videoDataRef = useRef<TamsVideo | Video | null>(null);

  // Main effect: Create player and load video
  useEffect(() => {
    if (!accessToken) return;

    // Verify DOM element exists
    const videoContainer = document.getElementById("omakase-video-container");
    if (!videoContainer) {
      console.error("Video container element not found");
      return;
    }

    // Construct TAMS URL
    const tamsUrl = `${AWS_TAMS_ENDPOINT}/${type}/${id}`;

    // Create player instance
    const player = new TamsPlayer({
      playerHTMLElementId: "omakase-video-container",
    });

    playerRef.current = player;

    // Set TAMS endpoint
    player.setTamsEndpoint(AWS_TAMS_ENDPOINT);

    // Configure authentication
    player.setAuthentication(createAuthenticationConfig(accessToken || ""));

    // Load video from TAMS URL - always load last 300 seconds initially
    const loadOptions = {
      returnTamsMediaData: true,
      duration: 300,
    };

    player.loadVideo(tamsUrl, loadOptions).subscribe({
      next: (video) => {
        videoDataRef.current = video;

        // Calculate timerange from video data
        const timerangeData = calculateTimerangeFromVideo(video);
        if (timerangeData) {
          onTimerangeChange(
            timerangeData.timerange,
            timerangeData.maxTimerange,
          );
        }

        // Store media start time
        if ("mediaStartTime" in video && video.mediaStartTime !== undefined) {
          if (onMediaStartTimeCalculated) {
            onMediaStartTimeCalculated(video.mediaStartTime);
          }
        }

        // Extract flows for export
        if ("tamsMediaData" in video && video.tamsMediaData?.subflows) {
          if (onFlowsCalculated) {
            onFlowsCalculated(video.tamsMediaData.subflows);
          }
        }

        createTimelineWithLanes(video, player, mode, onSegmentationLaneCreated);

        if (onPlayerReady) {
          onPlayerReady(player);
        }
      },
      error: (err) => {
        console.error("Error loading TAMS video:", err);
        onError(err.message || "Failed to load video");
      },
    });

    // Cleanup
    return () => {
      console.log("Revoking all blobs");
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      videoDataRef.current = null;
    };
    // mode is intentionally omitted - handled in separate effect to avoid full player reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    type,
    id,
    accessToken,
    onError,
    onTimerangeChange,
    onSegmentationLaneCreated,
    onPlayerReady,
    onMediaStartTimeCalculated,
    onFlowsCalculated,
  ]);

  // Separate effect: Update timeline theme when mode changes
  useEffect(() => {
    if (
      playerRef.current &&
      videoDataRef.current &&
      playerRef.current.timeline
    ) {
      // Destroy old timeline
      playerRef.current.timeline.destroy();

      // Recreate timeline with new theme
      // Pass callback to update lane reference (not add a new lane)
      createTimelineWithLanes(
        videoDataRef.current,
        playerRef.current,
        mode,
        onSegmentationLaneCreated,
      );
    }
  }, [mode, onSegmentationLaneCreated]);

  return playerRef;
};
