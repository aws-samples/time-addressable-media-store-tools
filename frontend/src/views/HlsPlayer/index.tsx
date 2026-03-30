import { useRef, useMemo, useCallback } from "react";
import { Box } from "@cloudscape-design/components";
import VideoJS from "./components/VideoJS";
import { useParams } from "react-router-dom";
import { useLambdaPresignedUrl } from "@/hooks/useLambdaPresignedUrl";
import type { Uuid } from "@/types/tams";

export const HlsPlayer = () => {
  const { type, id } = useParams<{ type: string, id: Uuid }>();
  if (!type || !id) return null;
  const { url, isLoading } = useLambdaPresignedUrl(type, id);
  const playerRef = useRef<videojs.VideoJsPlayer | null>(null);

  const videoJsOptions: videojs.VideoJsPlayerOptions = useMemo(() => ({
    liveui: true,
    autoplay: true,
    controls: true,
    responsive: true,
    fluid: true,
    html5: {
      vhs: {
        overrideNative: true,
      },
    },
    sources: [
      {
        src: url!,
        type: "application/x-mpegURL",
      },
    ],
  }), [url]);

  const playerReady = useCallback((player: videojs.VideoJsPlayer) => {
    playerRef.current = player;
  }, []);

  return (
    <Box textAlign="center">
      {!isLoading && <VideoJS options={videoJsOptions} onReady={playerReady} />}
    </Box>
  );
};

export default HlsPlayer;
