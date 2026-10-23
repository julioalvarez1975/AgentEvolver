import type { MediaAsset, MediaKind } from "@promedia/shared";
import {
  createLocalDiskAdapter,
  isAllowedImageMime,
  isAllowedVideoMime,
  type StorageAdapter,
} from "@promedia/media";
import { randomBytes } from "node:crypto";

function newAssetId(): string {
  return randomBytes(12).toString("hex");
}

/**
 * In-memory MediaAsset registry keyed by session, backed by local disk.
 */
export class AssetStore {
  private readonly bySession = new Map<string, Map<string, MediaAsset>>();
  private readonly adapter: StorageAdapter;

  constructor(adapter?: StorageAdapter) {
    this.adapter = adapter ?? createLocalDiskAdapter();
  }

  getAdapter(): StorageAdapter {
    return this.adapter;
  }

  get(sessionId: string, assetId: string): MediaAsset | undefined {
    return this.bySession.get(sessionId)?.get(assetId);
  }

  list(sessionId: string): MediaAsset[] {
    const map = this.bySession.get(sessionId);
    return map ? [...map.values()] : [];
  }

  private async putKind(
    sessionId: string,
    kind: MediaKind,
    bytes: Buffer,
    mime: string,
    originalName?: string,
  ): Promise<MediaAsset | { error: string }> {
    const id = newAssetId();
    const { storageKey } = await this.adapter.put(sessionId, id, bytes, {
      mime,
      originalName,
      size: bytes.byteLength,
    });
    const asset: MediaAsset = {
      id,
      kind,
      mime,
      storageKey,
      size: bytes.byteLength,
      originalName,
      createdAt: new Date().toISOString(),
    };
    let map = this.bySession.get(sessionId);
    if (!map) {
      map = new Map();
      this.bySession.set(sessionId, map);
    }
    map.set(id, asset);
    return asset;
  }

  async putImage(
    sessionId: string,
    bytes: Buffer,
    mime: string,
    originalName?: string,
  ): Promise<MediaAsset | { error: string }> {
    if (!isAllowedImageMime(mime)) {
      return { error: "unsupported_mime" };
    }
    return this.putKind(sessionId, "image", bytes, mime, originalName);
  }

  async putVideo(
    sessionId: string,
    bytes: Buffer,
    mime: string,
    originalName?: string,
  ): Promise<MediaAsset | { error: string }> {
    if (!isAllowedVideoMime(mime)) {
      return { error: "unsupported_mime" };
    }
    return this.putKind(sessionId, "video", bytes, mime, originalName);
  }

  /** Route by MIME: image or video. */
  async putByMime(
    sessionId: string,
    bytes: Buffer,
    mime: string,
    originalName?: string,
  ): Promise<MediaAsset | { error: string }> {
    if (isAllowedImageMime(mime)) {
      return this.putImage(sessionId, bytes, mime, originalName);
    }
    if (isAllowedVideoMime(mime)) {
      return this.putVideo(sessionId, bytes, mime, originalName);
    }
    return { error: "unsupported_mime" };
  }
}

export const assetStore = new AssetStore();
