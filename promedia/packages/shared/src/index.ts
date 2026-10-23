/**
 * ProMedia shared protocol types (subtarea 2–5).
 * No UI logic — hub and web import these shapes.
 */

export type SessionMode = "lan" | "cloud" | "portable";

export type ClientRole = "control" | "output";

export type TextAlign = "left" | "center" | "right";

export type TextSlide = {
  id: string;
  lines: string[];
};

export type TextPayload = {
  title?: string;
  slides: TextSlide[];
  align?: TextAlign;
};

export type ImageFit = "contain" | "cover" | "fill";

export type ImagePayload = {
  assetId: string;
  fit: ImageFit;
  title?: string;
};

export type TextPlaylistItem = {
  id: string;
  type: "text";
  order: number;
  payload: TextPayload;
};

export type ImagePlaylistItem = {
  id: string;
  type: "image";
  order: number;
  payload: ImagePayload;
};

export type PlaylistItemType = "text" | "image";

export type PlaylistItem = TextPlaylistItem | ImagePlaylistItem;

export type SessionPlaylist = {
  items: PlaylistItem[];
};

export type MediaKind = "image";

/** Media asset metadata (bytes live on disk via packages/media). */
export type MediaAsset = {
  id: string;
  kind: MediaKind;
  mime: string;
  storageKey: string;
  size?: number;
  originalName?: string;
  createdAt: string;
};

export type SessionLiveState = {
  currentItemId: string | null;
  currentSlideIndex: number;
  sceneMode: "normal";
  themeId: null;
  mediaClock: null;
};

export type SessionSnapshot = {
  id: string;
  code: string;
  mode: SessionMode;
  createdAt: string;
  /** Monotonic seq assigned only by the hub. Starts at 0. */
  seq: number;
  live: SessionLiveState;
  playlist: SessionPlaylist;
  /** Smoke fields from session.touch (protocol retained; UI hidden) */
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
  live: SessionLiveState;
  playlist: SessionPlaylist;
  lastTouchAt?: string;
  touchNote?: string;
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

export type PlaylistItemAddMessage = {
  type: "playlist.itemAdd";
  payload: { item: PlaylistItem };
};

export type PlaylistItemUpdateMessage = {
  type: "playlist.itemUpdate";
  payload: {
    id: string;
    patch: Partial<{ payload: TextPayload | ImagePayload; order: number }>;
  };
};

export type PlaylistItemRemoveMessage = {
  type: "playlist.itemRemove";
  payload: { id: string };
};

export type PlaylistReorderMessage = {
  type: "playlist.reorder";
  payload: { orderedIds: string[] };
};

export type LiveGoMessage = {
  type: "live.go";
  payload: { itemId: string };
};

export type LiveClearMessage = {
  type: "live.clear";
  payload?: Record<string, never>;
};

export type LiveSetSlideMessage = {
  type: "live.setSlide";
  payload: { index: number };
};

export type ClientToHubMessage =
  | ClientHelloMessage
  | ClientResyncMessage
  | SessionTouchMessage
  | PlaylistItemAddMessage
  | PlaylistItemUpdateMessage
  | PlaylistItemRemoveMessage
  | PlaylistReorderMessage
  | LiveGoMessage
  | LiveClearMessage
  | LiveSetSlideMessage;

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

export const SHARED_PACKAGE_VERSION = "0.0.5-image-storage" as const;

export function emptyLiveState(): SessionLiveState {
  return {
    currentItemId: null,
    currentSlideIndex: 0,
    sceneMode: "normal",
    themeId: null,
    mediaClock: null,
  };
}

export function emptyPlaylist(): SessionPlaylist {
  return { items: [] };
}

export function itemLabel(item: PlaylistItem): string {
  if (item.type === "text") {
    const title = item.payload.title?.trim();
    if (title) {
      return title;
    }
    const first = item.payload.slides[0]?.lines.find((l) => l.trim().length > 0);
    return first?.trim() || "Texto";
  }
  const title = item.payload.title?.trim();
  return title || "Imagen";
}
