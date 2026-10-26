import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  ensureAugmentedPath,
  missingBinHintFromError,
  resolveYtDlpBin,
} from "./subtitle-bins.js";
import { ensureSubtitleDirs } from "./subtitle-paths.js";

export type YoutubeAudioResult = {
  /** Absolute path to cached audio file (m4a/webm/opus/…). */
  mediaPath: string;
  /** Synthetic asset id used for ASR cue cache (`yt_<videoId>`). */
  assetId: string;
  videoId: string;
};

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

function classifyYoutubeError(stderr: string): string {
  const s = (stderr || "").toLowerCase();
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

async function findCachedAudio(
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
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    if (name.endsWith(".part") || name.endsWith(".ytdl")) continue;
    const full = path.join(cacheDir, name);
    try {
      await access(full);
      return full;
    } catch {
      // continue
    }
  }
  return null;
}

/**
 * Download YouTube audio-only (bestaudio) via local yt-dlp into
 * `data/subtitles/youtube-cache/<videoId>.*` (gitignored). Reuses cache.
 */
export async function ensureYoutubeAudio(options: {
  videoId: string;
  sourceUrl: string;
}): Promise<YoutubeAudioResult> {
  const { videoId, sourceUrl } = options;
  const assetId = `yt_${videoId}`;
  const dirs = await ensureSubtitleDirs();
  const cacheDir = dirs.youtubeCache;

  const cached = await findCachedAudio(cacheDir, videoId);
  if (cached) {
    return { mediaPath: cached, assetId, videoId };
  }

  const bin = resolveYtDlpBin();
  const available = await ytDlpAvailable();
  if (!available) {
    throw new Error("yt_dlp_missing");
  }

  // Prefer a stable container; yt-dlp + ffmpeg will remux when needed.
  const outTemplate = path.join(cacheDir, `${videoId}.%(ext)s`);
  const url =
    sourceUrl?.trim() || `https://www.youtube.com/watch?v=${videoId}`;

  let result: { code: number; stderr: string; stdout: string };
  try {
    result = await runCmd(bin, [
      "--no-playlist",
      "--no-warnings",
      "-f",
      "bestaudio/best",
      "-x",
      "--audio-format",
      "m4a",
      "--audio-quality",
      "0",
      "-o",
      outTemplate,
      "--",
      url,
    ]);
  } catch (err) {
    if (missingBinHintFromError(err, "yt_dlp")) {
      throw new Error("yt_dlp_missing");
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`yt_dlp_spawn_failed: ${msg.slice(0, 120)}`);
  }

  if (result.code !== 0) {
    throw new Error(classifyYoutubeError(result.stderr || result.stdout));
  }

  const mediaPath = await findCachedAudio(cacheDir, videoId);
  if (!mediaPath) {
    throw new Error("youtube_cache_missing_after_download");
  }

  return { mediaPath, assetId, videoId };
}
