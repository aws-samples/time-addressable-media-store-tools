import { useRef, useMemo, useCallback, useState } from "react";
import { Box, Alert } from "@cloudscape-design/components";
import VideoJS from "./components/VideoJS";
import { useParams } from "react-router-dom";
import { useLambdaPresignedUrl } from "@/hooks/useLambdaPresignedUrl";
import type videojs from "video.js";
import type { Uuid } from "@/types/tams";

export const HlsPlayer = () => {
  const { type, id } = useParams<{ type: string; id: Uuid }>();
  const { url, isLoading } = useLambdaPresignedUrl(type!, id!);
  const playerRef = useRef<ReturnType<typeof videojs> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoJsOptions: Parameters<typeof videojs>[1] = useMemo(
    () => ({
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
    }),
    [url],
  );

  const playerReady = useCallback((player: ReturnType<typeof videojs>) => {
    playerRef.current = player;
    player.on("error", () => {
      const err = player.error();
      if (err) {
        setError(err.message || `Playback error (code ${err.code})`);
      }
    });
  }, []);

  if (!type || !id) return null;

  return (
    <Box textAlign="center">
      {error && (
        <Alert type="error" header="Playback error">
          {error}
        </Alert>
      )}
      {!isLoading && !error && (
        <VideoJS options={videoJsOptions} onReady={playerReady} />
      )}
    </Box>
  );
};

export default HlsPlayer;
