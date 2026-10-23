import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { SHARED_PACKAGE_VERSION } from "@promedia/shared";

const app = new Hono();

const port = Number(process.env.PORT ?? 8787);

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
    status: "scaffold",
    health: "/health",
  }),
);

console.log(`ProMedia hub listening on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
