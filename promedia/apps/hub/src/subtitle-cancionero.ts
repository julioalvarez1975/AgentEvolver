/**
 * Cancionero / Biblioteca lyric match for Guion Audio + YouTube.
 * Source of truth for this path — no Whisper/Marian.
 */
import { spawn } from "node:child_process";
import type {
  LibraryItem,
  LibrarySongPayload,
  SubtitleCue,
} from "@promedia/shared";
import {
  ensureAugmentedPath,
  resolveFfmpegBin,
} from "./subtitle-bins.js";
import { cleanCueText, filterSpeechCues } from "./subtitle-cue-text.js";

const AUDIO_EXT_RE =
  /\.(mp3|wav|m4a|aac|flac|ogg|opus|wma|aiff|aif|caf|webm)$/i;

/** Junk tokens often appended to YouTube titles / audio filenames. */
const TITLE_JUNK_RE =
  /\b(official\s*(music\s*)?video|official\s*audio|lyrics?\s*(video)?|lyric\s*video|audio\s*oficial|vídeo\s*oficial|video\s*oficial|letra|hd|4k|remaster(ed)?|live|cover|karaoke|instrumental|mv|visualizer|with\s*lyrics)\b/gi;

const FEAT_RE = /\s*[(\[]?\s*(feat\.?|ft\.?|with)\s+[^)\]]+[)\]]?/gi;

export type CancioneroMatchQuery = {
  /** Raw titles to try (filename, payload.title, yt fulltitle, …). */
  titles: string[];
  /** Optional artist / track hints from metadata. */
  artists?: string[];
};

export type CancioneroMatchHit = {
  ok: true;
  item: LibraryItem;
  song: LibrarySongPayload;
  score: number;
  matchedQuery: string;
};

export type CancioneroMatchMiss = {
  ok: false;
  reason: "no_songs" | "no_query" | "no_match";
  tried: string[];
};

export type CancioneroMatchResult = CancioneroMatchHit | CancioneroMatchMiss;

/**
 * Fold a media title / filename into a matchable song title.
 * Strips extension, feat/junk parentheticals, punctuation; lowercases.
 */
export function normalizeMatchTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim();
  if (!s) return "";
  // Basename only if a path slipped in.
  const slash = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  if (slash >= 0) s = s.slice(slash + 1);
  s = s.replace(AUDIO_EXT_RE, "");
  // Drop YouTube trailing " - Topic" / " | Artist" noise carefully later.
  s = s.replace(FEAT_RE, " ");
  s = s.replace(TITLE_JUNK_RE, " ");
  // Drop bracketed leftover tags: (Official), [HD], …
  s = s.replace(/[(\[{][^)\]}]*[)\]}]/g, " ");
  // Separators → space
  s = s.replace(/[_|/·•]+/g, " ");
  // Strip punctuation except letters/digits/spaces (keep accented letters).
  s = s.replace(/[^\p{L}\p{N}\s]+/gu, " ");
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}

/** Split "Title - Artist" / "Artist - Title" style strings into candidates. */
export function titleVariants(raw: string | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: string) => {
    const n = normalizeMatchTitle(v);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };
  if (!raw?.trim()) return out;
  push(raw);
  const parts = String(raw)
    .split(/\s+[-–—]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 2) {
    push(parts[0]!);
    push(parts[1]!);
  } else if (parts.length > 2) {
    push(parts[0]!);
    push(parts.slice(1).join(" - "));
  }
  return out;
}

function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Score how well a library song matches a query title (+ optional artist).
 * Higher is better; 0 = no usable match.
 */
export function scoreSongMatch(
  song: LibrarySongPayload,
  queryTitle: string,
  queryArtist?: string,
): number {
  const q = normalizeMatchTitle(queryTitle);
  if (!q || q.length < 2) return 0;
  const songTitle = normalizeMatchTitle(song.title);
  if (!songTitle) return 0;
  const songArtist = normalizeMatchTitle(song.artist ?? "");
  const qArtist = normalizeMatchTitle(queryArtist ?? "");

  let score = 0;

  if (songTitle === q) {
    score = 100;
  } else if (songTitle.includes(q) || q.includes(songTitle)) {
    const shorter = Math.min(songTitle.length, q.length);
    const longer = Math.max(songTitle.length, q.length);
    // Prefer near-equal contains (avoid "a" matching everything).
    if (shorter >= 4 && shorter / longer >= 0.45) {
      score = 70 + Math.round(20 * (shorter / longer));
    }
  } else {
    const jac = jaccard(tokenSet(songTitle), tokenSet(q));
    if (jac >= 0.55) {
      score = Math.round(40 + jac * 40);
    } else if (jac >= 0.4 && Math.min(tokenSet(songTitle).size, tokenSet(q).size) >= 2) {
      score = Math.round(25 + jac * 30);
    }
  }

  if (score <= 0) return 0;

  // Artist bonus / slight penalty.
  if (qArtist && songArtist) {
    if (songArtist === qArtist || songArtist.includes(qArtist) || qArtist.includes(songArtist)) {
      score += 15;
    } else if (jaccard(tokenSet(songArtist), tokenSet(qArtist)) >= 0.5) {
      score += 8;
    }
  }

  return score;
}

