import { Hono } from "hono";
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  JoinSessionRequest,
  JoinSessionResponse,
  SessionMode,
} from "@promedia/shared";
import { sessionStore } from "./session-store.js";

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

export function createApiRoutes(): Hono {
  const api = new Hono();

  api.post("/sessions", async (c) => {
    let body: CreateSessionRequest = {};
    try {
      body = (await c.req.json()) as CreateSessionRequest;
    } catch {
      body = {};
    }

    const mode: SessionMode =
      body.mode === "cloud" || body.mode === "portable" || body.mode === "lan"
        ? body.mode
        : "lan";

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

  return api;
}
