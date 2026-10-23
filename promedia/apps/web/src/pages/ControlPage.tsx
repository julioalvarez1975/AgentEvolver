import { useMemo, useState } from "react";
import {
  createEmptyTextPayload,
  cryptoRandomId,
  getItemType,
  listItemTypes,
} from "@promedia/item-types";
import { DEFAULT_LOCALE, t } from "@promedia/i18n";
import type { PlaylistItem, TextPayload } from "@promedia/shared";
import { itemLabel } from "@promedia/shared";
import { TextItemEditor } from "../components/TextItemEditor";
import { useSessionConnection } from "../hooks/useSessionConnection";

const locale = DEFAULT_LOCALE;

function opaqueOutputUrl(accessToken: string): string {
  return `${window.location.origin}/output?token=${encodeURIComponent(accessToken)}`;
}

function codeOutputUrl(code: string): string {
  return `${window.location.origin}/output?code=${encodeURIComponent(code)}`;
}

/** Product Control shell — registry + text playlist (subtarea 4). */
export function ControlPage() {
  const session = useSessionConnection("control");
  const [joinCode, setJoinCode] = useState("");
  const [popupBlockedUrl, setPopupBlockedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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

  const outputByCode = session.code ? codeOutputUrl(session.code) : "";
  const outputByToken = session.accessToken
    ? opaqueOutputUrl(session.accessToken)
    : "";

  const canGoLive = Boolean(
    selectedItem && selectedItem.type === "text" && session.wsStatus === "open",
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
    const win = window.open(url, "promedia-output", "noopener,noreferrer");
    if (!win) {
      setPopupBlockedUrl(url);
      return;
    }
    setPopupBlockedUrl(null);
  };

  const selectItem = (id: string) => {
    setSelectedItemId(id);
    setPreviewSlideIndex(0);
    setCreating(false);
    setEditingId(null);
  };

  const startCreateText = () => {
    setCreating(true);
    setEditingId(null);
  };

  const saveNewText = (payload: TextPayload) => {
    const item: PlaylistItem = {
      id: cryptoRandomId(),
      type: "text",
      order: items.length,
      payload,
    };
    session.addItem(item);
    setCreating(false);
    setSelectedItemId(item.id);
    setPreviewSlideIndex(0);
  };

  const saveEdit = (payload: TextPayload) => {
    if (!editingId) {
      return;
    }
    session.updateItem(editingId, { payload });
    setEditingId(null);
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
          <a href={popupBlockedUrl} target="_blank" rel="noreferrer">
            {popupBlockedUrl}
          </a>
        </div>
      ) : null}

      {session.error ? (
        <div className="control-banner control-banner-error" role="alert">
          {session.error}
        </div>
      ) : null}

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
                disabled={!session.hasSession || session.wsStatus !== "open"}
                onClick={() => {
                  if (mod.type === "text") {
                    startCreateText();
                  }
                }}
              >
                + {t(locale, mod.labelKey)}
              </button>
            ))}
          </div>

          {creating ? (
            <div className="zone-body playlist-editor">
              <TextItemEditor
                initial={createEmptyTextPayload()}
                onSave={saveNewText}
                onCancel={() => setCreating(false)}
              />
            </div>
          ) : editingId && selectedItem ? (
            <div className="zone-body playlist-editor">
              <TextItemEditor
                initial={selectedItem.payload}
                onSave={saveEdit}
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
          <div className="zone-body zone-stage">
            {selectedItem && Preview ? (
              <Preview
                item={selectedItem}
                slideIndex={previewSlideIndex}
                onSlideIndexChange={setPreviewSlideIndex}
              />
            ) : (
              <p>{t(locale, "control.previewEmpty")}</p>
            )}
          </div>
        </section>

        <section className="zone zone-live" aria-label={t(locale, "control.live")}>
          <h2>{t(locale, "control.live")}</h2>
          <div className="zone-body zone-stage">
            {liveItem && LivePanel ? (
              <LivePanel
                item={liveItem}
                slideIndex={liveSlideIndex}
                onPrev={() => session.setSlide(liveSlideIndex - 1)}
                onNext={() => session.setSlide(liveSlideIndex + 1)}
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
            <button type="button" className="btn" disabled>
              {t(locale, "control.sceneLogo")}
            </button>
            <button type="button" className="btn" disabled>
              {t(locale, "control.sceneBlack")}
            </button>
            <button type="button" className="btn" disabled>
              {t(locale, "control.sceneClear")}
            </button>
          </div>
        </section>
      </div>

      <footer className="control-footer">
        <span
          className={
            session.wsStatus === "open" ? "status-dot on" : "status-dot"
          }
        />
        <span>
          {session.wsStatus === "open"
            ? t(locale, "control.wsConnected")
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
      </footer>
    </div>
  );
}
