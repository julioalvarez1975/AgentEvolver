import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { SHARED_PACKAGE_VERSION } from "@promedia/shared";
import { setSessionBroadcaster } from "./broadcast.js";
import { createApiRoutes } from "./routes.js";
import { WsHub } from "./ws-hub.js";

const app = new Hono();
const port = Number(process.env.PORT ?? 8787);
const deployMode = (process.env.PROMEDIA_MODE ?? "lan").toLowerCase();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "promedia-hub",
    shared: SHARED_PACKAGE_VERSION,
    mode: deployMode,
    mediaAdapter: process.env.MEDIA_ADAPTER ?? (deployMode === "cloud" ? "s3-compatible" : "local"),
  }),
);

app.get("/", (c) =>
  c.json({
    name: "ProMedia Hub",
    status: "hub-ws",
    health: "/health",
    api: "/api/v1",
    note: "Sessions are in-memory; hub restart clears them.",
  }),
);

app.route("/api/v1", createApiRoutes());

console.log(
  `ProMedia hub listening on http://localhost:${port} (mode=${deployMode})`,
);

const server = serve({
  fetch: app.fetch,
  port,
});

// Attach WS upgrade handler (ticket auth on /api/v1/ws)
const hub = new WsHub(server as import("node:http").Server);
setSessionBroadcaster((sessionId, message) => hub.broadcast(sessionId, message));
