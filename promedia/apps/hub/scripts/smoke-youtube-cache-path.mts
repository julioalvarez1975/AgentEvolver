import { access, rm, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  ensureSubtitleDirs,
  promediaRoot,
  subtitleDataRoot,
} from "../src/subtitle-paths.ts";
import {
  findCachedAudio,
  youtubeYtDlpOutputArgs,
} from "../src/subtitle-youtube.ts";

async function main(): Promise<void> {
  const root = promediaRoot();
  const data = subtitleDataRoot();
  console.log("promediaRoot:", root);
  console.log("subtitleDataRoot:", data);
  if (!root.endsWith(`${path.sep}promedia`) && !root.endsWith("/promedia")) {
    // Allow trailing slash variants
    if (!/[/\\]promedia[/\\]?$/.test(root)) {
      throw new Error(`unexpected promediaRoot: ${root}`);
    }
  }

  const dirs = await ensureSubtitleDirs();
  console.log("youtubeCache:", dirs.youtubeCache);
  await access(dirs.youtubeCache);
  const st = await stat(dirs.youtubeCache);
  console.log("youtubeCache isDir:", st.isDirectory());
  if (!st.isDirectory()) throw new Error("youtube-cache not a directory");

  const args = youtubeYtDlpOutputArgs(dirs.youtubeCache);
  console.log("yt-dlp args:", JSON.stringify(args));
  if (args[0] !== "-P" || args[2] !== "-o" || args[3] !== "%(id)s.%(ext)s") {
    throw new Error("bad output template args");
  }
  if (!path.isAbsolute(args[1]!)) throw new Error("cache -P must be absolute");
  if (!args[1]!.includes("youtube-cache")) {
    throw new Error("expected youtube-cache in -P");
  }

  const id = "3sur4BmjQt8";
  const fake = path.join(dirs.youtubeCache, `${id}.m4a`);
  await writeFile(fake, "smoke");
  const found = await findCachedAudio(dirs.youtubeCache, id);
  console.log("findCachedAudio:", found);
  if (found !== fake) throw new Error("glob resolve failed");
  await rm(fake);

  process.chdir(path.join(root, "apps", "hub"));
  const dirs2 = await ensureSubtitleDirs();
  console.log("after chdir cwd:", process.cwd());
  console.log("youtubeCache still:", dirs2.youtubeCache);
  if (dirs2.youtubeCache !== dirs.youtubeCache) {
    throw new Error("path drifted after chdir");
  }
  console.log("SMOKE_OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
