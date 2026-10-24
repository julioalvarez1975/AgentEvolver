import type { PlaylistItem, VideoPlaylistItem } from "@promedia/shared";
import { FileVideo } from "./FileVideo.js";
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
