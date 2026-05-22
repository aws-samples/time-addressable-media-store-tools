import { useEffect } from "react";
import type { OmakasePlayerApi } from "@byomakase/omakase-player";

type HotkeyBinding = {
  code: string;
  modifiers?: {
    shift?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    alt?: boolean;
  };
  requiresVideo?: boolean;
  action: (player: OmakasePlayerApi, event: KeyboardEvent) => void;
};

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 2, 4, 8];
const IGNORED_TAGS = ["INPUT", "TEXTAREA", "OMAKASE-MARKER-LIST"];

const HOTKEYS: HotkeyBinding[] = [
  {
    code: "Space",
    modifiers: { ctrl: false, meta: false },
    action: (p) => p.video.togglePlayPause(),
  },
  {
    code: "KeyS",
    modifiers: { shift: false, ctrl: false, meta: false },
    action: (p) => p.audio.toggleAudioOutputMuteUnmute(),
  },
  {
    code: "Backslash",
    action: (p, e) => {
      const delta = e.shiftKey ? 1 : -1;
      const vol = Math.min(
        100,
        Math.max(0, p.audio.getAudioOutputVolume() * 100 + 10 * delta),
      );
      p.audio.setAudioOutputVolume(vol / 100);
    },
  },
  {
    code: "KeyD",
    action: (p, e) => {
      if (!(e.ctrlKey && e.shiftKey && e.metaKey)) {
        p.subtitles.toggleShowHideActiveTrack();
      }
    },
  },
  {
    code: "KeyK",
    modifiers: { shift: false, ctrl: false, meta: false },
    action: (p) => {
      p.video.setPlaybackRate(1);
      p.video.pause();
    },
  },
  {
    code: "KeyL",
    modifiers: { ctrl: false, meta: false },
    action: (p, e) => {
      const currentIdx = PLAYBACK_RATES.indexOf(p.video.getPlaybackRate());
      const nextIdx = currentIdx + (e.shiftKey ? 1 : -1);
      const rate =
        PLAYBACK_RATES[
          Math.min(Math.max(0, nextIdx), PLAYBACK_RATES.length - 1)
        ];
      p.video.setPlaybackRate(rate);
      if (p.video.isPaused()) p.video.play();
    },
  },
  {
    code: "KeyF",
    modifiers: { shift: false, ctrl: false, meta: false },
    action: (p) => p.video.toggleFullscreen(),
  },
  {
    code: "ArrowRight",
    modifiers: { meta: false, alt: false },
    requiresVideo: true,
    action: (p, e) => {
      const frames = e.shiftKey ? 10 : 1;
      if (p.video.isPlaying()) p.video.pause();
      p.video.seekFromCurrentFrame(frames);
    },
  },
  {
    code: "ArrowLeft",
    modifiers: { meta: false, alt: false },
    requiresVideo: true,
    action: (p, e) => {
      const frames = e.shiftKey ? 10 : 1;
      if (p.video.isPlaying()) p.video.pause();
      p.video.seekFromCurrentFrame(-frames);
    },
  },
  {
    code: "Digit1",
    modifiers: { ctrl: false, meta: false, shift: false, alt: false },
    requiresVideo: true,
    action: (p) => p.video.pause().subscribe(() => p.video.seekToFrame(0)),
  },
  {
    code: "Home",
    requiresVideo: true,
    action: (p) => p.video.pause().subscribe(() => p.video.seekToFrame(0)),
  },
  {
    code: "Digit1",
    modifiers: { ctrl: true },
    requiresVideo: true,
    action: (p) => {
      if (p.video.isPlaying()) {
        p.video.pause().subscribe(() => p.video.seekToEnd());
      } else {
        p.video.seekToEnd();
      }
    },
  },
  {
    code: "End",
    requiresVideo: true,
    action: (p) => {
      if (p.video.isPlaying()) {
        p.video.pause().subscribe(() => p.video.seekToEnd());
      } else {
        p.video.seekToEnd();
      }
    },
  },
];

const modifiersMatch = (
  e: KeyboardEvent,
  modifiers?: HotkeyBinding["modifiers"],
): boolean => {
  if (!modifiers) return true;
  if (modifiers.shift !== undefined && e.shiftKey !== modifiers.shift)
    return false;
  if (modifiers.ctrl !== undefined && e.ctrlKey !== modifiers.ctrl)
    return false;
  if (modifiers.meta !== undefined && e.metaKey !== modifiers.meta)
    return false;
  if (modifiers.alt !== undefined && e.altKey !== modifiers.alt) return false;
  return true;
};

export const usePlayerHotkeys = (player: OmakasePlayerApi | undefined) => {
  useEffect(() => {
    if (!player) return;

    const handler = (e: KeyboardEvent) => {
      if (
        IGNORED_TAGS.includes((e.target as HTMLElement).tagName.toUpperCase())
      )
        return;

      const binding = HOTKEYS.find(
        (h) =>
          h.code === e.code &&
          modifiersMatch(e, h.modifiers) &&
          (!h.requiresVideo || player.video.isVideoLoaded()),
      );

      if (binding) {
        binding.action(player, e);
        e.stopPropagation();
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [player]);
};
