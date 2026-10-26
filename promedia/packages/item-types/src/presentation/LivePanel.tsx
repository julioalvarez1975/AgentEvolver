import type { PlaylistItem, PresentationPlaylistItem } from "@promedia/shared";

export type PresentationLivePanelProps = {
  item: PlaylistItem;
  slideIndex: number;
  assetSrc?: string;
  onPrev?: () => void;
  onNext?: () => void;
};

export function PresentationLivePanel({
  item,
  slideIndex,
  assetSrc,
  onPrev,
  onNext,
}: PresentationLivePanelProps) {
  if (item.type !== "presentation") {
    return null;
  }
  const presentation = item as PresentationPlaylistItem;
  const total = presentation.payload.slides.length;
  return (
    <div className="presentation-live-panel image-live-panel">
      <div className="image-stage">
        {assetSrc ? (
          <img
            src={assetSrc}
            alt={presentation.payload.title ?? "presentación"}
            style={{ objectFit: presentation.payload.fit }}
          />
        ) : (
          <p className="image-missing">…</p>
        )}
      </div>
      <div className="presentation-live-nav">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!onPrev || slideIndex <= 0}
          onClick={onPrev}
        >
          ←
        </button>
        <span>
          {Math.min(slideIndex + 1, total)} / {total}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!onNext || slideIndex >= total - 1}
          onClick={onNext}
        >
          →
        </button>
      </div>
    </div>
  );
}
