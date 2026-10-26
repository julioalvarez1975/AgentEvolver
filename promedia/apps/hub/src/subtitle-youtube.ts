import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { SubtitleCue } from "@promedia/shared";
import {
  ensureAugmentedPath,
  missingBinHintFromError,
  resolveFfmpegBin,
  resolveYtDlpBin,
} from "./subtitle-bins.js";
import { filterSpeechCues } from "./subtitle-cue-text.js";
import { ensureSubtitleDirs } from "./subtitle-paths.js";
import { extractWav16k } from "./subtitle-asr.js";
import { parseWhisperCppVttOrSrt } from "./subtitle-whisper-cpp.js";

export type YoutubeAudioResult = {
  /** Absolute path to cached audio file (wav preferred; else raw bestaudio). */
  mediaPath: string;
  /** Synthetic asset id used for ASR cue cache (`yt_<videoId>`). */
  assetId: string;
  videoId: string;
};

export type YoutubeCaptionResult = {
  cues: SubtitleCue[];
  /** Language tag from the chosen caption file (e.g. `en`, `es`). */
  sourceLang: string | null;
  assetId: string;
  videoId: string;
  /** Manual vs auto-generated YouTube track. */
  trackKind: "manual" | "auto" | "unknown";
};

/** YouTube ids are 11 chars of [A-Za-z0-9_-]; reject anything else for path safety. */
function assertSafeVideoId(videoId: string): void {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    throw new Error("youtube_invalid_id");
  }
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

