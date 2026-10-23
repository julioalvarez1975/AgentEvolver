import type { MediaClock } from "@promedia/shared";
import { effectiveMediaClockPositionMs } from "@promedia/shared";

export const MEDIA_CLOCK_DRIFT_MS = 400;

export function shouldCorrectSeek(
  localPositionMs: number,
  clock: MediaClock,
  nowMs: number = Date.now(),
): { seek: boolean; targetMs: number } {
  const targetMs = effectiveMediaClockPositionMs(clock, nowMs);
  return {
    seek: Math.abs(localPositionMs - targetMs) > MEDIA_CLOCK_DRIFT_MS,
    targetMs,
  };
}
