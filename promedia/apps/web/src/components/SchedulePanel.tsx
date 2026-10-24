import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "../locale/LocaleContext";
import type { PlaylistItem } from "@promedia/shared";
import { itemLabel } from "@promedia/shared";
import {
  ScheduleTypeIcon,
  scheduleKindOf,
  type ScheduleKind,
} from "./ScheduleTypeIcon";
import {
  IconAddFiles,
  IconChevronDown,
  IconFolderOpen,
  IconSave,
} from "./UiIcons";

export type SchedulePanelProps = {
  items: PlaylistItem[];
  selectedItemId: string | null;
  liveItemId: string | null;
  checkedIds: Set<string>;
  sessionReady: boolean;
  canMutate: boolean;
  uploading: boolean;
  onSelect: (id: string) => void;
  onToggleChecked: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onReorder: (orderedIds: string[]) => void;
  onRemove: (id: string) => void;
  onRemoveChecked: () => void;
  onGoLive: (id: string) => void;
  onEditText: (id: string) => void;
  /** Primary «+»: open native multi-file picker. */
  onAddFiles: () => void;
  /** Split menu: YouTube / generic link. */
  onAddLink: () => void;
  onAddBible: () => void;
  onAddTextBlank: () => void;
  onOpenLoad: () => void;
  onOpenSave: () => void;
  /** External file drag onto Guion (not item reorder). */
  onFilesDropped: (files: File[]) => void;
  /** Saved playlist dialogs (icons open them). */
  saveLoadDialogs?: ReactNode;
  /** Inline text editor when creating/editing. */
  editor?: ReactNode;
};

function kindLabelKey(kind: ScheduleKind): string {
  if (kind === "youtube") {
    return "itemTypes.youtube";
  }
  if (kind === "bible") {
    return "itemTypes.bible";
  }
  return `itemTypes.${kind}`;
}

/**
 * Left schedule column — denser list patterned after Quelea «Guion»
 * and EasyWorship Schedule (type icons, reorder, per-item go-live).
 * Toolbar: one unified «+» (files + chooser) + load/save icons.
 */
