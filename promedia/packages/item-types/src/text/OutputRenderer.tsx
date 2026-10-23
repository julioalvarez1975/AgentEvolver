import type { PlaylistItem, TextPayload } from "@promedia/shared";
import { textAlignCss } from "./styles.js";

export type TextOutputRendererProps = {
  item: PlaylistItem;
  slideIndex: number;
};

export function TextOutputRenderer({ item, slideIndex }: TextOutputRendererProps) {
  const payload = item.payload as TextPayload;
  const slides = payload.slides;
  const index = Math.min(Math.max(slideIndex, 0), Math.max(slides.length - 1, 0));
  const slide = slides[index];
  const align = textAlignCss(payload.align);

  return (
    <div className="text-output" style={align}>
      {(slide?.lines ?? [""]).map((line, i) => (
        <p key={`${slide?.id ?? "s"}-${i}`} className="text-output-line">
          {line || "\u00a0"}
        </p>
      ))}
    </div>
  );
}
