import { useMemo, useRef, useState } from "react";
import {
  createEmptyTextPayload,
  cryptoRandomId,
  getItemType,
  listItemTypes,
  parseYouTubeUrl,
} from "@promedia/item-types";
import { DEFAULT_LOCALE, t } from "@promedia/i18n";
import type {
  ImageFit,
  ImagePayload,
  PlaylistItem,
  SceneMode,
  TextPayload,
  ThemeId,
  VideoPayload,
} from "@promedia/shared";
import { DEFAULT_THEME_ID, itemLabel } from "@promedia/shared";
import { SavedPlaylistPanel } from "../components/SavedPlaylistPanel";
import { TextItemEditor } from "../components/TextItemEditor";
import { ThemePanel } from "../components/ThemePanel";
import { useControlShortcuts } from "../hooks/useControlShortcuts";
import { useSessionConnection } from "../hooks/useSessionConnection";
import {
  LARGE_IMAGE_WARN_BYTES,
  LARGE_VIDEO_WARN_BYTES,
  buildAssetUrl,
  uploadSessionAsset,
} from "../lib/assets";
import { themeSurfaceStyle } from "../lib/theme";

const locale = DEFAULT_LOCALE;

function opaqueOutputUrl(accessToken: string): string {
  return `${window.location.origin}/output?token=${encodeURIComponent(accessToken)}`;
}

