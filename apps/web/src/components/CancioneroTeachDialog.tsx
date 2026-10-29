import { useEffect, useMemo, useState } from "react";
import type { LibraryItem } from "@promedia/shared";
import { listLibraryItems } from "../lib/library";
import { useLocale } from "../locale/LocaleContext";
import { DialogBrand } from "./DialogBrand";

export type CancioneroTeachDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Current Guion / YouTube title for context. */
  mediaTitle?: string | null;
  /** Song currently used by the agent (if any). */
  matchedSongTitle?: string | null;
  busy?: boolean;
  onTeach: (songId: string) => void;
};

/**
 * Educate karaoke: pick the correct Biblioteca → Canciones entry for this media.
 * The hub remembers the choice for the next run.
 */
export function CancioneroTeachDialog({
  open,
  onClose,
  mediaTitle,
  matchedSongTitle,
  busy,
  onTeach,
}: CancioneroTeachDialogProps) {
  const { t } = useLocale();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQ("");
    setSelectedId(null);
    setError(null);
    setLoading(true);
    void listLibraryItems({ category: "canciones" })
      .then((list) => {
        setItems(list.filter((i) => i.song?.title?.trim()));
      })
      .catch((err) => {
        setError(String(err));
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) => {
      const title = it.song?.title?.toLowerCase() ?? "";
      const artist = it.song?.artist?.toLowerCase() ?? "";
      return title.includes(needle) || artist.includes(needle);
    });
  }, [items, q]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="promedia-dialog-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="promedia-dialog cancionero-teach-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancionero-teach-title"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogBrand id="cancionero-teach-title">
          {t("control.cancioneroTeachTitle")}
        </DialogBrand>
        <p className="promedia-dialog-hint">{t("control.cancioneroTeachHint")}</p>
        {mediaTitle?.trim() ? (
          <p className="promedia-dialog-hint" role="status">
            <strong>{t("control.cancioneroTeachMedia")}:</strong>{" "}
            {mediaTitle.trim()}
          </p>
        ) : null}
        {matchedSongTitle?.trim() ? (
          <p className="promedia-dialog-hint" role="status">
            <strong>{t("control.cancioneroTeachCurrent")}:</strong>{" "}
            {matchedSongTitle.trim()}
          </p>
        ) : null}

        <label className="cancionero-teach-search">
          <span className="sr-only">{t("control.cancioneroTeachSearch")}</span>
          <input
            type="search"
            value={q}
            disabled={loading || busy}
            placeholder={t("control.cancioneroTeachSearch")}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </label>

        {error ? (
          <p className="promedia-dialog-error" role="alert">
            {error}
          </p>
        ) : null}

        <ul className="cancionero-teach-list" role="listbox">
          {loading ? (
            <li className="cancionero-teach-empty">{t("control.loading")}</li>
          ) : filtered.length === 0 ? (
            <li className="cancionero-teach-empty">
              {t("control.cancioneroTeachEmpty")}
            </li>
          ) : (
            filtered.map((it) => {
              const title = it.song?.title?.trim() || it.id;
              const artist = it.song?.artist?.trim();
              const active = selectedId === it.id;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`cancionero-teach-item${active ? " is-selected" : ""}`}
                    disabled={busy}
                    onClick={() => setSelectedId(it.id)}
                    onDoubleClick={() => {
                      setSelectedId(it.id);
                      onTeach(it.id);
                    }}
                  >
                    <span className="cancionero-teach-item-title">{title}</span>
                    {artist ? (
                      <span className="cancionero-teach-item-artist">
                        {artist}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="promedia-dialog-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={onClose}
          >
            {t("control.close")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !selectedId}
            onClick={() => {
              if (selectedId) onTeach(selectedId);
            }}
          >
            {busy
              ? t("control.cancioneroTeachSaving")
              : t("control.cancioneroTeachApply")}
          </button>
        </div>
      </div>
    </div>
  );
}