/**
 * Find the best Biblioteca canción for the given media titles.
 * Threshold: score ≥ 55 to accept (exact / strong contains / solid token overlap).
 */
export async function findCancioneroSong(
  query: CancioneroMatchQuery,
): Promise<CancioneroMatchResult> {
  const tried: string[] = [];
  const titleSet = new Set<string>();
  for (const raw of query.titles) {
    for (const v of titleVariants(raw)) {
      titleSet.add(v);
      tried.push(v);
    }
  }
  const titles = [...titleSet];
  if (titles.length === 0) {
    return { ok: false, reason: "no_query", tried };
  }

  // Lazy import so pure match helpers (smoke) do not load the full hub graph.
  const { libraryStore } = await import("./library-store.js");
  const songs = await libraryStore.list({ category: "canciones" });
  const withSong = songs.filter((i) => i.song && i.song.title.trim());
  if (withSong.length === 0) {
    return { ok: false, reason: "no_songs", tried };
  }

  const artists = (query.artists ?? [])
    .map((a) => normalizeMatchTitle(a))
    .filter(Boolean);

  let best: CancioneroMatchHit | null = null;
  for (const item of withSong) {
    const song = item.song!;
    for (const q of titles) {
      // Try with and without each artist hint.
      const attempts: (string | undefined)[] =
        artists.length > 0 ? [...artists, undefined] : [undefined];
      for (const artist of attempts) {
        const score = scoreSongMatch(song, q, artist);
        if (score < 55) continue;
        if (!best || score > best.score) {
          best = {
            ok: true,
            item,
            song,
            score,
            matchedQuery: q,
          };
        }
      }
    }
  }

  if (!best) {
    return { ok: false, reason: "no_match", tried };
  }
  return best;
}

/**
 * Exact Biblioteca line breaks only — never re-merge or invent phrase splits.
 * Embedded newlines inside one stanza cell become separate lines; punctuation
 * does not create new cue boundaries.
 */
