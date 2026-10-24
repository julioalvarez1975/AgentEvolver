import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { Hono } from "hono";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  JoinSessionRequest,
  JoinSessionResponse,
  SessionMode,
} from "@promedia/shared";
import { assetStore } from "./asset-store.js";
import { authorizeSessionAccess } from "./auth.js";
import { broadcastSession } from "./broadcast.js";
import { playlistStore } from "./playlist-store.js";
import { sessionStore } from "./session-store.js";
import {
  TEXT_IMPORT_MAX_BYTES,
  parsePdfBuffer,
} from "./text-import.js";

function publicBase(c: {
  req: { url: string; header: (name: string) => string | undefined };
}): { http: string; ws: string } {
  const url = new URL(c.req.url);
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? url.host;
  const forwardedProto = c.req.header("x-forwarded-proto");
  const proto =
    forwardedProto === "https" || url.protocol === "https:" ? "https" : "http";
  const wsProto = proto === "https" ? "wss" : "ws";
  return {
    http: `${proto}://${host}`,
    ws: `${wsProto}://${host}`,
  };
}

function buildWsUrl(
  baseWs: string,
  sessionId: string,
  role: "control" | "output",
  ticket: string,
): string {
  const q = new URLSearchParams({
    sessionId,
    role,
    credential: ticket,
  });
  return `${baseWs}/api/v1/ws?${q.toString()}`;
}

function bearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1] ?? null;
}