export async function ytDlpAvailable(): Promise<boolean> {
  try {
    const bin = resolveYtDlpBin();
    const { code } = await runCmd(bin, ["--version"]);
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Probe resolved ffmpeg (Homebrew PATH + FFMPEG_PATH) before any extract/remux.
 * Throws `ffmpeg_missing` so Control can show the brew hint — never a cache-path error.
 */
export async function ensureFfmpegForExtract(): Promise<string> {
  const bin = resolveFfmpegBin();
  try {
    const { code } = await runCmd(bin, ["-version"]);
    if (code === 0) return bin;
  } catch (err) {
    if (missingBinHintFromError(err, "ffmpeg")) {
      throw new Error("ffmpeg_missing");
    }
  }
  throw new Error("ffmpeg_missing");
}

/**
 * Map yt-dlp stderr to stable hints.
 * ffmpeg/Postprocessing ENOENT must NOT become `youtube_cache_path_error`
 * (that mislabel is what Julio saw when brew ffmpeg was missing mid `-x`).
 */
export function classifyYoutubeError(stderr: string): string {
  const s = (stderr || "").toLowerCase();

  const mentionsFfmpeg =
    s.includes("ffmpeg") ||
    s.includes("ffprobe") ||
    s.includes("postprocessing") ||
    s.includes("post-processing") ||
    s.includes("--ffmpeg-location");

  if (mentionsFfmpeg) {
    if (
      s.includes("not found") ||
      s.includes("no such file") ||
      s.includes("errno 2") ||
      s.includes("unable to") ||
      s.includes("is not installed") ||
      s.includes("install or provide") ||
      s.includes("please install")
    ) {
      return "ffmpeg_missing";
    }
    if (
      s.includes("conversion failed") ||
      s.includes("error while decoding") ||
      s.includes("invalid data found") ||
      s.includes("error opening input")
    ) {
      return "ffmpeg_extract_failed";
    }
    // Postprocessor failed for an unclear reason — still not a cache mkdir bug.
    return "ffmpeg_extract_failed";
  }

  if (
    s.includes("sign in to confirm your age") ||
    s.includes("age-restricted") ||
    s.includes("age restricted")
  ) {
    return "youtube_age_restricted";
  }
  if (
    s.includes("confirm you're not a bot") ||
    s.includes("confirm you’re not a bot") ||
    s.includes("not a bot") ||
    s.includes("--cookies-from-browser") ||
    s.includes("http error 403") ||
    s.includes("http error 429")
  ) {
    return "youtube_blocked";
  }
  if (
    s.includes("private video") ||
    s.includes("this video is private") ||
    s.includes("login required")
  ) {
    return "youtube_private";
  }
  if (
    s.includes("video unavailable") ||
    s.includes("is not available") ||
    s.includes("removed by the uploader")
  ) {
    return "youtube_unavailable";
  }

  // Real cache/path issues only when ffmpeg/postprocessing is not involved.
  if (
    s.includes("unable to rename") ||
    s.includes("no such file or directory") ||
    s.includes("errno 2")
  ) {
    return "youtube_cache_path_error";
  }

  const last = (stderr || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-3)
    .join(" ");
  return last
    ? `youtube_download_failed: ${last.slice(0, 140)}`
    : "youtube_download_failed";
}

function isRetryableDownloadHint(hint: string): boolean {
  return (
    hint === "ffmpeg_extract_failed" ||
    hint === "youtube_cache_path_error" ||
    hint === "youtube_cache_missing_after_download" ||
    hint.startsWith("youtube_download_failed")
  );
}

/**
 * Remove temp + final artifacts for a video id (corrupt/partial downloads).
 */
export async function clearYoutubeCacheArtifacts(
  cacheDir: string,
  videoId: string,
): Promise<void> {
  let names: string[];
  try {
    names = await readdir(cacheDir);
  } catch {
    return;
  }
  const prefix = `${videoId}.`;
  await Promise.all(
    names
      .filter((name) => name.startsWith(prefix))
      .map((name) =>
        rm(path.join(cacheDir, name), { force: true }).catch(() => undefined),
      ),
  );
}

/**
 * Resolve the downloaded file under cacheDir by video id (any ext except
 * yt-dlp temp suffixes). Prefer wav, then m4a.
 */
export async function findCachedAudio(
  cacheDir: string,
  videoId: string,
): Promise<string | null> {
  let names: string[];
  try {
    names = await readdir(cacheDir);
  } catch {
    return null;
  }
  const prefix = `${videoId}.`;
  const matches: string[] = [];
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    if (
      name.endsWith(".part") ||
      name.endsWith(".ytdl") ||
      name.endsWith(".temp")
    ) {
      continue;
    }
    const full = path.join(cacheDir, name);
    try {
      const st = await stat(full);
      if (!st.isFile() || st.size < 64) continue;
      matches.push(full);
    } catch {
      // continue
    }
  }
  if (!matches.length) return null;
  const wav = matches.find((p) => /\.wav$/i.test(p));
  if (wav) return wav;
  const m4a = matches.find((p) => /\.m4a$/i.test(p));
  return m4a ?? matches[0]!;
}

/** Absolute yt-dlp `-P` home + `-o` template (directory + `%(id)s.%(ext)s`). */
export function youtubeYtDlpOutputArgs(cacheDir: string): string[] {
  const absCache = path.resolve(cacheDir);
  return ["-P", absCache, "-o", "%(id)s.%(ext)s"];
}

/**
 * Download bestaudio only — no `-x` / postprocessor (avoids yt-dlp spawning
 * ffmpeg from a GUI PATH that lacks Homebrew).
 */
async function invokeYtDlpBestaudio(options: {
  bin: string;
  cacheDir: string;
  url: string;
}): Promise<{ code: number; stderr: string; stdout: string }> {
  const { bin, cacheDir, url } = options;
  await mkdir(cacheDir, { recursive: true });
  return runCmd(bin, [
    "--no-playlist",
    "--no-warnings",
    "-f",
    "bestaudio/best",
    ...youtubeYtDlpOutputArgs(cacheDir),
    "--",
    url,
  ]);
}

async function remuxCachedToWav(
  cacheDir: string,
  videoId: string,
  rawPath: string,
): Promise<string> {
  const wavPath = path.join(cacheDir, `${videoId}.wav`);
  if (/\.wav$/i.test(rawPath) && path.resolve(rawPath) === path.resolve(wavPath)) {
    return wavPath;
  }
  try {
    await extractWav16k(rawPath, wavPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "ffmpeg_missing" || msg.includes("ffmpeg_missing")) {
      throw new Error("ffmpeg_missing");
    }
    if (msg.startsWith("ffmpeg_extract_failed")) {
      throw new Error("ffmpeg_extract_failed");
    }
    throw new Error(
      `ffmpeg_extract_failed: ${msg.slice(0, 120)}`,
    );
  }
  // Prefer wav; drop raw container so next cache hit is clean.
  if (path.resolve(rawPath) !== path.resolve(wavPath)) {
    await rm(rawPath, { force: true }).catch(() => undefined);
  }
  return wavPath;
}

/**
 * Download YouTube audio into `promedia/data/subtitles/youtube-cache/`.
 * Strategy: require ffmpeg up front → yt-dlp bestaudio (no `-x`) → remux to
 * 16 kHz mono WAV with the resolved brew ffmpeg. One retry after clearing
 * partials (no tight loop).
 */
export async function ensureYoutubeAudio(options: {
  videoId: string;
  sourceUrl: string;
}): Promise<YoutubeAudioResult> {
  const { videoId, sourceUrl } = options;
  assertSafeVideoId(videoId);
  const assetId = `yt_${videoId}`;
  const dirs = await ensureSubtitleDirs();
  const cacheDir = path.resolve(dirs.youtubeCache);

  await mkdir(cacheDir, { recursive: true });

  const cached = await findCachedAudio(cacheDir, videoId);
  if (cached && /\.wav$/i.test(cached)) {
    return { mediaPath: cached, assetId, videoId };
  }

  const bin = resolveYtDlpBin();
  if (!(await ytDlpAvailable())) {
    throw new Error("yt_dlp_missing");
  }

  // Fail fast with brew hint — do not let a later postprocessor ENOENT
  // look like youtube_cache_path_error.
  await ensureFfmpegForExtract();

  // Existing raw bestaudio (m4a/webm/…) from older builds: remux in place.
  if (cached) {
    try {
      const wavPath = await remuxCachedToWav(cacheDir, videoId, cached);
      return { mediaPath: wavPath, assetId, videoId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "ffmpeg_missing" || msg.includes("ffmpeg_missing")) {
        throw new Error("ffmpeg_missing");
      }
      // Corrupt raw — clear and re-download once below.
      await clearYoutubeCacheArtifacts(cacheDir, videoId);
    }
  }

  const url =
    sourceUrl?.trim() || `https://www.youtube.com/watch?v=${videoId}`;

  let lastHint = "youtube_download_failed";

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await clearYoutubeCacheArtifacts(cacheDir, videoId);
    }

    let result: { code: number; stderr: string; stdout: string };
    try {
      result = await invokeYtDlpBestaudio({ bin, cacheDir, url });
    } catch (err) {
      if (missingBinHintFromError(err, "yt_dlp")) {
        throw new Error("yt_dlp_missing");
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`yt_dlp_spawn_failed: ${msg.slice(0, 120)}`);
    }

    if (result.code !== 0) {
      lastHint = classifyYoutubeError(result.stderr || result.stdout);
      if (lastHint === "ffmpeg_missing") {
        throw new Error("ffmpeg_missing");
      }
      if (
        lastHint === "youtube_age_restricted" ||
        lastHint === "youtube_blocked" ||
        lastHint === "youtube_private" ||
        lastHint === "youtube_unavailable"
      ) {
        throw new Error(lastHint);
      }
      if (!isRetryableDownloadHint(lastHint) || attempt === 1) {
        throw new Error(lastHint);
      }
      continue;
    }

    const rawPath = await findCachedAudio(cacheDir, videoId);
    if (!rawPath) {
      lastHint = "youtube_cache_missing_after_download";
      if (attempt === 1) throw new Error(lastHint);
      continue;
    }

    try {
      const wavPath = await remuxCachedToWav(cacheDir, videoId, rawPath);
      return { mediaPath: wavPath, assetId, videoId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "ffmpeg_missing" || msg.includes("ffmpeg_missing")) {
        throw new Error("ffmpeg_missing");
      }
      lastHint = msg.startsWith("ffmpeg_extract_failed")
        ? "ffmpeg_extract_failed"
        : msg.slice(0, 180);
      await clearYoutubeCacheArtifacts(cacheDir, videoId);
      if (attempt === 1) {
        throw new Error(lastHint);
      }
    }
  }

  throw new Error(lastHint);
}

