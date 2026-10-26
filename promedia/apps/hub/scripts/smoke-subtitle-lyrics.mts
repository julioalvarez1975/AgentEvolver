/**
 * Smoke: non-speech cue filter + YouTube caption name/rank helpers.
 * Usage: pnpm --filter @promedia/hub exec tsx scripts/smoke-subtitle-lyrics.mts
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  cleanCueText,
  filterSpeechCues,
  isNonSpeechCueText,
  speechCueRatio,
} from "../src/subtitle-cue-text.ts";
import { ensureSubtitleDirs } from "../src/subtitle-paths.ts";
import {
  findYoutubeCaptionFiles,
  rankYoutubeCaptionLang,
  youtubeCaptionLangFromName,
} from "../src/subtitle-youtube.ts";
import { parseWhisperCppVttOrSrt } from "../src/subtitle-whisper-cpp.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main(): Promise<void> {
  assert(isNonSpeechCueText("[MUSIC]"), "MUSIC label");
  assert(isNonSpeechCueText("[MÚSICA]"), "MÚSICA label");
  assert(isNonSpeechCueText("(music)"), "paren music");
  assert(isNonSpeechCueText("♪♪"), "glyph only");
  assert(isNonSpeechCueText("  [ Blank_Audio ]  "), "blank audio");
  assert(!isNonSpeechCueText("The club isn't the best place to find a lover"), "lyric");
  assert(
    !isNonSpeechCueText("♪ The club isn't the best place ♪"),
    "lyric with music glyphs",
  );

  const filtered = filterSpeechCues([
    { id: "a", startMs: 0, endMs: 1000, text: "[MUSIC]" },
    { id: "b", startMs: 1000, endMs: 2000, text: "  Hello world  " },
    { id: "c", startMs: 2000, endMs: 3000, text: "[MÚSICA]" },
    { id: "d", startMs: 3000, endMs: 4000, text: "Shape of you" },
  ]);
  assert(filtered.length === 2, `expected 2 speech cues, got ${filtered.length}`);
  assert(filtered[0]!.text === "Hello world", "clean first lyric");
  assert(filtered[1]!.text === "Shape of you", "second lyric");
  assert(filtered[0]!.id === "c0" && filtered[1]!.id === "c1", "re-id");

  assert(speechCueRatio([{ id: "x", startMs: 0, endMs: 1, text: "[MUSIC]" }]) === 0, "ratio 0");
  assert(
    speechCueRatio([
      { id: "x", startMs: 0, endMs: 1, text: "[MUSIC]" },
      { id: "y", startMs: 1, endMs: 2, text: "hi" },
    ]) === 0.5,
    "ratio 0.5",
  );

  const cleaned = cleanCueText("<c>Hello</c> &amp; <b>you</b>");
  assert(cleaned === "Hello & you", `vtt cleanup: ${cleaned}`);

  const vtt = `WEBVTT

00:00:00.000 --> 00:00:02.000
[MUSIC]

00:00:02.000 --> 00:00:04.000
The club isn't the best place to find a lover

00:00:04.000 --> 00:00:06.000
[MÚSICA]
`;
  const parsed = filterSpeechCues(parseWhisperCppVttOrSrt(vtt));
  assert(parsed.length === 1, `vtt filter expected 1, got ${parsed.length}`);
  assert(
    parsed[0]!.text.includes("club isn't the best"),
    `unexpected lyric: ${parsed[0]?.text}`,
  );

  assert(
    youtubeCaptionLangFromName("JGw1FRCpL94", "JGw1FRCpL94.en.vtt") === "en",
    "en.vtt lang",
  );
  assert(
    youtubeCaptionLangFromName("JGw1FRCpL94", "JGw1FRCpL94.es-ES.vtt") ===
      "es-es",
    "es-ES lang",
  );
  assert(
    youtubeCaptionLangFromName("JGw1FRCpL94", "JGw1FRCpL94.wav") === null,
    "wav not caption",
  );
  assert(
    rankYoutubeCaptionLang("es", ["es", "en"]) <
      rankYoutubeCaptionLang("en", ["es", "en"]),
    "prefer es over en when target es",
  );

  const dirs = await ensureSubtitleDirs();
  const id = "smokeCap01";
  const enPath = path.join(dirs.youtubeCache, `${id}.en.vtt`);
  const esPath = path.join(dirs.youtubeCache, `${id}.es.vtt`);
  await mkdir(dirs.youtubeCache, { recursive: true });
  await writeFile(
    enPath,
    `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nEnglish line\n`,
  );
  await writeFile(
    esPath,
    `WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nLínea en español\n`,
  );
  const found = await findYoutubeCaptionFiles(dirs.youtubeCache, id, [
    "es",
    "en",
  ]);
  assert(found.length >= 2, "expected both caption files");
  assert(found[0]!.lang === "es", `prefer es first, got ${found[0]?.lang}`);
  await rm(enPath, { force: true });
  await rm(esPath, { force: true });

  console.log("SMOKE_OK");
}

main().catch((err) => {
  console.error("[smoke-subtitle-lyrics] FAILED:", err);
  process.exit(1);
});
