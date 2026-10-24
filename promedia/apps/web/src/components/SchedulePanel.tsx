import { useRef, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, t } from "@promedia/i18n";
import type { PlaylistItem } from "@promedia/shared";
import { itemLabel } from "@promedia/shared";
import {
  ScheduleTypeIcon,
  scheduleKindOf,
  type ScheduleKind,
} from "./ScheduleTypeIcon";

const locale = DEFAULT_LOCALE;

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
  onAddTextFile: () => void;
  onAddTextBlank: () => void;
  onAddImage: () => void;
  onAddVideo: () => void;
  onAddYoutube: () => void;
  /** Saved playlist save/load chrome (already present). */
  saveLoad?: ReactNode;
  /** Inline text editor when creating/editing. */
  editor?: ReactNode;
};

function kindLabelKey(kind: ScheduleKind): string {
  if (kind === "youtube") {
    return "itemTypes.youtube";
  }
  return `itemTypes.${kind}`;
}

/**
 * Left schedule column — denser list patterned after Quelea «Guion»
 * and EasyWorship Schedule (type icons, reorder, per-item go-live).
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
  onAddTextFile,
  onAddTextBlank,
  onAddImage,
  onAddVideo,
  onAddYoutube,
  saveLoad,
  editor,
}: SchedulePanelProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const addDisabled = !sessionReady || uploading;
  const sorted = items;

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

  return (
    <section
      className="zone zone-playlist zone-schedule"
      aria-label={t(locale, "control.playlist")}
    >
      <header className="schedule-header">
        <h2>{t(locale, "control.playlist")}</h2>
        <span className="schedule-count" title={t(locale, "playlist.itemCount")}>
          {sorted.length}
        </span>
      </header>

      <div className="schedule-toolbar" role="toolbar" aria-label={t(locale, "playlist.addMenu")}>
        <button
          type="button"
          className="schedule-add-btn"
          disabled={addDisabled}
          title={t(locale, "text.importFile")}
          onClick={onAddTextFile}
        >
          <ScheduleTypeIcon kind="text" />
          <span>{t(locale, "itemTypes.text")}</span>
        </button>
        <button
          type="button"
          className="schedule-add-btn"
          disabled={addDisabled}
          title={t(locale, "itemTypes.image")}
          onClick={onAddImage}
        >
          <ScheduleTypeIcon kind="image" />
          <span>{t(locale, "itemTypes.image")}</span>
        </button>
        <button
          type="button"
          className="schedule-add-btn"
          disabled={addDisabled}
          title={t(locale, "video.fromFile")}
          onClick={onAddVideo}
        >
          <ScheduleTypeIcon kind="video" />
          <span>{t(locale, "itemTypes.video")}</span>
        </button>
        <button
          type="button"
          className="schedule-add-btn"
          disabled={addDisabled}
          title={t(locale, "video.fromYoutube")}
          onClick={onAddYoutube}
        >
          <ScheduleTypeIcon kind="youtube" />
          <span>{t(locale, "itemTypes.youtube")}</span>
        </button>
        <button
          type="button"
          className="schedule-add-btn schedule-add-btn-quiet"
          disabled={addDisabled}
          title={t(locale, "text.blankManual")}
          onClick={onAddTextBlank}
        >
          <span>{t(locale, "text.blankManual")}</span>
        </button>
        <button
          type="button"
          className="schedule-add-btn schedule-add-btn-danger"
          disabled={!canMutate || checkedIds.size === 0}
          title={t(locale, "playlist.removeSelected")}
          onClick={onRemoveChecked}
        >
          {t(locale, "playlist.removeSelected")}
          {checkedIds.size > 0 ? ` (${checkedIds.size})` : ""}
        </button>
      </div>

      {saveLoad}

      {editor ? (
        <div className="zone-body playlist-editor">{editor}</div>
      ) : (
        <div className="zone-body schedule-list">
          {sorted.length === 0 ? (
            <p className="zone-empty">{t(locale, "control.playlistEmpty")}</p>
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
                        aria-label={t(locale, "playlist.selectItem")}
                      />
                    </label>
                    <span
                      className="schedule-drag-handle"
                      title={t(locale, "playlist.dragReorder")}
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
                      title={t(locale, "playlist.doubleClickLive")}
                    >
                      <span
                        className={`schedule-type schedule-type-${kind}`}
                        title={t(locale, kindLabelKey(kind))}
                      >
                        <ScheduleTypeIcon kind={kind} />
                      </span>
                      <span className="schedule-row-label">
                        {itemLabel(item)}
                      </span>
                      {isLive ? (
                        <span className="schedule-live-badge">
                          {t(locale, "playlist.liveBadge")}
                        </span>
                      ) : null}
                    </button>
                    <div className="schedule-row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost schedule-go-btn"
                        disabled={!canMutate || isLive}
                        title={t(locale, "control.goLive")}
                        onClick={() => onGoLive(item.id)}
                      >
                        {t(locale, "playlist.goLiveShort")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={!canMutate || index === 0}
                        onClick={() => onMove(item.id, -1)}
                        title={t(locale, "playlist.moveUp")}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={!canMutate || index === sorted.length - 1}
                        onClick={() => onMove(item.id, 1)}
                        title={t(locale, "playlist.moveDown")}
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
                          title={t(locale, "playlist.edit")}
                        >
                          {t(locale, "playlist.edit")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-ghost schedule-remove-btn"
                        disabled={!canMutate}
                        onClick={() => onRemove(item.id)}
                        title={t(locale, "playlist.remove")}
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
