import type { PlaylistItem, VideoPlaylistItem } from "@promedia/shared";
import { FileVideo } from "./FileVideo.js";
import { YouTubePlayer } from "./YouTubePlayer.js";

export type VideoPreviewProps = {
  item: PlaylistItem;
  slideIndex: number;
  assetSrc?: string;
};

export function VideoPreview({ item, assetSrc }: VideoPreviewProps) {
  if (item.type !== "video") {
    return null;
  }
  const video = item as VideoPlaylistItem;
  const muted = video.payload.muted === true;
  const loop = video.payload.loop === true;
  const fit = video.payload.fit ?? "contain";

  return (
    <div className="video-preview">
      {video.payload.sourceKind === "file" ? (
        assetSrc ? (
          <FileVideo
            src={assetSrc}
            preview
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
          preview
          muted={muted}
          loop={loop}
        />
      )}
      <p className="video-caveat">
        Preview local — no sincroniza Output hasta Go Live.
      </p>
    </div>
  );
}
