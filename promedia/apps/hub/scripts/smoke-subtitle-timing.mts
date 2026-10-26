/**
 * Smoke: cue intro-hold + Adelante lead + mediaClock cold-start snap.
 * Usage: pnpm --filter @promedia/hub exec tsx scripts/smoke-subtitle-timing.mts
 */
import {
  cueAtPositionWithLeadMs,
  effectiveMediaClockPositionMs,
  type MediaClock,
  type SubtitleCue,
} from "@promedia/shared";
import { shouldSnapMediaClockToStart } from "@promedia/item-types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const cues: SubtitleCue[] = [
  { id: "c0", startMs: 12_000, endMs: 15_000, text: "Primera letra" },
  { id: "c1", startMs: 15_000, endMs: 18_000, text: "Segunda letra" },
];

function main(): void {
  // At theme start (t=0), first lyric must already be visible (cancionero).
  const atStart = cueAtPositionWithLeadMs(cues, 0, 0);
  assert(atStart?.text === "Primera letra", `intro hold @0: ${atStart?.text}`);

  // Adelante −2s: still hold first line at t=0; natural window opens earlier.
  const withLead = cueAtPositionWithLeadMs(cues, 0, -2000);
  assert(withLead?.text === "Primera letra", "intro hold with Adelante −2");

  // Inside first cue window (no lead).
  const midFirst = cueAtPositionWithLeadMs(cues, 13_000, 0);
  assert(midFirst?.text === "Primera letra", "mid first cue");

  // After first cue ends, before second — gap stays blank (no fill-forward).
  const gap = cueAtPositionWithLeadMs(cues, 15_500, 0);
  // 15500 is inside c1 (15000–18000)
  assert(gap?.text === "Segunda letra", `second cue: ${gap?.text}`);
  const trueGap = cueAtPositionWithLeadMs(
    [
      cues[0]!,
      { id: "c1", startMs: 16_000, endMs: 18_000, text: "Segunda letra" },
    ],
    15_500,
    0,
  );
  assert(trueGap === null, "gap after first stays blank");

  // Adelante −2 advances into second cue at position 13s → lookup 15s.
  const earlySecond = cueAtPositionWithLeadMs(cues, 13_000, -2000);
  assert(
    earlySecond?.text === "Segunda letra",
    `Adelante into second: ${earlySecond?.text}`,
  );

  // Cold-start snap: hub extrapolated from explicit 0 while player still at head.
  const now = Date.now();
  const clock: MediaClock = {
    itemId: "item1",
    playing: true,
    positionMs: 0,
    rate: 1,
    updatedAt: new Date(now - 8_000).toISOString(),
  };
  assert(
    effectiveMediaClockPositionMs(clock, now) >= 7_500,
    "clock extrapolated",
  );
  assert(
    shouldSnapMediaClockToStart(0, clock, now) === true,
    "snap when player at 0 and clock ran ahead",
  );
  assert(
    shouldSnapMediaClockToStart(0, { ...clock, positionMs: 60_000 }, now) ===
      false,
    "no snap after operator scrub",
  );
  assert(
    shouldSnapMediaClockToStart(20_000, clock, now) === false,
    "no snap when player already past head",
  );

  console.log("SMOKE_OK smoke-subtitle-timing");
}

main();