export function splitLyricPhrases(raw: string): string[] {
  return String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Ordered cancionero lines (stanza order). One Biblioteca line → one phrase.
 * Stanza boundaries are preserved as sequence order only (no cross-merge).
 */
export function songCancioneroLines(song: LibrarySongPayload): string[] {
  const out: string[] = [];
  const stanzas =
    song.stanzas.length > 0
      ? song.stanzas
      : [{ id: "empty", lines: [] as string[] }];
  for (const stanza of stanzas) {
    for (const line of stanza.lines ?? []) {
      out.push(...splitLyricPhrases(String(line)));
    }
  }
  return out;
}

/** @deprecated Prefer songCancioneroLines — same exact-line semantics. */
export function songLyricPhrases(song: LibrarySongPayload): string[] {
  return songCancioneroLines(song);
}

/**
 * One cue text per exact cancionero line (Biblioteca stanza/line breaks).
 * Does not pack/re-split lines into invented multi-line phrase chunks.
 */
export function songLyricChunks(song: LibrarySongPayload): string[] {
  return songCancioneroLines(song);
}

/** Fold text for lyric↔ASR alignment (accents stripped, lowercase). */
export function normalizeAlignText(raw: string): string {
  return cleanCueText(raw)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function alignTokens(raw: string): string[] {
  return normalizeAlignText(raw)
    .split(/\s+/)
    .filter((t) => t.length >= 1);
}

function tokenCoverage(needle: string[], hay: string[]): number {
  if (needle.length === 0 || hay.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const t of hay) counts.set(t, (counts.get(t) ?? 0) + 1);
  let hit = 0;
  for (const t of needle) {
    const n = counts.get(t) ?? 0;
    if (n > 0) {
      hit += 1;
      counts.set(t, n - 1);
    }
  }
  return hit / needle.length;
}

function lineTimingScore(lineTokens: string[], windowText: string): number {
  const hay = alignTokens(windowText);
  if (lineTokens.length === 0 || hay.length === 0) return 0;
  const coverage = tokenCoverage(lineTokens, hay);
  const jac =
    coverage === 0
      ? 0
      : tokenCoverage(hay, lineTokens); // reverse coverage dampens huge windows
  const contains =
    normalizeAlignText(windowText).includes(lineTokens.join(" ")) ||
    lineTokens.join(" ").includes(normalizeAlignText(windowText));
  return coverage * 0.7 + jac * 0.2 + (contains ? 0.15 : 0);
}

export type CancioneroAlignResult = {
  cues: SubtitleCue[];
  /** How many cancionero lines got a voice-matched start (not equal-time fill). */
  alignedCount: number;
  /** True when enough lines locked to voice timing to trust the sync. */
  synced: boolean;
};

/**
 * Map exact cancionero lines onto ASR/caption clocks.
 * Timing source text is used only for alignment — cue `.text` stays Biblioteca.
 */
export function alignCancioneroLinesToTiming(
  lines: readonly string[],
  timingCues: readonly SubtitleCue[],
  durationMs = 0,
): CancioneroAlignResult {
  const speech = filterSpeechCues([...timingCues]);
  const exactLines = lines.map((l) => String(l).trim()).filter(Boolean);
  if (exactLines.length === 0) {
    return { cues: [], alignedCount: 0, synced: false };
  }

  const total = Math.max(
    durationMs > 0 ? durationMs : 0,
    speech.length > 0 ? speech[speech.length - 1]!.endMs : 0,
    exactLines.length * 2_500,
  );

  if (speech.length === 0) {
    return {
      cues: cuesFromEqualTime(exactLines, total),
      alignedCount: 0,
      synced: false,
    };
  }

  const starts: number[] = new Array(exactLines.length).fill(-1);
  let cursor = 0;
  let alignedCount = 0;

  for (let li = 0; li < exactLines.length; li++) {
    const lineTok = alignTokens(exactLines[li]!);
    if (lineTok.length === 0) continue;

    let bestScore = 0;
    let bestStart = -1;
    let bestEndCursor = cursor;

    // Search a forward window; allow multi-cue spans for one hymn line.
    const searchEnd = Math.min(speech.length, cursor + 14);
    for (let i = cursor; i < searchEnd; i++) {
      let window = "";
      for (let j = i; j < Math.min(speech.length, i + 4); j++) {
        window = window ? `${window} ${speech[j]!.text}` : speech[j]!.text;
        const score = lineTimingScore(lineTok, window);
        // Prefer earlier windows when scores are close (don't race ahead).
        const earlierBonus = (searchEnd - i) * 0.001;
        const adjusted = score + earlierBonus;
        if (adjusted > bestScore + 0.02 || (adjusted >= bestScore && bestStart < 0)) {
          if (score >= 0.45) {
            bestScore = score;
            bestStart = speech[i]!.startMs;
            bestEndCursor = j + 1;
          }
        }
      }
    }

    if (bestStart >= 0 && bestScore >= 0.45) {
      starts[li] = bestStart;
      cursor = Math.max(cursor + 1, bestEndCursor);
      alignedCount += 1;
    }
  }

  // Fill gaps monotonically so unaligned lines sit between neighbors
  // (still cancionero text — never ASR words).
  let last = -1;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i]! >= 0) {
      if (last >= 0 && starts[i]! < starts[last]!) {
        starts[i] = starts[last]!;
      }
      last = i;
    }
  }

  // Leading unaligned → estimate from first locked / conservative intro.
  const firstLocked = starts.findIndex((s) => s >= 0);
  if (firstLocked === -1) {
    return {
      cues: cuesFromEqualTime(exactLines, total),
      alignedCount: 0,
      synced: false,
    };
  }
  if (firstLocked > 0) {
    for (let i = 0; i < firstLocked; i++) {
      const span = starts[firstLocked]! / Math.max(1, firstLocked);
      starts[i] = Math.round(i * span);
    }
  }

  // Trailing / interior gaps: linear interpolate between locked anchors.
  for (let i = 0; i < starts.length; i++) {
    if (starts[i]! >= 0) continue;
    let prev = i - 1;
    while (prev >= 0 && starts[prev]! < 0) prev -= 1;
    let next = i + 1;
    while (next < starts.length && starts[next]! < 0) next += 1;
    if (prev >= 0 && next < starts.length) {
      const gap = next - prev;
      const t = (i - prev) / gap;
      starts[i] = Math.round(
        starts[prev]! + t * (starts[next]! - starts[prev]!),
      );
    } else if (prev >= 0) {
      const remain = starts.length - 1 - prev;
      const slice = Math.max(
        2_000,
        Math.floor((total - starts[prev]!) / Math.max(1, remain)),
      );
      starts[i] = starts[prev]! + (i - prev) * slice;
    } else if (next < starts.length) {
      starts[i] = Math.round((starts[next]! * (i + 1)) / (next + 1));
    } else {
      starts[i] =
        conservativeIntroMs(total, exactLines.length) + i * 2_500;
    }
  }

  // Enforce non-decreasing starts (voice never goes backward).
  for (let i = 1; i < starts.length; i++) {
    if (starts[i]! < starts[i - 1]!) {
      starts[i] = starts[i - 1]!;
    }
  }

  const cues: SubtitleCue[] = exactLines.map((text, index) => {
    const startMs = Math.max(0, Math.round(starts[index]!));
    const endMs = Math.max(
      startMs + 500,
      index === exactLines.length - 1
        ? total
        : Math.round(starts[index + 1]!),
    );
    return {
      id: `cancionero_${index}`,
      startMs,
      endMs,
      text,
    };
  });

  const synced =
    alignedCount >= Math.max(2, Math.ceil(exactLines.length * 0.4));
  return { cues, alignedCount, synced };
}

