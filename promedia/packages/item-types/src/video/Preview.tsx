import { useEffect, useRef, useState } from "react";
import type { PlaylistItem, VideoPlaylistItem } from "@promedia/shared";
import { YouTubePlayer } from "./YouTubePlayer.js";
import { YouTubeThumb } from "./YouTubeThumb.js";

export type VideoPreviewProps = {
  item: PlaylistItem;
  slideIndex: number;
  assetSrc?: string;
  /**
   * When this item is already live, do not mount a second YouTube iframe —
   * Output owns the embed. Show poster only.
   */
  projecting?: boolean;
};

function formatMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Local preview with timeline scrubber so operators can seek what will be shown
 * before Go Live (does not sync Output until live).
 */
export function VideoPreview({
  item,
  assetSrc,
  projecting = false,
}: VideoPreviewProps) {
  if (item.type !== "video") {
    return null;
  }
  const video = item as VideoPlaylistItem;
  const muted = video.payload.muted === true;
  const loop = video.payload.loop === true;
  const fit = video.payload.fit ?? "contain";
  const isYoutube = video.payload.sourceKind === "youtube";

  return (
    <div className="video-preview">
      {video.payload.sourceKind === "file" ? (
        assetSrc ? (
          <FilePreviewWithScrubber
            src={assetSrc}
            muted={muted}
            loop={loop}
            fit={fit}
          />
        ) : (
          <p className="video-missing">…</p>
        )
      ) : projecting ? (
        <YouTubeThumb
          videoId={video.payload.videoId}
          title={video.payload.title}
        />
      ) : (
        <YouTubePlayer
          videoId={video.payload.videoId}
          preview
          muted={muted}
          loop={loop}
        />
      )}
      <p className="video-caveat">
        {isYoutube && projecting
          ? "Preview local — reproducción en la ventana Output."
          : "Preview local — no sincroniza Output hasta Go Live."}
      </p>
    </div>
  );
}

function FilePreviewWithScrubber({
  src,
  muted,
  loop,
  fit,
}: {
  src: string;
  muted: boolean;
  loop: boolean;
  fit: "contain" | "cover";
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [positionMs, setPositionMs] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubMs, setScrubMs] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const onMeta = () => {
      setDurationMs((el.duration || 0) * 1000);
    };
    const onTime = () => {
      if (!scrubbing) {
        setPositionMs(el.currentTime * 1000);
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, [scrubbing, src]);

  const displayMs = scrubbing ? scrubMs : positionMs;
  const maxMs = Math.max(durationMs, 1);

  const seekTo = (ms: number) => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const clamped = Math.max(0, Math.min(ms, durationMs || ms));
    el.currentTime = clamped / 1000;
    setPositionMs(clamped);
  };

  return (
    <div className="video-preview-scrub">
      <div className="video-file-wrap">
        <video
          ref={ref}
          src={src}
          className="video-el"
          style={{ objectFit: fit }}
          playsInline
          controls={false}
          loop={loop}
          muted={muted}
          autoPlay={false}
        />
      </div>
      <div className="video-transport preview-transport">
        <button
          type="button"
          className="btn"
          onClick={() => {
            const el = ref.current;
            if (!el) {
              return;
            }
            if (el.paused) {
              void el.play().catch(() => undefined);
            } else {
              el.pause();
            }
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span className="video-time">{formatMs(displayMs)}</span>
        <input
          type="range"
          className="preview-scrubber"
          min={0}
          max={maxMs}
          step={100}
          value={Math.min(displayMs, maxMs)}
          aria-label="Timeline"
          onChange={(e) => {
            const v = Number(e.target.value);
            setScrubbing(true);
            setScrubMs(v);
          }}
          onMouseUp={() => {
            seekTo(scrubMs);
            setScrubbing(false);
          }}
          onTouchEnd={() => {
            seekTo(scrubMs);
            setScrubbing(false);
          }}
          onKeyUp={() => {
            seekTo(scrubMs);
            setScrubbing(false);
          }}
        />
        <span className="video-time">{formatMs(durationMs)}</span>
      </div>
    </div>
  );
}