export function SchedulePanel({
  items,
  selectedItemId,
  liveItemId,
  checkedIds,
  sessionReady,
  canMutate,
  uploading,
  onSelect,
  onToggleChecked,
  onMove,
  onReorder,
  onRemove,
  onRemoveChecked,
  onGoLive,
  onEditText,
  onAddFiles,
  onAddLink,
  onAddBible,
  onAddTextBlank,
  onOpenLoad,
  onOpenSave,
  onFilesDropped,
  saveLoadDialogs,
  editor,
}: SchedulePanelProps) {
  const { t } = useLocale();

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const dragIdRef = useRef<string | null>(null);
  const chooserRef = useRef<HTMLDivElement>(null);

  const addDisabled = !sessionReady || uploading;
  const sorted = items;

  useEffect(() => {
    if (!chooserOpen) {
      return;
    }
    const onDoc = (e: MouseEvent) => {
      if (
        chooserRef.current &&
        !chooserRef.current.contains(e.target as Node)
      ) {
        setChooserOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setChooserOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [chooserOpen]);

  const applyReorder = (fromId: string, toId: string) => {
    if (fromId === toId || !canMutate) {
      return;
    }
    const ids = sorted.map((i) => i.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from < 0 || to < 0) {
      return;
    }
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    if (!moved) {
      return;
    }
    next.splice(to, 0, moved);
    onReorder(next);
  };

  const hasExternalFiles = (dt: DataTransfer | null): boolean => {
    if (!dt) {
      return false;
    }
    if (dt.types.includes("Files")) {
      return true;
    }
    return Array.from(dt.items ?? []).some((it) => it.kind === "file");
  };

  return (
    <section
      className={[
        "zone zone-playlist zone-schedule",
        fileDragOver ? "is-file-drop" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={t("control.playlist")}
      onDragEnter={(e) => {
        if (!hasExternalFiles(e.dataTransfer) || dragIdRef.current) {
          return;
        }
        e.preventDefault();
        setFileDragOver(true);
      }}
      onDragOver={(e) => {
        if (!hasExternalFiles(e.dataTransfer) || dragIdRef.current) {
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setFileDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) {
          return;
        }
        setFileDragOver(false);
      }}
      onDrop={(e) => {
        if (dragIdRef.current) {
          return;
        }
        if (!hasExternalFiles(e.dataTransfer)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        setFileDragOver(false);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) {
          onFilesDropped(files);
        }
      }}
    >
      <header className="schedule-header">
        <h2>{t("control.playlist")}</h2>
        <span className="schedule-count" title={t("playlist.itemCount")}>
          {sorted.length}
        </span>
      </header>

      <div
        className="schedule-toolbar schedule-toolbar-unified"
        role="toolbar"
        aria-label={t("playlist.addMenu")}
      >
        <div className="schedule-split" ref={chooserRef}>
          <button
            type="button"
            className="schedule-primary-add"
            disabled={addDisabled}
            title={t("playlist.addFilesTip")}
            aria-label={t("playlist.addFilesTip")}
            onClick={onAddFiles}
          >
            <IconAddFiles className="schedule-icon-svg" size={18} />
            <span>{t("playlist.add")}</span>
          </button>
          <button
            type="button"
            className="schedule-primary-chevron"
            disabled={addDisabled}
            aria-expanded={chooserOpen}
            aria-haspopup="menu"
            title={t("playlist.addMoreTip")}
            aria-label={t("playlist.addMoreTip")}
            onClick={() => setChooserOpen((o) => !o)}
          >
            <IconChevronDown className="schedule-icon-svg" size={14} />
          </button>
          {chooserOpen ? (
            <div className="schedule-chooser" role="menu">
              <button
                type="button"
                role="menuitem"
                className="schedule-chooser-item"
                onClick={() => {
                  setChooserOpen(false);
                  onAddLink();
                }}
              >
                <ScheduleTypeIcon kind="youtube" />
                {t("playlist.addLink")}
              </button>
              <button
                type="button"
                role="menuitem"
                className="schedule-chooser-item"
                onClick={() => {
                  setChooserOpen(false);
                  onAddBible();
                }}
              >
                <ScheduleTypeIcon kind="bible" />
                {t("itemTypes.bible")}
              </button>
              <button
                type="button"
                role="menuitem"
                className="schedule-chooser-item"
                onClick={() => {
                  setChooserOpen(false);
                  onAddTextBlank();
                }}
              >
                <ScheduleTypeIcon kind="text" />
                {t("text.blankManual")}
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="schedule-icon-btn"
          disabled={!sessionReady || uploading}
          title={t("playlist.load")}
          aria-label={t("playlist.load")}
          onClick={onOpenLoad}
        >
          <IconFolderOpen className="schedule-icon-svg" size={18} />
        </button>
        <button
          type="button"
          className="schedule-icon-btn"
          disabled={!canMutate}
          title={t("playlist.save")}
          aria-label={t("playlist.save")}
          onClick={onOpenSave}
        >
          <IconSave className="schedule-icon-svg" size={18} />
        </button>

        {checkedIds.size > 0 ? (
          <button
            type="button"
            className="schedule-add-btn schedule-add-btn-danger schedule-remove-checked"
            disabled={!canMutate}
            title={t("playlist.removeSelected")}
            onClick={onRemoveChecked}
          >
            {t("playlist.removeSelected")} ({checkedIds.size})
          </button>
        ) : null}
      </div>

      {fileDragOver ? (
        <div className="schedule-drop-overlay" aria-hidden>
          {t("playlist.dropFiles")}
        </div>
      ) : null}

      {saveLoadDialogs}

      {editor ? (
        <div className="zone-body playlist-editor">{editor}</div>
      ) : (
        <div className="zone-body schedule-list">
          {sorted.length === 0 ? (
            <p className="zone-empty">
              {t("control.playlistEmpty")}
              <span className="schedule-drop-hint">
                {t("playlist.dropHint")}
              </span>
            </p>
          ) : (
            <ul
              className="schedule-ul"
              onDragOver={(e) => {
                if (dragIdRef.current) {
                  e.preventDefault();
                }
              }}
            >
              {sorted.map((item, index) => {
                const kind = scheduleKindOf(item);
                const isLive = item.id === liveItemId;
                const isSelected = item.id === selectedItemId;
                const isDropTarget =
                  dropTargetId === item.id && dragId !== item.id;
                return (
                  <li
                    key={item.id}
                    className={[
                      "schedule-item",
                      isSelected ? "is-selected" : "",
                      isLive ? "is-live" : "",
                      dragId === item.id ? "is-dragging" : "",
                      isDropTarget ? "is-drop-target" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onDragOver={(e) => {
                      if (!dragIdRef.current || dragIdRef.current === item.id) {
                        return;
                      }
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDropTargetId(item.id);
                    }}
                    onDragLeave={() => {
                      setDropTargetId((cur) =>
                        cur === item.id ? null : cur,
                      );
                    }}
                    onDrop={(e) => {
                      if (hasExternalFiles(e.dataTransfer)) {
                        return;
                      }
                      e.preventDefault();
                      const from =
                        e.dataTransfer.getData("text/plain") ||
                        dragIdRef.current;
                      if (from) {
                        applyReorder(from, item.id);
                      }
                      dragIdRef.current = null;
                      setDragId(null);
                      setDropTargetId(null);
                    }}
                  >
                    <label className="schedule-check">
                      <input
                        type="checkbox"
                        checked={checkedIds.has(item.id)}
                        onChange={() => onToggleChecked(item.id)}
                        aria-label={t("playlist.selectItem")}
                      />
                    </label>
                    <span
                      className="schedule-drag-handle"
                      title={t("playlist.dragReorder")}
                      draggable={canMutate}
                      onDragStart={(e) => {
                        if (!canMutate) {
                          e.preventDefault();
                          return;
                        }
                        dragIdRef.current = item.id;
                        setDragId(item.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", item.id);
                      }}
                      onDragEnd={() => {
                        dragIdRef.current = null;
                        setDragId(null);
                        setDropTargetId(null);
                      }}
                    >
                      ⋮⋮
                    </span>
                    <button
                      type="button"
                      className="schedule-row-main"
                      onClick={() => onSelect(item.id)}
                      onDoubleClick={() => {
                        if (canMutate) {
                          onGoLive(item.id);
                        }
                      }}
                      title={t("playlist.doubleClickLive")}
                    >
                      <span
                        className={`schedule-type schedule-type-${kind}`}
                        title={t(kindLabelKey(kind))}
                      >
                        <ScheduleTypeIcon kind={kind} />
                      </span>
                      <span className="schedule-row-label">
                        {itemLabel(item)}
                      </span>
                      {isLive ? (
                        <span className="schedule-live-badge">
                          {t("playlist.liveBadge")}
                        </span>
                      ) : null}
                    </button>
                    <div className="schedule-row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost schedule-go-btn"
                        disabled={!canMutate || isLive}
                        title={t("control.goLive")}
                        onClick={() => onGoLive(item.id)}
                      >
                        {t("playlist.goLiveShort")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={!canMutate || index === 0}
                        onClick={() => onMove(item.id, -1)}
                        title={t("playlist.moveUp")}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={!canMutate || index === sorted.length - 1}
                        onClick={() => onMove(item.id, 1)}
                        title={t("playlist.moveDown")}
                      >
                        ↓
                      </button>
                      {item.type === "text" ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={!canMutate}
                          onClick={() => {
                            onSelect(item.id);
                            onEditText(item.id);
                          }}
                          title={t("playlist.edit")}
                        >
                          {t("playlist.edit")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-ghost schedule-remove-btn"
                        disabled={!canMutate}
                        onClick={() => onRemove(item.id)}
                        title={t("playlist.remove")}
                      >
                        ×
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
