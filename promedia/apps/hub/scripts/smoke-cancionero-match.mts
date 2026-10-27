/**
 * Smoke: cancionero title normalize / match / cue synthesis.
 * Usage: pnpm --filter @promedia/hub exec tsx scripts/smoke-cancionero-match.mts
 */
import type { LibrarySongPayload } from "@promedia/shared";
import { cueAtPositionWithLeadMs } from "@promedia/shared";
import {
  normalizeMatchTitle,
  scoreSongMatch,
  songLyricChunks,
  songToSubtitleCues,
  titleFromAudioFilename,
  titleVariants,
} from "../src/subtitle-cancionero.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const song: LibrarySongPayload = {
  title: "Cuán grande es Él",
  artist: "Tradicional",
  stanzas: [
    {
      id: "s1",
      lines: ["Señor mi Dios", "al contemplar los cielos", "te adoro a Ti"],
    },
    {
      id: "s2",
      lines: ["Cuán grande es Él", "Cuán grande es Él"],
    },
  ],
};

assert(
  normalizeMatchTitle("Cuán grande es Él (Official Video).mp3") ===
    "cuán grande es él",
  "normalize strips junk+ext",
);
assert(
  titleFromAudioFilename("Mi Cancion.m4a") === "Mi Cancion",
  "audio filename strip",
);
assert(
  titleVariants("Artist - Song Title").includes("song title"),
  "title variants split",
);

const exact = scoreSongMatch(
  song,
  "Cuán grande es Él",
  "Tradicional",
);
assert(exact >= 100, `exact+artist score got ${exact}`);

const ytLike = scoreSongMatch(
  song,
  "Cuán Grande Es Él | Official Lyric Video",
);
assert(ytLike >= 70, `youtube-like title score got ${ytLike}`);

const miss = scoreSongMatch(song, "Shape of You");
assert(miss < 55, `unrelated should miss, got ${miss}`);

const chunks = songLyricChunks(song);
assert(chunks.length >= 2, `expected ≥2 chunks, got ${chunks.length}`);
assert(chunks[0]!.includes("Señor mi Dios"), "first chunk lyric");

const cues = songToSubtitleCues(song, 120_000);
assert(cues.length === chunks.length, "cue count = chunks");
assert(cues[0]!.startMs >= 0, "first start ≥ 0");
assert(cues[cues.length - 1]!.endMs >= 100_000, "last end near duration");
assert(
  cues.every((c) => c.text.trim().length > 0),
  "all cues have text",
);

const held = cueAtPositionWithLeadMs(cues, 500, 0, { holdIntro: true });
assert(held?.text === cues[0]!.text, "assisted intro-hold shows first verse");

console.log("SMOKE_OK cancionero-match");