/** Caption sidecar extensions we accept after yt-dlp `--convert-subs vtt`. */
const CAPTION_EXTS = new Set([".vtt", ".srt"]);

type CaptionCandidate = {
  filePath: string;
  lang: string;
  /** Lower rank = better (manual preferred, then language preference). */
  rank: number;
};

/**
 * Parse `videoId.<lang>.vtt` (and `.en-orig`, `.es-US`, …) into a BCP-47-ish tag.
 * Returns null for the audio file itself (`videoId.wav` / `.m4a`).
 */
export function youtubeCaptionLangFromName(
  videoId: string,
  fileName: string,
): string | null {
  if (!fileName.startsWith(`${videoId}.`)) return null;
  const rest = fileName.slice(videoId.length + 1);
  const ext = path.extname(rest).toLowerCase();
  if (!CAPTION_EXTS.has(ext)) return null;
  const langPart = rest.slice(0, rest.length - ext.length).trim();
  if (!langPart) return null;
  // Skip obvious non-lang leftovers.
  if (/^(f\d+|temp|part)$/i.test(langPart)) return null;
  return langPart.toLowerCase();
}

function captionLangBase(lang: string): string {
  return lang.split(/[-_.]/)[0] || lang;
}

/**
 * Rank caption files: prefer preferred language list, then shorter tags, then
 * path for stability. Auto tracks (`…-orig` / longer tags) still usable.
 */