/** Musical intro before equal-time fallback starts advancing lines. */
function conservativeIntroMs(totalMs: number, lineCount: number): number {
  // Prefer waiting through a real intro rather than racing the voice.
  const byPct = Math.floor(totalMs * 0.14);
  const capped = Math.min(18_000, Math.max(8_000, byPct));
  const maxIntro = Math.max(0, totalMs - lineCount * 2_000);
  return Math.min(capped, maxIntro);
}

function cuesFromEqualTime(
  lines: readonly string[],
  durationMs: number,
): SubtitleCue[] {
  if (lines.length === 0) return [];
  const total = Math.max(
    durationMs > 0 ? durationMs : lines.length * 8_000,
    lines.length * 2_500,
  );
  const leadInMs = conservativeIntroMs(total, lines.length);
  const usable = Math.max(total - leadInMs, lines.length * 2_000);
  const slice = usable / lines.length;
  return lines.map((text, index) => {
    const startMs = Math.round(leadInMs + index * slice);
    const endMs = Math.round(
      index === lines.length - 1 ? total : leadInMs + (index + 1) * slice,
    );
    return {
      id: `cancionero_${index}`,
      startMs: Math.max(0, startMs),
      endMs: Math.max(startMs + 500, endMs),
      text,
    };
  });
}

/**
 * Build timed cues from exact cancionero lines.
 * Equal-time fallback only — prefer alignCancioneroLinesToTiming when ASR /
 * captions clocks exist. −1s display lead is applied via agent leadMs.
 */
export function songToSubtitleCues(
  song: LibrarySongPayload,
  durationMs: number,
): SubtitleCue[] {
  return cuesFromEqualTime(songLyricChunks(song), durationMs);
}

function runCmd(
  bin: string,
  args: string[],
): Promise<{ code: number; stderr: string; stdout: string }> {
  ensureAugmentedPath();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stderr = "";
    let stdout = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stderr, stdout });
    });
  });
}

/** Probe media duration via ffprobe (ms). Returns 0 on failure. */
export async function probeMediaDurationMs(
  mediaPath: string,
): Promise<number> {
  if (!mediaPath) return 0;
  const ffmpeg = resolveFfmpegBin();
  const probeCandidates = [
    ffmpeg.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1"),
    "ffprobe",
  ];
  for (const bin of probeCandidates) {
    try {
      const result = await runCmd(bin, [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        mediaPath,
      ]);
      if (result.code !== 0 || !result.stdout.trim()) continue;
      const data = JSON.parse(result.stdout) as {
        format?: { duration?: string };
      };
      const sec = Number.parseFloat(data.format?.duration ?? "");
      if (Number.isFinite(sec) && sec > 0) {
        return Math.round(sec * 1000);
      }
    } catch {
      // try next
    }
  }
  return 0;
}

/** Strip extension from an audio filename for matching. */
export function titleFromAudioFilename(
  name: string | null | undefined,
): string {
  if (!name?.trim()) return "";
  let s = name.trim();
  const slash = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  if (slash >= 0) s = s.slice(slash + 1);
  return s.replace(AUDIO_EXT_RE, "").trim();
}
