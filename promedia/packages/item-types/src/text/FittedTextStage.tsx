import { useLayoutEffect, useRef, useState } from "react";
import { TEXT_PROJECTION_LINES } from "@promedia/shared";

export type FittedTextStageProps = {
  lines: string[];
  /** Stable key for the current slide (re-fit when it changes). */
  lineKey: string;
  className?: string;
  lineClassName?: string;
};

/**
 * Projection text block: ≤5 rows, font auto-fit via ResizeObserver so the
 * block fills nearly the full stage (width/height). Each source line is one
 * nowrap row — long lines are soft-split earlier in projectionTextSlides.
 */
export function FittedTextStage({
  lines,
  lineKey,
  className = "text-output",
  lineClassName = "text-output-line",
}: FittedTextStageProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  const [fontPx, setFontPx] = useState(28);

  const safeLines = lines
    .map((line) => String(line))
    .slice(0, TEXT_PROJECTION_LINES);
  const displayLines = safeLines.length > 0 ? safeLines : [""];
  const linesSignature = displayLines.join("\n");

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const block = blockRef.current;
    if (!shell || !block) {
      return;
    }

    const measure = () => {
      const width = shell.clientWidth;
      const height = shell.clientHeight;
      if (width < 8 || height < 8) {
        return;
      }

      const minPx = 10;
      const maxPx = Math.max(
        minPx,
        Math.min(height * 0.4, width * 0.22, 220),
      );

      let lo = minPx;
      let hi = maxPx;
      let best = minPx;

      for (let i = 0; i < 18; i += 1) {
        const mid = (lo + hi) / 2;
        block.style.fontSize = `${mid}px`;
        const fits =
          block.scrollWidth <= width + 1 && block.scrollHeight <= height + 1;
        if (fits) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }

      block.style.fontSize = `${best}px`;
      setFontPx(best);
    };

    measure();
    const ro = new ResizeObserver(() => {
      measure();
    });
    ro.observe(shell);
    return () => ro.disconnect();
  }, [linesSignature, lineKey]);

  return (
    <div
      ref={shellRef}
      className={className}
      data-line-count={displayLines.length}
    >
      <div
        ref={blockRef}
        className="text-fit-block"
        style={{ fontSize: `${fontPx}px` }}
      >
        {displayLines.map((line, i) => (
          <p key={`${lineKey}-${i}`} className={lineClassName}>
            {line || "\u00a0"}
          </p>
        ))}
      </div>
    </div>
  );
}
