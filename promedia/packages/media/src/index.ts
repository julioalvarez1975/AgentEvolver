/**
 * Media storage contract stub.
 * Local / S3 / URL adapters land in later subtareas — no real storage here.
 */

export type MediaKind = "image" | "video" | "youtube" | string;

export type MediaAssetPlaceholder = {
  id: string;
  kind: MediaKind;
  mime?: string;
  storageKey?: string;
  sourceUrl?: string;
  size?: number;
  durationMs?: number;
  createdAt: string;
};

/** Adapter interface — implementations come later. */
export type MediaStorageAdapter = {
  readonly name: string;
  /** Resolve a public or internal URL for an asset (not implemented in scaffold). */
  resolveUrl(asset: MediaAssetPlaceholder): Promise<string>;
};

export const MEDIA_PACKAGE_VERSION = "0.0.0-scaffold" as const;
