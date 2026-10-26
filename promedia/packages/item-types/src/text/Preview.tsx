import type { PlaylistItem, TextPayload } from "@promedia/shared";
import { projectionTextSlides } from "@promedia/shared";

export type TextPreviewProps = {
  item: PlaylistItem;
  slideIndex: number;
  onSlideIndexChange?: (index: number) => void;
};

/** Preview uses the same theme CSS vars as Output (theme wins over item align). */
export function TextPreview({ item, slideIndex }: TextPreviewProps) {
  const payload = item.payload as TextPayload;
  const slides = projectionTextSlides(payload.slides);
  const index = Math.min(Math.max(slideIndex, 0), Math.max(slides.length - 1, 0));
  const slide = slides[index];
  const lines = slide?.lines ?? [""];

  return (
    <div className="text-preview">
      <div className="text-stage" data-line-count={lines.length}>
        {lines.map((line, i) => (
          <p key={`${slide?.id ?? "s"}-${i}`} className="text-line">
            {line || "\u00a0"}
          </p>
        ))}
      </div>
    </div>
  );
}
