import { useRef, useState } from "react";
import type { TextAlign, TextPayload, TextSlide } from "@promedia/shared";
import { cryptoRandomId } from "@promedia/item-types";
import { DEFAULT_LOCALE, t } from "@promedia/i18n";
import {
  TEXT_IMPORT_MAX_BYTES,
  TEXT_IMPORT_MAX_SLIDES,
  importFileToTextSlides,
  isSupportedTextImport,
} from "../lib/textImport";

const locale = DEFAULT_LOCALE;

export type TextItemEditorProps = {
  initial: TextPayload;
  onSave: (payload: TextPayload) => void;
  onCancel: () => void;
};

function slideToText(slide: TextSlide): string {
  return slide.lines.join("\n");
}

function textToLines(text: string): string[] {
  return text.split("\n");
}

/** One textarea per slide (Q2) + PDF/XML/text import. */
export function TextItemEditor({ initial, onSave, onCancel }: TextItemEditorProps) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [align, setAlign] = useState<TextAlign>(initial.align ?? "center");
  const [slides, setSlides] = useState<TextSlide[]>(
    initial.slides.length > 0
      ? initial.slides.map((s) => ({ ...s, lines: [...s.lines] }))
      : [{ id: cryptoRandomId(), lines: [""] }],
  );
  const [importHint, setImportHint] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const updateSlideText = (index: number, text: string) => {
    setSlides((prev) =>
      prev.map((slide, i) =>
        i === index ? { ...slide, lines: textToLines(text) } : slide,
      ),
    );
  };

  const addSlide = () => {
    setSlides((prev) => [...prev, { id: cryptoRandomId(), lines: [""] }]);
  };

  const removeSlide = (index: number) => {
    setSlides((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setImportHint(null);
    if (!isSupportedTextImport(file)) {
      setImportHint(t(locale, "text.importUnsupported"));
      return;
    }
    if (file.size > TEXT_IMPORT_MAX_BYTES) {
      setImportHint(t(locale, "text.importTooLarge"));
      return;
    }
    setImporting(true);
    try {
      const result = await importFileToTextSlides(file);
      setSlides(result.slides);
      if (result.title && !title.trim()) {
        setTitle(result.title);
      }
      setImportHint(
        result.truncated
          ? t(locale, "text.importTruncated").replace(
              "{n}",
              String(TEXT_IMPORT_MAX_SLIDES),
            )
          : t(locale, "text.importOk").replace(
              "{n}",
              String(result.slides.length),
            ),
      );
    } catch (err) {
      const msg = String(err);
      if (msg.includes("file_too_large")) {
        setImportHint(t(locale, "text.importTooLarge"));
      } else if (msg.includes("unsupported_type")) {
        setImportHint(t(locale, "text.importUnsupported"));
      } else {
        setImportHint(t(locale, "text.importFailed"));
      }
    } finally {
      setImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  };

  const save = () => {
    onSave({
      title: title.trim() || undefined,
      align,
      slides: slides.map((s) => ({ id: s.id, lines: s.lines })),
    });
  };

  return (
    <div className="text-editor">
      <label className="text-editor-field">
        {t(locale, "text.editorTitle")}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t(locale, "text.editorTitlePlaceholder")}
        />
      </label>
      <label className="text-editor-field">
        {t(locale, "text.editorAlign")}
        <select
          value={align}
          onChange={(e) => setAlign(e.target.value as TextAlign)}
        >
          <option value="left">{t(locale, "text.alignLeft")}</option>
          <option value="center">{t(locale, "text.alignCenter")}</option>
          <option value="right">{t(locale, "text.alignRight")}</option>
        </select>
      </label>

      <div className="text-editor-import">
        <input
          ref={importInputRef}
          type="file"
          accept=".pdf,.xml,.txt,.md,.text,.markdown,application/pdf,text/plain,text/markdown,application/xml,text/xml"
          className="sr-only"
          onChange={(e) => void onImportFile(e.target.files?.[0])}
        />
        <button
          type="button"
          className="btn"
          disabled={importing}
          onClick={() => importInputRef.current?.click()}
        >
          {importing
            ? t(locale, "text.importing")
            : t(locale, "text.importFile")}
        </button>
        <p className="text-editor-import-hint">{t(locale, "text.importLimits")}</p>
        {importHint ? (
          <p className="text-editor-import-status" role="status">
            {importHint}
          </p>
        ) : null}
      </div>

      <div className="text-editor-slides">
        {slides.map((slide, index) => (
          <div key={slide.id} className="text-editor-slide">
            <div className="text-editor-slide-head">
              <span>
                {t(locale, "text.slide")} {index + 1}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={slides.length <= 1}
                onClick={() => removeSlide(index)}
              >
                {t(locale, "text.removeSlide")}
              </button>
            </div>
            <textarea
              rows={4}
              value={slideToText(slide)}
              onChange={(e) => updateSlideText(index, e.target.value)}
              placeholder={t(locale, "text.slidePlaceholder")}
            />
          </div>
        ))}
      </div>

      <div className="text-editor-actions">
        <button type="button" className="btn" onClick={addSlide}>
          {t(locale, "text.addSlide")}
        </button>
        <div className="text-editor-actions-right">
          <button type="button" className="btn" onClick={onCancel}>
            {t(locale, "text.cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            {t(locale, "text.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
