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
  LYRIC_OVERLAY_MAX_LINES,
  LYRIC_PHRASE_SOFT_WRAP_CHARS,
  normalizeProjectionLines,
  normalizeSubtitleLeadMs,
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

/**
 * SM–XL biases fit toward song-stage size (full-bleed FittedTextStage).
 * Band is the full stage; heightFrac/hardCap match canciones, XL a bit larger.
 */
const SUBTITLE_FIT_BY_SIZE: Record<
  SubtitleFontSize,
  { heightFrac: number; hardCapPx: number }
> = {
  sm: { heightFrac: 0.36, hardCapPx: 180 },
  md: { heightFrac: 0.44, hardCapPx: 220 },
  lg: { heightFrac: 0.52, hardCapPx: 260 },
  xl: { heightFrac: 0.6, hardCapPx: 300 },
};

/**
 * Full-stage lyric projection (cancionero look via FittedTextStage).
 * Soft-wrap ≤6 short phrases, largest type that fits (no overflow), theme
 * shadow, centered H+V on the stage. Timing prefers hub mediaClock; negative
 * `leadMs` (adelante) shows the cue early. Assisted timingMode holds the first
 * lyric through musical lead-in; exact (native captions) uses cue windows only.
 * Manual ←/→ song slides do not use this path.
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
  const holdIntro = state.timingMode !== "exact";
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

    return cueAtPositionWithLeadMs(state.cues, positionMs, leadMs, {
      holdIntro,
    });
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
    holdIntro,
  ]);

  const displayLines = useMemo(() => {
    if (!cue?.text) {
      return null;
    }
    const lines = normalizeProjectionLines(
      [cue.text],
      LYRIC_PHRASE_SOFT_WRAP_CHARS,
    ).slice(0, LYRIC_OVERLAY_MAX_LINES);
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
        maxLines={LYRIC_OVERLAY_MAX_LINES}
      />
    </div>
  );
}
