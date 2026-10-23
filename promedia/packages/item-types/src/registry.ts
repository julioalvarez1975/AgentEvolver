import type { ComponentType } from "react";
import type { ImageFit, MediaClock, PlaylistItem } from "@promedia/shared";
import { ImageLivePanel } from "./image/LivePanel.js";
import { ImageOutputRenderer } from "./image/OutputRenderer.js";
import { ImagePreview } from "./image/Preview.js";
import { isImagePlaylistItem } from "./image/schema.js";
import { TextLivePanel } from "./text/LivePanel.js";
import { TextOutputRenderer } from "./text/OutputRenderer.js";
import { TextPreview } from "./text/Preview.js";
import { isTextPlaylistItem } from "./text/schema.js";
import { VideoLivePanel } from "./video/LivePanel.js";
import { VideoOutputRenderer } from "./video/OutputRenderer.js";
import { VideoPreview } from "./video/Preview.js";
import { isVideoPlaylistItem } from "./video/schema.js";

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
    mediaClock?: MediaClock | null;
    onMediaClockSet?: (patch: {
      playing: boolean;
      positionMs?: number;
    }) => void;
  }>;
  OutputRenderer: ComponentType<{
    item: PlaylistItem;
    slideIndex: number;
    assetSrc?: string;
    mediaClock?: MediaClock | null;
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

const videoModule: MediaTypeModule = {
  type: "video",
  labelKey: "itemTypes.video",
  validate: isVideoPlaylistItem,
  Preview: VideoPreview,
  LivePanel: VideoLivePanel,
  OutputRenderer: VideoOutputRenderer,
};

const modules: MediaTypeModule[] = [textModule, imageModule, videoModule];

export const itemTypeRegistry: readonly MediaTypeModule[] = modules;

export function getItemType(type: string): MediaTypeModule | undefined {
  return modules.find((m) => m.type === type);
}

export function listItemTypes(): readonly MediaTypeModule[] {
  return itemTypeRegistry;
}
