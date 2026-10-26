import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import wavefile from "wavefile";
import type { SubtitleCue, SubtitleTargetLang } from "@promedia/shared";
import {
  ensureAugmentedPath,
  missingBinHintFromError,
  resolveFfmpegBin,
} from "./subtitle-bins.js";
import {
  applyTransformersCacheEnv,
  clearCorruptModelCache,
  ensureSubtitleDirs,
  subtitleModelsRoot,
} from "./subtitle-paths.js";

const { WaveFile } = wavefile as unknown as {
  WaveFile: new (buf?: Buffer | Uint8Array) => {
    fmt: object;
    toBitDepth: (depth: string) => void;
    toSampleRate: (rate: number) => void;
    getSamples: (
      interleaved: boolean,
      Container?: Float32ArrayConstructor,
    ) => unknown;
  };
};

export type AsrResult = {
  cues: SubtitleCue[];
  sourceLang: string | null;
  /** True when Whisper ran with task=translate (always English). */
  whisperTranslatedToEn: boolean;
};

type CachedAsr = {
  assetId: string;
  sourceHash: string;
  sourceLang: string | null;
  whisperTranslatedToEn: boolean;
  cues: SubtitleCue[];
  createdAt: string;
};

function runCmd(
  bin: string,
  args: string[],
): Promise<{ code: number; stderr: string }> {
  ensureAugmentedPath();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["ignore", "ignore", "pipe"],
      env: process.env,
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stderr });
    });
  });
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    const bin = resolveFfmpegBin();
    const { code } = await runCmd(bin, ["-version"]);
    return code === 0;
  } catch {
    return false;
  }
}

/** Extract 16 kHz mono WAV for Whisper (local ffmpeg — no cloud). */
export async function extractWav16k(
  mediaPath: string,
  outWavPath: string,
): Promise<void> {
  const bin = resolveFfmpegBin();
  let code: number;
  let stderr: string;
  try {
    ({ code, stderr } = await runCmd(bin, [
      "-y",
      "-i",
      mediaPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "wav",
      outWavPath,
    ]));
  } catch (err) {
    if (missingBinHintFromError(err, "ffmpeg")) {
      throw new Error("ffmpeg_missing");
    }
    throw err;
  }
  if (code !== 0) {
    const tail = (stderr || "").split("\n").slice(-6).join(" ");
    if (/not found|no such file|cannot find/i.test(tail)) {
      throw new Error("ffmpeg_missing");
    }
    throw new Error(`ffmpeg_extract_failed: ${tail}`);
  }
}

