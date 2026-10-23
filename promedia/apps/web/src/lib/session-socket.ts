import type { HubMessage } from "@promedia/shared";

export type SessionSocketHandlers = {
  onMessage: (msg: HubMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: Event) => void;
};

/**
 * Minimal WS client: applies seq idempotency and supports resync on demand.
 */
export class SessionSocket {
  private ws: WebSocket | null = null;
  private lastSeq = -1;
  private readonly url: string;
  private readonly handlers: SessionSocketHandlers;

  constructor(url: string, handlers: SessionSocketHandlers) {
    this.url = url;
    this.handlers = handlers;
  }

  get appliedSeq(): number {
    return this.lastSeq;
  }

  connect(): void {
    this.disconnect();
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.handlers.onOpen?.();
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as HubMessage;
        if (typeof msg.seq === "number" && msg.seq <= this.lastSeq) {
          return;
        }
        if (typeof msg.seq === "number") {
          this.lastSeq = msg.seq;
        }
        this.handlers.onMessage(msg);
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = () => {
      this.handlers.onClose?.();
    };

    ws.onerror = (err) => {
      this.handlers.onError?.(err);
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  send(type: string, payload?: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify({ type, payload }));
  }

  resync(): void {
    this.send("client.resync", { lastSeq: Math.max(this.lastSeq, 0) });
  }

  /**
   * Drop the socket without clearing lastSeq, then reconnect and ask for catch-up.
   */
  reconnectWithResync(): void {
    const last = this.lastSeq;
    this.disconnect();
    this.lastSeq = last;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.handlers.onOpen?.();
      // After automatic snapshot on connect, request catch-up from lastSeq
      this.send("client.resync", { lastSeq: Math.max(last, 0) });
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as HubMessage;
        if (typeof msg.seq === "number" && msg.seq <= this.lastSeq) {
          return;
        }
        if (typeof msg.seq === "number") {
          this.lastSeq = msg.seq;
        }
        this.handlers.onMessage(msg);
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      this.handlers.onClose?.();
    };

    ws.onerror = (err) => {
      this.handlers.onError?.(err);
    };
  }
}
