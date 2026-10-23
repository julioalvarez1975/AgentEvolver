import type {
  MediaClock,
  PlaylistItem,
  VideoPlaylistItem,
} from "@promedia/shared";
import { FileVideo } from "./FileVideo.js";
import { YouTubePlayer } from "./YouTubePlayer.js";

export type VideoOutputRendererProps = {
  item: PlaylistItem;
  slideIndex: number;
  assetSrc?: string;
  mediaClock?: MediaClock | null;
};

export function VideoOutputRenderer({
  item,
  assetSrc,
  mediaClock,
}: VideoOutputRendererProps) {
  if (item.type !== "video") {
    return null;
  }
  const video = item as VideoPlaylistItem;
  // Q2: unmuted by default (only mute if payload.muted === true)
  const muted = video.payload.muted === true;
  const loop = video.payload.loop === true;
  const fit = video.payload.fit ?? "contain";

  return (
    <div className="video-output">
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
          <p className="output-waiting">…</p>
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
  );
}
