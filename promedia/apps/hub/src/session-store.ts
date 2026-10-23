import type {
  ClientRole,
  HubMessage,
  SessionLiveState,
  SessionMode,
  SessionSnapshot,
  SessionUpdatedPayload,
} from "@promedia/shared";
import { emptyLiveState } from "@promedia/shared";
import {
  generateAccessToken,
  generateSessionId,
  generateShortCode,
  generateWsTicket,
} from "./ids.js";

const EVENT_BUFFER_SIZE = 100;

export type WsTicketRecord = {
  ticket: string;
  sessionId: string;
  role: ClientRole;
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  code: string;
  accessToken: string;
  mode: SessionMode;
  createdAt: string;
  seq: number;
  live: SessionLiveState;
  lastTouchAt?: string;
  touchNote?: string;
  /** Ring buffer of recent hub→client events for catch-up. */
  eventBuffer: HubMessage[];
};

function nowIso(): string {
  return new Date().toISOString();
}

export class SessionStore {
  private readonly byId = new Map<string, SessionRecord>();
  private readonly byCode = new Map<string, string>();
  private readonly byAccessToken = new Map<string, string>();
  private readonly tickets = new Map<string, WsTicketRecord>();

  create(mode: SessionMode = "lan"): {
    session: SessionRecord;
    ticket: WsTicketRecord;
  } {
    let code = generateShortCode(4);
    while (this.byCode.has(code)) {
      code = generateShortCode(4);
    }

    const id = generateSessionId();
    const accessToken = generateAccessToken();
    const createdAt = nowIso();

    const session: SessionRecord = {
      id,
      code,
      accessToken,
      mode,
      createdAt,
      seq: 0,
      live: emptyLiveState(),
      eventBuffer: [],
    };

    this.byId.set(id, session);
    this.byCode.set(code, id);
    this.byAccessToken.set(accessToken, id);

    const ticket = this.issueTicket(id, "control");
    return { session, ticket };
  }

  get(sessionId: string): SessionRecord | undefined {
    return this.byId.get(sessionId);
  }

  findByCode(code: string): SessionRecord | undefined {
    const id = this.byCode.get(code.trim().toUpperCase());
    return id ? this.byId.get(id) : undefined;
  }

  findByAccessToken(accessToken: string): SessionRecord | undefined {
    const id = this.byAccessToken.get(accessToken);
    return id ? this.byId.get(id) : undefined;
  }

  issueTicket(sessionId: string, role: ClientRole): WsTicketRecord {
    const record: WsTicketRecord = {
      ticket: generateWsTicket(),
      sessionId,
      role,
      createdAt: nowIso(),
    };
    this.tickets.set(record.ticket, record);
    return record;
  }

  getTicket(ticket: string): WsTicketRecord | undefined {
    return this.tickets.get(ticket);
  }

  toSnapshot(session: SessionRecord): SessionSnapshot {
    return {
      id: session.id,
      code: session.code,
      mode: session.mode,
      createdAt: session.createdAt,
      seq: session.seq,
      live: { ...session.live },
      lastTouchAt: session.lastTouchAt,
      touchNote: session.touchNote,
    };
  }

  makeMessage(
    session: SessionRecord,
    type: string,
    payload: unknown,
  ): HubMessage {
    return {
      type,
      seq: session.seq,
      sessionId: session.id,
      ts: nowIso(),
      payload,
    };
  }

  pushEvent(session: SessionRecord, message: HubMessage): void {
    session.eventBuffer.push(message);
    if (session.eventBuffer.length > EVENT_BUFFER_SIZE) {
      session.eventBuffer.splice(0, session.eventBuffer.length - EVENT_BUFFER_SIZE);
    }
  }

  /**
   * Control-only stub mutation. Increments seq and returns the broadcast message.
   */
  touch(session: SessionRecord, note?: string): HubMessage {
    session.seq += 1;
    session.lastTouchAt = nowIso();
    if (note !== undefined) {
      session.touchNote = note;
    }

    const payload: SessionUpdatedPayload = {
      seq: session.seq,
      lastTouchAt: session.lastTouchAt,
      touchNote: session.touchNote,
      live: { ...session.live },
    };

    const message = this.makeMessage(session, "session.updated", payload);
    this.pushEvent(session, message);
    return message;
  }

  /**
   * Catch-up: replay buffered events after lastSeq, or null → caller should send snapshot.
   */
  eventsAfter(session: SessionRecord, lastSeq: number): HubMessage[] | null {
    if (session.eventBuffer.length === 0) {
      return null;
    }
    const oldest = session.eventBuffer[0]?.seq ?? 0;
    if (lastSeq + 1 < oldest) {
      return null;
    }
    return session.eventBuffer.filter((m) => m.seq > lastSeq);
  }
}

export const sessionStore = new SessionStore();
