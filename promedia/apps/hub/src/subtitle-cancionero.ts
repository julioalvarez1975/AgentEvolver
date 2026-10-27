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
  LYRIC_OVERLAY_MAX_LINES,
  LYRIC_OVERLAY_PREFERRED_LINES,
  LYRIC_PHRASE_SOFT_WRAP_CHARS,
  softWrapProjectionLine,
} from "@promedia/shared";
import {
  ensureAugmentedPath,
  resolveFfmpegBin,
} from "./subtitle-bins.js";

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
 * Split a stanza line into short lyric phrases (not long run-on sentences).
 * Breaks on . ! ? ; : — … and commas when the remainder stays phrase-sized;
 * then soft-wraps at LYRIC_PHRASE_SOFT_WRAP_CHARS.
 */
export function splitLyricPhrases(
  raw: string,
  maxChars: number = LYRIC_PHRASE_SOFT_WRAP_CHARS,
): string[] {
  const cleaned = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
  if (cleaned.length === 0) return [];

  const limit = Math.max(12, Math.trunc(maxChars));
  const phrases: string[] = [];

  const pushWrapped = (chunk: string) => {
    for (const row of softWrapProjectionLine(chunk, limit)) {
      const t = row.trim();
      if (t) phrases.push(t);
    }
  };

  for (const line of cleaned) {
    if (line.length <= limit) {
      phrases.push(line);
      continue;
    }
    // Prefer phrase breaks before falling back to word wrap.
    const rough = line
      .split(/(?<=[.!?…])\s+|(?<=[;:—–-])\s+|(?<=,)\s+(?=.{10,})/u)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const piece of rough.length ? rough : [line]) {
      pushWrapped(piece.replace(/[,:;]\s*$/u, "").trim() || piece);
    }
  }
  return phrases;
}

/** Flatten every stanza into ordered short lyric phrases. */
export function songLyricPhrases(song: LibrarySongPayload): string[] {
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

/**
 * Pack short phrases into cue chunks (preferred 4, max 6 lines).
 * Preserves stanza boundaries so verses advance like cancionero slides.
 */
function chunkPhraseLines(phrases: string[]): string[] {
  if (phrases.length === 0) return [];
  const preferred = Math.max(
    1,
    Math.min(LYRIC_OVERLAY_PREFERRED_LINES, LYRIC_OVERLAY_MAX_LINES),
  );
  const maxLines = Math.max(preferred, LYRIC_OVERLAY_MAX_LINES);
  const chunks: string[] = [];

  for (let i = 0; i < phrases.length; ) {
    const remaining = phrases.length - i;
    let take = Math.min(preferred, remaining);
    // Absorb a single orphan line into this cue when it still fits ≤ max.
    if (
      remaining === preferred + 1 &&
      remaining <= maxLines
    ) {
      take = remaining;
    } else if (remaining > maxLines && remaining - preferred === 1) {
      take = Math.min(maxLines, remaining);
    }
    const text = phrases.slice(i, i + take).join("\n").trim();
    if (text) chunks.push(text);
    i += take;
  }
  return chunks;
}

/**
 * Flatten library song stanzas into projection chunks of short phrases
 * (preferred 4, max 6 lines) for the timed lyric overlay.
 */
export function songLyricChunks(song: LibrarySongPayload): string[] {
  const stanzas =
    song.stanzas.length > 0
      ? song.stanzas
      : [{ id: "empty", lines: [] as string[] }];
  const chunks: string[] = [];
  for (const stanza of stanzas) {
    const phrases: string[] = [];
    for (const line of stanza.lines ?? []) {
      phrases.push(...splitLyricPhrases(String(line)));
    }
    chunks.push(...chunkPhraseLines(phrases));
  }
  return chunks;
}

/**
 * Build timed cues from cancionero phrases, spread over durationMs.
 * Short lyric phrases (≤4–6 lines per cue); −1s lead is applied via agent leadMs.
 */
export function songToSubtitleCues(
  song: LibrarySongPayload,
  durationMs: number,
): SubtitleCue[] {
  const chunks = songLyricChunks(song);
  if (chunks.length === 0) return [];

  const total = Math.max(
    durationMs > 0 ? durationMs : chunks.length * 8_000,
    chunks.length * 2_500,
  );
  // Leave a short lead-in so assisted intro-hold shows phrase 1 from t≈0,
  // then space remaining phrases evenly. Overlay lead (−1s) anticipates onset.
  const leadInMs = Math.min(4_000, Math.floor(total * 0.06));
  const usable = Math.max(total - leadInMs, chunks.length * 2_000);
  const slice = usable / chunks.length;

  return chunks.map((text, index) => {
    const startMs = Math.round(leadInMs + index * slice);
    const endMs = Math.round(
      index === chunks.length - 1
        ? total
        : leadInMs + (index + 1) * slice,
    );
    return {
      id: `cancionero_${index}`,
      startMs: Math.max(0, startMs),
      endMs: Math.max(startMs + 500, endMs),
      text,
    };
  });
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
