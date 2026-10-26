import { useLayoutEffect, useRef, useState } from "react";
import { TEXT_PROJECTION_LINES } from "@promedia/shared";

export type FittedTextStageProps = {
  lines: string[];
  /** Stable key for the current slide (re-fit when it changes). */
  lineKey: string;
  className?: string;
  lineClassName?: string;
};

/** Soft text-shadow can bleed a few px past glyph bounds. */
const WIDTH_SAFETY_PX = 4;

type WrapMode = "nowrap" | "wrap";

function contentBoxSize(el: HTMLElement): { width: number; height: number } {
  const style = getComputedStyle(el);
  const pl = parseFloat(style.paddingLeft) || 0;
  const pr = parseFloat(style.paddingRight) || 0;
  const pt = parseFloat(style.paddingTop) || 0;
  const pb = parseFloat(style.paddingBottom) || 0;
  return {
    width: Math.max(0, el.clientWidth - pl - pr),
    height: Math.max(0, el.clientHeight - pt - pb),
  };
}

/** True when every line's full glyph width fits in `maxWidth`. */
function linesFitWidth(block: HTMLElement, maxWidth: number): boolean {
  const limit = maxWidth + 1;
  for (const child of Array.from(block.children)) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    // scrollWidth includes overflowing glyphs even if CSS clips them.
    if (child.scrollWidth > limit) {
      return false;
    }
  }
  if (block.scrollWidth > limit) {
    return false;
  }
  return true;
}

/** Count CSS line boxes across children (for wrap mode ≤5 visual rows). */
function visualLineCount(block: HTMLElement): number {
  let total = 0;
  for (const child of Array.from(block.children)) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    const rects = child.getClientRects();
    if (rects.length === 0) {
      total += 1;
      continue;
    }
    const tops: number[] = [];
    for (let i = 0; i < rects.length; i += 1) {
      const top = Math.round(rects[i]!.top);
      if (!tops.some((t) => Math.abs(t - top) <= 1)) {
        tops.push(top);
      }
    }
    total += Math.max(1, tops.length);
  }
  return total;
}

/**
 * Projection text block: ≤5 rows, font auto-fit via ResizeObserver so the
 * block fills the stage. Width (content box + padding/safe area) always wins
 * over growing as large as possible. Long unbreakable words may wrap, still
 * capped at 5 visual lines.
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
  const [wrapMode, setWrapMode] = useState<WrapMode>("nowrap");

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

    const applyMode = (mode: WrapMode) => {
      block.dataset.wrapMode = mode;
    };

    const measure = () => {
      const { width: contentW, height: contentH } = contentBoxSize(shell);
      if (contentW < 8 || contentH < 8) {
        return;
      }

      // Stage content box already excludes padding; extra px for shadow bleed.
      const availW = Math.max(8, contentW - WIDTH_SAFETY_PX);
      const availH = contentH;

      const minPx = 10;
      const maxPx = Math.max(
        minPx,
        Math.min(availH * 0.4, availW * 0.22, 220),
      );

      const binarySearch = (mode: WrapMode): number => {
        applyMode(mode);
        let lo = minPx;
        let hi = maxPx;
        let best = minPx;

        for (let i = 0; i < 18; i += 1) {
          const mid = (lo + hi) / 2;
          block.style.fontSize = `${mid}px`;
          void block.offsetHeight;

          const widthOk = linesFitWidth(block, availW);
          const heightOk = block.scrollHeight <= availH + 1;
          const linesOk =
            mode === "nowrap" ||
            visualLineCount(block) <= TEXT_PROJECTION_LINES;

          // Width is mandatory; height + visual-line cap apply as well.
          if (widthOk && heightOk && linesOk) {
            best = mid;
            lo = mid;
          } else {
            hi = mid;
          }
        }

        return best;
      };

      // Prefer one source line = one nowrap row (soft-split upstream).
      let best = binarySearch("nowrap");
      let mode: WrapMode = "nowrap";

      applyMode("nowrap");
      block.style.fontSize = `${best}px`;
      void block.offsetHeight;

      // Long unbreakable tokens: wrap + shrink so nothing clips mid-glyph.
      if (!linesFitWidth(block, availW)) {
        mode = "wrap";
        best = binarySearch("wrap");
      }

      applyMode(mode);
      block.style.fontSize = `${best}px`;
      setWrapMode(mode);
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
        data-wrap-mode={wrapMode}
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
