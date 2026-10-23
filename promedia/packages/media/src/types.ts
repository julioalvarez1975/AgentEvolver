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

/**
 * Storage adapter contract (local now; S3 later).
 */
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
    default:
      return ".bin";
  }
}
