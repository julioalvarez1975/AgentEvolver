import { useEffect, useId, useRef, useState } from "react";
import type { MediaClock } from "@promedia/shared";
import { shouldCorrectSeek } from "./clock.js";

type YtPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
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
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YtPlayer }) => void;
            onError?: (e: { data: number }) => void;
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

export type YouTubePlayerProps = {
  videoId: string;
  mediaClock?: MediaClock | null;
  /** Preview mode: ignore hub clock; local controls only */
  preview?: boolean;
  loop?: boolean;
  muted?: boolean;
  className?: string;
  onBlocked?: () => void;
};

export function YouTubePlayer({
  videoId,
  mediaClock,
  preview = false,
  loop = false,
  muted = false,
  className,
  onBlocked,
}: YouTubePlayerProps) {
  const reactId = useId().replace(/:/g, "");
  const elId = `yt-${reactId}`;
  const playerRef = useRef<YtPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadYouTubeApi().then(() => {
      if (cancelled || !window.YT?.Player) {
        return;
      }
      playerRef.current?.destroy();
      playerRef.current = new window.YT.Player(elId, {
        videoId,
        playerVars: {
          controls: preview ? 1 : 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          loop: loop ? 1 : 0,
          playlist: loop ? videoId : undefined as unknown as string,
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
          },
          onError: () => {
            setError("youtube_embed_error");
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
    };
  }, [elId, videoId, loop, muted, preview]);

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
}
