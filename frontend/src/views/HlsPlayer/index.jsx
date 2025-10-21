import { useRef } from "react";
import { Box } from "@cloudscape-design/components";
import VideoJS from "./components/VideoJS";
import { useParams } from "react-router-dom";
import { usePresignedUrl } from "@/hooks/usePresignedUrl";

export const HlsPlayer = () => {
  const { type, id } = useParams();
  const { url, isLoading } = usePresignedUrl(type, id);
  const playerRef = useRef(null);

  const videoJsOptions = {
    liveui: true,
    liveTracker: true,
    autoplay: true,
    controls: true,
    responsive: true,
    fluid: true,
    sources: [
      {
        src: url,
        type: "application/x-mpegURL",
      },
    ],
  };

  const playerReady = (player) => {
    playerRef.current = player;
    player.on("waiting", () => {
      console.log("player is waiting");
    });
    player.on("dispose", () => {
      console.log("player will dispose");
    });
  };

  return (
    <Box textAlign="center">
      {!isLoading && <VideoJS options={videoJsOptions} onReady={playerReady} />}
    </Box>
  );
};

export default HlsPlayer;
