import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyTextPayload,
  cryptoRandomId,
  getItemType,
  parseYouTubeUrl,
} from "@promedia/item-types";
import type {
  BiblePayload,
  ImageFit,
  ImagePayload,
  PlaylistItem,
  SceneMode,
  TextPayload,
  ThemeId,
  TransitionEffect,
  VideoPayload,
} from "@promedia/shared";
import {
  DEFAULT_THEME_ID,
  DEFAULT_TRANSITION_EFFECT,
  itemHasSlides,
} from "@promedia/shared";
import { AboutDialog } from "../components/AboutDialog";
import { BibleDialog } from "../components/BibleDialog";
import { ControlAdBanner } from "../components/ControlAdBanner";
import { ControlHeaderToolbar } from "../components/ControlHeaderToolbar";
import { LinkAddDialog } from "../components/LinkAddDialog";
import { SavedPlaylistPanel } from "../components/SavedPlaylistPanel";
import { SchedulePanel } from "../components/SchedulePanel";
import { StatusTip } from "../components/StatusTip";
import { TextItemEditor } from "../components/TextItemEditor";
import { IconGoLive, IconNext, IconPrev } from "../components/UiIcons";
import { useLocale } from "../locale/LocaleContext";
import { useControlShortcuts } from "../hooks/useControlShortcuts";
import { useSessionConnection } from "../hooks/useSessionConnection";
import {
  LARGE_IMAGE_WARN_BYTES,
  LARGE_VIDEO_WARN_BYTES,
  buildAssetUrl,
  uploadSessionAsset,
} from "../lib/assets";
import {
  UNIFIED_MEDIA_ACCEPT,
  classifyMediaFile,
} from "../lib/classifyMediaFile";
import {
  loadPersistedControlSession,
  savePersistedControlSession,
} from "../lib/controlSessionPersist";
import { openOutputWindow, startProjection } from "../lib/openOutputWindow";
import {
  TEXT_IMPORT_MAX_BYTES,
  TEXT_IMPORT_MAX_SLIDES,
  importFileToTextSlides,
} from "../lib/textImport";
import { themeSurfaceStyle } from "../lib/theme";

function assetSrcFor(
  sessionId: string,
  wsTicket: string,
  item: PlaylistItem | null,
): string | undefined {
  if (!item || !sessionId || !wsTicket) {
    return undefined;
  }
  if (item.type === "image") {
    return buildAssetUrl(sessionId, item.payload.assetId, wsTicket);
  }
  if (item.type === "video" && item.payload.sourceKind === "file") {
    return buildAssetUrl(sessionId, item.payload.assetId, wsTicket);
  }
  return undefined;
}

