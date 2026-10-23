import type { ImagePlaylistItem, PlaylistItem } from "@promedia/shared";

export type ImageLivePanelProps = {
  item: PlaylistItem;
  slideIndex: number;
  assetSrc?: string;
};

export function ImageLivePanel({ item, assetSrc }: ImageLivePanelProps) {
  if (item.type !== "image") {
    return null;
  }
  const image = item as ImagePlaylistItem;
  return (
    <div className="image-live-panel">
      <div className="image-stage">
        {assetSrc ? (
          <img
            src={assetSrc}
            alt={image.payload.title ?? "image"}
            style={{ objectFit: image.payload.fit }}
          />
        ) : (
          <p className="image-missing">…</p>
        )}
      </div>
      <p className="image-fit-label">{image.payload.fit}</p>
    </div>
  );
}
