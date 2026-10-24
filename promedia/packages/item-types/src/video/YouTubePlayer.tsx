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
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [blocked, setBlocked] = useState(false);

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
      void loadYouTubeApi().then(() => {
        if (cancelled || !window.YT?.Player) {
          return;
        }
        playerRef.current?.destroy();
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
            autoplay: 0,
            mute: muted ? 1 : 0,
          },
          events: {
            onReady: (e) => {
              if (muted) {
                e.target.mute();
              } else {
                e.target.unMute();
              }
              setReady(true);
              onReadyChange?.(true);
            },
            onStateChange: (e) => {
              // 1 = playing, 2 = paused
              if (e.data === 1) {
                onPlayingChange?.(true);
              } else if (e.data === 2 || e.data === 0) {
                onPlayingChange?.(false);
              }
            },
            onError: (e) => {
              setError(youtubeErrorMessage(e.data));
            },
          },
        });
      });
      return () => {
        cancelled = true;
        try {
          playerRef.current?.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
        setReady(false);
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

    useEffect(() => {
      if (preview || !ready || !mediaClock || !playerRef.current) {
        return;
      }
      const player = playerRef.current;
      try {
        const localMs = (player.getCurrentTime?.() ?? 0) * 1000;
        const { seek, targetMs } = shouldCorrectSeek(localMs, mediaClock);
        if (seek) {
          player.seekTo(targetMs / 1000, true);
        }
        if (mediaClock.playing) {
          if (!muted) {
            player.unMute();
          }
          try {
            player.playVideo();
            setBlocked(false);
          } catch {
            setBlocked(true);
            onBlocked?.();
          }
        } else {
          player.pauseVideo();
        }
      } catch {
        setBlocked(true);
        onBlocked?.();
      }
    }, [mediaClock, preview, ready, muted, onBlocked]);

    return (
      <div className={className ?? "video-yt-wrap"}>
        <div id={elId} className="video-yt-host" />
        {error ? <p className="video-error">{error}</p> : null}
        {blocked && !error ? (
          <button
            type="button"
            className="btn btn-primary video-unblock"
            onClick={() => {
              const player = playerRef.current;
              if (!player) {
                return;
              }
              try {
                if (!muted) {
                  player.unMute();
                }
                player.playVideo();
                setBlocked(false);
              } catch {
                // keep overlay
              }
            }}
          >
            Clic para audio / play
          </button>
        ) : null}
      </div>
    );
  },
);
