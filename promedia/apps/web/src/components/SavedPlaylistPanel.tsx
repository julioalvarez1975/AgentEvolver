import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LOCALE, t } from "@promedia/i18n";
import {
  deleteSavedPlaylist,
  listSavedPlaylists,
  loadSavedPlaylist,
  saveSessionPlaylist,
  type SavedPlaylistSummary,
} from "../lib/playlists";

const locale = DEFAULT_LOCALE;

export type SavedPlaylistPanelProps = {
  sessionId: string;
  wsTicket: string;
  disabled?: boolean;
  onHint?: (msg: string | null) => void;
  /** Compact layout for playlist column (Guardar / Cargar). */
  compact?: boolean;
};

export function SavedPlaylistPanel({
  sessionId,
  wsTicket,
  disabled,
  onHint,
  compact,
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
