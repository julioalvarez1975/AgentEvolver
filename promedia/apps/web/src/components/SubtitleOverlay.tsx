import { useEffect, useState } from "react";
import type { MediaClock, SubtitleAgentState } from "@promedia/shared";
import {
  cueAtPositionMs,
  effectiveMediaClockPositionMs,
  emptySubtitleAgentState,
  isSubtitleFontSize,
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
 * Bottom-centered captions for Vista previa + Output.
 * Timing prefers hub mediaClock so both surfaces show the same cue.
 */
export function SubtitleOverlay({
  agent,
  mediaClock,
  localPositionMs,
  itemId,
}: SubtitleOverlayProps) {
  const state = agent ?? emptySubtitleAgentState();
  const fontSize = isSubtitleFontSize(state.fontSize) ? state.fontSize : "md";
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
  } else if (typeof localPositionMs === "number" && Number.isFinite(localPositionMs)) {
    positionMs = localPositionMs;
  } else if (mediaClock) {
    positionMs = effectiveMediaClockPositionMs(mediaClock, nowMs);
  } else {
    return null;
  }

  const cue = cueAtPositionMs(state.cues, positionMs);
  if (!cue?.text) {
    return null;
  }

  return (
    <div
      className="subtitle-overlay"
      data-size={fontSize}
      aria-live="polite"
    >
      <p className="subtitle-overlay-line">{cue.text}</p>
    </div>
  );
}
