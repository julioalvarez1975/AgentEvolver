#!/usr/bin/env node
/**
 * `pnpm dev` entry: build packages, then run hub + web via concurrently
 * with [hub]/[web] prefixes. Exit non-zero if hub never answers /health.
 */
import concurrently from "concurrently";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HUB_URL = (process.env.HUB_URL ?? "http://127.0.0.1:8787").replace(
  /\/$/,
  "",
);
const HEALTH = `${HUB_URL}/health`;
const HUB_WAIT_MS = Number(process.env.PROMEDIA_HUB_WAIT_MS ?? 45_000);

console.log("[dev] building packages…");
const build = spawnSync("pnpm", ["run", "build:packages"], {
  cwd: ROOT,
  env: process.env,
  stdio: "inherit",
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

console.log("[dev] starting hub + web (labels [hub] / [web])…");

const { result, commands } = concurrently(
  [
    {
      name: "hub",
      command: "pnpm --filter @promedia/hub dev",
      prefixColor: "cyan",
    },
    {
      name: "web",
      command: "pnpm --filter @promedia/web dev",
      prefixColor: "magenta",
    },
  ],
  {
    cwd: ROOT,
    prefix: "name",
    killOthersOn: ["failure", "success"],
    restartTries: 0,
  },
);

async function waitForHub(timeoutMs) {
  const start = Date.now();
  let lastErr = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(HEALTH, { cache: "no-store" });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        console.log(
          `[dev] hub healthy → ${HEALTH}` +
            (body?.service ? ` (${body.service})` : ""),
        );
        return true;
      }
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await delay(400);
  }
  console.error(
    `[dev] ERROR: hub did not become healthy within ${timeoutMs}ms.`,
  );
  console.error(`[dev] Last probe of ${HEALTH}: ${lastErr}`);
  console.error(
    `[dev] Two-terminal fallback:\n` +
      `  Terminal A: pnpm dev:hub\n` +
      `  Terminal B: pnpm dev:web\n` +
      `Then: curl -s ${HEALTH}`,
  );
  return false;
}

const healthy = await waitForHub(HUB_WAIT_MS);
if (!healthy) {
  for (const cmd of commands) {
    try {
      cmd.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  process.exit(1);
}

console.log(
  "[dev] ready — Control http://localhost:5173/control · health " + HEALTH,
);

try {
  await result;
} catch {
  process.exit(1);
}
