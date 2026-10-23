export {
  ALLOWED_IMAGE_MIMES,
  extensionForMime,
  isAllowedImageMime,
  type AllowedImageMime,
  type MediaAsset,
  type PutMeta,
  type PutResult,
  type StorageAdapter,
} from "./types.js";
export {
  LocalDiskAdapter,
  createLocalDiskAdapter,
} from "./local/LocalDiskAdapter.js";

export const MEDIA_PACKAGE_VERSION = "0.0.5-local" as const;
