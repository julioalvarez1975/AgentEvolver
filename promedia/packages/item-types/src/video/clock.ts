import type { MediaClock } from "@promedia/shared";
import { effectiveMediaClockPositionMs } from "@promedia/shared";

export const MEDIA_CLOCK_DRIFT_MS = 400;

/**
 * Hub mediaClock extrapolates from Go Live even while Output is still mounting
 * the YouTube iframe or autoplay is blocked. If the player is still at the
 * head and the last *explicit* seek was 0 (no operator scrub), snap back to 0
 * so the audible theme start lines up with cue intro-hold — not mid-track.
 */
export const MEDIA_CLOCK_COLD_START_MS = 1500;

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

/**
 * True when Output audio is about to start at t≈0 but the hub clock already
 * ran ahead during handoff / autoplay block (explicit position still 0).
 */
export function shouldSnapMediaClockToStart(
  localPositionMs: number,
  clock: MediaClock,
  nowMs: number = Date.now(),
): boolean {
  if (!clock.playing) {
    return false;
  }
  // Operator scrubbed / seeked away from the head — honor that position.
  if (clock.positionMs > MEDIA_CLOCK_COLD_START_MS) {
    return false;
  }
  if (localPositionMs > MEDIA_CLOCK_COLD_START_MS) {
    return false;
  }
  return (
    effectiveMediaClockPositionMs(clock, nowMs) > MEDIA_CLOCK_COLD_START_MS
  );
}
