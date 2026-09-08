import { useEffect } from "react";
import type { OmakasePlayerApi } from "@byomakase/omakase-player";
import { MediaTemporalFormat } from "@byomakase/omakase-player";

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

// omakase-player 1.x has no `isPlaying()`/`isPaused()`/`getPlaybackRate()` accessors — the
// playback state is read off the session snapshot instead.
const playback = (p: OmakasePlayerApi) => p.player.playerSession.playback;

const seekToFrame = (p: OmakasePlayerApi, frame: number) =>
  p.player.seekTo(frame, MediaTemporalFormat.FRAME_COUNT);

// Replaces 0.25.4's `seekToEnd()`, which 1.x dropped.
const seekToEnd = (p: OmakasePlayerApi) =>
  p.player.seekTo(100, MediaTemporalFormat.PERCENT);

const HOTKEYS: HotkeyBinding[] = [
  {
    code: "Space",
    modifiers: { ctrl: false, meta: false },
    action: (p) =>
      playback(p).playing ? p.player.pause() : p.player.play(),
  },
  {
    code: "KeyS",
    modifiers: { shift: false, ctrl: false, meta: false },
    action: (p) => p.player.audio.toggleMuted(),
  },
  {
    code: "Backslash",
    action: (p, e) => {
      const delta = e.shiftKey ? 1 : -1;
      const vol = Math.min(
        100,
        Math.max(0, p.player.audio.volume * 100 + 10 * delta),
      );
      p.player.audio.setVolume(vol / 100);
    },
  },
  {
    code: "KeyD",
    action: (p, e) => {
      if (!(e.ctrlKey && e.shiftKey && e.metaKey)) {
        p.player.text.toggleShowHide();
      }
    },
  },
  {
    code: "KeyK",
    modifiers: { shift: false, ctrl: false, meta: false },
    action: (p) => {
      p.player.setPlaybackRate(1);
      p.player.pause();
    },
  },
  {
    code: "KeyL",
    modifiers: { ctrl: false, meta: false },
    action: (p, e) => {
      const currentIdx = PLAYBACK_RATES.indexOf(playback(p).playbackRate);
      const nextIdx = currentIdx + (e.shiftKey ? 1 : -1);
      const rate =
        PLAYBACK_RATES[
          Math.min(Math.max(0, nextIdx), PLAYBACK_RATES.length - 1)
        ];
      p.player.setPlaybackRate(rate);
      if (playback(p).paused) p.player.play();
    },
  },
  {
    code: "KeyF",
    modifiers: { shift: false, ctrl: false, meta: false },
    action: (p) => p.player.toggleFullScreen(),
  },
  {
    code: "ArrowRight",
    modifiers: { meta: false, alt: false },
    requiresVideo: true,
    action: (p, e) => {
      const frames = e.shiftKey ? 10 : 1;
      if (playback(p).playing) p.player.pause();
      p.player.seekFromCurrentTime(frames, MediaTemporalFormat.FRAME_COUNT);
    },
  },
  {
    code: "ArrowLeft",
    modifiers: { meta: false, alt: false },
    requiresVideo: true,
    action: (p, e) => {
      const frames = e.shiftKey ? 10 : 1;
      if (playback(p).playing) p.player.pause();
      p.player.seekFromCurrentTime(-frames, MediaTemporalFormat.FRAME_COUNT);
    },
  },
  {
    code: "Digit1",
    modifiers: { ctrl: false, meta: false, shift: false, alt: false },
    requiresVideo: true,
    action: (p) => p.player.pause().subscribe(() => seekToFrame(p, 0)),
  },
  {
    code: "Home",
    requiresVideo: true,
    action: (p) => p.player.pause().subscribe(() => seekToFrame(p, 0)),
  },
  {
    code: "Digit1",
    modifiers: { ctrl: true },
    requiresVideo: true,
    action: (p) => {
      if (playback(p).playing) {
        p.player.pause().subscribe(() => seekToEnd(p));
      } else {
        seekToEnd(p);
      }
    },
  },
  {
    code: "End",
    requiresVideo: true,
    action: (p) => {
      if (playback(p).playing) {
        p.player.pause().subscribe(() => seekToEnd(p));
      } else {
        seekToEnd(p);
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
          (!h.requiresVideo || player.player.isMainMediaLoaded),
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
