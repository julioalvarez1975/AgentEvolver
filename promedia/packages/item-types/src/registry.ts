import type { ComponentType } from "react";
import type { ImageFit, PlaylistItem } from "@promedia/shared";
import { ImageLivePanel } from "./image/LivePanel.js";
import { ImageOutputRenderer } from "./image/OutputRenderer.js";
import { ImagePreview } from "./image/Preview.js";
import { isImagePlaylistItem } from "./image/schema.js";
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
    assetSrc?: string;
    onFitChange?: (fit: ImageFit) => void;
  }>;
  LivePanel: ComponentType<{
    item: PlaylistItem;
    slideIndex: number;
    onPrev?: () => void;
    onNext?: () => void;
    assetSrc?: string;
  }>;
  OutputRenderer: ComponentType<{
    item: PlaylistItem;
    slideIndex: number;
    assetSrc?: string;
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

const imageModule: MediaTypeModule = {
  type: "image",
  labelKey: "itemTypes.image",
  validate: isImagePlaylistItem,
  Preview: ImagePreview,
  LivePanel: ImageLivePanel,
  OutputRenderer: ImageOutputRenderer,
};

const modules: MediaTypeModule[] = [textModule, imageModule];

export const itemTypeRegistry: readonly MediaTypeModule[] = modules;

export function getItemType(type: string): MediaTypeModule | undefined {
  return modules.find((m) => m.type === type);
}

export function listItemTypes(): readonly MediaTypeModule[] {
  return itemTypeRegistry;
}
