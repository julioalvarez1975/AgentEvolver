import path from "node:path";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
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

/**
 * Ensure dirs exist and point Node HF/transformers caches at `data/models`.
 * Note: `@huggingface/transformers` v4 does **not** read TRANSFORMERS_CACHE;
 * callers must also set `env.cacheDir` / `env.localModelPath` via
 * {@link applyTransformersCacheEnv}.
 */
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
  // Compat for other HF tooling; transformers.js v4 uses env.cacheDir instead.
  process.env.TRANSFORMERS_CACHE = process.env.TRANSFORMERS_CACHE || models;
  process.env.HF_HOME = process.env.HF_HOME || models;
  return { data, models, cache, wav, youtubeCache };
}

type TransformersEnvLike = {
  cacheDir: string | null;
  localModelPath: string;
  allowRemoteModels: boolean;
  allowLocalModels: boolean;
  useFSCache: boolean;
  useFS: boolean;
};

/**
 * Configure `@huggingface/transformers` so ONNX weights download into and
 * reload from `subtitleModelsRoot()` (gitignored `promedia/data/models`).
 * Must run after dynamic `import("@huggingface/transformers")` and before
 * `pipeline(...)`.
 */
export function applyTransformersCacheEnv(
  env: TransformersEnvLike,
  modelsRoot: string,
): void {
  const root = path.resolve(modelsRoot);
  // Trailing sep helps localModelPath joins stay under the cache root.
  const withSep = root.endsWith(path.sep) ? root : root + path.sep;
  env.cacheDir = root;
  env.localModelPath = withSep;
  env.allowRemoteModels = true;
  env.allowLocalModels = true;
  env.useFSCache = true;
  env.useFS = true;
  process.env.TRANSFORMERS_CACHE = process.env.TRANSFORMERS_CACHE || root;
  process.env.HF_HOME = process.env.HF_HOME || root;
}

async function walkRemoveTmp(dir: string): Promise<number> {
  let removed = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      removed += await walkRemoveTmp(full);
      continue;
    }
    // FileCache writes `file.onnx.tmp.<pid>.<rand>` then renames.
    if (/\.tmp\./.test(ent.name) || ent.name.endsWith(".tmp")) {
      try {
        await rm(full, { force: true });
        removed += 1;
      } catch {
        // ignore
      }
    }
  }
  return removed;
}

/**
 * Drop incomplete/corrupt Whisper (or MT) downloads so a retry can finish.
 * Removes `.tmp.*` partials under the model folder; if the onnx dir is empty
 * or missing expected weights, removes the whole model cache tree.
 */
export async function clearCorruptModelCache(
  modelsRoot: string,
  modelId: string,
): Promise<{ removedTmp: number; removedModelDir: boolean }> {
  const modelDir = path.join(modelsRoot, ...modelId.split("/"));
  const removedTmp = await walkRemoveTmp(modelsRoot);

  let removedModelDir = false;
  try {
    const onnxDir = path.join(modelDir, "onnx");
    let onnxOk = false;
    try {
      const files = await readdir(onnxDir);
      onnxOk = files.some(
        (f) =>
          f.endsWith(".onnx") &&
          !f.includes(".tmp") &&
          !f.endsWith(".onnx_data"),
      );
      // Reject empty / tiny stubs left by aborted downloads.
      if (onnxOk) {
        for (const f of files) {
          if (!f.endsWith(".onnx") || f.includes(".tmp")) continue;
          const st = await stat(path.join(onnxDir, f));
          if (st.size < 1024) {
            onnxOk = false;
            break;
          }
        }
      }
    } catch {
      onnxOk = false;
    }
    if (!onnxOk) {
      await rm(modelDir, { recursive: true, force: true });
      removedModelDir = true;
    }
  } catch {
    // ignore
  }

  return { removedTmp, removedModelDir };
}
