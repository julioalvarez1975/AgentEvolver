import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyTextPayload,
  cryptoRandomId,
  getItemType,
  parseYouTubeUrl,
} from "@promedia/item-types";
import { DEFAULT_LOCALE, t } from "@promedia/i18n";
import type {
  BiblePayload,
  ImageFit,
  ImagePayload,
  PlaylistItem,
  SceneMode,
  TextPayload,
  ThemeId,
  VideoPayload,
} from "@promedia/shared";
import { DEFAULT_THEME_ID, itemHasSlides } from "@promedia/shared";
import { BibleDialog } from "../components/BibleDialog";
import { ControlAdBanner } from "../components/ControlAdBanner";
import { LinkAddDialog } from "../components/LinkAddDialog";
import { SavedPlaylistPanel } from "../components/SavedPlaylistPanel";
import { SchedulePanel } from "../components/SchedulePanel";
import { TextItemEditor } from "../components/TextItemEditor";
import { ThemePanel } from "../components/ThemePanel";
import { IconNext, IconPrev } from "../components/UiIcons";
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

const locale = DEFAULT_LOCALE;

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
  const session = useSessionConnection("control");
  const [joinCode, setJoinCode] = useState("");
  const [popupBlockedUrl, setPopupBlockedUrl] = useState<string | null>(null);
  const [projectionBusy, setProjectionBusy] = useState(false);
  const [projectionNote, setProjectionNote] = useState<string | null>(null);
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
  const [uploadHint, setUploadHint] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const unifiedInputRef = useRef<HTMLInputElement>(null);
  /** Track item count for sequential multi-file order without stale closure. */
  const itemsLenRef = useRef(0);

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
  const themeStyle = themeSurfaceStyle(themeId, themeOverrides);

  const toggleSceneMode = (mode: SceneMode) => {
    if (session.wsStatus !== "open") {
      return;
    }
    // Active mode → normal; otherwise set mode
    session.setSceneMode(sceneMode === mode ? "normal" : mode);
  };

  const sceneBtnClass = (mode: SceneMode) =>
    sceneMode === mode ? "btn btn-scene active" : "btn btn-scene";

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
      setProjectionNote(t(locale, "control.hubUnreachable"));
      void session.checkHubHealth();
      return;
    }
    setProjectionBusy(true);
    setProjectionNote(null);
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
          setProjectionNote(t(locale, "control.popupBlocked"));
          return;
        }
        setPopupBlockedUrl(null);
        if (result.placement?.onSecondary) {
          setProjectionNote(t(locale, "control.projectionOnSecondary"));
        } else {
          setProjectionNote(t(locale, "control.projectionOpened"));
        }
      } catch (err) {
        setProjectionNote(String(err));
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
      setUploadHint(t(locale, "control.hubUnreachable"));
      void session.checkHubHealth();
      return false;
    }
    session.reconnect();
    setUploadHint(t(locale, "control.wsDisconnectedHint"));
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
      setUploadHint(t(locale, "control.wsDisconnectedHint"));
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
      setUploadHint(t(locale, "control.wsDisconnectedHint"));
      session.reconnect();
      return;
    }
    setSelectedItemId(item.id);
    setPreviewSlideIndex(0);
    closeBibleDialog();
    if (payload.fromCache) {
      setUploadHint(t(locale, "bible.addedFromCache"));
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
      setUploadHint(t(locale, "video.youtubeInvalid"));
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
      setUploadHint(t(locale, "control.wsDisconnectedHint"));
      session.reconnect();
      return;
    }
    setSelectedItemId(item.id);
    closeLinkDialog();
    setUploadHint(t(locale, "video.youtubeCaveat"));
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
      title: host || t(locale, "link.itemTitle"),
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
      setUploadHint(t(locale, "control.wsDisconnectedHint"));
      session.reconnect();
      return;
    }
    setSelectedItemId(item.id);
    setPreviewSlideIndex(0);
    closeLinkDialog();
    setUploadHint(t(locale, "link.added"));
  };

  const ingestOneFile = async (
    file: File,
    order: number,
  ): Promise<{ ok: boolean; itemId?: string; hint?: string }> => {
    const kind = classifyMediaFile(file);
    if (kind === "unsupported") {
      return { ok: false, hint: t(locale, "text.importUnsupported") };
    }
    if (kind === "text") {
      if (file.size > TEXT_IMPORT_MAX_BYTES) {
        return { ok: false, hint: t(locale, "text.importTooLarge") };
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
          return { ok: false, hint: t(locale, "control.wsDisconnectedHint") };
        }
        return {
          ok: true,
          itemId: item.id,
          hint: result.truncated
            ? t(locale, "text.importTruncated").replace(
                "{n}",
                String(TEXT_IMPORT_MAX_SLIDES),
              )
            : t(locale, "text.importAdded").replace(
                "{n}",
                String(result.slides.length),
              ),
        };
      } catch (err) {
        const msg = String(err);
        if (msg.includes("file_too_large")) {
          return { ok: false, hint: t(locale, "text.importTooLarge") };
        }
        if (msg.includes("unsupported_type")) {
          return { ok: false, hint: t(locale, "text.importUnsupported") };
        }
        return { ok: false, hint: t(locale, "text.importFailed") };
      }
    }

    if (!session.sessionId || !session.wsTicket) {
      return { ok: false, hint: t(locale, "control.wsDisconnectedHint") };
    }

    const hints: string[] = [];
    if (kind === "image" && file.size > LARGE_IMAGE_WARN_BYTES) {
      hints.push(t(locale, "image.largeWarning"));
    }
    if (kind === "video") {
      if (file.type === "video/quicktime") {
        hints.push(t(locale, "video.quicktimeWarning"));
      }
      if (file.size > LARGE_VIDEO_WARN_BYTES) {
        hints.push(t(locale, "video.largeWarning"));
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
          t(locale, "playlist.filesAdded").replace("{n}", String(added)),
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
            {t(locale, "control.headerTitle")}
          </h1>
        </div>
        <ControlAdBanner />
      </header>

      <div className="control-session-bar">
        <div className="control-session-actions">
          <button
            type="button"
            className="btn btn-primary btn-start-projection"
            disabled={projectionBusy || session.hubUnreachable}
            onClick={onStartProjection}
          >
            {projectionBusy
              ? t(locale, "control.startProjectionBusy")
              : t(locale, "control.startProjection")}
          </button>
          {!session.hasSession ? (
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
                {t(locale, "control.createSession")}
              </button>
              <label className="field-inline">
                <span className="sr-only">{t(locale, "control.code")}</span>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder={t(locale, "control.joinPlaceholder")}
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
                {t(locale, "control.joinSession")}
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={openOutput}>
              {t(locale, "control.openOutput")}
            </button>
          )}
        </div>
      </div>

      {projectionNote ? (
        <div className="control-banner" role="status">
          {projectionNote}
        </div>
      ) : null}

      {popupBlockedUrl ? (
        <div className="control-banner" role="status">
          <p>{t(locale, "control.popupBlocked")}</p>
          <a href={popupBlockedUrl} target="_blank" rel="noopener">
            {popupBlockedUrl}
          </a>
        </div>
      ) : null}

      {uploadHint ? (
        <div className="control-banner" role="status">
          {uploadHint}
        </div>
      ) : null}

      {session.hubUnreachable ? (
        <div
          className="control-banner control-banner-hub-down"
          role="alert"
        >
          <p className="control-banner-hub-title">
            {t(locale, "control.hubUnreachable")}
          </p>
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
              ? t(locale, "control.hubChecking")
              : t(locale, "control.retryHealth")}
          </button>
        </div>
      ) : null}

      {session.error &&
      !session.hubUnreachable &&
      !session.error.startsWith("HUB_UNREACHABLE") ? (
        <div className="control-banner control-banner-error" role="alert">
          {session.error}
        </div>
      ) : null}

      {sessionReady && !wsReady && !session.hubUnreachable ? (
        <div className="control-banner control-banner-error" role="status">
          <p>
            {session.wsStatus === "connecting"
              ? t(locale, "control.wsConnectingHint")
              : t(locale, "control.wsDisconnectedHint")}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => session.reconnect()}
          >
            {t(locale, "control.reconnect")}
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
              setUploadHint(t(locale, "control.wsDisconnectedHint"));
            }
            onPickUnifiedFiles();
          }}
          onAddLink={() => {
            if (!sessionReady) {
              return;
            }
            if (!wsReady) {
              session.reconnect();
              setUploadHint(t(locale, "control.wsDisconnectedHint"));
            }
            openLinkDialog();
          }}
          onAddBible={() => {
            if (!sessionReady) {
              return;
            }
            if (!wsReady) {
              session.reconnect();
              setUploadHint(t(locale, "control.wsDisconnectedHint"));
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
              setUploadHint(t(locale, "control.wsDisconnectedHint"));
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

        <div className="control-stages">
          <div className="control-stages-equal">
            <section
              className="zone zone-preview"
              aria-label={t(locale, "control.preview")}
            >
              <header className="stage-header">
                <h2>{t(locale, "control.preview")}</h2>
              </header>
              {/*
                Lite item/slide nav when anything is selected (no empty bar).
                Video/YouTube also render a dedicated play/scrub/mute bar
                under the media inside Preview.
              */}
              {selectedItem ? (
                <div
                  className="preview-toolbar preview-toolbar-lite"
                  role="toolbar"
                  aria-label={t(locale, "preview.nav")}
                >
                  <button
                    type="button"
                    className="btn preview-tb-btn"
                    disabled={!canPreviewPrev}
                    title={t(locale, "preview.prev")}
                    aria-label={t(locale, "preview.prev")}
                    onClick={previewGoPrev}
                  >
                    <IconPrev />
                  </button>
                  <span className="preview-nav-meta">
                    {itemHasSlides(selectedItem) && slideCount > 1
                      ? `${previewSlideIndex + 1}/${slideCount}`
                      : selectedIndex >= 0
                        ? `${selectedIndex + 1}/${items.length}`
                        : "—"}
                  </span>
                  <button
                    type="button"
                    className="btn preview-tb-btn"
                    disabled={!canPreviewNext}
                    title={t(locale, "preview.next")}
                    aria-label={t(locale, "preview.next")}
                    onClick={previewGoNext}
                  >
                    <IconNext />
                  </button>
                </div>
              ) : null}
              <div className="zone-body zone-stage pm-theme" style={themeStyle}>
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
                  />
                ) : (
                  <p>{t(locale, "control.previewEmpty")}</p>
                )}
              </div>
            </section>

            <section
              className="zone zone-live"
              aria-label={t(locale, "control.live")}
            >
              <header className="stage-header">
                <h2>
                  {t(locale, "control.live")}
                  {sceneMode !== "normal" ? (
                    <span className="scene-mode-badge" data-mode={sceneMode}>
                      {t(locale, `scene.${sceneMode}`)}
                    </span>
                  ) : null}
                </h2>
              </header>
              <div className="zone-body zone-stage pm-theme" style={themeStyle}>
                {liveItem && LivePanel ? (
                  <LivePanel
                    item={liveItem}
                    slideIndex={liveSlideIndex}
                    assetSrc={liveSrc}
                    mediaClock={mediaClock}
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
                  <p>{t(locale, "control.liveEmpty")}</p>
                )}
              </div>
            </section>
          </div>

          <div className="control-stages-chrome">
            <div className="live-controls">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canGoLive}
                onClick={() => {
                  if (selectedItemId) {
                    session.goLive(selectedItemId);
                  }
                }}
              >
                {t(locale, "control.goLive")}
              </button>
              <button
                type="button"
                className={sceneBtnClass("normal")}
                disabled={!canMutate}
                aria-pressed={sceneMode === "normal"}
                onClick={() => session.setSceneMode("normal")}
              >
                {t(locale, "control.sceneNormal")}
              </button>
              <button
                type="button"
                className={sceneBtnClass("logo")}
                disabled={!canMutate}
                aria-pressed={sceneMode === "logo"}
                onClick={() => toggleSceneMode("logo")}
              >
                {t(locale, "control.sceneLogo")}
              </button>
              <button
                type="button"
                className={sceneBtnClass("black")}
                disabled={!canMutate}
                aria-pressed={sceneMode === "black"}
                onClick={() => toggleSceneMode("black")}
              >
                {t(locale, "control.sceneBlack")}
              </button>
              <button
                type="button"
                className={sceneBtnClass("clear")}
                disabled={!canMutate}
                aria-pressed={sceneMode === "clear"}
                onClick={() => toggleSceneMode("clear")}
              >
                {t(locale, "control.sceneClear")}
              </button>
            </div>
            <div className="theme-controls">
              <h3 className="theme-controls-title">{t(locale, "theme.title")}</h3>
              <ThemePanel
                themeId={themeId}
                themeOverrides={themeOverrides}
                disabled={!canMutate}
                onChange={(patch) => session.setTheme(patch)}
              />
            </div>
            <p className="shortcuts-hint">{t(locale, "shortcuts.hint")}</p>
          </div>
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
            ? t(locale, "control.hubDownFooter")
            : session.wsStatus === "open"
              ? t(locale, "control.wsConnected")
              : session.wsStatus === "connecting"
                ? t(locale, "control.wsConnecting")
                : t(locale, "control.wsDisconnected")}
        </span>
        <span className="footer-sep">·</span>
        <span>seq {session.lastSeq >= 0 ? session.lastSeq : "—"}</span>
        {uploading ? (
          <>
            <span className="footer-sep">·</span>
            <span className="footer-muted">{t(locale, "video.uploading")}</span>
          </>
        ) : null}
      </footer>
    </div>
  );
}
