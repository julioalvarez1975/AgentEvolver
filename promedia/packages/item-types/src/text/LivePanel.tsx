import type { PlaylistItem, TextPayload } from "@promedia/shared";

export type TextLivePanelProps = {
  item: PlaylistItem;
  slideIndex: number;
  onPrev?: () => void;
  onNext?: () => void;
};

export function TextLivePanel({ item, slideIndex, onPrev, onNext }: TextLivePanelProps) {
  const payload = item.payload as TextPayload;
  const slides = payload.slides;
  const index = Math.min(Math.max(slideIndex, 0), Math.max(slides.length - 1, 0));
  const slide = slides[index];

  return (
    <div className="text-live-panel">
      <div className="text-stage">
        {(slide?.lines ?? [""]).map((line, i) => (
          <p key={`${slide?.id ?? "s"}-${i}`} className="text-line">
            {line || "\u00a0"}
          </p>
        ))}
      </div>
      <div className="text-slide-nav">
        <button
          type="button"
          className="btn"
          disabled={index <= 0 || !onPrev}
          onClick={onPrev}
        >
          ←
        </button>
        <span>
          {index + 1} / {slides.length}
        </span>
        <button
          type="button"
          className="btn"
          disabled={index >= slides.length - 1 || !onNext}
          onClick={onNext}
        >
          →
        </button>
      </div>
    </div>
  );
}
