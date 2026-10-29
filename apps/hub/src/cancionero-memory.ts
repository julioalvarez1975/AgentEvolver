/**
 * Persistent karaoke “learning”: remember which Biblioteca song worked for a
 * YouTube id / audio asset / primary title so the next run skips bad aliases.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promediaRoot } from "./subtitle-paths.js";
import { normalizeMatchTitle, primaryTitleSegment } from "./subtitle-cancionero.js";

export type CancioneroMemoryEntry = {
  songId: string;
  songTitle: string;
  /** How we learned this mapping. */
  source: "exact" | "lyric" | "fuzzy" | "manual";
  updatedAt: string;
};

type MemoryFile = {
  version: 1;
  /** yt:<videoId> | asset:<assetId> → song */
  byMedia: Record<string, CancioneroMemoryEntry>;
  /** normalized primary title → song */
  byTitle: Record<string, CancioneroMemoryEntry>;
};

const EMPTY: MemoryFile = { version: 1, byMedia: {}, byTitle: {} };

function memoryPath(): string {
  return path.join(promediaRoot(), "data", "cancionero-memory.json");
}

let cache: MemoryFile | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function loadMemory(): Promise<MemoryFile> {
  if (cache) return cache;
  try {
    const raw = await readFile(memoryPath(), "utf8");
    const parsed = JSON.parse(raw) as MemoryFile;
    if (parsed?.version === 1 && parsed.byMedia && parsed.byTitle) {
      cache = parsed;
      return cache;
    }
  } catch {
    // missing / corrupt → start fresh
  }
  cache = { ...EMPTY, byMedia: {}, byTitle: {} };
  return cache;
}

async function saveMemory(next: MemoryFile): Promise<void> {
  cache = next;
  writeChain = writeChain.then(async () => {
    const dir = path.dirname(memoryPath());
    await mkdir(dir, { recursive: true });
    await writeFile(memoryPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  });
  await writeChain;
}

export function cancioneroMediaKey(options: {
  youtubeVideoId?: string | null;
  assetId?: string | null;
}): string | null {
  const yt = options.youtubeVideoId?.trim();
  if (yt) return `yt:${yt}`;
  const asset = options.assetId?.trim();
  if (asset) return `asset:${asset}`;
  return null;
}

export async function recallCancioneroByMedia(
  mediaKey: string | null | undefined,
): Promise<CancioneroMemoryEntry | null> {
  if (!mediaKey) return null;
  const mem = await loadMemory();
  return mem.byMedia[mediaKey] ?? null;
}

export async function recallCancioneroByTitles(
  titles: string[],
): Promise<CancioneroMemoryEntry | null> {
  const mem = await loadMemory();
  for (const raw of titles) {
    const primary = normalizeMatchTitle(primaryTitleSegment(raw) || raw);
    if (!primary) continue;
    const hit = mem.byTitle[primary];
    if (hit) return hit;
  }
  return null;
}

export async function rememberCancioneroMatch(options: {
  mediaKey?: string | null;
  titles?: string[];
  songId: string;
  songTitle: string;
  source: CancioneroMemoryEntry["source"];
}): Promise<void> {
  const mem = await loadMemory();
  const entry: CancioneroMemoryEntry = {
    songId: options.songId,
    songTitle: options.songTitle,
    source: options.source,
    updatedAt: new Date().toISOString(),
  };
  const byMedia = { ...mem.byMedia };
  const byTitle = { ...mem.byTitle };
  if (options.mediaKey) {
    byMedia[options.mediaKey] = entry;
  }
  for (const raw of options.titles ?? []) {
    const primary = normalizeMatchTitle(primaryTitleSegment(raw) || raw);
    if (primary && primary.length >= 3) {
      byTitle[primary] = entry;
    }
  }
  await saveMemory({ version: 1, byMedia, byTitle });
}
