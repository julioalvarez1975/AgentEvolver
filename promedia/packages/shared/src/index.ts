/**
 * ProMedia shared protocol types (subtarea 2–6).
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

export type VideoFit = "contain" | "cover";

export type VideoFilePayload = {
  sourceKind: "file";
  assetId: string;
  title?: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  fit?: VideoFit;
};

export type VideoYoutubePayload = {
  sourceKind: "youtube";
  videoId: string;
  sourceUrl: string;
  title?: string;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  fit?: VideoFit;
};

export type VideoPayload = VideoFilePayload | VideoYoutubePayload;

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

export type VideoPlaylistItem = {
  id: string;
  type: "video";
  order: number;
  payload: VideoPayload;
};

export type PlaylistItemType = "text" | "image" | "video";

export type PlaylistItem =
  | TextPlaylistItem
  | ImagePlaylistItem
  | VideoPlaylistItem;

export type SessionPlaylist = {
  items: PlaylistItem[];
};

export type MediaKind = "image" | "video";

/** Media asset metadata (bytes live on disk via packages/media). */
export type MediaAsset = {
  id: string;
  kind: MediaKind;
  mime: string;
  storageKey: string;
  size?: number;
  durationMs?: number;
  originalName?: string;
  createdAt: string;
};

export type MediaClock = {
  itemId: string;
  playing: boolean;
  positionMs: number;
  rate?: number;
  updatedAt: string;
};

export type SessionLiveState = {
  currentItemId: string | null;
  currentSlideIndex: number;
  sceneMode: "normal";
  themeId: null;
  mediaClock: MediaClock | null;
};

export type SessionSnapshot = {
  id: string;
  code: string;
  mode: SessionMode;
  createdAt: string;
  seq: number;
  live: SessionLiveState;
  playlist: SessionPlaylist;
  lastTouchAt?: string;
  touchNote?: string;
};

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
    patch: Partial<{
      payload: TextPayload | ImagePayload | VideoPayload;
      order: number;
    }>;
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

export type LiveMediaClockSetMessage = {
  type: "live.mediaClock.set";
  payload: { playing: boolean; positionMs?: number };
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
  | LiveSetSlideMessage
  | LiveMediaClockSetMessage;

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

export const SHARED_PACKAGE_VERSION = "0.0.6-video-youtube" as const;

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

export function effectiveMediaClockPositionMs(
  clock: MediaClock,
  nowMs: number = Date.now(),
): number {
  if (!clock.playing) {
    return clock.positionMs;
  }
  const updated = Date.parse(clock.updatedAt);
  if (!Number.isFinite(updated)) {
    return clock.positionMs;
  }
  const rate = clock.rate ?? 1;
  return Math.max(0, clock.positionMs + (nowMs - updated) * rate);
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
  if (item.type === "image") {
    return item.payload.title?.trim() || "Imagen";
  }
  if (item.payload.sourceKind === "youtube") {
    return item.payload.title?.trim() || `YouTube ${item.payload.videoId}`;
  }
  return item.payload.title?.trim() || "Vídeo";
}
