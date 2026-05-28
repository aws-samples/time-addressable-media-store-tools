/* eslint-disable @typescript-eslint/no-explicit-any */
import videojs from "video.js";
import Hls from "hls.js";

class HlsjsSourceHandler {
  private hls: Hls;
  private tech: any;
  private player: any;
  private el: HTMLMediaElement;

  constructor(source: { src: string }, tech: any) {
    this.tech = tech;
    this.player = videojs.getPlayer(tech.options().playerId);
    this.el = tech.el();
    this.hls = new Hls({ liveDurationInfinity: true });
    tech.hlsjs = this.hls;

    this.hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      const codeMap: Record<string, number> = {
        [Hls.ErrorTypes.NETWORK_ERROR]: 2,
        [Hls.ErrorTypes.MEDIA_ERROR]: 3,
      };
      tech.error({ code: codeMap[data.type] || 0, message: data.details });
    });

    this.hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      const hlsTracks = this.hls.audioTracks;
      const playerTracks = tech.audioTracks();
      if (hlsTracks.length <= 1) return;

      hlsTracks.forEach((t, i) => {
        playerTracks.addTrack(
          new videojs.AudioTrack({
            id: String(i),
            kind: "alternative" as const,
            label: t.name || t.lang || `Audio ${i + 1}`,
            language: t.lang || "",
            enabled: i === this.hls.audioTrack,
          }),
        );
      });

      playerTracks.addEventListener("change", () => {
        for (let j = 0; j < playerTracks.length; j++) {
          const track = playerTracks[j];
          if (track.enabled && track.label !== "SoundHandler") {
            const newTrackId = Number(track.id);
            if (this.hls.audioTrack !== newTrackId) {
              this.hls.audioTrack = newTrackId;
              this.enableSourceBufferAudio();
            }
            break;
          }
        }
      });
    });

    this.hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
      this.hls.subtitleTracks.forEach((sub) => {
        this.player.addRemoteTextTrack(
          {
            kind: "subtitles",
            label: sub.name || sub.lang || "Subtitles",
            srclang: sub.lang || "",
            default: sub.default,
          },
          false,
        );
      });
    });

    this.player.textTracks().addEventListener("change", () => {
      const tracks = this.player.textTracks();
      let activeIndex = -1;
      for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].mode === "showing" && tracks[i].kind === "subtitles") {
          activeIndex = i;
        }
      }
      this.hls.subtitleTrack = activeIndex;
    });

    this.hls.attachMedia(this.el);
    this.hls.loadSource(source.src);

    this.player.addClass("vjs-waiting");
    this.el.addEventListener(
      "playing",
      () => {
        this.player.removeClass("vjs-waiting");
      },
      { once: true },
    );
  }

  private enableSourceBufferAudio() {
    const ms = (this.hls as any).bufferController?.mediaSource;
    if (!ms) return;
    for (let i = 0; i < ms.sourceBuffers.length; i++) {
      const audioTracks = ms.sourceBuffers[i].audioTracks;
      if (audioTracks) {
        for (let j = 0; j < audioTracks.length; j++) {
          audioTracks[j].enabled = true;
        }
      }
    }
  }

  dispose() {
    this.hls.destroy();
    delete this.tech.hlsjs;
  }
}

if (Hls.isSupported()) {
  const Html5 = videojs.getTech("Html5") as any;
  Html5.registerSourceHandler(
    {
      canHandleSource(source: { type?: string; src?: string }) {
        const hlsTypeRE = /^application\/(x-mpegURL|vnd\.apple\.mpegURL)$/i;
        const hlsExtRE = /\.m3u8/i;
        if (source.type && hlsTypeRE.test(source.type)) return "probably";
        if (source.src && hlsExtRE.test(source.src)) return "maybe";
        return "";
      },
      handleSource(source: { src: string }, tech: any) {
        if (tech.hlsProvider) tech.hlsProvider.dispose();
        tech.hlsProvider = new HlsjsSourceHandler(source, tech);
        return tech.hlsProvider;
      },
      canPlayType(type: string) {
        return /^application\/(x-mpegURL|vnd\.apple\.mpegURL)$/i.test(type)
          ? "probably"
          : "";
      },
    },
    0,
  );
}

export default HlsjsSourceHandler;
