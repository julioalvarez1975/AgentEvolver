import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import wavefile from "wavefile";
import type { SubtitleCue, SubtitleTargetLang } from "@promedia/shared";
import { ensureSubtitleDirs } from "./subtitle-paths.js";

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

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

function runCmd(
  bin: string,
  args: string[],
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
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

/** Extract 16 kHz mono WAV for Whisper (local ffmpeg — no cloud). */
export async function extractWav16k(
  mediaPath: string,
  outWavPath: string,
): Promise<void> {
  const { code, stderr } = await runCmd(ffmpegBin(), [
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
  ]);
  if (code !== 0) {
    throw new Error(
      `ffmpeg_extract_failed: ${(stderr || "").split("\n").slice(-6).join(" ")}`,
    );
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

let whisperPromise: Promise<WhisperPipeline> | null = null;

async function getWhisper(): Promise<WhisperPipeline> {
  if (!whisperPromise) {
    whisperPromise = (async () => {
      await ensureSubtitleDirs();
      const modelId =
        process.env.SUBTITLE_WHISPER_MODEL?.trim() || "Xenova/whisper-tiny";
      // Dynamic import keeps `tsc` / cold start light; models download into data/models.
      const transformers = await import("@huggingface/transformers");
      const pipe = await transformers.pipeline(
        "automatic-speech-recognition",
        modelId,
        {
          // dtype optional — tiny fp32 is fine on CPU for Phase 1
        },
      );
      return pipe as unknown as WhisperPipeline;
    })();
  }
  return whisperPromise;
}

/**
 * Local ASR with Whisper tiny (ONNX via @huggingface/transformers).
 * Models download once into gitignored `data/models/` (TRANSFORMERS_CACHE).
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
