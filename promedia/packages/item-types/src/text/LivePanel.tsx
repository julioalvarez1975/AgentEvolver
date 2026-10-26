import type { PlaylistItem, TextPayload } from "@promedia/shared";
import { projectionTextSlides } from "@promedia/shared";
import { FittedTextStage } from "./FittedTextStage.js";

export type TextLivePanelProps = {
  item: PlaylistItem;
  slideIndex: number;
  onPrev?: () => void;
  onNext?: () => void;
};

export function TextLivePanel({ item, slideIndex, onPrev, onNext }: TextLivePanelProps) {
  const payload = item.payload as TextPayload;
  const slides = projectionTextSlides(payload.slides);
  const index = Math.min(Math.max(slideIndex, 0), Math.max(slides.length - 1, 0));
  const slide = slides[index];
  const lines = slide?.lines ?? [""];

  return (
    <div className="text-live-panel">
      <FittedTextStage
        lines={lines}
        lineKey={slide?.id ?? `live-${index}`}
        className="text-stage"
        lineClassName="text-line"
      />
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