export function rankYoutubeCaptionLang(
  lang: string,
  preferLangs: string[],
): number {
  const base = captionLangBase(lang);
  const prefs = preferLangs.map((l) => captionLangBase(l.toLowerCase()));
  const prefIdx = prefs.findIndex((p) => p === base || lang.startsWith(`${p}-`));
  const prefScore = prefIdx >= 0 ? prefIdx : 100;
  // Prefer plain `en` / `es` over `en-orig` / regional when tied.
  const specificity = lang.includes("-") || lang.includes(".") ? 1 : 0;
  return prefScore * 10 + specificity;
}

export async function findYoutubeCaptionFiles(
  cacheDir: string,
  videoId: string,
  preferLangs: string[],
): Promise<CaptionCandidate[]> {
  let names: string[];
  try {
    names = await readdir(cacheDir);
  } catch {
    return [];
  }
  const out: CaptionCandidate[] = [];
  for (const name of names) {
    const lang = youtubeCaptionLangFromName(videoId, name);
    if (!lang) continue;
    const filePath = path.join(cacheDir, name);
    try {
      const st = await stat(filePath);
      if (!st.isFile() || st.size < 16) continue;
    } catch {
      continue;
    }
    out.push({
      filePath,
      lang,
      rank: rankYoutubeCaptionLang(lang, preferLangs),
    });
  }
  out.sort((a, b) => a.rank - b.rank || a.filePath.localeCompare(b.filePath));
  return out;
}

