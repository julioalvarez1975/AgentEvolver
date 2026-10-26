import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { MediaClock } from "@promedia/shared";
import { shouldCorrectSeek } from "./clock.js";

type YtPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: string | HTMLElement,
        opts: {
          videoId: string;
          host?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YtPlayer }) => void;
            onError?: (e: { data: number }) => void;
            onStateChange?: (e: { data: number }) => void;
          };
        },
      ) => YtPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** YT.PlayerState */
const YT_UNSTARTED = -1;
const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;
const YT_CUED = 5;

/** Brief delay so Control can tear down its Preview iframe before Output mounts. */
const OUTPUT_HANDOFF_MS = 180;
const PLAY_WATCHDOG_MS = 450;

let apiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("no_window"));
  }
  if (window.YT?.Player) {
    return Promise.resolve();
  }
  if (apiPromise) {
    return apiPromise;
  }
  apiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  });
  return apiPromise;
}

function readPlayerState(player: YtPlayer | null): number {
  if (!player) {
    return YT_UNSTARTED;
  }
  try {
    return player.getPlayerState();
  } catch {
    return YT_UNSTARTED;
  }
}

function isActivelyPlaying(state: number): boolean {
  return state === YT_PLAYING || state === YT_BUFFERING;
}

/** Map YouTube IFrame API onError codes to Spanish operator messages. */
export function youtubeErrorMessage(code: number): string {
  switch (code) {
    case 101:
    case 150:
      return "Este vídeo no permite embed (el dueño lo bloqueó en YouTube).";
    case 100:
      return "Vídeo no encontrado o privado en YouTube.";
    case 2:
      return "Parámetro de YouTube no válido (revisá la URL / videoId).";
    case 5:
      return "Error HTML5 al reproducir YouTube.";
    default:
      return `Error de YouTube (${code}). Si Control también embebe el mismo vídeo, puede ser conflicto de doble reproductor — la salida Output debe ser el único embed.`;
  }
}

export type YouTubePlayerHandle = {
  play: () => void;
  pause: () => void;
  seekToMs: (ms: number) => void;
  getCurrentTimeMs: () => number;
  getDurationMs: () => number;
  mute: () => void;
  unMute: () => void;
  isReady: () => boolean;
};

