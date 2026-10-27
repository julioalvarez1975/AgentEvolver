/**
 * Smoke: cancionero title normalize / match / phrase cues / −1s lead.
 * Usage: pnpm --filter @promedia/hub exec tsx scripts/smoke-cancionero-match.mts
 */
import type { LibrarySongPayload } from "@promedia/shared";
import {
  CANCIONERO_DEFAULT_LEAD_MS,
  cueAtPositionWithLeadMs,
  LYRIC_OVERLAY_MAX_LINES,
} from "@promedia/shared";
import {
  normalizeMatchTitle,
  scoreSongMatch,
  songLyricChunks,
  songLyricPhrases,
  songToSubtitleCues,
  splitLyricPhrases,
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

const longLine =
  "Señor mi Dios, al contemplar los cielos, el firmamento y las estrellas mil, ¿qué es el hombre para que tú lo cuides?";
const phrases = splitLyricPhrases(longLine);
assert(phrases.length >= 2, `long sentence → phrases, got ${phrases.length}`);
assert(
  phrases.every((p) => p.length <= 48),
  `phrases should be short, got ${JSON.stringify(phrases)}`,
);

const flat = songLyricPhrases(song);
assert(flat.length >= 5, `expected ≥5 phrases, got ${flat.length}`);

const chunks = songLyricChunks(song);
assert(chunks.length >= 2, `expected ≥2 chunks, got ${chunks.length}`);
assert(chunks[0]!.includes("Señor mi Dios"), "first chunk lyric");
assert(
  chunks.every(
    (c) => c.split("\n").filter(Boolean).length <= LYRIC_OVERLAY_MAX_LINES,
  ),
  "chunks ≤6 lines",
);

const runOnSong: LibrarySongPayload = {
  title: "Run on",
  stanzas: [{ id: "r1", lines: [longLine] }],
};
const runChunks = songLyricChunks(runOnSong);
assert(runChunks.length >= 1, "run-on yields chunks");
assert(
  runChunks.every(
    (c) => c.split("\n").filter(Boolean).length <= LYRIC_OVERLAY_MAX_LINES,
  ),
  "run-on chunks ≤6 lines",
);
assert(
  runChunks.some((c) => c.includes("\n") || c.length <= 48),
  "run-on split into short phrases",
);

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

assert(CANCIONERO_DEFAULT_LEAD_MS === -1000, "cancionero default lead −1s");
const early = cueAtPositionWithLeadMs(
  cues,
  Math.max(0, cues[0]!.startMs - 500),
  CANCIONERO_DEFAULT_LEAD_MS,
  { holdIntro: true },
);
assert(early?.text === cues[0]!.text, "−1s lead shows first lyric early");

console.log("SMOKE_OK cancionero-match");