/** Product Control — text + image + video playlist (subtarea 6). */
export function ControlPage() {
  const { t } = useLocale();
  const session = useSessionConnection("control");
  const [joinCode, setJoinCode] = useState("");
  const [popupBlockedUrl, setPopupBlockedUrl] = useState<string | null>(null);
  const [projectionBusy, setProjectionBusy] = useState(false);
  const autoSessionStarted = useRef(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  /** Multi-select for bulk remove (checkboxes); separate from preview selection. */
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [bibleDialogOpen, setBibleDialogOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  /** Soft hints retained for setters (upload / playlist); message log panel removed. */
  const [, setUploadHint] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  /** Remember video durations (preview metadata) for remaining-time / scrub max. */
  const [durationByItemId, setDurationByItemId] = useState<
    Record<string, number>
  >({});
  const unifiedInputRef = useRef<HTMLInputElement>(null);
  /** Track item count for sequential multi-file order without stale closure. */
  const itemsLenRef = useRef(0);

  const rememberDuration = (itemId: string | null, ms: number) => {
    if (!itemId || !(ms > 0)) {
      return;
    }
    setDurationByItemId((prev) =>
      prev[itemId] === ms ? prev : { ...prev, [itemId]: ms },
    );
  };

  const items = session.snapshot?.playlist.items ?? [];
  itemsLenRef.current = items.length;
  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );
  const selectedIndex = useMemo(
    () => items.findIndex((i) => i.id === selectedItemId),
    [items, selectedItemId],
  );
  const liveItemId = session.snapshot?.live.currentItemId ?? null;
  const liveItem = useMemo(
    () => items.find((i) => i.id === liveItemId) ?? null,
    [items, liveItemId],
  );
  const liveSlideIndex = session.snapshot?.live.currentSlideIndex ?? 0;
  const mediaClock = session.snapshot?.live.mediaClock ?? null;
  const sceneMode: SceneMode = session.snapshot?.live.sceneMode ?? "normal";
  const themeId: ThemeId =
    session.snapshot?.live.themeId ?? DEFAULT_THEME_ID;
  const themeOverrides = session.snapshot?.live.themeOverrides ?? null;
  const transitionEffect: TransitionEffect =
    session.snapshot?.live.transitionEffect ?? DEFAULT_TRANSITION_EFFECT;
  const themeStyle = themeSurfaceStyle(themeId, themeOverrides);

  const toggleSceneMode = (mode: SceneMode) => {
    if (session.wsStatus !== "open") {
      return;
    }
    // Active mode → normal; otherwise set mode
    session.setSceneMode(sceneMode === mode ? "normal" : mode);
  };

  const wsReady = session.wsStatus === "open";
  const sessionReady = session.hasSession;
  /** Playlist chrome needs a session; mutations need WS (auto-reconnects if down). */
  const canMutate = sessionReady && wsReady;

  const canGoLive = Boolean(
    selectedItem &&
      (selectedItem.type === "text" ||
        selectedItem.type === "image" ||
        selectedItem.type === "video" ||
        selectedItem.type === "bible") &&
      canMutate,
  );

  const persistSession = (code: string, accessToken?: string) => {
    savePersistedControlSession({ code, accessToken });
  };

  const createRef = useRef(session.create);
  const joinRef = useRef(session.join);
  createRef.current = session.create;
  joinRef.current = session.join;

  // After hub is healthy: create or resume session so Control WS is ready.
  // Opening Output still needs a click ("Iniciar proyección") — browsers block popups.
  useEffect(() => {
    if (autoSessionStarted.current) {
      return;
    }
    if (session.hubChecking || session.hubUnreachable) {
      return;
    }
    if (session.hasSession) {
      autoSessionStarted.current = true;
      if (session.code) {
        persistSession(session.code, session.accessToken || undefined);
      }
      return;
    }
    autoSessionStarted.current = true;
    void (async () => {
      try {
        const saved = loadPersistedControlSession();
        if (saved?.code) {
          try {
            const res = await joinRef.current({ code: saved.code });
            persistSession(res.code, saved.accessToken);
            return;
          } catch {
            // Stale code after hub restart — create a fresh session.
          }
        }
        const res = await createRef.current();
        persistSession(res.code, res.accessToken);
      } catch {
        // Allow manual CTA / retry after failure (hub flap).
        autoSessionStarted.current = false;
      }
    })();
  }, [
    session.hubChecking,
    session.hubUnreachable,
    session.hasSession,
    session.code,
    session.accessToken,
  ]);

  /** Existing "Abrir salida" — open/focus Output for current session (no create). */
  const openOutput = () => {
    if (!session.code) {
      return;
    }
    void (async () => {
      const result = await openOutputWindow(session.code, {
        autofullscreen: false,
        preferSecondary: true,
      });
      if (result.popupBlocked) {
        setPopupBlockedUrl(result.url);
        return;
      }
      setPopupBlockedUrl(null);
    })();
  };

  /**
   * Primary CTA: create/resume session → open Output (secondary screen when
   * Window Management API allows) → request fullscreen (gesture / Chrome).
   */
  const onStartProjection = () => {
    if (session.hubUnreachable) {
      void session.checkHubHealth();
      return;
    }
    setProjectionBusy(true);
    void (async () => {
      try {
        const result = await startProjection({
          existingCode: session.code || null,
          ensureSession: async () => {
            if (session.code) {
              return session.code;
            }
            const saved = loadPersistedControlSession();
            if (saved?.code) {
              try {
                const joined = await session.join({ code: saved.code });
                persistSession(joined.code, saved.accessToken);
                return joined.code;
              } catch {
                // stale — create fresh
              }
            }
            const created = await session.create();
            persistSession(created.code, created.accessToken);
            return created.code;
          },
        });
        if (result.popupBlocked) {
          setPopupBlockedUrl(result.url);
          return;
        }
        setPopupBlockedUrl(null);
      } catch {
        // Footer / banner cover hub errors; no message panel.
      } finally {
        setProjectionBusy(false);
      }
    })();
  };

  useControlShortcuts({
    enabled: canMutate,
    goLive: () => {
      if (selectedItemId && canGoLive) {
        session.goLive(selectedItemId);
      }
    },
    openOutput,
    setSceneMode: (mode) => session.setSceneMode(mode),
    setTheme: (id) => session.setTheme({ themeId: id }),
    prevSlide: () => {
      if (liveItem && itemHasSlides(liveItem)) {
        session.setSlide(liveSlideIndex - 1);
      }
    },
    nextSlide: () => {
      if (liveItem && itemHasSlides(liveItem)) {
        session.setSlide(liveSlideIndex + 1);
      }
    },
  });

  const selectItem = (id: string) => {
    setSelectedItemId(id);
    setPreviewSlideIndex(0);
    setCreating(false);
    setEditingId(null);
    setLinkDialogOpen(false);
    setBibleDialogOpen(false);
  };

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearChecked = () => setCheckedIds(new Set());

  const startCreateTextBlank = () => {
    setCreating(true);
    setEditingId(null);
    setLinkDialogOpen(false);
    setBibleDialogOpen(false);
  };

  const ensureWsOrHint = (): boolean => {
    if (session.wsStatus === "open" && session.isWsOpen()) {
      return true;
    }
    if (session.hubUnreachable) {
      setUploadHint(t("control.hubUnreachable"));
      void session.checkHubHealth();
      return false;
    }
    session.reconnect();
    setUploadHint(t("control.wsDisconnectedHint"));
    return false;
  };

  const saveNewText = (payload: TextPayload) => {
    if (!ensureWsOrHint()) {
      return;
    }
    const item: PlaylistItem = {
      id: cryptoRandomId(),
      type: "text",
      order: items.length,
      payload,
    };
    if (!session.addItem(item)) {
      setUploadHint(t("control.wsDisconnectedHint"));
      session.reconnect();
      return;
    }
    setCreating(false);
    setSelectedItemId(item.id);
    setPreviewSlideIndex(0);
  };

  const saveEditText = (payload: TextPayload) => {
    if (!editingId) {
      return;
    }
    if (!ensureWsOrHint()) {
      return;
    }
    session.updateItem(editingId, { payload });
    setEditingId(null);
  };

  const openLinkDialog = () => {
    setUploadHint(null);
    setCreating(false);
    setEditingId(null);
    setBibleDialogOpen(false);
    setLinkDialogOpen(true);
  };

  const closeLinkDialog = () => setLinkDialogOpen(false);

  const openBibleDialog = () => {
    setUploadHint(null);
    setCreating(false);
    setEditingId(null);
    setLinkDialogOpen(false);
    setBibleDialogOpen(true);
  };

  const closeBibleDialog = () => setBibleDialogOpen(false);

  const addBiblePassage = (payload: BiblePayload) => {
    if (!ensureWsOrHint()) {
      return;
    }
    const item: PlaylistItem = {
      id: cryptoRandomId(),
      type: "bible",
      order: itemsLenRef.current,
      payload,
    };
    if (!session.addItem(item)) {
      setUploadHint(t("control.wsDisconnectedHint"));
      session.reconnect();
      return;
    }
    setSelectedItemId(item.id);
    setPreviewSlideIndex(0);
    closeBibleDialog();
    if (payload.fromCache) {
      setUploadHint(t("bible.addedFromCache"));
    } else {
      setUploadHint(null);
    }
  };

  const addYoutubeFromUrl = (url: string) => {
    if (!ensureWsOrHint()) {
      return;
    }
    const parsed = parseYouTubeUrl(url);
    if (!parsed) {
      setUploadHint(t("video.youtubeInvalid"));
      return;
    }
    const payload: VideoPayload = {
      sourceKind: "youtube",
      videoId: parsed.videoId,
      sourceUrl: parsed.sourceUrl,
      autoplay: true,
      muted: false,
      fit: "contain",
    };
    const item: PlaylistItem = {
      id: cryptoRandomId(),
      type: "video",
      order: itemsLenRef.current,
      payload,
    };
    if (!session.addItem(item)) {
      setUploadHint(t("control.wsDisconnectedHint"));
      session.reconnect();
      return;
    }
    setSelectedItemId(item.id);
    closeLinkDialog();
    setUploadHint(t("video.youtubeCaveat"));
  };

  const addGenericLink = (url: string) => {
    if (!ensureWsOrHint()) {
      return;
    }
    let host = url;
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // keep raw
    }
    const payload: TextPayload = {
      title: host || t("link.itemTitle"),
      align: "center",
      slides: [
        {
          id: cryptoRandomId(),
          lines: [url],
        },
      ],
    };
    const item: PlaylistItem = {
      id: cryptoRandomId(),
      type: "text",
      order: itemsLenRef.current,
      payload,
    };
    if (!session.addItem(item)) {
      setUploadHint(t("control.wsDisconnectedHint"));
      session.reconnect();
      return;
    }
    setSelectedItemId(item.id);
    setPreviewSlideIndex(0);
    closeLinkDialog();
    setUploadHint(t("link.added"));
  };

  const ingestOneFile = async (
    file: File,
    order: number,
  ): Promise<{ ok: boolean; itemId?: string; hint?: string }> => {
    const kind = classifyMediaFile(file);
    if (kind === "unsupported") {
      return { ok: false, hint: t("text.importUnsupported") };
    }
    if (kind === "text") {
      if (file.size > TEXT_IMPORT_MAX_BYTES) {
        return { ok: false, hint: t("text.importTooLarge") };
      }
      try {
        const result = await importFileToTextSlides(file);
        const payload: TextPayload = {
          title: result.title || file.name.replace(/\.[^.]+$/, ""),
          align: "center",
          slides: result.slides,
        };
        const item: PlaylistItem = {
          id: cryptoRandomId(),
          type: "text",
          order,
          payload,
        };
        if (!session.addItem(item)) {
          return { ok: false, hint: t("control.wsDisconnectedHint") };
        }
        return {
          ok: true,
          itemId: item.id,
          hint: result.truncated
            ? t("text.importTruncated").replace(
                "{n}",
                String(TEXT_IMPORT_MAX_SLIDES),
              )
            : t("text.importAdded").replace(
                "{n}",
                String(result.slides.length),
              ),
        };
      } catch (err) {
        const msg = String(err);
        if (msg.includes("file_too_large")) {
          return { ok: false, hint: t("text.importTooLarge") };
        }
        if (msg.includes("unsupported_type")) {
          return { ok: false, hint: t("text.importUnsupported") };
        }
        return { ok: false, hint: t("text.importFailed") };
      }
    }

    if (!session.sessionId || !session.wsTicket) {
      return { ok: false, hint: t("control.wsDisconnectedHint") };
    }

    const hints: string[] = [];
    if (kind === "image" && file.size > LARGE_IMAGE_WARN_BYTES) {
      hints.push(t("image.largeWarning"));
    }
    if (kind === "video") {
      if (file.type === "video/quicktime") {
        hints.push(t("video.quicktimeWarning"));
      }
      if (file.size > LARGE_VIDEO_WARN_BYTES) {
        hints.push(t("video.largeWarning"));
      }
    }

    try {
      const asset = await uploadSessionAsset(
        session.sessionId,
        session.wsTicket,
        file,
      );
      if (kind === "image") {
        const payload: ImagePayload = {
          assetId: asset.id,
          fit: "contain",
          title: asset.originalName || file.name,
        };
        const item: PlaylistItem = {
          id: cryptoRandomId(),
          type: "image",
          order,
          payload,
        };
        session.addItem(item);
        return {
          ok: true,
          itemId: item.id,
          hint: hints.length ? hints.join(" ") : undefined,
        };
      }
      const payload: VideoPayload = {
        sourceKind: "file",
        assetId: asset.id,
        title: asset.originalName || file.name,
        autoplay: true,
        muted: false,
        fit: "contain",
      };
      const item: PlaylistItem = {
        id: cryptoRandomId(),
        type: "video",
        order,
        payload,
      };
      session.addItem(item);
      return {
        ok: true,
        itemId: item.id,
        hint: hints.length ? hints.join(" ") : undefined,
      };
    } catch (err) {
      return { ok: false, hint: String(err) };
    }
  };

  const ingestFiles = async (fileList: File[]) => {
    if (!fileList.length) {
      return;
    }
    if (!ensureWsOrHint()) {
      return;
    }
    setCreating(false);
    setEditingId(null);
    setLinkDialogOpen(false);
    setBibleDialogOpen(false);
    setUploading(true);
    setUploadHint(null);
    let order = itemsLenRef.current;
    let lastId: string | null = null;
    const hints: string[] = [];
    let added = 0;
    try {
      for (const file of fileList) {
        const result = await ingestOneFile(file, order);
        if (result.ok) {
          added += 1;
          order += 1;
          itemsLenRef.current = order;
          if (result.itemId) {
            lastId = result.itemId;
          }
        }
        if (result.hint) {
          hints.push(result.hint);
        }
      }
      if (lastId) {
        setSelectedItemId(lastId);
        setPreviewSlideIndex(0);
      }
      if (hints.length) {
        setUploadHint(hints.slice(-3).join(" · "));
      } else if (added > 1) {
        setUploadHint(
          t("playlist.filesAdded").replace("{n}", String(added)),
        );
      }
    } finally {
      setUploading(false);
      if (unifiedInputRef.current) {
        unifiedInputRef.current.value = "";
      }
    }
  };

  const onPickUnifiedFiles = () => {
    setUploadHint(null);
    setCreating(false);
    setEditingId(null);
    setLinkDialogOpen(false);
    setBibleDialogOpen(false);
    unifiedInputRef.current?.click();
  };

  const onFitChange = (fit: ImageFit) => {
    if (!selectedItem || selectedItem.type !== "image") {
      return;
    }
    session.updateItem(selectedItem.id, {
      payload: { ...selectedItem.payload, fit },
    });
  };

  const moveItem = (id: string, dir: -1 | 1) => {
    if (!ensureWsOrHint()) {
      return;
    }
    const sorted = [...items].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((i) => i.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= sorted.length) {
      return;
    }
    const next = [...sorted];
    const tmp = next[idx]!;
    next[idx] = next[swap]!;
    next[swap] = tmp;
    session.reorder(next.map((i) => i.id));
  };

  const reorderItems = (orderedIds: string[]) => {
    if (!ensureWsOrHint()) {
      return;
    }
    session.reorder(orderedIds);
  };

  const goLiveItem = (id: string) => {
    if (!ensureWsOrHint()) {
      return;
    }
    setSelectedItemId(id);
    setPreviewSlideIndex(0);
    setCreating(false);
    setEditingId(null);
    setLinkDialogOpen(false);
    setBibleDialogOpen(false);
    session.goLive(id);
  };

  const slideCount =
    selectedItem && itemHasSlides(selectedItem)
      ? (selectedItem.type === "text" || selectedItem.type === "bible"
          ? selectedItem.payload.slides.length
          : 0)
      : 0;

  const previewGoPrev = () => {
    if (
      selectedItem &&
      itemHasSlides(selectedItem) &&
      previewSlideIndex > 0
    ) {
      setPreviewSlideIndex(previewSlideIndex - 1);
      return;
    }
    if (selectedIndex > 0) {
      const prev = items[selectedIndex - 1];
      if (prev) {
        selectItem(prev.id);
      }
    }
  };

  const previewGoNext = () => {
    if (
      selectedItem &&
      itemHasSlides(selectedItem) &&
      previewSlideIndex < slideCount - 1
    ) {
      setPreviewSlideIndex(previewSlideIndex + 1);
      return;
    }
    if (selectedIndex >= 0 && selectedIndex < items.length - 1) {
      const next = items[selectedIndex + 1];
      if (next) {
        selectItem(next.id);
      }
    }
  };

  const canPreviewPrev =
    Boolean(selectedItem) &&
    (previewSlideIndex > 0 || selectedIndex > 0);
  const canPreviewNext =
    Boolean(selectedItem) &&
    ((itemHasSlides(selectedItem!) &&
      previewSlideIndex < slideCount - 1) ||
      (selectedIndex >= 0 && selectedIndex < items.length - 1));

  const removeOne = (id: string) => {
    if (!ensureWsOrHint()) {
      return;
    }
    session.removeItem(id);
    if (selectedItemId === id) {
      setSelectedItemId(null);
    }
    if (editingId === id) {
      setEditingId(null);
    }
    setCheckedIds((prev) => {
      if (!prev.has(id)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const removeChecked = () => {
    if (checkedIds.size === 0) {
      return;
    }
    if (!ensureWsOrHint()) {
      return;
    }
    const ids = [...checkedIds];
    for (const id of ids) {
      session.removeItem(id);
    }
    if (selectedItemId && checkedIds.has(selectedItemId)) {
      setSelectedItemId(null);
    }
    if (editingId && checkedIds.has(editingId)) {
      setEditingId(null);
    }
    clearChecked();
  };

  const previewModule = selectedItem
    ? getItemType(selectedItem.type)
    : undefined;
  const liveModule = liveItem ? getItemType(liveItem.type) : undefined;
  const Preview = previewModule?.Preview;
  const LivePanel = liveModule?.LivePanel;
  const previewSrc = assetSrcFor(
    session.sessionId,
    session.wsTicket,
    selectedItem,
  );
  const liveSrc = assetSrcFor(session.sessionId, session.wsTicket, liveItem);

  const liveDurationMs =
    (liveItemId && durationByItemId[liveItemId]) || 0;

  return (
    <div className="control-shell">
      <header className="control-header">
        <div className="control-brand">
          <img
            className="control-brand-logo"
            src="/logo-mark.svg"
            alt=""
            width={40}
            height={40}
            decoding="async"
          />
          <h1 className="control-brand-title">
            {t("control.headerTitle")}
          </h1>
        </div>

        <div className="control-header-cluster">
          <ControlHeaderToolbar
            projectionBusy={projectionBusy}
            hubUnreachable={session.hubUnreachable}
            canMutate={canMutate}
            hasSession={session.hasSession}
            sceneMode={sceneMode}
            themeId={themeId}
            themeOverrides={themeOverrides}
            transitionEffect={transitionEffect}
            onProject={onStartProjection}
            onSceneNormal={() => session.setSceneMode("normal")}
            onToggleScene={(mode) => toggleSceneMode(mode)}
            onThemeChange={(patch) => session.setTheme(patch)}
            onAbout={() => setAboutOpen(true)}
            sessionFallback={
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    void session
                      .create()
                      .then((res) => {
                        persistSession(res.code, res.accessToken);
                      })
                      .catch(() => undefined);
                  }}
                >
                  {t("control.createSession")}
                </button>
                <label className="field-inline">
                  <span className="sr-only">{t("control.code")}</span>
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder={t("control.joinPlaceholder")}
                    maxLength={8}
                  />
                </label>
                <button
                  type="button"
                  className="btn"
                  disabled={!joinCode.trim()}
                  onClick={() => {
                    void session
                      .join({ code: joinCode.trim() })
                      .then((res) => {
                        persistSession(res.code);
                      })
                      .catch(() => undefined);
                  }}
                >
                  {t("control.joinSession")}
                </button>
              </>
            }
          />
        </div>

        <div className="control-header-end">
          <div
            className="control-header-sep"
            role="separator"
            aria-orientation="vertical"
            aria-label={t("control.headerSeparator")}
          />
          <ControlAdBanner />
        </div>
      </header>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />

      {popupBlockedUrl ? (
        <div className="control-banner control-banner-compact" role="status">
          <StatusTip
            tone="warn"
            label={t("control.statusTipWarn")}
            message={t("control.popupBlocked")}
          />
          <a
            className="control-banner-link"
            href={popupBlockedUrl}
            target="_blank"
            rel="noopener"
          >
            {t("control.openOutput")}
          </a>
        </div>
      ) : null}

      {session.hubUnreachable ? (
        <div
          className="control-banner control-banner-hub-down control-banner-compact"
          role="alert"
        >
          <StatusTip
            tone="error"
            label={t("control.statusTipWarn")}
            message={t("control.hubUnreachable")}
          />
          <p className="control-banner-hub-cmd">
            <code>pnpm dev</code>
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={session.hubChecking}
            onClick={() => {
              void session.checkHubHealth().then((ok) => {
                if (ok && session.hasSession) {
                  session.reconnect();
                }
              });
            }}
          >
            {session.hubChecking
              ? t("control.hubChecking")
              : t("control.retryHealth")}
          </button>
        </div>
      ) : null}

      {session.error &&
      !session.hubUnreachable &&
      !session.error.startsWith("HUB_UNREACHABLE") ? (
        <div
          className="control-banner control-banner-error control-banner-compact"
          role="alert"
        >
          <StatusTip
            tone="error"
            label={t("control.statusTipWarn")}
            message={session.error}
          />
        </div>
      ) : null}

      {sessionReady && !wsReady && !session.hubUnreachable ? (
        <div
          className="control-banner control-banner-error control-banner-compact"
          role="status"
        >
          <StatusTip
            tone="error"
            label={t("control.statusTipWarn")}
            message={
              session.wsStatus === "connecting"
                ? t("control.wsConnectingHint")
                : t("control.wsDisconnectedHint")
            }
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => session.reconnect()}
          >
            {t("control.reconnect")}
          </button>
        </div>
      ) : null}

      <input
        ref={unifiedInputRef}
        type="file"
        multiple
        accept={UNIFIED_MEDIA_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const list = e.target.files ? Array.from(e.target.files) : [];
          void ingestFiles(list);
        }}
      />

      <LinkAddDialog
        open={linkDialogOpen}
        onClose={closeLinkDialog}
        onAddYoutube={addYoutubeFromUrl}
        onAddGenericLink={addGenericLink}
      />

      <BibleDialog
        open={bibleDialogOpen}
        onClose={closeBibleDialog}
        onAdd={addBiblePassage}
      />

      <div className="control-zones control-zones-stacked">
        {/*
          Left column: Guion list on top + compact En vivo monitor below
          (Julio red layout — live stage relocates under Guion).
        */}
        <div className="control-guion-column">
          <SchedulePanel
            items={items}
            selectedItemId={selectedItemId}
            liveItemId={liveItemId}
            checkedIds={checkedIds}
            sessionReady={sessionReady}
            canMutate={canMutate}
            uploading={uploading}
            onSelect={selectItem}
            onToggleChecked={toggleChecked}
            onMove={moveItem}
            onReorder={reorderItems}
            onRemove={removeOne}
            onRemoveChecked={removeChecked}
            onGoLive={goLiveItem}
            onEditText={(id) => {
              selectItem(id);
              setEditingId(id);
            }}
            onAddFiles={() => {
              if (!sessionReady) {
                return;
              }
              if (!wsReady) {
                session.reconnect();
                setUploadHint(t("control.wsDisconnectedHint"));
              }
              onPickUnifiedFiles();
            }}
            onAddLink={() => {
              if (!sessionReady) {
                return;
              }
              if (!wsReady) {
                session.reconnect();
                setUploadHint(t("control.wsDisconnectedHint"));
              }
              openLinkDialog();
            }}
            onAddBible={() => {
              if (!sessionReady) {
                return;
              }
              if (!wsReady) {
                session.reconnect();
                setUploadHint(t("control.wsDisconnectedHint"));
              }
              openBibleDialog();
            }}
            onAddTextBlank={() => {
              if (!sessionReady) {
                return;
              }
              startCreateTextBlank();
            }}
            onOpenLoad={() => {
              if (!session.hasSession) {
                return;
              }
              setLoadDialogOpen(true);
            }}
            onOpenSave={() => {
              if (!canMutate) {
                return;
              }
              setSaveDialogOpen(true);
            }}
            onFilesDropped={(files) => {
              if (!sessionReady) {
                return;
              }
              if (!wsReady) {
                session.reconnect();
                setUploadHint(t("control.wsDisconnectedHint"));
                return;
              }
              void ingestFiles(files);
            }}
            saveLoadDialogs={
              session.hasSession && session.sessionId && session.wsTicket ? (
                <SavedPlaylistPanel
                  sessionId={session.sessionId}
                  wsTicket={session.wsTicket}
                  disabled={!canMutate}
                  onHint={setUploadHint}
                  dialogMode
                  saveOpen={saveDialogOpen}
                  loadOpen={loadDialogOpen}
                  onSaveOpenChange={setSaveDialogOpen}
                  onLoadOpenChange={setLoadDialogOpen}
                />
              ) : null
            }
            editor={
              creating ? (
                <TextItemEditor
                  initial={createEmptyTextPayload()}
                  onSave={saveNewText}
                  onCancel={() => setCreating(false)}
                />
              ) : editingId && selectedItem?.type === "text" ? (
                <TextItemEditor
                  initial={selectedItem.payload}
                  onSave={saveEditText}
                  onCancel={() => setEditingId(null)}
                />
              ) : null
            }
          />

          <section
            className="zone zone-live zone-live-sidebar"
            aria-label={t("control.live")}
          >
            <div className="zone-body zone-stage pm-theme" style={themeStyle}>
              <span className="stage-overlay-label" aria-hidden="true">
                {t("control.live")}
              </span>
              {sceneMode !== "normal" ? (
                <span
                  className="scene-mode-badge stage-overlay-badge"
                  data-mode={sceneMode}
                >
                  {t(`scene.${sceneMode}`)}
                </span>
              ) : null}
              {liveItem && LivePanel ? (
                <LivePanel
                  item={liveItem}
                  slideIndex={liveSlideIndex}
                  assetSrc={liveSrc}
                  mediaClock={mediaClock}
                  durationMsHint={liveDurationMs}
                  onDurationMs={(ms) => rememberDuration(liveItem.id, ms)}
                  onMediaClockSet={
                    liveItem.type === "video"
                      ? (patch) => session.setMediaClock(patch)
                      : undefined
                  }
                  onPrev={
                    itemHasSlides(liveItem)
                      ? () => session.setSlide(liveSlideIndex - 1)
                      : undefined
                  }
                  onNext={
                    itemHasSlides(liveItem)
                      ? () => session.setSlide(liveSlideIndex + 1)
                      : undefined
                  }
                />
              ) : (
                <p>{t("control.liveEmpty")}</p>
              )}
            </div>
          </section>
        </div>

        {/* Right column: maximized Vista previa. */}
        <div className="control-stages control-stages-preview-only">
          <section
            className="zone zone-preview"
            aria-label={t("control.preview")}
          >
            {/*
              Always-visible Preview toolbar: prev/next, send-to-live, and
              shortcuts tip. No floating 1/N pager — count removed per Julio.
              Video/YouTube also render play/scrub/mute under the media.
            */}
            <div
              className="preview-toolbar preview-toolbar-lite preview-toolbar-persistent"
              role="toolbar"
              aria-label={t("preview.nav")}
            >
              <button
                type="button"
                className="btn preview-tb-btn"
                disabled={!selectedItem || !canPreviewPrev}
                title={t("shortcuts.prev")}
                aria-label={t("shortcuts.prev")}
                onClick={previewGoPrev}
              >
                <IconPrev />
              </button>
              <button
                type="button"
                className="btn preview-tb-btn"
                disabled={!selectedItem || !canPreviewNext}
                title={t("shortcuts.next")}
                aria-label={t("shortcuts.next")}
                onClick={previewGoNext}
              >
                <IconNext />
              </button>
              <span className="preview-tb-sep" aria-hidden="true" />
              <button
                type="button"
                className="btn btn-primary preview-tb-golive"
                disabled={!canGoLive}
                title={t("shortcuts.goLive")}
                aria-label={t("shortcuts.goLive")}
                onClick={() => {
                  if (selectedItemId) {
                    session.goLive(selectedItemId);
                  }
                }}
              >
                <IconGoLive />
                <span className="preview-tb-golive-label">
                  {t("playlist.goLiveShort")}
                </span>
              </button>
              <span className="preview-tb-spacer" />
              <StatusTip
                tone="info"
                className="preview-tb-shortcuts"
                label={t("shortcuts.help")}
                message={t("shortcuts.hint")}
              />
            </div>
            <div className="zone-body zone-stage pm-theme" style={themeStyle}>
              <span className="stage-overlay-label" aria-hidden="true">
                {t("control.preview")}
              </span>
              {selectedItem && Preview ? (
                <Preview
                  item={selectedItem}
                  slideIndex={previewSlideIndex}
                  onSlideIndexChange={setPreviewSlideIndex}
                  assetSrc={previewSrc}
                  onFitChange={
                    selectedItem.type === "image" ? onFitChange : undefined
                  }
                  projecting={
                    selectedItem.type === "video" &&
                    selectedItem.id === liveItemId
                  }
                  mediaClock={
                    selectedItem.type === "video" &&
                    selectedItem.id === liveItemId
                      ? mediaClock
                      : undefined
                  }
                  onMediaClockSet={
                    selectedItem.type === "video" &&
                    selectedItem.id === liveItemId
                      ? (patch) => session.setMediaClock(patch)
                      : undefined
                  }
                  onDurationMs={(ms) =>
                    rememberDuration(selectedItem.id, ms)
                  }
                  durationMsHint={
                    durationByItemId[selectedItem.id] ?? 0
                  }
                />
              ) : (
                <p>{t("control.previewEmpty")}</p>
              )}
            </div>
          </section>
        </div>
      </div>

      <footer className="control-footer">
        <span
          className={
            session.wsStatus === "open" && !session.hubUnreachable
              ? "status-dot on"
              : "status-dot"
          }
        />
        <span>
          {session.hubUnreachable
            ? t("control.hubDownFooter")
            : session.wsStatus === "open"
              ? t("control.wsConnected")
              : session.wsStatus === "connecting"
                ? t("control.wsConnecting")
                : t("control.wsDisconnected")}
        </span>
        <span className="footer-sep">·</span>
        <span>seq {session.lastSeq >= 0 ? session.lastSeq : "—"}</span>
        {uploading ? (
          <>
            <span className="footer-sep">·</span>
            <span className="footer-muted">{t("video.uploading")}</span>
          </>
        ) : null}
      </footer>
    </div>
  );
}
