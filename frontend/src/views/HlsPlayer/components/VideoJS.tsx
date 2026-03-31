import { useEffect, useRef } from "react";
import videojs from "video.js";

type Props = {
  options: videojs.VideoJsPlayerOptions;
  onReady?: (player: videojs.VideoJsPlayer) => void;
};

const VideoJS = ({ options, onReady }: Props) => {
  const videoRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<videojs.VideoJsPlayer | null>(null);

  useEffect(() => {
    // Make sure Video.js player is only initialized once
    if (!playerRef.current) {
      // The Video.js player needs to be _inside_ the component el for React 18 Strict Mode.
      const videoElement = document.createElement("video-js");
      videoElement.classList.add("vjs-big-play-centered");
      videoRef.current?.appendChild(videoElement);
      const player = (playerRef.current = videojs(videoElement, options, () => {
        onReady && onReady(player);
      }));
    } else {
      const player = playerRef.current;
      if (options.autoplay !== undefined) {
        player.autoplay(options.autoplay);
      }
      if (options.sources) {
        player.src(options.sources);
      }
    }

    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [options]);

  // wrap player with data-vjs-player` attribute so no additional wrapper are created in the DOM
  return (
    <div data-vjs-player>
      <div ref={videoRef} />
    </div>
  );
};

export default VideoJS;
