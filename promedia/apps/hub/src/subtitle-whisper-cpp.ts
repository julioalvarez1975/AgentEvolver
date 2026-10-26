import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { SubtitleCue } from "@promedia/shared";
import {
  ensureAugmentedPath,
  missingBinHintFromError,
  resolveWhisperCliBin,
} from "./subtitle-bins.js";
import { ensureSubtitleDirs, subtitleModelsRoot } from "./subtitle-paths.js";

/** ggml tiny multilingual — small, good enough for local ASR fallback. */
const DEFAULT_GGML_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin";
const DEFAULT_GGML_NAME = "ggml-tiny.bin";
/** Reject truncated downloads under this size (~75MB full tiny). */
const MIN_GGML_BYTES = 10 * 1024 * 1024;

export function whisperCppModelsDir(modelsRoot?: string): string {
  return path.join(modelsRoot ?? subtitleModelsRoot(), "whisper");
}

export function whisperCppModelPath(modelsRoot?: string): string {
  const name =
    process.env.SUBTITLE_WHISPER_CPP_MODEL?.trim() || DEFAULT_GGML_NAME;
  return path.join(whisperCppModelsDir(modelsRoot), name);
}

export async function whisperCliAvailable(): Promise<boolean> {
  try {
    const bin = resolveWhisperCliBin();
    // Absolute path preferred; bare name only counts if spawn succeeds.
    const { code } = await runCmd(bin, ["-h"]);
    // whisper-cli prints usage and may exit 0 or 1 depending on version.
    return code === 0 || code === 1;
  } catch {
    return false;
  }
}

function runCmd(
  bin: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  ensureAugmentedPath();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function fileLooksComplete(filePath: string): Promise<boolean> {
  try {
    const st = await stat(filePath);
    return st.isFile() && st.size >= MIN_GGML_BYTES;
  } catch {
    return false;
  }
}

/**
 * Download ggml tiny once into `data/models/whisper/` (gitignored).
 * Skips when a complete file already exists.
 */
export async function ensureWhisperCppModel(
  onStatus?: (status: "downloading") => void,
): Promise<string> {
  const dirs = await ensureSubtitleDirs();
  const modelPath = whisperCppModelPath(dirs.models);
  await mkdir(path.dirname(modelPath), { recursive: true });

  if (await fileLooksComplete(modelPath)) {
    return modelPath;
  }

  onStatus?.("downloading");
  const url =
    process.env.SUBTITLE_WHISPER_CPP_MODEL_URL?.trim() || DEFAULT_GGML_URL;
  const tmpPath = `${modelPath}.tmp`;
  await rm(tmpPath, { force: true }).catch(() => undefined);

  console.log(`[subtitle] whisper.cpp downloading ggml → ${modelPath}`);
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`model_download_failed: whisper.cpp ${msg}`.slice(0, 180));
  }
  if (!res.ok || !res.body) {
    throw new Error(
      `model_download_failed: whisper.cpp HTTP ${res.status}`.slice(0, 180),
    );
  }

  try {
    const nodeStream = Readable.fromWeb(
      res.body as import("node:stream/web").ReadableStream,
    );
    await pipeline(nodeStream, createWriteStream(tmpPath));
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`model_download_failed: whisper.cpp ${msg}`.slice(0, 180));
  }

  if (!(await fileLooksComplete(tmpPath))) {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw new Error("model_download_failed: whisper.cpp incomplete download");
  }

  await rm(modelPath, { force: true }).catch(() => undefined);
  await rename(tmpPath, modelPath);
  return modelPath;
}

