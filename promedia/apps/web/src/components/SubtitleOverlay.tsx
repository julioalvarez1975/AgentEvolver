import { useEffect, useMemo, useState } from "react";
import { FittedTextStage } from "@promedia/item-types";
import type {
  MediaClock,
  SubtitleAgentState,
  SubtitleFontSize,
} from "@promedia/shared";
import {
  cueAtPositionWithLeadMs,
  effectiveMediaClockPositionMs,
  emptySubtitleAgentState,
  isSubtitleFontSize,
  normalizeProjectionLines,
  normalizeSubtitleLeadMs,
  TEXT_PROJECTION_LINES,
} from "@promedia/shared";

export type SubtitleOverlayProps = {
  agent: SubtitleAgentState | null | undefined;
  /** Hub mediaClock when the shown item is live; drives sync Preview↔Output. */
  mediaClock: MediaClock | null | undefined;
  /**
   * When Preview is not projecting, pass the local <video> currentTime in ms
   * so captions still track scrubbing before Go Live.
   */
  localPositionMs?: number | null;
  /** Only render cues when this matches agent.itemId (or agent has cues for it). */
  itemId?: string | null;
};

/** SM–XL biases fit target; band height still scales via CSS data-size. */
const SUBTITLE_FIT_BY_SIZE: Record<
  SubtitleFontSize,
  { heightFrac: number; hardCapPx: number }
> = {
  sm: { heightFrac: 0.32, hardCapPx: 120 },
  md: { heightFrac: 0.4, hardCapPx: 160 },
  lg: { heightFrac: 0.48, hardCapPx: 200 },
  xl: { heightFrac: 0.56, hardCapPx: 240 },
};

/**
 * Upper-stage projection captions (cancionero look via FittedTextStage).
 * Soft-wrap ≤5 lines, largest type that fits (no width overflow), theme shadow,
 * centered H+V inside the upper band. Timing prefers hub mediaClock; negative
 * `leadMs` (adelante) shows the cue early; intro-hold keeps the first lyric on
 * screen from media start through any musical lead-in. Manual ←/→ song slides
 * do not use this path.
 */
export function SubtitleOverlay({
  agent,
  mediaClock,
  localPositionMs,
  itemId,
}: SubtitleOverlayProps) {
  const state = agent ?? emptySubtitleAgentState();
  const fontSize = isSubtitleFontSize(state.fontSize) ? state.fontSize : "md";
  const leadMs = normalizeSubtitleLeadMs(state.leadMs);
  const fit = SUBTITLE_FIT_BY_SIZE[fontSize];
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!state.enabled || state.status !== "ready" || !state.cues.length) {
      return;
    }
    if (mediaClock?.playing) {
      const id = window.setInterval(() => setNowMs(Date.now()), 200);
      return () => window.clearInterval(id);
    }
    setNowMs(Date.now());
    return undefined;
  }, [state.enabled, state.status, state.cues.length, mediaClock?.playing, mediaClock?.updatedAt]);

  const cue = useMemo(() => {
    if (!state.enabled) {
      return null;
    }
    if (itemId && state.itemId && state.itemId !== itemId) {
      return null;
    }
    if (state.status !== "ready" || !state.cues.length) {
      return null;
    }

    let positionMs: number;
    if (mediaClock && (!itemId || mediaClock.itemId === itemId)) {
      positionMs = effectiveMediaClockPositionMs(mediaClock, nowMs);
    } else if (
      typeof localPositionMs === "number" &&
      Number.isFinite(localPositionMs)
    ) {
      positionMs = localPositionMs;
    } else if (mediaClock) {
      positionMs = effectiveMediaClockPositionMs(mediaClock, nowMs);
    } else {
      return null;
    }

    return cueAtPositionWithLeadMs(state.cues, positionMs, leadMs);
  }, [
    state.enabled,
    state.itemId,
    state.status,
    state.cues,
    itemId,
    mediaClock,
    localPositionMs,
    nowMs,
    leadMs,
  ]);

  const displayLines = useMemo(() => {
    if (!cue?.text) {
      return null;
    }
    const lines = normalizeProjectionLines([cue.text]).slice(
      0,
      TEXT_PROJECTION_LINES,
    );
    return lines.length > 0 ? lines : [cue.text.trim() || "\u00a0"];
  }, [cue?.text]);

  if (!cue?.text || !displayLines) {
    return null;
  }

  return (
    <div
      className="subtitle-overlay"
      data-size={fontSize}
      aria-live="polite"
    >
      <FittedTextStage
        lines={displayLines}
        lineKey={`${cue.id}-${cue.startMs}-${fontSize}`}
        className="subtitle-overlay-fit text-output"
        lineClassName="text-output-line"
        heightFrac={fit.heightFrac}
        hardCapPx={fit.hardCapPx}
      />
    </div>
  );
}
