import type { ComponentType } from "react";
import type { PlaylistItem } from "@promedia/shared";
import { TextLivePanel } from "./text/LivePanel.js";
import { TextOutputRenderer } from "./text/OutputRenderer.js";
import { TextPreview } from "./text/Preview.js";
import { isTextPlaylistItem } from "./text/schema.js";

export type MediaTypeModule = {
  type: string;
  labelKey: string;
  validate: (item: unknown) => item is PlaylistItem;
  Preview: ComponentType<{
    item: PlaylistItem;
    slideIndex: number;
    onSlideIndexChange?: (index: number) => void;
  }>;
  LivePanel: ComponentType<{
    item: PlaylistItem;
    slideIndex: number;
    onPrev?: () => void;
    onNext?: () => void;
  }>;
  OutputRenderer: ComponentType<{
    item: PlaylistItem;
    slideIndex: number;
  }>;
};

const textModule: MediaTypeModule = {
  type: "text",
  labelKey: "itemTypes.text",
  validate: isTextPlaylistItem,
  Preview: TextPreview,
  LivePanel: TextLivePanel,
  OutputRenderer: TextOutputRenderer,
};

const modules: MediaTypeModule[] = [textModule];

export const itemTypeRegistry: readonly MediaTypeModule[] = modules;

export function getItemType(type: string): MediaTypeModule | undefined {
  return modules.find((m) => m.type === type);
}

export function listItemTypes(): readonly MediaTypeModule[] {
  return itemTypeRegistry;
}