/** Parse whisper-cli JSON (`-oj`) segments into cues. */
export function parseWhisperCppJson(raw: string): SubtitleCue[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const root = data as {
    transcription?: Array<{
      text?: string;
      offsets?: { from?: number; to?: number };
      timestamps?: { from?: string; to?: string };
    }>;
    segments?: Array<{
      text?: string;
      start?: number;
      end?: number;
      t0?: number;
      t1?: number;
    }>;
  };

  const cues: SubtitleCue[] = [];
  let i = 0;

  const push = (text: string, startMs: number, endMs: number) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t) return;
    let start = Math.max(0, Math.round(startMs));
    let end = Math.max(0, Math.round(endMs));
    if (end <= start) end = start + 1500;
    cues.push({ id: `c${i++}`, startMs: start, endMs: end, text: t });
  };

  if (Array.isArray(root.transcription)) {
    for (const seg of root.transcription) {
      const from = seg.offsets?.from;
      const to = seg.offsets?.to;
      if (typeof from === "number" && typeof to === "number") {
        push(seg.text ?? "", from, to);
        continue;
      }
      const startMs = parseVttClock(seg.timestamps?.from ?? "");
      const endMs = parseVttClock(seg.timestamps?.to ?? "");
      if (startMs != null && endMs != null) {
        push(seg.text ?? "", startMs, endMs);
      }
    }
  } else if (Array.isArray(root.segments)) {
    for (const seg of root.segments) {
      const start =
        typeof seg.start === "number"
          ? seg.start * 1000
          : typeof seg.t0 === "number"
            ? seg.t0 * 10 // centiseconds in some builds
            : 0;
      const end =
        typeof seg.end === "number"
          ? seg.end * 1000
          : typeof seg.t1 === "number"
            ? seg.t1 * 10
            : start + 2000;
      push(seg.text ?? "", start, end);
    }
  }

  return cues;
}

/** Parse WebVTT / SRT-ish timestamp files from whisper-cli. */
export function parseWhisperCppVttOrSrt(raw: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let i = 0;
  // Match "00:00:01.000 --> 00:00:02.500" or comma decimal (SRT)
  const re =
    /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/g;
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  for (let li = 0; li < lines.length; li++) {
    const m = re.exec(lines[li] ?? "");
    re.lastIndex = 0;
    if (!m) continue;
    const startMs = parseVttClock(m[1]!.replace(",", "."));
    const endMs = parseVttClock(m[2]!.replace(",", "."));
    if (startMs == null || endMs == null) continue;
    const textLines: string[] = [];
    for (let j = li + 1; j < lines.length; j++) {
      const line = lines[j] ?? "";
      if (!line.trim() || /^\d+$/.test(line.trim()) || re.test(line)) {
        re.lastIndex = 0;
        if (/^\d+$/.test(line.trim())) continue;
        if (!line.trim()) break;
        if (/-->/.test(line)) break;
      }
      re.lastIndex = 0;
      if (/^(WEBVTT|NOTE)\b/i.test(line)) continue;
      textLines.push(line);
    }
    const text = textLines.join(" ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    let end = endMs;
    if (end <= startMs) end = startMs + 1500;
    cues.push({
      id: `c${i++}`,
      startMs: startMs,
      endMs: end,
      text,
    });
  }
  return cues;
}

function parseVttClock(clock: string): number | null {
  const m = /^(\d{2}):(\d{2}):(\d{2})[.,](\d{3})$/.exec(clock.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3]);
  const ms = Number(m[4]);
  return ((h * 60 + min) * 60 + s) * 1000 + ms;
}

/**
 * Transcribe a 16 kHz mono WAV with brew `whisper-cli` / whisper.cpp.
 * Throws `whisper_cpp_missing` when the binary is absent.
 */
