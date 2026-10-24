import { useEffect, useState } from "react";
import type {
  MediaClock,
  PlaylistItem,
  VideoPlaylistItem,
} from "@promedia/shared";
import { effectiveMediaClockPositionMs } from "@promedia/shared";
import { FileVideo } from "./FileVideo.js";
import {
  VideoTransportBar,
  formatMediaMs,
} from "./VideoTransportBar.js";
import { YouTubeThumb } from "./YouTubeThumb.js";

export type VideoLivePanelProps = {
  item: PlaylistItem;
  slideIndex: number;
  assetSrc?: string;
  mediaClock?: MediaClock | null;
  onMediaClockSet?: (patch: { playing: boolean; positionMs?: number }) => void;
  /** Optional duration hint (ms) when known from preview / metadata. */
  durationMsHint?: number;
  onDurationMs?: (ms: number) => void;
};

/**
 * Live monitor: file video mirrors mediaClock; YouTube is thumb-only
 * (Output owns the iframe). Transport drives hub mediaClock for both.
 */
export function VideoLivePanel({
  item,
  assetSrc,
  mediaClock,
  onMediaClockSet,
  durationMsHint = 0,
  onDurationMs,
}: VideoLivePanelProps) {
  if (item.type !== "video") {
    return null;
  }
  const video = item as VideoPlaylistItem;
  const muted = video.payload.muted === true;
  const loop = video.payload.loop === true;
  const fit = video.payload.fit ?? "contain";
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubMs, setScrubMs] = useState(0);
  const [fileDurationMs, setFileDurationMs] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!mediaClock?.playing || scrubbing) {
      return;
    }
    const id = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [mediaClock?.playing, mediaClock?.updatedAt, scrubbing]);

  const pos = mediaClock
    ? effectiveMediaClockPositionMs(mediaClock)
    : 0;
  void tick;
  const playing = mediaClock?.playing ?? false;
  const durationMs = Math.max(fileDurationMs, durationMsHint, 0);
  const canControl = Boolean(onMediaClockSet && mediaClock);

  const seekTo = (ms: number) => {
    if (!onMediaClockSet) {
      return;
    }
    const clamped =
      durationMs > 0
        ? Math.max(0, Math.min(ms, durationMs))
        : Math.max(0, ms);
    onMediaClockSet({ playing, positionMs: clamped });
    setScrubMs(clamped);
  };

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
              onDurationMs={(ms) => {
                setFileDurationMs(ms);
                onDurationMs?.(ms);
              }}
            />
          ) : (
            <p className="video-missing">…</p>
          )
        ) : (
          <YouTubeThumb
            videoId={video.payload.videoId}
            title={video.payload.title}
            caption="YouTube en Output — aquí solo miniatura + transporte (evita doble embed)."
          />
        )}
      </div>
      <VideoTransportBar
        playing={playing}
        positionMs={pos}
        durationMs={durationMs}
        scrubbing={scrubbing}
        scrubMs={scrubMs}
        disabled={!canControl}
        showMute={false}
        labels={{
          play: "Play",
          pause: "Pause",
          skipBack: "−10s",
          skipForward: "+10s",
          toStart: "Start",
          toEnd: "End",
          timeline: "Timeline",
          toolbar: "En vivo transport",
        }}
        remainingLabel={
          durationMs > 0
            ? `−${formatMediaMs(Math.max(0, durationMs - (scrubbing ? scrubMs : pos)))}`
            : "−−:−−"
        }
        onTogglePlay={() =>
          onMediaClockSet?.({
            playing: !playing,
            positionMs: scrubbing ? scrubMs : pos,
          })
        }
        onSkip={(delta) => {
          seekTo((scrubbing ? scrubMs : pos) + delta);
        }}
        onSeekTo={seekTo}
        onScrubStart={() => {
          setScrubbing(true);
          setScrubMs(pos);
        }}
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
