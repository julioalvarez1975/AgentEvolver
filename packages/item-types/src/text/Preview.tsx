import type { PlaylistItem, TextPayload } from "@promedia/shared";
import { resolveProjectionTextSlides } from "@promedia/shared";
import { FittedTextStage } from "./FittedTextStage.js";

export type TextPreviewProps = {
  item: PlaylistItem;
  slideIndex: number;
  onSlideIndexChange?: (index: number) => void;
};

function ChevronLeftIcon() {
  return (
    <svg
      className="text-preview-nav-icon"
      width="22"
      height="22"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      className="text-preview-nav-icon"
      width="22"
      height="22"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708"
      />
    </svg>
  );
}

/** Preview uses the same theme CSS vars + fit path as Output. */
export function TextPreview({
  item,
  slideIndex,
  onSlideIndexChange,
}: TextPreviewProps) {
  const payload = item.payload as TextPayload;
  const slides = resolveProjectionTextSlides(payload);
  const total = slides.length;
  const index = Math.min(Math.max(slideIndex, 0), Math.max(total - 1, 0));
  const slide = slides[index];
  const lines = slide?.lines ?? [""];
  const showNav = Boolean(onSlideIndexChange) && total > 1;
  const canPrev = showNav && index > 0;
  const canNext = showNav && index < total - 1;

  return (
    <div className="text-preview" data-has-slide-nav={showNav ? "1" : undefined}>
      {showNav ? (
        <button
          type="button"
          className="text-preview-nav text-preview-nav-prev"
          disabled={!canPrev}
          aria-label="Previous"
          title="Previous"
          onClick={() => onSlideIndexChange?.(index - 1)}
        >
          <ChevronLeftIcon />
        </button>
      ) : null}
      <FittedTextStage
        lines={lines}
        lineKey={slide?.id ?? `prev-${index}`}
        className="text-stage"
        lineClassName="text-line"
      />
      {showNav ? (
        <button
          type="button"
          className="text-preview-nav text-preview-nav-next"
          disabled={!canNext}
          aria-label="Next"
          title="Next"
          onClick={() => onSlideIndexChange?.(index + 1)}
        >
          <ChevronRightIcon />
        </button>
      ) : null}
    </div>
  );
}
