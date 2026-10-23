/**
 * Schema-only validation for hub (no React).
 */
import type { PlaylistItem } from "@promedia/shared";
import { isTextPlaylistItem, normalizeTextPayload } from "./text/schema.js";

const REGISTERED_TYPES = new Set(["text"]);

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
      ...value,
      payload: normalizeTextPayload(value.payload),
    };
  }
  return null;
}
