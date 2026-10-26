import path from "node:path";
import { mkdir } from "node:fs/promises";

/** Gitignored model + cache root under promedia/data/. */
export function subtitleDataRoot(): string {
  return (
    process.env.SUBTITLE_DATA_ROOT?.trim() ||
    path.join(process.cwd(), "data", "subtitles")
  );
}

export function subtitleModelsRoot(): string {
  return (
    process.env.SUBTITLE_MODELS_ROOT?.trim() ||
    path.join(process.cwd(), "data", "models")
  );
}

export async function ensureSubtitleDirs(): Promise<{
  data: string;
  models: string;
  cache: string;
  wav: string;
}> {
  const data = subtitleDataRoot();
  const models = subtitleModelsRoot();
  const cache = path.join(data, "cache");
  const wav = path.join(data, "wav");
  await mkdir(cache, { recursive: true });
  await mkdir(wav, { recursive: true });
  await mkdir(models, { recursive: true });
  // Hugging Face / transformers.js cache (downloaded ONNX weights — not committed).
  process.env.TRANSFORMERS_CACHE = process.env.TRANSFORMERS_CACHE || models;
  process.env.HF_HOME = process.env.HF_HOME || models;
  return { data, models, cache, wav };
}
