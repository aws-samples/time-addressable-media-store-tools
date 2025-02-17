import { AWS_HLS_ENDPOINT } from "@/constants";
import { OmakasePlayer } from "@byomakase/omakase-player";
import { useEffect } from "react";
import { useParams } from "react-router-dom";

export const HlsPlayer = () => {
  const { type, id } = useParams();
  const url = `${AWS_HLS_ENDPOINT}/hls/${type}/${id}/output.m3u8`;

  useEffect(() => {
    let omakasePlayer = new OmakasePlayer({
      playerHTMLElementId: "omakase-player",
      mediaChrome: "enabled",
    });
    omakasePlayer.loadVideo(url, 24);
  });

  return <div id="omakase-player"></div>;
};

export default HlsPlayer;