export async function transcribeWithWhisperCpp(options: {
  wavPath: string;
  translateToEn: boolean;
  workDir: string;
  onStatus?: (status: "downloading" | "transcribing") => void;
}): Promise<{ cues: SubtitleCue[]; whisperTranslatedToEn: boolean }> {
  const bin = resolveWhisperCliBin();
  let modelPath: string;
  try {
    modelPath = await ensureWhisperCppModel((st) => options.onStatus?.(st));
  } catch (err) {
    throw err;
  }

  options.onStatus?.("transcribing");
  await mkdir(options.workDir, { recursive: true });
  const outBase = path.join(options.workDir, "whisper-cpp-out");
  // Clean previous outputs
  for (const ext of [".json", ".vtt", ".srt", ".txt"]) {
    await rm(`${outBase}${ext}`, { force: true }).catch(() => undefined);
  }

  const args = [
    "-m",
    modelPath,
    "-f",
    options.wavPath,
    "-of",
    outBase,
    "-oj",
    "-ovtt",
    "-osrt",
    "-nt", // no timestamps in stdout (cleaner)
    "-np", // no prints progress spam when supported; ignored if unknown
  ];
  if (options.translateToEn) {
    args.push("-tr");
  }

  let code: number;
  let stderr: string;
  try {
    ({ code, stderr } = await runCmd(bin, args));
  } catch (err) {
    if (missingBinHintFromError(err, "whisper_cpp")) {
      throw new Error("whisper_cpp_missing");
    }
    // Older builds may reject -np; retry without optional flags.
    const msg = err instanceof Error ? err.message : String(err);
    if (/enoent|not found/i.test(msg)) {
      throw new Error("whisper_cpp_missing");
    }
    throw err;
  }

  if (code !== 0) {
    // Retry without -np if the flag is unknown
    if (/-np|unknown|unrecognized/i.test(stderr)) {
      const args2 = args.filter((a) => a !== "-np");
      const second = await runCmd(bin, args2);
      code = second.code;
      stderr = second.stderr;
    }
  }

  if (code !== 0) {
    if (
      /not found|no such file|enoent|unable to find|cannot find/i.test(stderr) ||
      /whisper-cli|whisper\.cpp/i.test(stderr) && /not found/i.test(stderr)
    ) {
      throw new Error("whisper_cpp_missing");
    }
    const tail = stderr.split("\n").slice(-8).join(" ").trim();
    throw new Error(
      `whisper_cpp_failed: ${tail || `exit ${code}`}`.slice(0, 180),
    );
  }

  let cues: SubtitleCue[] = [];
  try {
    const jsonRaw = await readFile(`${outBase}.json`, "utf8");
    cues = parseWhisperCppJson(jsonRaw);
  } catch {
    // fall through
  }
  if (!cues.length) {
    try {
      const vtt = await readFile(`${outBase}.vtt`, "utf8");
      cues = parseWhisperCppVttOrSrt(vtt);
    } catch {
      // fall through
    }
  }
  if (!cues.length) {
    try {
      const srt = await readFile(`${outBase}.srt`, "utf8");
      cues = parseWhisperCppVttOrSrt(srt);
    } catch {
      // fall through
    }
  }
  if (!cues.length) {
    try {
      const txt = (await readFile(`${outBase}.txt`, "utf8")).trim();
      if (txt) {
        cues = [{ id: "c0", startMs: 0, endMs: 4000, text: txt }];
      }
    } catch {
      // empty
    }
  }

  return {
    cues,
    whisperTranslatedToEn: options.translateToEn,
  };
}

export async function assertWhisperCliOrThrow(): Promise<string> {
  const bin = resolveWhisperCliBin();
  try {
    await access(bin);
  } catch {
    // bare name may still be on PATH after augment — probe via -h
  }
  try {
    const { code, stderr } = await runCmd(bin, ["-h"]);
    if (code !== 0 && code !== 1 && /not found|enoent/i.test(stderr)) {
      throw new Error("whisper_cpp_missing");
    }
    // If spawn worked at all, treat as present (usage exits 0/1).
    return bin;
  } catch (err) {
    if (missingBinHintFromError(err, "whisper_cpp")) {
      throw new Error("whisper_cpp_missing");
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/enoent|not found/i.test(msg)) {
      throw new Error("whisper_cpp_missing");
    }
    throw new Error("whisper_cpp_missing");
  }
}
