import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useLocale } from "../locale/LocaleContext";
import type { BiblePayload } from "@promedia/shared";
import {
  fetchBibleBooks,
  fetchBiblePassage,
  fetchBibleVersions,
  type BibleBookInfo,
  type BibleVersionInfo,
} from "../lib/bible";
import { DialogBrand } from "./DialogBrand";

export type BibleDialogProps = {
  open: boolean;
  onClose: () => void;
  onAdd: (payload: BiblePayload) => void;
  /** When set, dialog edits an existing Guion bible item (expand/change verses). */
  initial?: BiblePayload | null;
  onSave?: (payload: BiblePayload) => void;
};

export function BibleDialog({
  open,
  onClose,
  onAdd,
  initial = null,
  onSave,
}: BibleDialogProps) {
  const { t } = useLocale();
  const editing = Boolean(initial && onSave);

  const searchRef = useRef<HTMLInputElement>(null);
  const [versions, setVersions] = useState<BibleVersionInfo[]>([]);
  const [books, setBooks] = useState<BibleBookInfo[]>([]);
  const [versionId, setVersionId] = useState("rvr1909");
  const [bookId, setBookId] = useState("john");
  const [chapter, setChapter] = useState(3);
  const [verseStart, setVerseStart] = useState(16);
  const [verseEnd, setVerseEnd] = useState(16);
  const [searchQ, setSearchQ] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingPassage, setLoadingPassage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licenseNote, setLicenseNote] = useState<string | null>(null);

  const selectedBook = useMemo(
    () => books.find((b) => b.id === bookId) ?? null,
    [books, bookId],
  );
  const maxChapter = selectedBook?.chapters ?? 150;

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setLoadingMeta(true);
    const seed = initial;
    void (async () => {
      try {
        const [vRes, bRes] = await Promise.all([
          fetchBibleVersions(),
          fetchBibleBooks(),
        ]);
        setVersions(vRes.versions);
        setBooks(bRes.books);
        setLicenseNote(vRes.note ?? null);

        if (seed) {
          setVersionId(seed.versionId);
          setBookId(seed.bookId);
          setChapter(seed.chapter);
          setVerseStart(seed.verseStart);
          setVerseEnd(seed.verseEnd);
          setSearchQ(seed.reference);
        } else {
          setVersionId(
            vRes.defaultVersionId || vRes.versions[0]?.id || "rvr1909",
          );
          const firstBook = bRes.books[0];
          if (firstBook) {
            setBookId(firstBook.id);
          }
          setChapter(3);
          setVerseStart(16);
          setVerseEnd(16);
          setSearchQ("");
        }
        window.setTimeout(() => searchRef.current?.focus(), 0);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoadingMeta(false);
      }
    })();
    // Seed once per open; parent should remount key when switching edit target.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open only
  }, [open]);

  useEffect(() => {
    if (chapter > maxChapter) {
      setChapter(maxChapter);
    }
  }, [chapter, maxChapter]);

  if (!open) {
    return null;
  }

  const toPayload = (
    data: Awaited<ReturnType<typeof fetchBiblePassage>>,
  ): BiblePayload => ({
    versionId: data.versionId,
    versionLabel: data.versionLabel,
    bookId: data.bookId,
    bookName: data.bookName,
    chapter: data.chapter,
    verseStart: data.verseStart,
    verseEnd: data.verseEnd,
    reference: data.reference,
    copyright: data.copyright,
    fromCache: data.fromCache,
    align: "center",
    slides: data.slides,
  });

  const commitPayload = (payload: BiblePayload) => {
    if (editing && onSave) {
      onSave(payload);
    } else {
      onAdd(payload);
    }
  };

  /** Lookup and add/update Guion immediately — no preview/review step. */
  const runLookupAndCommit = async (mode: "fields" | "search") => {
    setError(null);
    setLoadingPassage(true);
    try {
      const data =
        mode === "search"
          ? await fetchBiblePassage({
              version: versionId,
              q: searchQ.trim(),
            })
          : await fetchBiblePassage({
              version: versionId,
              book: bookId,
              chapter,
              verseStart,
              verseEnd: Math.max(verseEnd, verseStart),
            });
      commitPayload(toPayload(data));
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "api_failed" || /api_failed|bible_http_502/.test(e.message)) {
        setError(t("bible.apiFailed"));
      } else if (e.code === "invalid_reference") {
        setError(t("bible.invalidReference"));
      } else {
        setError(e.message || t("bible.apiFailed"));
      }
    } finally {
      setLoadingPassage(false);
    }
  };

  const primaryLabel = loadingPassage
    ? t("bible.loading")
    : editing
      ? t("bible.save")
      : t("bible.add");

  const onFieldsKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !loadingPassage) {
      e.preventDefault();
      void runLookupAndCommit("fields");
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="promedia-dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="promedia-dialog bible-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bible-dialog-title"
      >
        <DialogBrand id="bible-dialog-title">
          {editing ? t("bible.editTitle") : t("bible.dialogTitle")}
        </DialogBrand>

        {loadingMeta ? (
          <p className="promedia-dialog-hint">{t("bible.loading")}</p>
        ) : (
          <>
            <label className="promedia-dialog-field">
              {t("bible.version")}
              <select
                value={versionId}
                onChange={(e) => setVersionId(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.shortLabel} — {v.label}
                    {v.source === "local"
                      ? ` [${t("bible.localBadge")}]`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="promedia-dialog-field">
              {t("bible.searchRef")}
              <input
                ref={searchRef}
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder={t("bible.searchPlaceholder")}
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQ.trim() && !loadingPassage) {
                    e.preventDefault();
                    void runLookupAndCommit("search");
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    onClose();
                  }
                }}
              />
            </label>
            <div className="bible-dialog-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!searchQ.trim() || loadingPassage}
                onClick={() => void runLookupAndCommit("search")}
              >
                {primaryLabel}
              </button>
            </div>

            <p className="bible-dialog-or">{t("bible.orPick")}</p>

            <div className="bible-dialog-grid">
              <label className="promedia-dialog-field bible-dialog-book">
                {t("bible.book")}
                <select
                  value={bookId}
                  onChange={(e) => {
                    setBookId(e.target.value);
                    setChapter(1);
                    setVerseStart(1);
                    setVerseEnd(1);
                  }}
                  onKeyDown={onFieldsKeyDown}
                >
                  {books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nameEs}
                    </option>
                  ))}
                </select>
              </label>
              <label className="promedia-dialog-field bible-dialog-num">
                {t("bible.chapter")}
                <input
                  type="number"
                  inputMode="numeric"
                  maxLength={3}
                  min={1}
                  max={maxChapter}
                  value={chapter}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
                    setChapter(
                      Math.min(
                        maxChapter,
                        Math.max(1, Number(digits) || 1),
                      ),
                    );
                  }}
                  onKeyDown={onFieldsKeyDown}
                />
              </label>
              <label className="promedia-dialog-field bible-dialog-num">
                {t("bible.verseFrom")}
                <input
                  type="number"
                  inputMode="numeric"
                  maxLength={3}
                  min={1}
                  max={999}
                  value={verseStart}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
                    const n = Math.min(999, Math.max(1, Number(digits) || 1));
                    setVerseStart(n);
                    if (verseEnd < n) {
                      setVerseEnd(n);
                    }
                  }}
                  onKeyDown={onFieldsKeyDown}
                />
              </label>
              <label className="promedia-dialog-field bible-dialog-num">
                {t("bible.verseTo")}
                <input
                  type="number"
                  inputMode="numeric"
                  maxLength={3}
                  min={verseStart}
                  max={999}
                  value={verseEnd}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
                    setVerseEnd(
                      Math.min(
                        999,
                        Math.max(
                          verseStart,
                          Number(digits) || verseStart,
                        ),
                      ),
                    );
                  }}
                  onKeyDown={onFieldsKeyDown}
                />
              </label>
            </div>

            <div className="bible-dialog-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={loadingPassage}
                onClick={() => void runLookupAndCommit("fields")}
              >
                {primaryLabel}
              </button>
            </div>
          </>
        )}

        {error ? (
          <p className="promedia-dialog-error" role="alert">
            {error}
          </p>
        ) : null}

        {licenseNote ? (
          <p className="promedia-dialog-hint">{licenseNote}</p>
        ) : (
          <p className="promedia-dialog-hint">
            {editing ? t("bible.hintEdit") : t("bible.hintFast")}
          </p>
        )}

        <div className="promedia-dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t("text.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
