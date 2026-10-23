/**
 * ProMedia shared protocol types (subtarea 2).
 * No UI logic — hub and web import these shapes.
 */

export type SessionMode = "lan" | "cloud" | "portable";

export type ClientRole = "control" | "output";

export type SessionLiveState = {
  currentItemId: null;
  currentSlideIndex: number;
  sceneMode: "normal";
  themeId: null;
  mediaClock: null;
};

/** Minimal session snapshot for subtarea 2 (no playlist/items). */
export type SessionSnapshot = {
  id: string;
  code: string;
  mode: SessionMode;
  createdAt: string;
  /** Monotonic seq assigned only by the hub. Starts at 0. */
  seq: number;
  live: SessionLiveState;
  /** Smoke fields from session.touch */
  lastTouchAt?: string;
  touchNote?: string;
};

/** Hub → client envelope. `seq` is always set by the hub. */
export type HubMessage = {
  type: string;
  seq: number;
  sessionId: string;
  ts: string;
  payload: unknown;
};

export type SessionSnapshotPayload = SessionSnapshot;

export type SessionUpdatedPayload = {
  seq: number;
  lastTouchAt?: string;
  touchNote?: string;
  live: SessionLiveState;
};

export type SessionEndedPayload = {
  reason: string;
};

export type ErrorPayload = {
  code: string;
  message: string;
};

/** Client → hub (no client-assigned seq). */
export type ClientHelloMessage = {
  type: "client.hello";
  payload?: Record<string, unknown>;
};

export type ClientResyncMessage = {
  type: "client.resync";
  payload: { lastSeq: number };
};

export type SessionTouchMessage = {
  type: "session.touch";
  payload?: { note?: string };
};

export type ClientToHubMessage =
  | ClientHelloMessage
  | ClientResyncMessage
  | SessionTouchMessage;

export type CreateSessionRequest = {
  mode?: SessionMode;
};

export type CreateSessionResponse = {
  sessionId: string;
  code: string;
  accessToken: string;
  role: "control";
  wsTicket: string;
  joinUrl: string;
  wsUrl: string;
  snapshot: SessionSnapshot;
};

export type JoinSessionRequest = {
  code?: string;
  accessToken?: string;
  role?: ClientRole;
};

export type JoinSessionResponse = {
  sessionId: string;
  code: string;
  role: ClientRole;
  wsTicket: string;
  wsUrl: string;
  snapshot: SessionSnapshot;
};

export const SHARED_PACKAGE_VERSION = "0.0.2-hub-ws" as const;

export function emptyLiveState(): SessionLiveState {
  return {
    currentItemId: null,
    currentSlideIndex: 0,
    sceneMode: "normal",
    themeId: null,
    mediaClock: null,
  };
}
