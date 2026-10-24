import type { PlaylistItem, TextPayload } from "@promedia/shared";

export type TextPreviewProps = {
  item: PlaylistItem;
  slideIndex: number;
  onSlideIndexChange?: (index: number) => void;
};

/** Preview uses the same theme CSS vars as Output (theme wins over item align). */
export function TextPreview({ item, slideIndex }: TextPreviewProps) {
  const payload = item.payload as TextPayload;
  const slides = payload.slides;
  const index = Math.min(Math.max(slideIndex, 0), Math.max(slides.length - 1, 0));
  const slide = slides[index];

  return (
    <div className="text-preview">
      <div className="text-stage">
        {(slide?.lines ?? [""]).map((line, i) => (
          <p key={`${slide?.id ?? "s"}-${i}`} className="text-line">
            {line || "\u00a0"}
          </p>
        ))}
      </div>
    </div>
  );
}
