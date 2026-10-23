import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { SHARED_PACKAGE_VERSION } from "@promedia/shared";
import { createApiRoutes } from "./routes.js";
import { WsHub } from "./ws-hub.js";

const app = new Hono();
const port = Number(process.env.PORT ?? 8787);

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

console.log(`ProMedia hub listening on http://localhost:${port}`);

const server = serve({
  fetch: app.fetch,
  port,
});

// Attach WS upgrade handler (ticket auth on /api/v1/ws)
new WsHub(server as import("node:http").Server);
