import { useState } from "react";
import type {
  MediaClock,
  PlaylistItem,
  VideoPlaylistItem,
} from "@promedia/shared";
import { effectiveMediaClockPositionMs } from "@promedia/shared";
import { FileVideo } from "./FileVideo.js";
import { YouTubePlayer } from "./YouTubePlayer.js";

export type VideoLivePanelProps = {
  item: PlaylistItem;
  slideIndex: number;
  assetSrc?: string;
  mediaClock?: MediaClock | null;
  onMediaClockSet?: (patch: { playing: boolean; positionMs?: number }) => void;
};

function formatMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function VideoLivePanel({
  item,
  assetSrc,
  mediaClock,
  onMediaClockSet,
}: VideoLivePanelProps) {
  if (item.type !== "video") {
    return null;
  }
  const video = item as VideoPlaylistItem;
  const muted = video.payload.muted === true;
  const loop = video.payload.loop === true;
  const fit = video.payload.fit ?? "contain";
  const [scrub, setScrub] = useState(0);

  const pos = mediaClock
    ? effectiveMediaClockPositionMs(mediaClock)
    : 0;
  const playing = mediaClock?.playing ?? false;

  return (
    <div className="video-live-panel">
      <div className="video-stage">
        {video.payload.sourceKind === "file" ? (
          assetSrc ? (
            <FileVideo
              src={assetSrc}
              mediaClock={mediaClock}
              muted={muted}
              loop={loop}
              fit={fit}
            />
          ) : (
            <p className="video-missing">…</p>
          )
        ) : (
          <YouTubePlayer
            videoId={video.payload.videoId}
            mediaClock={mediaClock}
            muted={muted}
            loop={loop}
          />
        )}
      </div>
      <div className="video-transport">
        <button
          type="button"
          className="btn"
          disabled={!onMediaClockSet || !mediaClock}
          onClick={() =>
            onMediaClockSet?.({
              playing: !playing,
              positionMs: pos,
            })
          }
        >
          {playing ? "Pause" : "Play"}
        </button>
        <span className="video-time">{formatMs(pos)}</span>
        <input
          type="range"
          min={0}
          max={600000}
          step={100}
          value={scrub || pos}
          disabled={!onMediaClockSet || !mediaClock}
          onChange={(e) => setScrub(Number(e.target.value))}
          onMouseUp={() => {
            if (onMediaClockSet) {
              onMediaClockSet({ playing, positionMs: scrub || pos });
            }
            setScrub(0);
          }}
          onTouchEnd={() => {
            if (onMediaClockSet) {
              onMediaClockSet({ playing, positionMs: scrub || pos });
            }
            setScrub(0);
          }}
        />
      </div>
      {video.payload.sourceKind === "youtube" ? (
        <p className="video-caveat">
          YouTube: requiere red; algunos vídeos bloquean embed.
        </p>
      ) : null}
    </div>
  );
}