export type YouTubePlayerProps = {
  videoId: string;
  mediaClock?: MediaClock | null;
  /** Preview mode: ignore hub clock; local controls only */
  preview?: boolean;
  /**
   * When true (preview toolbar), hide native YT chrome — ProMedia owns transport.
   * Output / non-toolbar preview keep API defaults.
   */
  hideNativeControls?: boolean;
  loop?: boolean;
  muted?: boolean;
  className?: string;
  onBlocked?: () => void;
  onReadyChange?: (ready: boolean) => void;
  onPlayingChange?: (playing: boolean) => void;
};

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer(
    {
      videoId,
      mediaClock,
      preview = false,
      hideNativeControls = false,
      loop = false,
      muted = false,
      className,
      onBlocked,
      onReadyChange,
      onPlayingChange,
    },
    ref,
  ) {
    const reactId = useId().replace(/:/g, "");
    const elId = `yt-${reactId}`;
    const playerRef = useRef<YtPlayer | null>(null);
    const mediaClockRef = useRef(mediaClock);
    mediaClockRef.current = mediaClock;
    const mutedRef = useRef(muted);
    mutedRef.current = muted;
    const onBlockedRef = useRef(onBlocked);
    onBlockedRef.current = onBlocked;
    const failStreakRef = useRef(0);
    const softMutedRef = useRef(false);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    /** True when browser/YT blocked unmuted autoplay — need a click. */
    const [blocked, setBlocked] = useState(false);
    /** Soft-muted to get motion under autoplay policy; click restores audio. */
    const [softMuted, setSoftMuted] = useState(false);
    softMutedRef.current = softMuted;

    useImperativeHandle(
      ref,
      () => ({
        play: () => {
          try {
            playerRef.current?.playVideo();
          } catch {
            // ignore
          }
        },
        pause: () => {
          try {
            playerRef.current?.pauseVideo();
          } catch {
            // ignore
          }
        },
        seekToMs: (ms: number) => {
          try {
            playerRef.current?.seekTo(Math.max(0, ms) / 1000, true);
          } catch {
            // ignore
          }
        },
        getCurrentTimeMs: () => {
          try {
            return (playerRef.current?.getCurrentTime?.() ?? 0) * 1000;
          } catch {
            return 0;
          }
        },
        getDurationMs: () => {
          try {
            return (playerRef.current?.getDuration?.() ?? 0) * 1000;
          } catch {
            return 0;
          }
        },
        mute: () => {
          try {
            playerRef.current?.mute();
          } catch {
            // ignore
          }
        },
        unMute: () => {
          try {
            playerRef.current?.unMute();
          } catch {
            // ignore
          }
        },
        isReady: () => ready && Boolean(playerRef.current),
      }),
      [ready],
    );

    useEffect(() => {
      let cancelled = false;
      let handoffTimer: number | undefined;
      // Output waits briefly so Control Preview can destroy its iframe first
      // (same videoId dual-embed historically freezes / blocks the second player).
      const delayMs = preview ? 0 : OUTPUT_HANDOFF_MS;

      const mount = () => {
        void loadYouTubeApi().then(() => {
          if (cancelled || !window.YT?.Player) {
            return;
          }
          try {
            playerRef.current?.destroy();
          } catch {
            // ignore
          }
          playerRef.current = null;
          const origin =
            typeof window !== "undefined" ? window.location.origin : undefined;
          const nativeControls = preview && !hideNativeControls ? 1 : 0;
          playerRef.current = new window.YT.Player(elId, {
            videoId,
            host: "https://www.youtube-nocookie.com",
            playerVars: {
              controls: nativeControls,
              rel: 0,
              modestbranding: 1,
              playsinline: 1,
              enablejsapi: 1,
              ...(origin ? { origin } : {}),
              loop: loop ? 1 : 0,
              playlist: loop ? videoId : (undefined as unknown as string),
              // Hub mediaClock drives play; autoplay=1 alone is unreliable unmuted.
              autoplay: 0,
              mute: muted ? 1 : 0,
            },
            events: {
              onReady: (e) => {
                if (cancelled) {
                  return;
                }
                if (muted) {
                  e.target.mute();
                } else {
                  e.target.unMute();
                }
                setReady(true);
                onReadyChange?.(true);
              },
              onStateChange: (e) => {
                if (e.data === YT_PLAYING) {
                  onPlayingChange?.(true);
                  failStreakRef.current = 0;
                  if (!softMutedRef.current && !mutedRef.current) {
                    setBlocked(false);
                  }
                } else if (
                  e.data === YT_PAUSED ||
                  e.data === YT_ENDED ||
                  e.data === YT_CUED
                ) {
                  onPlayingChange?.(false);
                }
              },
              onError: (e) => {
                setError(youtubeErrorMessage(e.data));
              },
            },
          });
        });
      };

      if (delayMs > 0) {
        handoffTimer = window.setTimeout(mount, delayMs);
      } else {
        mount();
      }

      return () => {
        cancelled = true;
        if (handoffTimer != null) {
          window.clearTimeout(handoffTimer);
        }
        try {
          playerRef.current?.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
        setReady(false);
        setBlocked(false);
        setSoftMuted(false);
        failStreakRef.current = 0;
        onReadyChange?.(false);
      };
    }, [
      elId,
      videoId,
      loop,
      muted,
      preview,
      hideNativeControls,
      onReadyChange,
      onPlayingChange,
    ]);

    /**
     * Follow hub mediaClock: seek + play/pause.
     * playVideo() does not throw on autoplay block — watchdog verifies state and
     * falls back to muted motion + "Clic para audio" when needed.
     */
    useEffect(() => {
      if (preview || !ready || !mediaClock || !playerRef.current) {
        return;
      }

      const applyClock = () => {
        const player = playerRef.current;
        const clock = mediaClockRef.current;
        if (!player || !clock) {
          return;
        }
        try {
          const localMs = (player.getCurrentTime?.() ?? 0) * 1000;
          const { seek, targetMs } = shouldCorrectSeek(localMs, clock);
          if (seek) {
            player.seekTo(targetMs / 1000, true);
          }
          if (!clock.playing) {
            player.pauseVideo();
            setBlocked(false);
            setSoftMuted(false);
            failStreakRef.current = 0;
            return;
          }
          // Want playback. Prefer unmuted unless payload.muted or soft-mute fallback.
          if (mutedRef.current || softMuted) {
            player.mute();
          } else {
            player.unMute();
          }
          player.playVideo();
        } catch {
          setBlocked(true);
          onBlockedRef.current?.();
        }
      };

      applyClock();

      const watchdog = window.setInterval(() => {
        const player = playerRef.current;
        const clock = mediaClockRef.current;
        if (!player || !clock?.playing) {
          return;
        }
        const state = readPlayerState(player);
        if (isActivelyPlaying(state)) {
          failStreakRef.current = 0;
          // Motion OK — if we soft-muted for autoplay, keep the click-to-unmute overlay.
          if (softMuted && !mutedRef.current) {
            setBlocked(true);
          } else if (!mutedRef.current) {
            setBlocked(false);
          }
          return;
        }
        // Clock says playing but YT is stuck (typical unmuted autoplay block).
        failStreakRef.current += 1;
        try {
          const localMs = (player.getCurrentTime?.() ?? 0) * 1000;
          const { seek, targetMs } = shouldCorrectSeek(localMs, clock);
          if (seek) {
            player.seekTo(targetMs / 1000, true);
          }
          if (failStreakRef.current >= 2 && !mutedRef.current) {
            // Muted autoplay usually succeeds — get video motion, ask for click for audio.
            player.mute();
            setSoftMuted(true);
            setBlocked(true);
            onBlockedRef.current?.();
          } else if (!mutedRef.current && !softMuted) {
            player.unMute();
          }
          player.playVideo();
          if (failStreakRef.current >= 3) {
            setBlocked(true);
            onBlockedRef.current?.();
          }
        } catch {
          setBlocked(true);
          onBlockedRef.current?.();
        }
      }, PLAY_WATCHDOG_MS);

      return () => window.clearInterval(watchdog);
    }, [mediaClock, preview, ready, muted, softMuted]);

    const clickUnblock = () => {
      const player = playerRef.current;
      if (!player) {
        return;
      }
      try {
        const clock = mediaClockRef.current;
        if (clock && !preview) {
          const localMs = (player.getCurrentTime?.() ?? 0) * 1000;
          const { seek, targetMs } = shouldCorrectSeek(localMs, clock);
          if (seek) {
            player.seekTo(targetMs / 1000, true);
          }
        }
        if (!mutedRef.current) {
          player.unMute();
        }
        setSoftMuted(false);
        player.playVideo();
        failStreakRef.current = 0;
        // Confirm shortly — gesture should allow unmuted play.
        window.setTimeout(() => {
          if (isActivelyPlaying(readPlayerState(playerRef.current))) {
            setBlocked(false);
          }
        }, 200);
      } catch {
        // keep overlay
      }
    };

    return (
      <div className={className ?? "video-yt-wrap"}>
        <div id={elId} className="video-yt-host" />
        {error ? <p className="video-error">{error}</p> : null}
        {blocked && !error ? (
          <button
            type="button"
            className="btn btn-primary video-unblock"
            onClick={clickUnblock}
          >
            {softMuted ? "Clic para audio" : "Clic para audio / play"}
          </button>
        ) : null}
      </div>
    );
  },
);
