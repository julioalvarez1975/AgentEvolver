#!/usr/bin/env node
/**
 * `pnpm dev` entry: build packages, then run hub + web via concurrently
 * with [hub] / [web] prefixes.
 *
 * Ready only when:
 * - our hub child logged "listening" (real bind, not a stale :8787), and
 * - /health answers while that child is still alive.
 *
 * Prints the ACTUAL Vite URL from "Local: http://localhost:PORT".
 */
import concurrently from "concurrently";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const READY_URL_FILE = path.join(ROOT, ".promedia-ready-url");
const HUB_URL = (process.env.HUB_URL ?? "http://127.0.0.1:8787").replace(
  /\/$/,
  "",
);
const HEALTH = `${HUB_URL}/health`;
const HUB_WAIT_MS = Number(process.env.PROMEDIA_HUB_WAIT_MS ?? 45_000);
const WEB_URL_WAIT_MS = Number(process.env.PROMEDIA_WEB_URL_WAIT_MS ?? 20_000);

function clearReadyUrlFile() {
  try {
    fs.unlinkSync(READY_URL_FILE);
  } catch {
    // ignore
  }
}

function writeReadyUrlFile(controlUrl) {
  try {
    fs.writeFileSync(READY_URL_FILE, `${controlUrl}\n`, "utf8");
  } catch {
    // ignore — launchers still probe /control on 5173–5178
  }
}

clearReadyUrlFile();


const LOCAL_URL_RE = /Local:\s*(https?:\/\/\S+)/i;
const HUB_LISTENING_RE = /ProMedia hub listening on/i;
const HUB_EADDR_RE = /EADDRINUSE|puerto \d+ ya está en uso/i;

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

const hubCmd = commands.find((c) => c.name === "hub");
const webCmd = commands.find((c) => c.name === "web");

let hubExited = false;
let hubExitCode = null;
let hubListening = false;
let hubBindFailed = false;
let webLocalUrl = null;

function scanHubOutput(buf) {
  const text = buf.toString();
  if (HUB_LISTENING_RE.test(text)) hubListening = true;
  if (HUB_EADDR_RE.test(text)) hubBindFailed = true;
}

function scanWebOutput(buf) {
  const text = buf.toString();
  const m = text.match(LOCAL_URL_RE);
  if (m) {
    webLocalUrl = m[1].replace(/\/$/, "");
  }
}

if (hubCmd) {
  hubCmd.close.subscribe((ev) => {
    hubExited = true;
    hubExitCode = ev.exitCode;
  });
  hubCmd.stdout.subscribe(scanHubOutput);
  hubCmd.stderr.subscribe(scanHubOutput);
}

if (webCmd) {
  webCmd.stdout.subscribe(scanWebOutput);
  webCmd.stderr.subscribe(scanWebOutput);
}

function killAll() {
  for (const cmd of commands) {
    try {
      cmd.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
}

function hubChildDead() {
  return (
    hubExited ||
    !hubCmd ||
    hubCmd.state === "exited" ||
    hubCmd.state === "errored"
  );
}

async function waitForHub(timeoutMs) {
  const start = Date.now();
  let lastErr = "";
  let sawStaleHealth = false;

  while (Date.now() - start < timeoutMs) {
    if (hubBindFailed) {
      console.error(
        "[dev] ERROR: el hub no pudo enlazar el puerto (EADDRINUSE).",
      );
      console.error(
        "[dev] Hay una instancia anterior en :8787. Cerrala o usá el launcher (start-mac / start-windows / start-linux).",
      );
      console.error(
        "[dev] Manual: lsof -nP -iTCP:8787 -sTCP:LISTEN  →  kill <PID>",
      );
      return false;
    }

    if (hubChildDead() && !hubListening) {
      console.error(
        `[dev] ERROR: el proceso hub salió antes de escuchar (code=${hubExitCode ?? hubCmd?.state}).`,
      );
      console.error(
        "[dev] No uses un /health de un hub viejo: esta instancia no arrancó.",
      );
      return false;
    }

    try {
      const res = await fetch(HEALTH, { cache: "no-store" });
      if (res.ok) {
        if (!hubListening) {
          // Old process still answering — our child has not bound yet.
          sawStaleHealth = true;
          lastErr =
            "HTTP 200 de un proceso viejo (nuestro hub aún no logueó listening)";
        } else if (hubChildDead() || hubBindFailed) {
          console.error(
            "[dev] ERROR: /health responde, pero nuestro hub hijo ya no está vivo.",
          );
          console.error(
            "[dev] Eso suele ser un hub ANTERIOR en :8787 (EADDRINUSE). Matá ese proceso y reintentá.",
          );
          return false;
        } else {
          const body = await res.json().catch(() => ({}));
          console.log(
            `[dev] hub healthy → ${HEALTH}` +
              (body?.service ? ` (${body.service})` : ""),
          );
          return true;
        }
      } else {
        lastErr = `HTTP ${res.status}`;
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
    await delay(400);
  }

  console.error(
    `[dev] ERROR: hub did not become healthy within ${timeoutMs}ms.`,
  );
  console.error(`[dev] Last probe of ${HEALTH}: ${lastErr}`);
  if (sawStaleHealth && !hubListening) {
    console.error(
      "[dev] /health respondió, pero este hub nunca logueó “listening” — probable EADDRINUSE / proceso viejo.",
    );
  }
  console.error(
    `[dev] Two-terminal fallback:\n` +
      `  Terminal A: pnpm dev:hub\n` +
      `  Terminal B: pnpm dev:web\n` +
      `Then: curl -s ${HEALTH}`,
  );
  return false;
}

async function waitForWebLocalUrl(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (webLocalUrl) return webLocalUrl;
    await delay(200);
  }
  return webLocalUrl;
}

const healthy = await waitForHub(HUB_WAIT_MS);
if (!healthy) {
  killAll();
  clearReadyUrlFile();
  process.exit(1);
}

const localUrl = await waitForWebLocalUrl(WEB_URL_WAIT_MS);
if (localUrl) {
  const control = `${localUrl.replace(/\/$/, "")}/control`;
  writeReadyUrlFile(control);
  console.log(`[dev] ready — Control ${control} · health ${HEALTH}`);
  if (!/:(5173)(\/|$)/.test(localUrl)) {
    console.log(
      `[dev] Nota: Vite no usó 5173 — abrí exactamente ${control} (no asumas :5173).`,
    );
  }
} else {
  console.log(
    `[dev] ready — hub OK (${HEALTH}). Todavía no vi “Local:” de Vite.`,
  );
  console.log(
    `[dev] Buscá en los logs [web] la línea Local: http://localhost:PUERTO — NO asumas :5173.`,
  );
}

try {
  await result;
} catch {
  clearReadyUrlFile();
  process.exit(1);
}
clearReadyUrlFile();

