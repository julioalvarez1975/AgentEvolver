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
  LYRIC_OVERLAY_PREFERRED_LINES,
  LYRIC_PHRASE_SOFT_WRAP_CHARS,
  normalizeSubtitleLeadMs,
  softWrapProjectionLine,
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
 * With ≤2–3 lines, heightFrac/hardCap lean larger so type fills the stage.
 */
const SUBTITLE_FIT_BY_SIZE: Record<
  SubtitleFontSize,
  { heightFrac: number; hardCapPx: number }
> = {
  sm: { heightFrac: 0.42, hardCapPx: 200 },
  md: { heightFrac: 0.5, hardCapPx: 240 },
  lg: { heightFrac: 0.58, hardCapPx: 280 },
  xl: { heightFrac: 0.68, hardCapPx: 320 },
};

/**
 * Prefer ≤2 visual rows; absolute max 3. Cancionero exact newlines win when
 * present (sliced only if over the hard max). Soft-wrap widens the char
 * budget before spilling past preferred / max so FittedTextStage stays large.
 */
function lyricOverlayDisplayLines(raw: string): string[] {
  const exact = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (exact.length > 1) {
    return exact.slice(0, LYRIC_OVERLAY_MAX_LINES);
  }
  const single = (exact[0] ?? String(raw ?? "").trim()).trim();
  if (!single) {
    return ["\u00a0"];
  }

  const tryBudget = (budget: number) =>
    softWrapProjectionLine(single, Math.max(12, Math.trunc(budget)));

  let rows = tryBudget(LYRIC_PHRASE_SOFT_WRAP_CHARS);
  if (rows.length <= LYRIC_OVERLAY_PREFERRED_LINES) {
    return rows;
  }

  // Widen wrap so a long cue lands in preferred (2) rows when possible.
  rows = tryBudget(
    Math.max(
      LYRIC_PHRASE_SOFT_WRAP_CHARS,
      Math.ceil(single.length / LYRIC_OVERLAY_PREFERRED_LINES),
    ),
  );
  if (rows.length <= LYRIC_OVERLAY_PREFERRED_LINES) {
    return rows;
  }

  // Absolute max 3 — force-fit before FittedTextStage hard-caps.
  rows = tryBudget(
    Math.max(12, Math.ceil(single.length / LYRIC_OVERLAY_MAX_LINES)),
  );
  return rows.slice(0, LYRIC_OVERLAY_MAX_LINES);
}

/**
 * Full-stage lyric projection (cancionero look via FittedTextStage).
 * Prefer 2 short phrases (absolute max 3), largest type that fits (no
 * overflow), theme shadow, centered H+V on the stage. Timing prefers hub
 * mediaClock; negative `leadMs` (adelante) shows the cue early. Assisted
 * timingMode holds the first lyric through musical lead-in; exact (native
 * captions / cancionero) uses cue windows only. Manual ←/→ song slides do
 * not use this path.
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
    // Prefer exact cue newlines (cancionero Biblioteca lines). Soft-wrap only
    // when a single source line has no breaks — prefer 2 rows, hard max 3.
    return lyricOverlayDisplayLines(cue.text);
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
