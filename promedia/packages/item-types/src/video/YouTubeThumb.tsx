/**
 * Static YouTube poster — used on Control Live (and Preview while projecting)
 * so Output owns the only IFrame API embed for that videoId.
 */
export type YouTubeThumbProps = {
  videoId: string;
  title?: string;
  className?: string;
  caption?: string;
};

export function youtubeThumbUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function YouTubeThumb({
  videoId,
  title,
  className,
  caption,
}: YouTubeThumbProps) {
  return (
    <div className={className ?? "video-yt-thumb-wrap"}>
      <img
        className="video-yt-thumb"
        src={youtubeThumbUrl(videoId)}
        alt={title?.trim() || `YouTube ${videoId}`}
        loading="lazy"
        decoding="async"
      />
      {caption ? <p className="video-caveat">{caption}</p> : null}
    </div>
  );
}