function codeOutputUrl(code: string): string {
  return `${window.location.origin}/output?code=${encodeURIComponent(code)}`;
}

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
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [videoMode, setVideoMode] = useState<"pick" | "youtube" | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [uploadHint, setUploadHint] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const items = session.snapshot?.playlist.items ?? [];
  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) ?? null,
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

  const outputByCode = session.code ? codeOutputUrl(session.code) : "";
  const outputByToken = session.accessToken
    ? opaqueOutputUrl(session.accessToken)
    : "";

  const wsReady = session.wsStatus === "open";
  const sessionReady = session.hasSession;
  /** Playlist chrome needs a session; mutations need WS (auto-reconnects if down). */
  const canMutate = sessionReady && wsReady;

  const canGoLive = Boolean(
    selectedItem &&
      (selectedItem.type === "text" ||
        selectedItem.type === "image" ||
        selectedItem.type === "video") &&
      canMutate,
  );

  const flashCopied = (label: string) => {
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1500);
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      flashCopied(label);
    } catch {
      flashCopied("?");
    }
  };

  const openOutput = () => {
    if (!session.code) {
      return;
    }
    const url = codeOutputUrl(session.code);
    // Keep referrer/origin for YouTube embeds in the popup (noreferrer breaks them).
    const win = window.open(url, "promedia-output", "noopener");
    if (!win) {
      setPopupBlockedUrl(url);
      return;
    }
    setPopupBlockedUrl(null);
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
      if (liveItem?.type === "text") {
        session.setSlide(liveSlideIndex - 1);
      }
    },
    nextSlide: () => {
      if (liveItem?.type === "text") {
        session.setSlide(liveSlideIndex + 1);
      }
    },
  });

  const selectItem = (id: string) => {
    setSelectedItemId(id);
    setPreviewSlideIndex(0);
    setCreating(false);
    setEditingId(null);
    setVideoMode(null);
  };

  const startCreateText = () => {
    setCreating(true);
    setEditingId(null);
    setVideoMode(null);
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

  const onPickImage = () => {
    setUploadHint(null);
    setVideoMode(null);
    imageInputRef.current?.click();
  };

  const onImageFile = async (file: File | undefined) => {
    if (!file || !session.sessionId || !session.wsTicket) {
      return;
    }
    if (file.size > LARGE_IMAGE_WARN_BYTES) {
      setUploadHint(t(locale, "image.largeWarning"));
    } else {
      setUploadHint(null);
    }
    setUploading(true);
    try {
      const asset = await uploadSessionAsset(
        session.sessionId,
        session.wsTicket,
        file,
      );
      const payload: ImagePayload = {
        assetId: asset.id,
        fit: "contain",
        title: asset.originalName || file.name,
      };
      const item: PlaylistItem = {
        id: cryptoRandomId(),
        type: "image",
        order: items.length,
        payload,
      };
      session.addItem(item);
      setSelectedItemId(item.id);
      setCreating(false);
      setEditingId(null);
    } catch (err) {
      setUploadHint(String(err));
    } finally {
      setUploading(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  };

  const startAddVideo = () => {
    setUploadHint(null);
    setCreating(false);
    setEditingId(null);
    setVideoMode("pick");
    setYoutubeUrl("");
  };

  const onPickVideoFile = () => {
    videoInputRef.current?.click();
  };

  const onVideoFile = async (file: File | undefined) => {
    if (!file || !session.sessionId || !session.wsTicket) {
      return;
    }
    const hints: string[] = [];
    if (file.type === "video/quicktime") {
      hints.push(t(locale, "video.quicktimeWarning"));
    }
    if (file.size > LARGE_VIDEO_WARN_BYTES) {
      hints.push(t(locale, "video.largeWarning"));
    }
    setUploadHint(hints.length ? hints.join(" ") : null);
    setUploading(true);
    try {
      const asset = await uploadSessionAsset(
        session.sessionId,
        session.wsTicket,
        file,
      );
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
        order: items.length,
        payload,
      };
      session.addItem(item);
      setSelectedItemId(item.id);
      setVideoMode(null);
      setCreating(false);
      setEditingId(null);
    } catch (err) {
      setUploadHint(String(err));
    } finally {
      setUploading(false);
      if (videoInputRef.current) {
        videoInputRef.current.value = "";
      }
    }
  };

  const addYoutubeVideo = () => {
    const parsed = parseYouTubeUrl(youtubeUrl);
    if (!parsed) {
      setUploadHint(t(locale, "video.youtubeInvalid"));
      return;
    }
    setUploadHint(t(locale, "video.youtubeCaveat"));
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
      order: items.length,
      payload,
    };
    session.addItem(item);
    setSelectedItemId(item.id);
    setVideoMode(null);
    setYoutubeUrl("");
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

  const removeSelected = (id: string) => {
    session.removeItem(id);
    if (selectedItemId === id) {
      setSelectedItemId(null);
    }
    if (editingId === id) {
      setEditingId(null);
    }
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
          <span className="control-brand-name">{t(locale, "app.name")}</span>
          <span className="control-brand-role">Control</span>
        </div>

        <div className="control-session-actions">
          {!session.hasSession ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void session.create()}
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
                onClick={() => void session.join({ code: joinCode.trim() })}
              >
                {t(locale, "control.joinSession")}
              </button>
            </>
          ) : (
            <>
              <div className="session-chip">
                <span className="session-chip-label">
                  {t(locale, "control.code")}
                </span>
                <strong className="session-chip-value">{session.code}</strong>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void copyText(session.code, "code")}
                >
                  {t(locale, "control.copyCode")}
                </button>
              </div>
              {outputByToken ? (
                <div className="session-chip session-chip-link">
                  <span className="session-chip-label">
                    {t(locale, "control.link")}
                  </span>
                  <code className="session-chip-mono" title={outputByToken}>
                    {outputByToken}
                  </code>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void copyText(outputByToken, "link")}
                  >
                    {t(locale, "control.copyLink")}
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className="btn btn-primary"
                onClick={openOutput}
              >
                {t(locale, "control.openOutput")}
              </button>
            </>
          )}
        </div>
      </header>

      {session.hasSession ? (
        <p className="control-drag-hint">{t(locale, "control.dragHint")}</p>
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
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
        className="sr-only"
        onChange={(e) => void onImageFile(e.target.files?.[0])}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
        className="sr-only"
        onChange={(e) => void onVideoFile(e.target.files?.[0])}
      />

      <div className="control-zones">
        <section
          className="zone zone-playlist"
          aria-label={t(locale, "control.playlist")}
        >
          <h2>{t(locale, "control.playlist")}</h2>
          <div className="playlist-toolbar">
            {listItemTypes().map((mod) => (
              <button
                key={mod.type}
                type="button"
                className="btn btn-primary"
                disabled={!sessionReady || uploading}
                title={
                  !sessionReady
                    ? t(locale, "control.createSession")
                    : !wsReady
                      ? t(locale, "control.wsDisconnectedHint")
                      : undefined
                }
                onClick={() => {
                  if (!sessionReady) {
                    return;
                  }
                  if (!wsReady) {
                    session.reconnect();
                    setUploadHint(t(locale, "control.wsDisconnectedHint"));
                  }
                  if (mod.type === "text") {
                    startCreateText();
                  } else if (mod.type === "image") {
                    if (!wsReady) {
                      return;
                    }
                    onPickImage();
                  } else if (mod.type === "video") {
                    startAddVideo();
                  }
                }}
              >
                + {t(locale, mod.labelKey)}
              </button>
            ))}
          </div>

          {videoMode ? (
            <div className="zone-body video-ingest">
              <p className="video-ingest-title">{t(locale, "video.ingestTitle")}</p>
              <div className="video-ingest-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={uploading}
                  onClick={onPickVideoFile}
                >
                  {t(locale, "video.fromFile")}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setVideoMode("youtube")}
                >
                  {t(locale, "video.fromYoutube")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setVideoMode(null)}
                >
                  {t(locale, "text.cancel")}
                </button>
              </div>
              {videoMode === "youtube" ? (
                <div className="video-yt-form">
                  <label>
                    {t(locale, "video.youtubeUrl")}
                    <input
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=…"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!youtubeUrl.trim()}
                    onClick={addYoutubeVideo}
                  >
                    {t(locale, "video.addYoutube")}
                  </button>
                  <p className="video-caveat">{t(locale, "video.youtubeCaveat")}</p>
                </div>
              ) : (
                <p className="video-caveat">{t(locale, "video.fileCaveat")}</p>
              )}
            </div>
          ) : creating ? (
            <div className="zone-body playlist-editor">
              <TextItemEditor
                initial={createEmptyTextPayload()}
                onSave={saveNewText}
                onCancel={() => setCreating(false)}
              />
            </div>
          ) : editingId && selectedItem?.type === "text" ? (
            <div className="zone-body playlist-editor">
              <TextItemEditor
                initial={selectedItem.payload}
                onSave={saveEditText}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <div className="zone-body playlist-list">
              {items.length === 0 ? (
                <p className="zone-empty">{t(locale, "control.playlistEmpty")}</p>
              ) : (
                <ul>
                  {items.map((item, index) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={
                          item.id === selectedItemId
                            ? "playlist-row selected"
                            : "playlist-row"
                        }
                        onClick={() => selectItem(item.id)}
                      >
                        <span className="playlist-row-label">
                          {itemLabel(item)}
                        </span>
                        <span className="playlist-type-badge">{item.type}</span>
                        {item.id === liveItemId ? (
                          <span className="playlist-live-badge">LIVE</span>
                        ) : null}
                      </button>
                      <div className="playlist-row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={index === 0}
                          onClick={() => moveItem(item.id, -1)}
                          title={t(locale, "playlist.moveUp")}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={index === items.length - 1}
                          onClick={() => moveItem(item.id, 1)}
                          title={t(locale, "playlist.moveDown")}
                        >
                          ↓
                        </button>
                        {item.type === "text" ? (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => {
                              selectItem(item.id);
                              setEditingId(item.id);
                            }}
                          >
                            {t(locale, "playlist.edit")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => removeSelected(item.id)}
                        >
                          {t(locale, "playlist.remove")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section
          className="zone zone-preview"
          aria-label={t(locale, "control.preview")}
        >
          <h2>{t(locale, "control.preview")}</h2>
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

        <section className="zone zone-live" aria-label={t(locale, "control.live")}>
          <h2>
            {t(locale, "control.live")}
            {sceneMode !== "normal" ? (
              <span className="scene-mode-badge" data-mode={sceneMode}>
                {t(locale, `scene.${sceneMode}`)}
              </span>
            ) : null}
          </h2>
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
                  liveItem.type === "text"
                    ? () => session.setSlide(liveSlideIndex - 1)
                    : undefined
                }
                onNext={
                  liveItem.type === "text"
                    ? () => session.setSlide(liveSlideIndex + 1)
                    : undefined
                }
              />
            ) : (
              <p>{t(locale, "control.liveEmpty")}</p>
            )}
          </div>
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
          {session.hasSession && session.sessionId && session.wsTicket ? (
            <SavedPlaylistPanel
              sessionId={session.sessionId}
              wsTicket={session.wsTicket}
              disabled={!canMutate}
              onHint={setUploadHint}
            />
          ) : null}
          <p className="shortcuts-hint">{t(locale, "shortcuts.hint")}</p>
        </section>
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
        {outputByCode ? (
          <>
            <span className="footer-sep">·</span>
            <span className="footer-muted">salida {session.code}</span>
          </>
        ) : null}
        {copied ? (
          <>
            <span className="footer-sep">·</span>
            <span className="footer-muted">copiado</span>
          </>
        ) : null}
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
