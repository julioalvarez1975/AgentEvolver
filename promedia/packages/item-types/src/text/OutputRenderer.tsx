import type { PlaylistItem, TextPayload } from "@promedia/shared";
import { projectionTextSlides } from "@promedia/shared";

export type TextOutputRendererProps = {
  item: PlaylistItem;
  slideIndex: number;
};

/**
 * Text on Output. Align / colors / font come from session theme CSS vars
 * (`--pm-*` on `.pm-theme`); item.payload.align does not win (subtarea 8).
 * Shows at most 5 lines per slide, centered to fill the projection stage.
 */
export function TextOutputRenderer({ item, slideIndex }: TextOutputRendererProps) {
  const payload = item.payload as TextPayload;
  const slides = projectionTextSlides(payload.slides);
  const index = Math.min(Math.max(slideIndex, 0), Math.max(slides.length - 1, 0));
  const slide = slides[index];
  const lines = slide?.lines ?? [""];

  return (
    <div className="text-output" data-line-count={lines.length}>
      {lines.map((line, i) => (
        <p key={`${slide?.id ?? "s"}-${i}`} className="text-output-line">
          {line || "\u00a0"}
        </p>
      ))}
    </div>
  );
}
