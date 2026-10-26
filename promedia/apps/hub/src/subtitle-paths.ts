import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Monorepo `promedia/` root — same whether the hub is started from repo root
 * or `apps/hub` via pnpm filter (cwd alone is unreliable).
 */
export function promediaRoot(): string {
  // src|dist → apps/hub → apps → promedia
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

/** Gitignored model + cache root under promedia/data/. */
export function subtitleDataRoot(): string {
  if (process.env.SUBTITLE_DATA_ROOT?.trim()) {
    return process.env.SUBTITLE_DATA_ROOT.trim();
  }
  return path.join(promediaRoot(), "data", "subtitles");
}

export function subtitleModelsRoot(): string {
  if (process.env.SUBTITLE_MODELS_ROOT?.trim()) {
    return process.env.SUBTITLE_MODELS_ROOT.trim();
  }
  return path.join(promediaRoot(), "data", "models");
}

export async function ensureSubtitleDirs(): Promise<{
  data: string;
  models: string;
  cache: string;
  wav: string;
  youtubeCache: string;
}> {
  const data = subtitleDataRoot();
  const models = subtitleModelsRoot();
  const cache = path.join(data, "cache");
  const wav = path.join(data, "wav");
  const youtubeCache = path.join(data, "youtube-cache");
  await mkdir(cache, { recursive: true });
  await mkdir(wav, { recursive: true });
  await mkdir(youtubeCache, { recursive: true });
  await mkdir(models, { recursive: true });
  // Hugging Face / transformers.js cache (downloaded ONNX weights — not committed).
  process.env.TRANSFORMERS_CACHE = process.env.TRANSFORMERS_CACHE || models;
  process.env.HF_HOME = process.env.HF_HOME || models;
  return { data, models, cache, wav, youtubeCache };
}