async function fileSha256(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

function cacheKey(assetId: string, targetLang: SubtitleTargetLang, translateToEn: boolean): string {
  return `${assetId}_${translateToEn ? "en" : "src"}_${targetLang}`;
}

function normalizeChunks(
  chunks: Array<{ text?: string; timestamp?: [number, number] | number }>,
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let i = 0;
  for (const chunk of chunks) {
    const text = (chunk.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    let startSec = 0;
    let endSec = 0;
    const ts = chunk.timestamp;
    if (Array.isArray(ts)) {
      startSec = typeof ts[0] === "number" ? ts[0] : 0;
      endSec = typeof ts[1] === "number" ? ts[1] : startSec + 2;
    } else if (typeof ts === "number") {
      startSec = ts;
      endSec = ts + 2;
    } else {
      startSec = cues.length ? cues[cues.length - 1]!.endMs / 1000 : 0;
      endSec = startSec + 2;
    }
    if (endSec <= startSec) {
      endSec = startSec + 1.5;
    }
    cues.push({
      id: `c${i++}`,
      startMs: Math.max(0, Math.round(startSec * 1000)),
      endMs: Math.max(0, Math.round(endSec * 1000)),
      text,
    });
  }
  return cues;
}

type WhisperPipeline = (
  input: Float32Array | Float32Array[],
  options?: Record<string, unknown>,
) => Promise<{
  text?: string;
  chunks?: Array<{ text?: string; timestamp?: [number, number] | number }>;
}>;

/** Decode 16 kHz mono WAV → Float32Array for transformers.js (no AudioContext in Node). */
async function wavToFloat32(wavPath: string): Promise<Float32Array> {
  const buf = await readFile(wavPath);
  const wav = new WaveFile(buf);
  wav.toBitDepth("32f");
  const fmt = wav.fmt as { sampleRate?: number };
  if (Number(fmt.sampleRate) !== 16000) {
    wav.toSampleRate(16000);
  }
  const raw = wav.getSamples(false, Float32Array) as unknown;
  if (Array.isArray(raw)) {
    const first = raw[0] as Float32Array | undefined;
    return first ?? new Float32Array(0);
  }
  if (raw instanceof Float32Array) {
    return raw;
  }
  // wavefile may return Float64Array depending on bit depth helpers
  const asNum = raw as ArrayLike<number>;
  const out = new Float32Array(asNum.length);
  for (let i = 0; i < asNum.length; i++) {
    out[i] = Number(asNum[i]);
  }
  return out;
}

/** Default Xenova whisper-tiny; pin revision so ONNX layout stays stable. */
const DEFAULT_WHISPER_MODEL = "Xenova/whisper-tiny";
/** Known-good revision with onnx/ weights (override: SUBTITLE_WHISPER_REVISION). */
const DEFAULT_WHISPER_REVISION = "main";

let whisperPromise: Promise<WhisperPipeline> | null = null;

function whisperModelId(): string {
  return process.env.SUBTITLE_WHISPER_MODEL?.trim() || DEFAULT_WHISPER_MODEL;
}

function whisperRevision(): string {
  return (
    process.env.SUBTITLE_WHISPER_REVISION?.trim() || DEFAULT_WHISPER_REVISION
  );
}

/**
 * Map transformers / download failures to Control-facing hint codes.
 * - model_download_failed: network / HF hub unreachable
 * - model_path_error: cache path / buffer / corrupt local files
 */
export function classifyWhisperLoadError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const lower = msg.toLowerCase();
  if (
    /fetch failed|econnrefused|enotfound|etimedout|econnreset|network|socket|getaddrinfo|und_err|certificate|ssl|tls|huggingface\.co|status (?:4\d\d|5\d\d)|403|429|502|503|504|download/i.test(
      msg,
    ) ||
    /network|offline|dns|timeout/.test(lower)
  ) {
    return "model_download_failed";
  }
  if (
    /unable to get model file path or buffer|local_files_only|unable to load from local path|ENOENT|EACCES|EPERM|EISDIR|ENOSPC/i.test(
      msg,
    ) ||
    /model file path|file path or buffer/i.test(lower)
  ) {
    return "model_path_error";
  }
  return msg.slice(0, 180) || "asr_failed";
}

async function loadWhisperPipeline(attempt: number): Promise<WhisperPipeline> {
  const dirs = await ensureSubtitleDirs();
  const modelsRoot = dirs.models || subtitleModelsRoot();
  const modelId = whisperModelId();
  const revision = whisperRevision();

  // Dynamic import keeps `tsc` / cold start light.
  const transformers = await import("@huggingface/transformers");
  applyTransformersCacheEnv(transformers.env, modelsRoot);

  console.log(
    `[subtitle] Whisper cacheDir=${transformers.env.cacheDir} localModelPath=${transformers.env.localModelPath} model=${modelId}@${revision} attempt=${attempt}`,
  );

  const pipe = await transformers.pipeline(
    "automatic-speech-recognition",
    modelId,
    {
      revision,
      // tiny quantized ONNX is the Xenova default and stays CPU-friendly
      dtype: "q8",
    },
  );
  return pipe as unknown as WhisperPipeline;
}

async function getWhisper(): Promise<WhisperPipeline> {
  if (!whisperPromise) {
    whisperPromise = (async () => {
      try {
        return await loadWhisperPipeline(1);
      } catch (firstErr) {
        const firstMsg =
          firstErr instanceof Error ? firstErr.message : String(firstErr);
        console.warn(
          `[subtitle] Whisper load failed (will clear corrupt cache + retry once): ${firstMsg}`,
        );
        try {
          const cleared = await clearCorruptModelCache(
            subtitleModelsRoot(),
            whisperModelId(),
          );
          console.warn(
            `[subtitle] cleared model cache tmp=${cleared.removedTmp} modelDir=${cleared.removedModelDir}`,
          );
        } catch (clearErr) {
          console.warn(
            "[subtitle] cache clear failed:",
            clearErr instanceof Error ? clearErr.message : clearErr,
          );
        }
        try {
          return await loadWhisperPipeline(2);
        } catch (secondErr) {
          // Reset so a later job can try again after network/path is fixed.
          whisperPromise = null;
          throw new Error(classifyWhisperLoadError(secondErr));
        }
      }
    })();
  }
  return whisperPromise;
}

/**
 * Local ASR with Whisper tiny (ONNX via @huggingface/transformers).
 * Models download once into gitignored `data/models/` (`env.cacheDir`).
 */
export async function transcribeLocalFile(options: {
  mediaPath: string;
  assetId: string;
  /** When true, Whisper task=translate → English cues. */
  translateToEn: boolean;
  targetLang: SubtitleTargetLang;
  onStatus?: (status: "downloading" | "extracting" | "transcribing") => void;
}): Promise<AsrResult> {
  const { mediaPath, assetId, translateToEn, targetLang, onStatus } = options;
  const dirs = await ensureSubtitleDirs();
  const sourceHash = await fileSha256(mediaPath);
  const key = cacheKey(assetId, targetLang, translateToEn);
  const cachePath = path.join(dirs.cache, `${key}.json`);

  try {
    const raw = await readFile(cachePath, "utf8");
    const cached = JSON.parse(raw) as CachedAsr;
    if (
      cached &&
      cached.sourceHash === sourceHash &&
      Array.isArray(cached.cues) &&
      cached.cues.length > 0
    ) {
      return {
        cues: cached.cues,
        sourceLang: cached.sourceLang,
        whisperTranslatedToEn: cached.whisperTranslatedToEn,
      };
    }
  } catch {
    // miss
  }

  onStatus?.("extracting");
  const wavPath = path.join(dirs.wav, `${assetId}.wav`);
  await extractWav16k(mediaPath, wavPath);

  onStatus?.("downloading");
  const whisper = await getWhisper();
  const audio = await wavToFloat32(wavPath);

  onStatus?.("transcribing");
  const result = await whisper(audio, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    // Whisper multilingual: translate task always emits English.
    task: translateToEn ? "translate" : "transcribe",
    sampling_rate: 16000,
  });

  let cues = normalizeChunks(result.chunks ?? []);
  if (!cues.length && result.text?.trim()) {
    cues = [
      {
        id: "c0",
        startMs: 0,
        endMs: 4000,
        text: result.text.trim(),
      },
    ];
  }

  const asr: AsrResult = {
    cues,
    sourceLang: translateToEn ? "en" : null,
    whisperTranslatedToEn: translateToEn,
  };

  const payload: CachedAsr = {
    assetId,
    sourceHash,
    sourceLang: asr.sourceLang,
    whisperTranslatedToEn: asr.whisperTranslatedToEn,
    cues: asr.cues,
    createdAt: new Date().toISOString(),
  };
  await writeFile(cachePath, JSON.stringify(payload, null, 2), "utf8");
  return asr;
}

export async function mediaFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
