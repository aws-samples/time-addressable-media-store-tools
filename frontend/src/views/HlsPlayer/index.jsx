import { AWS_HLS_API_ENDPOINT } from "@/constants";
import { Box } from "@cloudscape-design/components";
import VideoJS from "./components/VideoJS";
import { useParams } from "react-router-dom";
import { useRef } from "react";

export const HlsPlayer = () => {
  const { type, id } = useParams();
  const url = `${AWS_HLS_API_ENDPOINT}/${type}/${id}/manifest.m3u8`;

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
      <VideoJS options={videoJsOptions} onReady={playerReady} />
    </Box>
  );
};

export default HlsPlayer;
