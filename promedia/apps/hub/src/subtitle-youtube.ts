import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  ensureAugmentedPath,
  missingBinHintFromError,
  resolveFfmpegBin,
  resolveYtDlpBin,
} from "./subtitle-bins.js";
import { ensureSubtitleDirs } from "./subtitle-paths.js";

export type YoutubeAudioResult = {
  /** Absolute path to cached audio file (wav/m4a/webm/opus/…). */
  mediaPath: string;
  /** Synthetic asset id used for ASR cue cache (`yt_<videoId>`). */
  assetId: string;
  videoId: string;
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

/** Probe resolved ffmpeg (Homebrew PATH + FFMPEG_PATH) before yt-dlp `-x`. */
async function ensureFfmpegForExtract(): Promise<string> {
  const bin = resolveFfmpegBin();
  try {
    const { code, stderr } = await runCmd(bin, ["-version"]);
    if (code === 0) return bin;
    if (/not found|no such file|cannot find/i.test(stderr || "")) {
      throw new Error("ffmpeg_missing");
    }
    throw new Error("ffmpeg_missing");
  } catch (err) {
    if (missingBinHintFromError(err, "ffmpeg")) {
      throw new Error("ffmpeg_missing");
    }
    throw new Error("ffmpeg_missing");
  }
}

/** Pass absolute ffmpeg to yt-dlp so GUI/launcher PATH gaps do not break `-x`. */
function ffmpegLocationArgs(ffmpegBin: string): string[] {
  if (ffmpegBin.includes("/") || ffmpegBin.includes("\\")) {
    return ["--ffmpeg-location", ffmpegBin];
  }
  return [];
}

function classifyYoutubeError(stderr: string): string {
  const s = (stderr || "").toLowerCase();
  // ffmpeg missing must win over generic "no such file" → cache_path_error.
  if (
    (s.includes("ffmpeg") || s.includes("ffprobe")) &&
    (s.includes("not found") ||
      s.includes("no such file") ||
      s.includes("install") ||
      s.includes("--ffmpeg-location") ||
      s.includes("is not installed"))
  ) {
    return "ffmpeg_missing";
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
  if (
    s.includes("no such file or directory") ||
    s.includes("unable to rename") ||
    s.includes("errno 2")
  ) {
    return "youtube_cache_path_error";
  }
  if (
    s.includes("conversion failed") ||
    s.includes("error while decoding") ||
    s.includes("invalid data found") ||
    s.includes("postprocessing")
  ) {
    return "ffmpeg_extract_failed";
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

async function invokeYtDlpExtract(options: {
  bin: string;
  ffmpegBin: string;
  cacheDir: string;
  url: string;
  audioFormat: "wav" | "m4a";
}): Promise<{ code: number; stderr: string; stdout: string }> {
  const { bin, ffmpegBin, cacheDir, url, audioFormat } = options;
  await mkdir(cacheDir, { recursive: true });
  const args = [
    "--no-playlist",
    "--no-warnings",
    "-f",
    "bestaudio/best",
    "-x",
    "--audio-format",
    audioFormat,
    "--audio-quality",
    "0",
    ...ffmpegLocationArgs(ffmpegBin),
    ...youtubeYtDlpOutputArgs(cacheDir),
  ];
  args.push("--", url);
  return runCmd(bin, args);
}

/**
 * Download YouTube audio via local yt-dlp into
 * `promedia/data/subtitles/youtube-cache/<videoId>.*` (gitignored).
 * Prefers one-step `-x --audio-format wav`; falls back to m4a.
 * Retries download once after clearing partials (no tight loop).
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

  // Always mkdir -p immediately before invoke (parents + writable check).
  await mkdir(cacheDir, { recursive: true });

  const cached = await findCachedAudio(cacheDir, videoId);
  if (cached) {
    return { mediaPath: cached, assetId, videoId };
  }

  const bin = resolveYtDlpBin();
  const available = await ytDlpAvailable();
  if (!available) {
    throw new Error("yt_dlp_missing");
  }

  const ffmpegBin = await ensureFfmpegForExtract();

  const url =
    sourceUrl?.trim() || `https://www.youtube.com/watch?v=${videoId}`;

  let lastHint = "youtube_download_failed";

  // Attempt 0: wav. Attempt 1: clear partials + wav again. Then one m4a fallback.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await clearYoutubeCacheArtifacts(cacheDir, videoId);
    }
    let result: { code: number; stderr: string; stdout: string };
    try {
      result = await invokeYtDlpExtract({
        bin,
        ffmpegBin,
        cacheDir,
        url,
        audioFormat: "wav",
      });
    } catch (err) {
      if (missingBinHintFromError(err, "yt_dlp")) {
        throw new Error("yt_dlp_missing");
      }
      if (missingBinHintFromError(err, "ffmpeg")) {
        throw new Error("ffmpeg_missing");
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`yt_dlp_spawn_failed: ${msg.slice(0, 120)}`);
    }

    if (result.code === 0) {
      const mediaPath = await findCachedAudio(cacheDir, videoId);
      if (mediaPath) {
        return { mediaPath, assetId, videoId };
      }
      lastHint = "youtube_cache_missing_after_download";
    } else {
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
      if (!isRetryableDownloadHint(lastHint)) {
        throw new Error(lastHint);
      }
    }
  }

  // Last resort: m4a container; ASR extractWav16k remuxes with safe flags.
  await clearYoutubeCacheArtifacts(cacheDir, videoId);
  let m4aResult: { code: number; stderr: string; stdout: string };
  try {
    m4aResult = await invokeYtDlpExtract({
      bin,
      ffmpegBin,
      cacheDir,
      url,
      audioFormat: "m4a",
    });
  } catch (err) {
    if (missingBinHintFromError(err, "yt_dlp")) {
      throw new Error("yt_dlp_missing");
    }
    if (missingBinHintFromError(err, "ffmpeg")) {
      throw new Error("ffmpeg_missing");
    }
    throw new Error(lastHint);
  }

  if (m4aResult.code !== 0) {
    const hint = classifyYoutubeError(m4aResult.stderr || m4aResult.stdout);
    if (hint === "ffmpeg_missing") {
      throw new Error("ffmpeg_missing");
    }
    throw new Error(hint === "ffmpeg_extract_failed" ? hint : lastHint);
  }

  const mediaPath = await findCachedAudio(cacheDir, videoId);
  if (!mediaPath) {
    throw new Error("youtube_cache_missing_after_download");
  }

  return { mediaPath, assetId, videoId };
}
