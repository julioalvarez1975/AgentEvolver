import { useEffect, useRef, useState } from "react";
import type { PlaylistItem, VideoPlaylistItem } from "@promedia/shared";
import {
  YouTubePlayer,
  type YouTubePlayerHandle,
} from "./YouTubePlayer.js";
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

const SKIP_MS = 5000;

function formatMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function IconPlay() {
  return (
    <svg className="preview-tb-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path d="M8 5.5v13l11-6.5L8 5.5Z" fill="currentColor" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg className="preview-tb-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}

function IconSkipBack() {
  return (
    <svg className="preview-tb-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path d="M11 12 18 6.5v11L11 12Z" fill="currentColor" />
      <path d="M6 12 13 6.5v11L6 12Z" fill="currentColor" />
      <rect x="4" y="6" width="2.2" height="12" rx="0.6" fill="currentColor" />
    </svg>
  );
}

function IconSkipForward() {
  return (
    <svg className="preview-tb-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path d="M13 12 6 6.5v11L13 12Z" fill="currentColor" />
      <path d="M18 12 11 6.5v11L18 12Z" fill="currentColor" />
      <rect x="17.8" y="6" width="2.2" height="12" rx="0.6" fill="currentColor" />
    </svg>
  );
}

function IconVolumeOn() {
  return (
    <svg className="preview-tb-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path d="M4 9.5h3.2L12 6v12l-4.8-3.5H4V9.5Z" fill="currentColor" />
      <path
        d="M15.2 9.2a3.2 3.2 0 0 1 0 5.6M17.5 7a6 6 0 0 1 0 10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function IconVolumeOff() {
  return (
    <svg className="preview-tb-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path d="M4 9.5h3.2L12 6v12l-4.8-3.5H4V9.5Z" fill="currentColor" />
      <path
        d="m15 9.5 5 5M20 9.5l-5 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

type TransportBarProps = {
  playing: boolean;
  muted: boolean;
  positionMs: number;
  durationMs: number;
  scrubbing: boolean;
  scrubMs: number;
  disabled?: boolean;
  onTogglePlay: () => void;
  onSkip: (deltaMs: number) => void;
  onToggleMute: () => void;
  onScrubChange: (ms: number) => void;
  onScrubCommit: () => void;
  onScrubStart: () => void;
};

function VideoTransportBar({
  playing,
  muted,
  positionMs,
  durationMs,
  scrubbing,
  scrubMs,
  disabled = false,
  onTogglePlay,
  onSkip,
  onToggleMute,
  onScrubChange,
  onScrubCommit,
  onScrubStart,
}: TransportBarProps) {
  const displayMs = scrubbing ? scrubMs : positionMs;
  const maxMs = Math.max(durationMs, 1);

  return (
    <div
      className="preview-toolbar preview-toolbar-video"
      role="toolbar"
      aria-label="Controles de vista previa"
    >
      <div className="preview-toolbar-row">
        <button
          type="button"
          className="btn preview-tb-btn"
          disabled={disabled}
          title={playing ? "Pausa" : "Reproducir"}
          aria-label={playing ? "Pausa" : "Reproducir"}
          onClick={onTogglePlay}
        >
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <button
          type="button"
          className="btn preview-tb-btn"
          disabled={disabled}
          title="Retroceder 5 s"
          aria-label="Retroceder 5 s"
          onClick={() => onSkip(-SKIP_MS)}
        >
          <IconSkipBack />
        </button>
        <button
          type="button"
          className="btn preview-tb-btn"
          disabled={disabled}
          title="Avanzar 5 s"
          aria-label="Avanzar 5 s"
          onClick={() => onSkip(SKIP_MS)}
        >
          <IconSkipForward />
        </button>
        <span className="video-time">{formatMs(displayMs)}</span>
        <input
          type="range"
          className="preview-scrubber"
          min={0}
          max={maxMs}
          step={100}
          value={Math.min(displayMs, maxMs)}
          disabled={disabled || durationMs <= 0}
          aria-label="Línea de tiempo"
          onPointerDown={onScrubStart}
          onChange={(e) => {
            onScrubStart();
            onScrubChange(Number(e.target.value));
          }}
          onPointerUp={onScrubCommit}
          onKeyUp={onScrubCommit}
        />
        <span className="video-time">{formatMs(durationMs)}</span>
        <button
          type="button"
          className="btn preview-tb-btn"
          disabled={disabled}
          title={muted ? "Activar audio" : "Silenciar"}
          aria-label={muted ? "Activar audio" : "Silenciar"}
          onClick={onToggleMute}
        >
          {muted ? <IconVolumeOff /> : <IconVolumeOn />}
        </button>
      </div>
    </div>
  );
}

/**
 * Local preview with dedicated transport toolbar so operators can seek /
 * mute / skip before Go Live (does not sync Output until live).
 * YouTube while projecting: thumb only — Output owns the iframe.
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
  const initialMuted = video.payload.muted === true;
  const loop = video.payload.loop === true;
  const fit = video.payload.fit ?? "contain";
  const isYoutube = video.payload.sourceKind === "youtube";

  return (
    <div className="video-preview">
      {video.payload.sourceKind === "file" ? (
        assetSrc ? (
          <FilePreviewWithToolbar
            src={assetSrc}
            initialMuted={initialMuted}
            loop={loop}
            fit={fit}
          />
        ) : (
          <>
            <p className="video-missing">…</p>
            <VideoTransportBar
              playing={false}
              muted={initialMuted}
              positionMs={0}
              durationMs={0}
              scrubbing={false}
              scrubMs={0}
              disabled
              onTogglePlay={() => undefined}
              onSkip={() => undefined}
              onToggleMute={() => undefined}
              onScrubChange={() => undefined}
              onScrubCommit={() => undefined}
              onScrubStart={() => undefined}
            />
          </>
        )
      ) : projecting ? (
        <>
          <YouTubeThumb
            videoId={video.payload.videoId}
            title={video.payload.title}
          />
          <div
            className="preview-toolbar preview-toolbar-video preview-toolbar-locked"
            role="status"
          >
            <p className="preview-toolbar-note">
              YouTube en Output — aquí solo miniatura (un solo iframe).
            </p>
          </div>
        </>
      ) : (
        <YouTubePreviewWithToolbar
          videoId={video.payload.videoId}
          initialMuted={initialMuted}
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

function FilePreviewWithToolbar({
  src,
  initialMuted,
  loop,
  fit,
}: {
  src: string;
  initialMuted: boolean;
  loop: boolean;
  fit: "contain" | "cover";
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [positionMs, setPositionMs] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubMs, setScrubMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(initialMuted);

  useEffect(() => {
    setMuted(initialMuted);
  }, [initialMuted, src]);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.muted = muted;
  }, [muted]);

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
      <VideoTransportBar
        playing={playing}
        muted={muted}
        positionMs={positionMs}
        durationMs={durationMs}
        scrubbing={scrubbing}
        scrubMs={scrubMs}
        onTogglePlay={() => {
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
        onSkip={(delta) => {
          seekTo((scrubbing ? scrubMs : positionMs) + delta);
        }}
        onToggleMute={() => setMuted((m) => !m)}
        onScrubStart={() => setScrubbing(true)}
        onScrubChange={(ms) => {
          setScrubbing(true);
          setScrubMs(ms);
        }}
        onScrubCommit={() => {
          seekTo(scrubMs);
          setScrubbing(false);
        }}
      />
    </div>
  );
}

function YouTubePreviewWithToolbar({
  videoId,
  initialMuted,
  loop,
}: {
  videoId: string;
  initialMuted: boolean;
  loop: boolean;
}) {
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(initialMuted);
  const [durationMs, setDurationMs] = useState(0);
  const [positionMs, setPositionMs] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubMs, setScrubMs] = useState(0);

  useEffect(() => {
    setMuted(initialMuted);
    setPlaying(false);
    setPositionMs(0);
    setDurationMs(0);
  }, [initialMuted, videoId]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p?.isReady()) {
        return;
      }
      const dur = p.getDurationMs();
      if (dur > 0) {
        setDurationMs(dur);
      }
      if (!scrubbing) {
        setPositionMs(p.getCurrentTimeMs());
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [ready, scrubbing]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p?.isReady()) {
      return;
    }
    if (muted) {
      p.mute();
    } else {
      p.unMute();
    }
  }, [muted, ready]);

  const seekTo = (ms: number) => {
    const p = playerRef.current;
    if (!p) {
      return;
    }
    const clamped = Math.max(0, Math.min(ms, durationMs || ms));
    p.seekToMs(clamped);
    setPositionMs(clamped);
  };

  return (
    <div className="video-preview-scrub">
      <YouTubePlayer
        ref={playerRef}
        videoId={videoId}
        preview
        hideNativeControls
        muted={muted}
        loop={loop}
        onReadyChange={setReady}
        onPlayingChange={setPlaying}
      />
      <VideoTransportBar
        playing={playing}
        muted={muted}
        positionMs={positionMs}
        durationMs={durationMs}
        scrubbing={scrubbing}
        scrubMs={scrubMs}
        disabled={!ready}
        onTogglePlay={() => {
          const p = playerRef.current;
          if (!p) {
            return;
          }
          if (playing) {
            p.pause();
          } else {
            p.play();
          }
        }}
        onSkip={(delta) => {
          seekTo((scrubbing ? scrubMs : positionMs) + delta);
        }}
        onToggleMute={() => setMuted((m) => !m)}
        onScrubStart={() => setScrubbing(true)}
        onScrubChange={(ms) => {
          setScrubbing(true);
          setScrubMs(ms);
        }}
        onScrubCommit={() => {
          seekTo(scrubMs);
          setScrubbing(false);
        }}
      />
    </div>
  );
}
