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
    if (!this.ws) {
      return;
    }
    const ws = this.ws;
    this.ws = null;
    const wasOpenOrConnecting =
      ws.readyState === WebSocket.OPEN ||
      ws.readyState === WebSocket.CONNECTING;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    if (wasOpenOrConnecting) {
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    // Always notify — otherwise UI can stay wsStatus "open" while send() no-ops
    // (handlers were cleared before the browser close event).
    this.handlers.onClose?.();
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** @returns false if the socket is not open (caller should reconnect / warn). */
  send(type: string, payload?: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.ws.send(JSON.stringify({ type, payload }));
    return true;
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