export function createApiRoutes(): Hono {
  const api = new Hono();

  api.post("/sessions", async (c) => {
    let body: CreateSessionRequest = {};
    try {
      body = (await c.req.json()) as CreateSessionRequest;
    } catch {
      body = {};
    }

    const envMode = (process.env.PROMEDIA_MODE ?? "").toLowerCase();
    const defaultMode: SessionMode =
      envMode === "cloud" || envMode === "portable" || envMode === "lan"
        ? envMode
        : "lan";
    const mode: SessionMode =
      body.mode === "cloud" || body.mode === "portable" || body.mode === "lan"
        ? body.mode
        : defaultMode;

    const { session, ticket } = sessionStore.create(mode);
    const bases = publicBase(c);
    const snapshot = sessionStore.toSnapshot(session);

    const response: CreateSessionResponse = {
      sessionId: session.id,
      code: session.code,
      accessToken: session.accessToken,
      role: "control",
      wsTicket: ticket.ticket,
      joinUrl: `${bases.http}/output?token=${encodeURIComponent(session.accessToken)}`,
      wsUrl: buildWsUrl(bases.ws, session.id, "control", ticket.ticket),
      snapshot,
    };

    return c.json(response, 201);
  });

  api.post("/sessions/join", async (c) => {
    let body: JoinSessionRequest;
    try {
      body = (await c.req.json()) as JoinSessionRequest;
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }

    const hasCode = typeof body.code === "string" && body.code.length > 0;
    const hasToken =
      typeof body.accessToken === "string" && body.accessToken.length > 0;

    if (hasCode === hasToken) {
      return c.json(
        { error: "provide exactly one of code or accessToken" },
        400,
      );
    }

    const session = hasCode
      ? sessionStore.findByCode(body.code!)
      : sessionStore.findByAccessToken(body.accessToken!);

    if (!session) {
      return c.json({ error: "invalid_credentials" }, 401);
    }

    const role =
      body.role === "control" || body.role === "output" ? body.role : "output";
    const ticket = sessionStore.issueTicket(session.id, role);
    const bases = publicBase(c);
    const snapshot = sessionStore.toSnapshot(session);

    const response: JoinSessionResponse = {
      sessionId: session.id,
      code: session.code,
      role,
      wsTicket: ticket.ticket,
      wsUrl: buildWsUrl(bases.ws, session.id, role, ticket.ticket),
      snapshot,
    };

    return c.json(response);
  });

  api.get("/sessions/:sessionId", (c) => {
    const sessionId = c.req.param("sessionId");
    const session = sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ snapshot: sessionStore.toSnapshot(session) });
  });

  /**
   * Upload image or video asset (control only). Multipart field `file`.
   * Auth: Authorization Bearer <wsTicket> or query ?credential=
   * Video MIMEs: mp4/webm/quicktime (Q1). No hard size cap.
   */
  api.post("/sessions/:sessionId/assets", async (c) => {
    const sessionId = c.req.param("sessionId");
    const credential =
      bearerToken(c.req.header("authorization")) ?? c.req.query("credential");
    const access = authorizeSessionAccess(sessionId, {
      credential,
      requireRole: "control",
    });
    if (!access.ok) {
      return c.json({ error: access.error }, access.status);
    }

    let body: Record<string, string | File>;
    try {
      body = (await c.req.parseBody({ all: true })) as Record<
        string,
        string | File
      >;
    } catch {
      return c.json({ error: "invalid_multipart" }, 400);
    }

    const file = body.file;
    if (!file || typeof file === "string") {
      return c.json({ error: "missing_file" }, 400);
    }

    const mime = file.type || "application/octet-stream";
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await assetStore.putByMime(
      sessionId,
      bytes,
      mime,
      file.name,
    );
    if ("error" in result) {
      return c.json({ error: result.error }, 400);
    }
    return c.json({ asset: result }, 201);
  });

  /**
   * Parse an uploaded document into page/paragraph text for Control text import.
   * PDF only on hub (pdf-parse). Auth not required — no session mutation.
   */
  api.post("/parse/document", async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      return c.json({ error: "missing_file" }, 400);
    }
    if (file.size > TEXT_IMPORT_MAX_BYTES) {
      return c.json({ error: "file_too_large" }, 400);
    }
    const name = file.name.toLowerCase();
    const isPdf =
      name.endsWith(".pdf") || file.type === "application/pdf";
    if (!isPdf) {
      return c.json({ error: "unsupported_type" }, 400);
    }
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const result = await parsePdfBuffer(bytes);
      return c.json(result);
    } catch (err) {
      return c.json(
        { error: "parse_failed", detail: String(err) },
        400,
      );
    }
  });

  /** List named SavedPlaylists (global to hub process / data file). */
  api.get("/playlists", async (c) => {
    const list = await playlistStore.list();
    return c.json({
      playlists: list.map(({ id, name, createdAt, updatedAt, items }) => ({
        id,
        name,
        createdAt,
        updatedAt,
        itemCount: items.length,
      })),
    });
  });

  api.get("/playlists/:id", async (c) => {
    const saved = await playlistStore.get(c.req.param("id"));
    if (!saved) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ playlist: saved });
  });

  /** Save current session playlist under a name (control). */
  api.post("/sessions/:sessionId/playlists", async (c) => {
    const sessionId = c.req.param("sessionId");
    const credential =
      bearerToken(c.req.header("authorization")) ?? c.req.query("credential");
    const access = authorizeSessionAccess(sessionId, {
      credential,
      requireRole: "control",
    });
    if (!access.ok) {
      return c.json({ error: access.error }, access.status);
    }
    const session = sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: "not_found" }, 404);
    }
    let body: { name?: string; id?: string } = {};
    try {
      body = (await c.req.json()) as { name?: string; id?: string };
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    if (typeof body.name !== "string") {
      return c.json({ error: "missing_name" }, 400);
    }
    const result = await playlistStore.save({
      name: body.name,
      id: typeof body.id === "string" ? body.id : undefined,
      items: session.playlist.items,
    });
    if ("error" in result) {
      return c.json({ error: result.error }, 400);
    }
    return c.json({ playlist: result }, 201);
  });

  /** Load a SavedPlaylist into the session playlist (control). */
  api.post("/sessions/:sessionId/playlists/:playlistId/load", async (c) => {
    const sessionId = c.req.param("sessionId");
    const playlistId = c.req.param("playlistId");
    const credential =
      bearerToken(c.req.header("authorization")) ?? c.req.query("credential");
    const access = authorizeSessionAccess(sessionId, {
      credential,
      requireRole: "control",
    });
    if (!access.ok) {
      return c.json({ error: access.error }, access.status);
    }
    const session = sessionStore.get(sessionId);
    if (!session) {
      return c.json({ error: "not_found" }, 404);
    }
    const saved = await playlistStore.get(playlistId);
    if (!saved) {
      return c.json({ error: "not_found" }, 404);
    }
    // Re-id items so load can be repeated without duplicate_id conflicts
    const cloned = saved.items.map((item, order) => ({
      ...item,
      id: `${item.id.slice(0, 8)}-${Date.now().toString(36)}-${order}`,
      order,
    }));
    const result = sessionStore.replacePlaylist(session, cloned);
    if ("error" in result) {
      return c.json({ error: result.error }, 400);
    }
    broadcastSession(sessionId, result.message);
    return c.json({
      snapshot: sessionStore.toSnapshot(session),
      skipped: result.skipped,
      note: "File image/video assets are session-scoped; missing media were skipped.",
    });
  });

  api.delete("/playlists/:id", async (c) => {
    const ok = await playlistStore.remove(c.req.param("id"));
    if (!ok) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ ok: true });
  });

  /**
   * Serve asset bytes. Auth via credential / code / accessToken query.
   */
  api.get("/sessions/:sessionId/assets/:assetId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const assetId = c.req.param("assetId");
    const access = authorizeSessionAccess(sessionId, {
      credential: c.req.query("credential"),
      code: c.req.query("code"),
      accessToken: c.req.query("accessToken") ?? c.req.query("token"),
    });
    if (!access.ok) {
      return c.json({ error: access.error }, access.status);
    }

    const asset = assetStore.get(sessionId, assetId);
    if (!asset) {
      return c.json({ error: "not_found" }, 404);
    }

    try {
      const { path: filePath } = await assetStore.getAdapter().open(asset.storageKey);
      await stat(filePath);
      const nodeStream = createReadStream(filePath);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream;
      return new Response(webStream, {
        status: 200,
        headers: {
          "Content-Type": asset.mime,
          "Cache-Control": "private, max-age=60",
        },
      });
    } catch {
      return c.json({ error: "file_missing" }, 404);
    }
  });

  return api;
}
