import { accessSync, constants } from "node:fs";
import path from "node:path";

/** Homebrew + Intel Mac prefixes often missing from GUI/launcher PATH. */
export const COMMON_MAC_BIN_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
] as const;

const MISSING_BIN_HINTS = new Set([
  "yt_dlp_missing",
  "ffmpeg_missing",
  "whisper_cpp_missing",
]);

let pathAugmented = false;

/** Prepend common Mac brew dirs to `process.env.PATH` once (idempotent). */
export function ensureAugmentedPath(): void {
  if (pathAugmented) return;
  pathAugmented = true;
  const sep = path.delimiter;
  const parts = (process.env.PATH || "").split(sep).filter(Boolean);
  const extra = COMMON_MAC_BIN_DIRS.filter((d) => !parts.includes(d));
  if (extra.length > 0) {
    process.env.PATH = [...extra, ...parts].join(sep);
  }
}

function isExecutable(filePath: string): boolean {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a CLI tool: env override → PATH (augmented) → common Mac absolute paths.
 * Returns an absolute path when found; otherwise the bare name for spawn to try.
 */
export function resolveToolBin(envKey: string, bareName: string): string {
  ensureAugmentedPath();
  const override = process.env[envKey]?.trim();
  const candidates: string[] = [];
  if (override) {
    candidates.push(override);
  }
  if (!candidates.includes(bareName)) {
    candidates.push(bareName);
  }

  const pathDirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const searchDirs = [...pathDirs];
  for (const d of COMMON_MAC_BIN_DIRS) {
    if (!searchDirs.includes(d)) searchDirs.push(d);
  }

  for (const name of candidates) {
    if (name.includes("/") || name.includes("\\")) {
      if (isExecutable(name)) return name;
      continue;
    }
    for (const dir of searchDirs) {
      const full = path.join(dir, name);
      if (isExecutable(full)) return full;
    }
  }

  return override || bareName;
}

export function resolveYtDlpBin(): string {
  return resolveToolBin("YT_DLP_PATH", "yt-dlp");
}

export function resolveFfmpegBin(): string {
  return resolveToolBin("FFMPEG_PATH", "ffmpeg");
}

/**
 * brew `whisper-cpp` installs `whisper-cli` (preferred). Older builds may
 * expose `whisper-cpp`. Override: `WHISPER_CPP_PATH`.
 */
export function resolveWhisperCliBin(): string {
  ensureAugmentedPath();
  const override = process.env.WHISPER_CPP_PATH?.trim();
  if (override) {
    if (isExecutable(override)) return override;
    return override;
  }

  const pathDirs = (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  const searchDirs = [...pathDirs];
  for (const d of COMMON_MAC_BIN_DIRS) {
    if (!searchDirs.includes(d)) searchDirs.push(d);
  }

  for (const name of ["whisper-cli", "whisper-cpp"] as const) {
    for (const dir of searchDirs) {
      const full = path.join(dir, name);
      if (isExecutable(full)) return full;
    }
  }
  return "whisper-cli";
}

export function isMissingBinHint(hint: string | null | undefined): boolean {
  return Boolean(hint && MISSING_BIN_HINTS.has(hint));
}

/**
 * Map thrown errors to stable subtitleAgent hint codes.
 * Callers should throw `yt_dlp_missing` / `ffmpeg_missing` /
 * `whisper_cpp_missing` for ENOENT; this also accepts those substrings.
 * Bare ENOENT without a typed code is mapped with `kind` when provided.
 */
export function missingBinHintFromError(
  err: unknown,
  kind?: "yt_dlp" | "ffmpeg" | "whisper_cpp",
): string | null {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (msg === "yt_dlp_missing" || lower.includes("yt_dlp_missing")) {
    return "yt_dlp_missing";
  }
  if (msg === "ffmpeg_missing" || lower.includes("ffmpeg_missing")) {
    return "ffmpeg_missing";
  }
  if (
    msg === "whisper_cpp_missing" ||
    lower.includes("whisper_cpp_missing")
  ) {
    return "whisper_cpp_missing";
  }
  if (
    kind &&
    (lower.includes("enoent") || lower.includes("not found"))
  ) {
    if (kind === "yt_dlp") return "yt_dlp_missing";
    if (kind === "ffmpeg") return "ffmpeg_missing";
    return "whisper_cpp_missing";
  }
  return null;
}
