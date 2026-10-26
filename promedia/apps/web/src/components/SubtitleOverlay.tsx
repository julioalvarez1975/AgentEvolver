import { useEffect, useMemo, useState } from "react";
import { FittedTextStage } from "@promedia/item-types";
import type { MediaClock, SubtitleAgentState } from "@promedia/shared";
import {
  cueAtPositionWithLeadMs,
  effectiveMediaClockPositionMs,
  emptySubtitleAgentState,
  isSubtitleFontSize,
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
 * Upper-stage projection captions (cancionero look via FittedTextStage).
 * Timing prefers hub mediaClock; `leadMs` shows the cue early so the line is
 * readable before it is sung. Manual ←/→ song slides do not use this path.
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

  if (!cue?.text) {
    return null;
  }

  const lines = cue.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const displayLines = lines.length > 0 ? lines : [cue.text];

  return (
    <div
      className="subtitle-overlay"
      data-size={fontSize}
      aria-live="polite"
    >
      <FittedTextStage
        lines={displayLines}
        lineKey={`${cue.id}-${cue.startMs}`}
        className="subtitle-overlay-fit text-output"
        lineClassName="text-output-line"
      />
    </div>
  );
}
