/**
 * Schema-only validation for hub (no React).
 */
import type { PlaylistItem } from "@promedia/shared";
import {
  isImagePlaylistItem,
  normalizeImagePayload,
} from "./image/schema.js";
import { isTextPlaylistItem, normalizeTextPayload } from "./text/schema.js";

const REGISTERED_TYPES = new Set(["text", "image"]);

export function isRegisteredItemType(type: string): boolean {
  return REGISTERED_TYPES.has(type);
}

export function validatePlaylistItem(value: unknown): PlaylistItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as { type?: string };
  if (!raw.type || !isRegisteredItemType(raw.type)) {
    return null;
  }
  if (raw.type === "text") {
    if (!isTextPlaylistItem(value)) {
      return null;
    }
    return {
      id: value.id,
      type: "text",
      order: value.order,
      payload: normalizeTextPayload(value.payload),
    };
  }
  if (raw.type === "image") {
    if (!isImagePlaylistItem(value)) {
      return null;
    }
    return {
      id: value.id,
      type: "image",
      order: value.order,
      payload: normalizeImagePayload(value.payload),
    };
  }
  return null;
}
