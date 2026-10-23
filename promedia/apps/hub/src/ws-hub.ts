import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type {
  ClientRole,
  ClientToHubMessage,
  ErrorPayload,
  HubMessage,
} from "@promedia/shared";
import { sessionStore, type SessionRecord } from "./session-store.js";

type ClientConn = {
  ws: WebSocket;
  sessionId: string;
  role: ClientRole;
  lastSeq: number;
};

function send(ws: WebSocket, message: HubMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(
  ws: WebSocket,
  sessionId: string,
  seq: number,
  code: string,
  message: string,
): void {
  const payload: ErrorPayload = { code, message };
  send(ws, {
    type: "error",
    seq,
    sessionId,
    ts: new Date().toISOString(),
    payload,
  });
}

function parseClientMessage(raw: string): ClientToHubMessage | null {
  try {
    const data = JSON.parse(raw) as { type?: string; payload?: unknown };
    if (!data || typeof data.type !== "string") {
      return null;
    }
    if (data.type === "client.hello") {
      return { type: "client.hello", payload: data.payload as Record<string, unknown> };
    }
    if (data.type === "client.resync") {
      const lastSeq = (data.payload as { lastSeq?: unknown } | undefined)?.lastSeq;
      if (typeof lastSeq !== "number" || !Number.isFinite(lastSeq)) {
        return null;
      }
      return { type: "client.resync", payload: { lastSeq } };
    }
    if (data.type === "session.touch") {
      const note = (data.payload as { note?: unknown } | undefined)?.note;
      return {
        type: "session.touch",
        payload: typeof note === "string" ? { note } : {},
      };
    }
    return null;
  } catch {
    return null;
  }
}

export class WsHub {
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<ClientConn>();

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (!url.pathname.endsWith("/api/v1/ws") && url.pathname !== "/api/v1/ws") {
        socket.destroy();
        return;
      }

      const sessionId = url.searchParams.get("sessionId") ?? "";
      const role = url.searchParams.get("role") as ClientRole | null;
      const credential = url.searchParams.get("credential") ?? "";

      const rejected = this.validateUpgrade(sessionId, role, credential);
      if (rejected) {
        socket.write(
          `HTTP/1.1 ${rejected.status} ${rejected.statusText}\r\nConnection: close\r\n\r\n`,
        );
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.onConnection(ws, req, sessionId, role as ClientRole);
      });
    });
  }

  private validateUpgrade(
    sessionId: string,
    role: ClientRole | null,
    credential: string,
  ): { status: number; statusText: string } | null {
    if (!sessionId || !credential || (role !== "control" && role !== "output")) {
      return { status: 401, statusText: "Unauthorized" };
    }
    const session = sessionStore.get(sessionId);
    if (!session) {
      return { status: 401, statusText: "Unauthorized" };
    }
    const ticket = sessionStore.getTicket(credential);
    if (!ticket || ticket.sessionId !== sessionId || ticket.role !== role) {
      return { status: 403, statusText: "Forbidden" };
    }
    return null;
  }

  private onConnection(
    ws: WebSocket,
    _req: IncomingMessage,
    sessionId: string,
    role: ClientRole,
  ): void {
    const session = sessionStore.get(sessionId);
    if (!session) {
      ws.close(4401, "session not found");
      return;
    }

    const conn: ClientConn = {
      ws,
      sessionId,
      role,
      lastSeq: session.seq,
    };
    this.clients.add(conn);

    const snapshotMsg = sessionStore.makeMessage(
      session,
      "session.snapshot",
      sessionStore.toSnapshot(session),
    );
    send(ws, snapshotMsg);

    ws.on("message", (data) => {
      const text = typeof data === "string" ? data : data.toString("utf8");
      this.handleClientMessage(conn, session, text);
    });

    ws.on("close", () => {
      this.clients.delete(conn);
    });

    ws.on("error", () => {
      this.clients.delete(conn);
    });
  }

  private handleClientMessage(
    conn: ClientConn,
    session: SessionRecord,
    raw: string,
  ): void {
    const msg = parseClientMessage(raw);
    if (!msg) {
      sendError(conn.ws, session.id, session.seq, "bad_request", "Invalid message");
      return;
    }

    if (msg.type === "client.hello") {
      const snapshotMsg = sessionStore.makeMessage(
        session,
        "session.snapshot",
        sessionStore.toSnapshot(session),
      );
      send(conn.ws, snapshotMsg);
      conn.lastSeq = session.seq;
      return;
    }

    if (msg.type === "client.resync") {
      this.handleResync(conn, session, msg.payload.lastSeq);
      return;
    }

    if (msg.type === "session.touch") {
      if (conn.role !== "control") {
        sendError(
          conn.ws,
          session.id,
          session.seq,
          "forbidden",
          "output cannot mutate session",
        );
        return;
      }
      const liveSession = sessionStore.get(session.id);
      if (!liveSession) {
        sendError(conn.ws, session.id, 0, "not_found", "Session gone");
        return;
      }
      const updated = sessionStore.touch(liveSession, msg.payload?.note);
      this.broadcast(liveSession.id, updated);
      return;
    }
  }

  private handleResync(
    conn: ClientConn,
    session: SessionRecord,
    lastSeq: number,
  ): void {
    const live = sessionStore.get(session.id);
    if (!live) {
      sendError(conn.ws, session.id, 0, "not_found", "Session gone");
      return;
    }

    if (lastSeq >= live.seq) {
      conn.lastSeq = live.seq;
      return;
    }

    const events = sessionStore.eventsAfter(live, lastSeq);
    if (events === null) {
      const snapshotMsg = sessionStore.makeMessage(
        live,
        "session.snapshot",
        sessionStore.toSnapshot(live),
      );
      send(conn.ws, snapshotMsg);
      conn.lastSeq = live.seq;
      return;
    }

    for (const event of events) {
      send(conn.ws, event);
      conn.lastSeq = event.seq;
    }
  }

  broadcast(sessionId: string, message: HubMessage): void {
    for (const conn of this.clients) {
      if (conn.sessionId !== sessionId) {
        continue;
      }
      if (message.seq <= conn.lastSeq) {
        continue;
      }
      send(conn.ws, message);
      conn.lastSeq = message.seq;
    }
  }
}
