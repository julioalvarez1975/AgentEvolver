import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LOCALE, t } from "@promedia/i18n";
import {
  deleteSavedPlaylist,
  listSavedPlaylists,
  loadSavedPlaylist,
  saveSessionPlaylist,
  type SavedPlaylistSummary,
} from "../lib/playlists";
import { DialogBrand } from "./DialogBrand";

const locale = DEFAULT_LOCALE;

export type SavedPlaylistPanelProps = {
  sessionId: string;
  wsTicket: string;
  disabled?: boolean;
  onHint?: (msg: string | null) => void;
  /** Compact layout for playlist column (legacy inline). */
  compact?: boolean;
  /** Dialog mode opened from Guion toolbar icons. */
  dialogMode?: boolean;
  saveOpen?: boolean;
  loadOpen?: boolean;
  onSaveOpenChange?: (open: boolean) => void;
  onLoadOpenChange?: (open: boolean) => void;
};

export function SavedPlaylistPanel({
  sessionId,
  wsTicket,
  disabled,
  onHint,
  compact,
  dialogMode,
  saveOpen = false,
  loadOpen = false,
  onSaveOpenChange,
  onLoadOpenChange,
}: SavedPlaylistPanelProps) {
  const [name, setName] = useState("");
  const [list, setList] = useState<SavedPlaylistSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setList(await listSavedPlaylists());
    } catch (err) {
      onHint?.(String(err));
    }
  }, [onHint]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if ((saveOpen || loadOpen) && dialogMode) {
      void refresh();
    }
  }, [saveOpen, loadOpen, dialogMode, refresh]);

  const onSave = async () => {
    if (!name.trim() || disabled) {
      return;
    }
    setBusy(true);
    try {
      await saveSessionPlaylist(sessionId, wsTicket, name.trim());
      setName("");
      onHint?.(t(locale, "playlist.savedOk"));
      await refresh();
      onSaveOpenChange?.(false);
    } catch (err) {
      onHint?.(String(err));
    } finally {
      setBusy(false);
    }
  };

  const onLoad = async (id: string) => {
    setBusy(true);
    try {
      const { skipped } = await loadSavedPlaylist(sessionId, wsTicket, id);
      onHint?.(
        skipped > 0
          ? t(locale, "playlist.loadedSkipped").replace(
              "{n}",
              String(skipped),
            )
          : t(locale, "playlist.loadedOk"),
      );
      onLoadOpenChange?.(false);
    } catch (err) {
      onHint?.(String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    setBusy(true);
    try {
      await deleteSavedPlaylist(id);
      await refresh();
    } catch (err) {
      onHint?.(String(err));
    } finally {
      setBusy(false);
    }
  };

  if (dialogMode) {
    return (
      <>
        {saveOpen ? (
          <div
            className="promedia-dialog-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                onSaveOpenChange?.(false);
              }
            }}
          >
            <div
              className="promedia-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="playlist-save-title"
            >
              <DialogBrand id="playlist-save-title">
                {t(locale, "playlist.save")}
              </DialogBrand>
              <label className="promedia-dialog-field">
                {t(locale, "playlist.saveName")}
                <input
                  value={name}
                  disabled={disabled || busy}
                  autoFocus
                  placeholder={t(locale, "playlist.saveName")}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      void onSave();
                    } else if (e.key === "Escape") {
                      onSaveOpenChange?.(false);
                    }
                  }}
                />
              </label>
              <div className="promedia-dialog-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => onSaveOpenChange?.(false)}
                >
                  {t(locale, "text.cancel")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={disabled || busy || !name.trim()}
                  onClick={() => void onSave()}
                >
                  {t(locale, "playlist.save")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {loadOpen ? (
          <div
            className="promedia-dialog-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                onLoadOpenChange?.(false);
              }
            }}
          >
            <div
              className="promedia-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="playlist-load-title"
            >
              <DialogBrand id="playlist-load-title">
                {t(locale, "playlist.load")}
              </DialogBrand>
              {list.length === 0 ? (
                <p className="promedia-dialog-hint">
                  {t(locale, "playlist.savedEmpty")}
                </p>
              ) : (
                <ul className="saved-playlist-list saved-playlist-list-dialog">
                  {list.map((p) => (
                    <li key={p.id}>
                      <span className="saved-playlist-name">
                        {p.name}{" "}
                        <span className="footer-muted">({p.itemCount})</span>
                      </span>
                      <div className="playlist-row-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={disabled || busy}
                          onClick={() => void onLoad(p.id)}
                        >
                          {t(locale, "playlist.load")}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => void onDelete(p.id)}
                        >
                          {t(locale, "playlist.remove")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="promedia-dialog-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => onLoadOpenChange?.(false)}
                >
                  {t(locale, "text.cancel")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div
      className={
        compact
          ? "saved-playlist-panel saved-playlist-panel-compact"
          : "saved-playlist-panel"
      }
    >
      <h3 className="theme-controls-title">
        {t(locale, compact ? "playlist.saveLoadTitle" : "playlist.savedTitle")}
      </h3>
      <div className="saved-playlist-save">
        <input
          value={name}
          disabled={disabled || busy}
          placeholder={t(locale, "playlist.saveName")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              void onSave();
            }
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={disabled || busy || !name.trim()}
          onClick={() => void onSave()}
        >
          {t(locale, "playlist.save")}
        </button>
      </div>
      {list.length === 0 ? (
        <p className="zone-empty">{t(locale, "playlist.savedEmpty")}</p>
      ) : (
        <ul className="saved-playlist-list">
          {list.map((p) => (
            <li key={p.id}>
              <span className="saved-playlist-name">
                {p.name}{" "}
                <span className="footer-muted">({p.itemCount})</span>
              </span>
              <div className="playlist-row-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={disabled || busy}
                  onClick={() => void onLoad(p.id)}
                >
                  {t(locale, "playlist.load")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => void onDelete(p.id)}
                >
                  {t(locale, "playlist.remove")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
