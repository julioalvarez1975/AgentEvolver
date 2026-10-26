/**
 * ProMedia shared protocol types (subtarea 2–8+).
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

/**
 * Bible passage as slides (one verse per slide). Renders like text on Output.
 * Version ids: rvr1909 | pdt | kjv | asv (see README licensing).
 */
export type BiblePayload = {
  versionId: string;
  versionLabel: string;
  bookId: string;
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  /** Display reference, e.g. "Juan 3:16-17". */
  reference: string;
  copyright?: string;
  /** True when served from embedded offline subset. */
  fromCache?: boolean;
  slides: TextSlide[];
  align?: TextAlign;
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

export type VideoPlaylistItem = {
  id: string;
  type: "video";
  order: number;
  payload: VideoPayload;
};

export type BiblePlaylistItem = {
  id: string;
  type: "bible";
  order: number;
  payload: BiblePayload;
};

/** One projected page/slide of an imported presentation (image or SVG asset). */
export type PresentationSlide = {
  id: string;
  assetId: string;
};

/**
 * View-only presentation (PPTX/PDF/… import). No native edit — ←/→ navigates slides.
 */
export type PresentationPayload = {
  title?: string;
  fit: ImageFit;
  slides: PresentationSlide[];
  /** Original filename kept for operator reference / re-download from library. */
  originalName?: string;
  libraryItemId?: string;
};

export type PresentationPlaylistItem = {
  id: string;
  type: "presentation";
  order: number;
  payload: PresentationPayload;
};

export type PlaylistItemType =
  | "text"
  | "image"
  | "video"
  | "bible"
  | "presentation";

export type PlaylistItem =
  | TextPlaylistItem
  | ImagePlaylistItem
  | VideoPlaylistItem
  | BiblePlaylistItem
  | PresentationPlaylistItem;

/** Local media library categories (Phase 1 — on-disk, not cloud). */
export type LibraryCategory =
  | "canciones"
  | "biblias"
  | "textos"
  | "presentaciones"
  | "imagenes"
  | "videos";

export const LIBRARY_CATEGORIES: readonly LibraryCategory[] = [
  "canciones",
  "biblias",
  "textos",
  "presentaciones",
  "imagenes",
  "videos",
] as const;

export type LibrarySongStanza = {
  id: string;
  lines: string[];
};

export type LibrarySongPayload = {
  title: string;
  artist?: string;
  stanzas: LibrarySongStanza[];
};

export type LibraryFileRef = {
  relativePath: string;
  mime: string;
  originalName: string;
  size: number;
};

export type LibrarySlideRef = {
  id: string;
  relativePath: string;
  mime: string;
};

export type LibraryItem = {
  id: string;
  category: LibraryCategory;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Songs: lyrics by stanza (projectable as text). */
  song?: LibrarySongPayload;
  /** Free-form text saved in library. */
  text?: TextPayload;
  /** Bible passage snapshot. */
  bible?: BiblePayload;
  /** Original uploaded file (presentations, images, videos, optional for others). */
  original?: LibraryFileRef;
  /** Rendered pages/slides for projection (presentations). */
  slides?: LibrarySlideRef[];
};

export type SessionPlaylist = {
  items: PlaylistItem[];
};

/** Named playlist snapshot (subtarea 9). Asset bytes stay in media store. */
export type SavedPlaylist = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
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

/** Visual overlay on Output; does not clear live item (subtarea 7). */
export type SceneMode = "normal" | "logo" | "black" | "clear";

export const SCENE_MODES: readonly SceneMode[] = [
  "normal",
  "logo",
  "black",
  "clear",
] as const;

export function isSceneMode(value: unknown): value is SceneMode {
  return (
    typeof value === "string" &&
    (SCENE_MODES as readonly string[]).includes(value)
  );
}

export type {
  ResolvedTheme,
  ThemeBackground,
  ThemeBackgroundMediaKind,
  ThemeBackgroundMode,
  ThemeBackgroundPackId,
  ThemeFontFamily,
  ThemeFontSize,
  ThemeId,
  ThemeOverrides,
  ThemePreset,
  TransitionEffect,
} from "./themes.js";
export {
  DEFAULT_THEME_BACKGROUND,
  DEFAULT_THEME_ID,
  DEFAULT_TRANSITION_EFFECT,
  THEME_BACKGROUND_PACK_IDS,
  THEME_IDS,
  THEME_PRESETS,
  TRANSITION_DURATION_MS,
  TRANSITION_EFFECTS,
  fontFamilyCss,
  fontSizeCss,
  getThemePreset,
  isThemeBackgroundMediaKind,
  isThemeBackgroundPackId,
  isThemeFontFamily,
  isThemeFontSize,
  isThemeId,
  isTransitionEffect,
  normalizeThemeBackground,
  normalizeThemeOverrides,
  resolveTheme,
  themeToCssVars,
} from "./themes.js";

import type {
  ThemeBackground,
  ThemeId,
  ThemeOverrides,
  TransitionEffect,
} from "./themes.js";
import {
  DEFAULT_THEME_BACKGROUND,
  DEFAULT_THEME_ID,
  DEFAULT_TRANSITION_EFFECT,
} from "./themes.js";

export type SessionLiveState = {
  currentItemId: string | null;
  currentSlideIndex: number;
  sceneMode: SceneMode;
  themeId: ThemeId;
  /** Deltas over preset; null = pure preset. */
  themeOverrides: ThemeOverrides | null;
  /** Stage background: solid color or media (pack / upload). */
  themeBackground: ThemeBackground;
  /** CSS transition on Output when live item changes. */
  transitionEffect: TransitionEffect;
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
      payload:
        | TextPayload
        | ImagePayload
        | VideoPayload
        | BiblePayload
        | PresentationPayload;
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

export type LiveSetSceneModeMessage = {
  type: "live.setSceneMode";
  payload: { sceneMode: SceneMode };
};

export type LiveSetThemeMessage = {
  type: "live.setTheme";
  payload: {
    themeId?: ThemeId;
    themeOverrides?: ThemeOverrides | null;
    themeBackground?: ThemeBackground | null;
    transitionEffect?: TransitionEffect;
  };
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
  | LiveMediaClockSetMessage
  | LiveSetSceneModeMessage
  | LiveSetThemeMessage;

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

export const SHARED_PACKAGE_VERSION = "0.0.14-mvp" as const;

export function emptyLiveState(): SessionLiveState {
  return {
    currentItemId: null,
    currentSlideIndex: 0,
    sceneMode: "normal",
    themeId: DEFAULT_THEME_ID,
    themeOverrides: null,
    themeBackground: { ...DEFAULT_THEME_BACKGROUND },
    transitionEffect: DEFAULT_TRANSITION_EFFECT,
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
  if (item.type === "bible") {
    const ref = item.payload.reference?.trim();
    const ver = item.payload.versionLabel?.trim() || item.payload.versionId;
    if (ref) {
      return ver ? `${ref} · ${ver}` : ref;
    }
    return ver || "Biblia";
  }
  if (item.type === "image") {
    return item.payload.title?.trim() || "Imagen";
  }
  if (item.type === "presentation") {
    return (
      item.payload.title?.trim() ||
      item.payload.originalName?.trim() ||
      "Presentación"
    );
  }
  if (item.payload.sourceKind === "youtube") {
    return item.payload.title?.trim() || `YouTube ${item.payload.videoId}`;
  }
  return item.payload.title?.trim() || "Vídeo";
}

/** Text, bible and presentation items share ←/→ slide navigation. */
export function itemHasSlides(item: PlaylistItem): boolean {
  return (
    item.type === "text" ||
    item.type === "bible" ||
    item.type === "presentation"
  );
}

/**
 * Max lines shown at once on Output / Preview / Live text stages.
 * Longer slides are split into chunks so ←/→ advances by 4 lines.
 */
export const TEXT_PROJECTION_LINES = 4;

/** Split a line list into chunks of at most `linesPerChunk` (default 4). */
export function chunkTextLines(
  lines: string[],
  linesPerChunk: number = TEXT_PROJECTION_LINES,
): string[][] {
  const limit = Math.max(1, Math.trunc(linesPerChunk));
  const source = lines.length > 0 ? lines.map((line) => String(line)) : [""];
  const chunks: string[][] = [];
  for (let i = 0; i < source.length; i += limit) {
    chunks.push(source.slice(i, i + limit));
  }
  return chunks;
}

/**
 * Expand text/bible slides so each has ≤4 lines for projection navigation.
 * Preserves intentional slide boundaries; splits only when a slide is longer.
 */
export function projectionTextSlides(
  slides: TextSlide[],
  linesPerChunk: number = TEXT_PROJECTION_LINES,
): TextSlide[] {
  if (!Array.isArray(slides) || slides.length < 1) {
    return [{ id: "empty", lines: [""] }];
  }
  const out: TextSlide[] = [];
  for (const slide of slides) {
    const parts = chunkTextLines(slide.lines ?? [], linesPerChunk);
    parts.forEach((lines, partIndex) => {
      out.push({
        id: partIndex === 0 ? slide.id : `${slide.id}__${partIndex}`,
        lines,
      });
    });
  }
  return out.length > 0 ? out : [{ id: "empty", lines: [""] }];
}

/** Slide count used by ←/→ (text/bible after 4-line chunking; presentation = pages). */
export function itemProjectionSlideCount(item: PlaylistItem): number {
  if (item.type === "presentation") {
    return Math.max(item.payload.slides.length, 0);
  }
  if (item.type !== "text" && item.type !== "bible") {
    return 0;
  }
  return projectionTextSlides(item.payload.slides).length;
}

/** Convert library song stanzas → text slides, then 4-line projection chunks. */
export function songToTextPayload(song: LibrarySongPayload): TextPayload {
  const stanzas =
    song.stanzas.length > 0
      ? song.stanzas
      : [{ id: "empty", lines: [""] as string[] }];
  const slides: TextSlide[] = stanzas.map((stanza, index) => ({
    id: stanza.id || `stanza_${index}`,
    lines: stanza.lines.length > 0 ? stanza.lines.map((l) => String(l)) : [""],
  }));
  const title = song.title.trim();
  const artist = song.artist?.trim();
  return {
    title: artist ? `${title} — ${artist}` : title || undefined,
    align: "center",
    slides: projectionTextSlides(slides),
  };
}