async function invokeYtDlpCaptions(options: {
  bin: string;
  cacheDir: string;
  url: string;
  preferLangs: string[];
}): Promise<{ code: number; stderr: string; stdout: string }> {
  const { bin, cacheDir, url, preferLangs } = options;
  await mkdir(cacheDir, { recursive: true });
  // Prefer UI language, then English (lyrics often uploaded in EN), then any.
  const langs = [
    ...preferLangs.map((l) => `${captionLangBase(l)}.*`),
    ...preferLangs.map((l) => captionLangBase(l)),
    "en.*",
    "en",
  ];
  const uniqueLangs = [...new Set(langs.filter(Boolean))];
  return runCmd(bin, [
    "--no-playlist",
    "--no-warnings",
    "--skip-download",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs",
    uniqueLangs.join(","),
    "--sub-format",
    "vtt/srt/best",
    "--convert-subs",
    "vtt",
    ...youtubeYtDlpOutputArgs(cacheDir),
    "--",
    url,
  ]);
}

/**
 * Prefer official / auto YouTube captions over Whisper-on-audio for music
 * videos — Whisper tiny often emits only `[MUSIC]` / `[MÚSICA]` for songs.
 * Returns null when no usable speech/lyric cues are available (caller falls
 * through to audio ASR). Never throws for "no captions"; hard yt-dlp failures
 * are swallowed so the Whisper path can still run.
 */
export async function tryYoutubeCaptions(options: {
  videoId: string;
  sourceUrl: string;
  /** Preferred language codes (e.g. targetLang then `en`). */
  preferLangs: string[];
}): Promise<YoutubeCaptionResult | null> {
  const { videoId, sourceUrl, preferLangs } = options;
  assertSafeVideoId(videoId);
  const assetId = `yt_${videoId}`;
  const dirs = await ensureSubtitleDirs();
  const cacheDir = path.resolve(dirs.youtubeCache);
  await mkdir(cacheDir, { recursive: true });

  // Reuse previously downloaded caption sidecars when present.
  let candidates = await findYoutubeCaptionFiles(
    cacheDir,
    videoId,
    preferLangs,
  );

  if (!candidates.length) {
    if (!(await ytDlpAvailable())) {
      return null;
    }
    const bin = resolveYtDlpBin();
    // convert-subs may need ffmpeg; missing ffmpeg → skip captions, keep ASR.
    try {
      await ensureFfmpegForExtract();
    } catch {
      return null;
    }
    const url =
      sourceUrl?.trim() || `https://www.youtube.com/watch?v=${videoId}`;
    try {
      const result = await invokeYtDlpCaptions({
        bin,
        cacheDir,
        url,
        preferLangs,
      });
      if (result.code !== 0) {
        const hint = classifyYoutubeError(result.stderr || result.stdout);
        console.warn(
          `[subtitle] YouTube captions unavailable (${hint}) — falling back to Whisper ASR`,
        );
        return null;
      }
    } catch (err) {
      console.warn(
        "[subtitle] YouTube captions fetch failed:",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
    candidates = await findYoutubeCaptionFiles(cacheDir, videoId, preferLangs);
  }

  for (const cand of candidates) {
    let raw: string;
    try {
      raw = await readFile(cand.filePath, "utf8");
    } catch {
      continue;
    }
    const parsed = filterSpeechCues(parseWhisperCppVttOrSrt(raw));
    if (parsed.length < 1) continue;
    const sourceLang = captionLangBase(cand.lang);
    console.log(
      `[subtitle] YouTube captions used lang=${cand.lang} cues=${parsed.length} → ${cand.filePath}`,
    );
    // Persist a tiny marker so Control/debug can see caption source was used.
    void writeFile(
      path.join(cacheDir, `${videoId}.captions-meta.json`),
      JSON.stringify(
        {
          lang: cand.lang,
          sourceLang,
          cues: parsed.length,
          file: path.basename(cand.filePath),
          at: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    ).catch(() => undefined);
    return {
      cues: parsed,
      sourceLang,
      assetId,
      videoId,
      trackKind: /orig|auto/i.test(cand.lang) ? "auto" : "unknown",
    };
  }

  return null;
}
