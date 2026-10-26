import { useEffect, useMemo, useRef, useState } from "react";
import type {
  LibraryCategory,
  LibraryItem,
  LibrarySongPayload,
} from "@promedia/shared";
import { LIBRARY_CATEGORIES } from "@promedia/shared";
import { useLocale } from "../locale/LocaleContext";
import {
  LIBRARY_UPLOAD_ACCEPT,
  addLibraryItemToSession,
  createLibrarySong,
  deleteLibraryItem,
  libraryOriginalUrl,
  listLibraryItems,
  uploadLibraryFile,
} from "../lib/library";
import { DialogBrand } from "./DialogBrand";
import { SongEditor } from "./SongEditor";

export type BibliotecaDialogProps = {
  open: boolean;
  sessionId: string | null;
  wsTicket: string | null;
  canMutate: boolean;
  onClose: () => void;
  onAddedToGuion: (itemId: string) => void;
  onOpenCreateSong: () => void;
};

const CATEGORY_LABEL: Record<LibraryCategory, string> = {
  canciones: "library.cat.canciones",
  biblias: "library.cat.biblias",
  textos: "library.cat.textos",
  presentaciones: "library.cat.presentaciones",
  imagenes: "library.cat.imagenes",
  videos: "library.cat.videos",
};

export function BibliotecaDialog({
  open,
  sessionId,
  wsTicket,
  canMutate,
  onClose,
  onAddedToGuion,
  onOpenCreateSong,
}: BibliotecaDialogProps) {
  const { t } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<LibraryCategory | "all">("all");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [songOpen, setSongOpen] = useState(false);
  const [songBusy, setSongBusy] = useState(false);
  const [songError, setSongError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listLibraryItems({
        category: category === "all" ? undefined : category,
        q: q.trim() || undefined,
      });
      setItems(list);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on open/filter
  }, [open, category]);

  const filteredHint = useMemo(() => {
    if (loading) {
      return t("library.loading");
    }
    if (items.length === 0) {
      return t("library.empty");
    }
    return null;
  }, [loading, items.length, t]);

  if (!open) {
    return null;
  }

  const onUpload = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadLibraryFile(file);
      await reload();
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  };

  const onAdd = async (item: LibraryItem) => {
    if (!sessionId || !wsTicket || !canMutate) {
      setError(t("control.wsDisconnectedHint"));
      return;
    }
    setBusyId(item.id);
    setError(null);
    try {
      const playlistItem = await addLibraryItemToSession({
        sessionId,
        credential: wsTicket,
        libraryItemId: item.id,
      });
      onAddedToGuion(playlistItem.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (item: LibraryItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      await deleteLibraryItem(item.id);
      await reload();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusyId(null);
    }
  };

  const onSaveSong = async (song: LibrarySongPayload) => {
    setSongBusy(true);
    setSongError(null);
    try {
      await createLibrarySong(song);
      setSongOpen(false);
      setCategory("canciones");
      await reload();
    } catch (err) {
      setSongError(String(err));
    } finally {
      setSongBusy(false);
    }
  };

  return (
    <>
      <div
        className="promedia-dialog-backdrop"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !uploading) {
            onClose();
          }
        }}
      >
        <div
          className="promedia-dialog biblioteca-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="biblioteca-title"
        >
          <DialogBrand id="biblioteca-title">{t("library.title")}</DialogBrand>
          <p className="promedia-dialog-hint">{t("library.hint")}</p>

          <div className="biblioteca-toolbar">
            <label className="promedia-dialog-field biblioteca-search">
              {t("library.search")}
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void reload();
                  }
                }}
                placeholder={t("library.searchPlaceholder")}
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void reload()}
              disabled={loading}
            >
              {t("library.filter")}
            </button>
          </div>

          <div className="biblioteca-cats" role="tablist">
            <button
              type="button"
              role="tab"
              className={
                category === "all"
                  ? "biblioteca-cat is-active"
                  : "biblioteca-cat"
              }
              aria-selected={category === "all"}
              onClick={() => setCategory("all")}
            >
              {t("library.cat.all")}
            </button>
            {LIBRARY_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                className={
                  category === cat
                    ? "biblioteca-cat is-active"
                    : "biblioteca-cat"
                }
                aria-selected={category === cat}
                onClick={() => setCategory(cat)}
              >
                {t(CATEGORY_LABEL[cat])}
              </button>
            ))}
          </div>

          <div className="biblioteca-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSongError(null);
                setSongOpen(true);
                onOpenCreateSong();
              }}
            >
              {t("library.createSong")}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? t("library.uploading") : t("library.upload")}
            </button>
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              accept={LIBRARY_UPLOAD_ACCEPT}
              onChange={(e) => void onUpload(e.target.files?.[0])}
            />
          </div>

          {error ? <p className="promedia-dialog-error">{error}</p> : null}

          <div className="biblioteca-list">
            {filteredHint ? (
              <p className="zone-empty">{filteredHint}</p>
            ) : (
              <ul className="biblioteca-ul">
                {items.map((item) => (
                  <li key={item.id} className="biblioteca-item">
                    <div className="biblioteca-item-main">
                      <span className="biblioteca-item-cat">
                        {t(CATEGORY_LABEL[item.category])}
                      </span>
                      <span className="biblioteca-item-title">{item.title}</span>
                      {item.song?.artist ? (
                        <span className="biblioteca-item-meta">
                          {item.song.artist}
                        </span>
                      ) : null}
                      {item.slides?.length ? (
                        <span className="biblioteca-item-meta">
                          {t("library.slideCount").replace(
                            "{n}",
                            String(item.slides.length),
                          )}
                        </span>
                      ) : null}
                    </div>
                    <div className="biblioteca-item-actions">
                      <button
                        type="button"
                        className="btn"
                        disabled={!canMutate || busyId === item.id}
                        onClick={() => void onAdd(item)}
                      >
                        {t("library.addToGuion")}
                      </button>
                      {item.original ? (
                        <a
                          className="btn btn-ghost"
                          href={libraryOriginalUrl(item.id)}
                          download={item.original.originalName}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("library.download")}
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busyId === item.id}
                        onClick={() => void onDelete(item)}
                      >
                        {t("library.delete")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="promedia-dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t("library.close")}
            </button>
          </div>
        </div>
      </div>

      <SongEditor
        open={songOpen}
        busy={songBusy}
        error={songError}
        onClose={() => setSongOpen(false)}
        onSave={(song) => void onSaveSong(song)}
      />
    </>
  );
}
