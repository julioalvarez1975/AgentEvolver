import type { MediaAsset } from "@promedia/shared";

export type { MediaAsset };

export type PutMeta = {
  mime: string;
  originalName?: string;
  size?: number;
};

export type PutResult = {
  storageKey: string;
};

export type StorageAdapter = {
  readonly name: string;
  put(
    sessionId: string,
    assetId: string,
    bytes: Uint8Array | Buffer,
    meta: PutMeta,
  ): Promise<PutResult>;
  open(storageKey: string): Promise<{ path: string; mimeHint?: string }>;
  resolvePath(storageKey: string): string;
  delete?(storageKey: string): Promise<void>;
};

export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

export function isAllowedImageMime(mime: string): mime is AllowedImageMime {
  return (ALLOWED_IMAGE_MIMES as readonly string[]).includes(mime);
}

/** Q1: mp4/webm allowed; quicktime optional with UI warning. */
export const ALLOWED_VIDEO_MIMES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export type AllowedVideoMime = (typeof ALLOWED_VIDEO_MIMES)[number];

export function isAllowedVideoMime(mime: string): mime is AllowedVideoMime {
  return (ALLOWED_VIDEO_MIMES as readonly string[]).includes(mime);
}

export function isQuicktimeMime(mime: string): boolean {
  return mime === "video/quicktime";
}

export function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    case "video/quicktime":
      return ".mov";
    default:
      return ".bin";
  }
}
