import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type {
  BiblePayload,
  LibraryCategory,
  LibraryItem,
  LibrarySongPayload,
  TextPayload,
} from "@promedia/shared";
import { LIBRARY_CATEGORIES, songToTextPayload } from "@promedia/shared";
import { assetStore } from "./asset-store.js";
import {
  importPresentationFile,
  isMacroPresentationName,
  type RenderedSlide,
} from "./presentation-import.js";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return randomBytes(10).toString("hex");
}

function libraryRoot(): string {
  return (
    process.env.LIBRARY_ROOT ??
    path.join(process.cwd(), "data", "library")
  );
}

function indexPath(): string {
  return path.join(libraryRoot(), "index.json");
}

function assertSafeId(id: string): void {
  if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) {
    throw new Error("invalid_id");
  }
}

function isCategory(value: string): value is LibraryCategory {
  return (LIBRARY_CATEGORIES as readonly string[]).includes(value);
}

function mimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (lower.endsWith(".ppsx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.slideshow";
  }
  if (lower.endsWith(".potx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.template";
  }
  if (lower.endsWith(".odp")) {
    return "application/vnd.oasis.opendocument.presentation";
  }
  if (lower.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
  return "application/octet-stream";
}

function classifyUpload(
  fileName: string,
  mime: string,
): LibraryCategory | { error: string; message: string } {
  const lower = fileName.toLowerCase();
  if (isMacroPresentationName(fileName)) {
    return {
      error: "macros_not_supported",
      message:
        "No se admiten presentaciones con macros (.pptm / .ppsm) por seguridad. Guardá una copia sin macros (.pptx / .ppsx) o exportá a PDF e importá de nuevo.",
    };
  }
  if (
    lower.endsWith(".pptx") ||
    lower.endsWith(".ppt") ||
    lower.endsWith(".ppsx") ||
    lower.endsWith(".potx") ||
    lower.endsWith(".odp") ||
    lower.endsWith(".pdf") ||
    mime.includes("presentation") ||
    mime === "application/pdf"
  ) {
    return "presentaciones";
  }
  if (
    mime.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(lower)
  ) {
    return "imagenes";
  }
  if (
    mime.startsWith("video/") ||
    /\.(mp4|webm|mov)$/i.test(lower)
  ) {
    return "videos";
  }
  if (/\.(txt|md|xml)$/i.test(lower) || mime.startsWith("text/")) {
    return "textos";
  }
  return {
    error: "unsupported_type",
    message:
      "Tipo no soportado para la biblioteca. Subí imagen, vídeo, texto o presentación (.pptx/.pdf/…).",
  };
}

/**
 * File-backed local media library (JSON index + files under data/library).
 * Cloud sync is out of scope for Phase 1.
 */
export class LibraryStore {
  private items = new Map<string, LibraryItem>();
  private loaded = false;

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    try {
      const raw = await readFile(indexPath(), "utf8");
      const parsed = JSON.parse(raw) as { items?: LibraryItem[] };
      for (const item of parsed.items ?? []) {
        if (item?.id && item.category && item.title) {
          this.items.set(item.id, item);
        }
      }
    } catch {
      // missing = empty
    }
  }

  private async persist(): Promise<void> {
    const root = libraryRoot();
    await mkdir(root, { recursive: true });
    const items = [...this.items.values()].sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : -1,
    );
    await writeFile(
      indexPath(),
      JSON.stringify({ items }, null, 2),
      "utf8",
    );
  }

  private resolveUnderLibrary(relativePath: string): string {
    if (
      !relativePath ||
      relativePath.includes("..") ||
      path.isAbsolute(relativePath)
    ) {
      throw new Error("invalid_path");
    }
    const abs = path.resolve(libraryRoot(), relativePath);
    const root = path.resolve(libraryRoot());
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      throw new Error("path_escape");
    }
    return abs;
  }

  async list(opts?: {
    category?: string;
    q?: string;
  }): Promise<LibraryItem[]> {
    await this.ensureLoaded();
    let list = [...this.items.values()];
    if (opts?.category && isCategory(opts.category)) {
      list = list.filter((i) => i.category === opts.category);
    }
    const q = opts?.q?.trim().toLowerCase();
    if (q) {
      list = list.filter((i) => {
        const hay = [
          i.title,
          i.song?.artist,
          i.song?.title,
          i.original?.originalName,
          i.bible?.reference,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  async get(id: string): Promise<LibraryItem | undefined> {
    await this.ensureLoaded();
    return this.items.get(id);
  }

  async createSong(
    song: LibrarySongPayload,
  ): Promise<LibraryItem | { error: string; message: string }> {
    await this.ensureLoaded();
    const title = song.title.trim();
    if (!title) {
      return { error: "missing_title", message: "La canción necesita un título." };
    }
    const stanzas = (song.stanzas ?? [])
      .map((s) => ({
        id: s.id || newId(),
        lines: (s.lines ?? []).map((l) => String(l)),
      }))
      .filter((s) => s.lines.some((l) => l.trim().length > 0) || true);
    if (stanzas.length === 0) {
      stanzas.push({ id: newId(), lines: [""] });
    }
    const id = newId();
    const ts = nowIso();
    const item: LibraryItem = {
      id,
      category: "canciones",
      title,
      createdAt: ts,
      updatedAt: ts,
      song: {
        title,
        artist: song.artist?.trim() || undefined,
        stanzas,
      },
    };
    this.items.set(id, item);
    await this.persist();
    return item;
  }

  async updateSong(
    id: string,
    song: LibrarySongPayload,
  ): Promise<LibraryItem | { error: string; message: string }> {
    await this.ensureLoaded();
    const existing = this.items.get(id);
    if (!existing || existing.category !== "canciones") {
      return { error: "not_found", message: "Canción no encontrada." };
    }
    const title = song.title.trim();
    if (!title) {
      return { error: "missing_title", message: "La canción necesita un título." };
    }
    const updated: LibraryItem = {
      ...existing,
      title,
      updatedAt: nowIso(),
      song: {
        title,
        artist: song.artist?.trim() || undefined,
        stanzas: (song.stanzas ?? []).map((s) => ({
          id: s.id || newId(),
          lines: (s.lines ?? []).map((l) => String(l)),
        })),
      },
    };
    this.items.set(id, updated);
    await this.persist();
    return updated;
  }

  async saveText(opts: {
    title: string;
    text: TextPayload;
  }): Promise<LibraryItem | { error: string; message: string }> {
    await this.ensureLoaded();
    const title = opts.title.trim() || opts.text.title?.trim() || "Texto";
    const id = newId();
    const ts = nowIso();
    const item: LibraryItem = {
      id,
      category: "textos",
      title,
      createdAt: ts,
      updatedAt: ts,
      text: opts.text,
    };
    this.items.set(id, item);
    await this.persist();
    return item;
  }

  async saveBible(
    payload: BiblePayload,
  ): Promise<LibraryItem | { error: string; message: string }> {
    await this.ensureLoaded();
    const title =
      payload.reference?.trim() ||
      `${payload.bookName} ${payload.chapter}` ||
      "Biblia";
    const id = newId();
    const ts = nowIso();
    const item: LibraryItem = {
      id,
      category: "biblias",
      title,
      createdAt: ts,
      updatedAt: ts,
      bible: payload,
    };
    this.items.set(id, item);
    await this.persist();
    return item;
  }

  private async writeSlides(
    itemId: string,
    slides: RenderedSlide[],
  ): Promise<LibraryItem["slides"]> {
    const out: NonNullable<LibraryItem["slides"]> = [];
    for (const slide of slides) {
      const rel = path.join(
        "files",
        itemId,
        "slides",
        slide.fileName,
      );
      const abs = this.resolveUnderLibrary(rel);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, slide.bytes);
      out.push({
        id: slide.id,
        relativePath: rel.split(path.sep).join("/"),
        mime: slide.mime,
      });
    }
    return out;
  }

  async uploadFile(opts: {
    bytes: Buffer;
    originalName: string;
    mime?: string;
    title?: string;
  }): Promise<LibraryItem | { error: string; message: string }> {
    await this.ensureLoaded();
    const originalName = opts.originalName || "archivo";
    const mime = opts.mime || mimeFromName(originalName);
    const classified = classifyUpload(originalName, mime);
    if (typeof classified !== "string") {
      return classified;
    }
    const category = classified;
    const id = newId();
    const ext = path.extname(originalName) || "";
    const originalRel = path
      .join("files", id, `original${ext}`)
      .split(path.sep)
      .join("/");
    const absOriginal = this.resolveUnderLibrary(originalRel);
    await mkdir(path.dirname(absOriginal), { recursive: true });
    await writeFile(absOriginal, opts.bytes);

    const ts = nowIso();
    let item: LibraryItem = {
      id,
      category,
      title:
        opts.title?.trim() ||
        originalName.replace(/\.[^.]+$/, "") ||
        originalName,
      createdAt: ts,
      updatedAt: ts,
      original: {
        relativePath: originalRel,
        mime,
        originalName,
        size: opts.bytes.byteLength,
      },
    };

    if (category === "presentaciones") {
      const imported = await importPresentationFile({
        bytes: opts.bytes,
        originalName,
        mime,
      });
      if (!imported.ok) {
        await rm(path.join(libraryRoot(), "files", id), {
          recursive: true,
          force: true,
        }).catch(() => undefined);
        return { error: imported.error, message: imported.message };
      }
      item = {
        ...item,
        title: opts.title?.trim() || imported.title || item.title,
        slides: await this.writeSlides(id, imported.slides),
      };
    }

    this.items.set(id, item);
    await this.persist();
    return item;
  }

  async remove(
    id: string,
  ): Promise<boolean | { error: string; message: string }> {
    await this.ensureLoaded();
    assertSafeId(id);
    if (!this.items.has(id)) {
      return false;
    }
    this.items.delete(id);
    await this.persist();
    await rm(path.join(libraryRoot(), "files", id), {
      recursive: true,
      force: true,
    }).catch(() => undefined);
    return true;
  }

  async openFile(
    itemId: string,
    kind: "original" | { slideId: string },
  ): Promise<{ path: string; mime: string; downloadName: string } | null> {
    await this.ensureLoaded();
    const item = this.items.get(itemId);
    if (!item) {
      return null;
    }
    if (kind === "original") {
      if (!item.original) {
        return null;
      }
      return {
        path: this.resolveUnderLibrary(item.original.relativePath),
        mime: item.original.mime,
        downloadName: item.original.originalName,
      };
    }
    const slide = item.slides?.find((s) => s.id === kind.slideId);
    if (!slide) {
      return null;
    }
    return {
      path: this.resolveUnderLibrary(slide.relativePath),
      mime: slide.mime,
      downloadName: path.basename(slide.relativePath),
    };
  }

  /**
   * Materialize a library item into session playlist item(s) + session assets.
   */
  async addToSession(opts: {
    sessionId: string;
    libraryItemId: string;
    order: number;
  }): Promise<
    | { item: import("@promedia/shared").PlaylistItem }
    | { error: string; message: string }
  > {
    await this.ensureLoaded();
    const lib = this.items.get(opts.libraryItemId);
    if (!lib) {
      return { error: "not_found", message: "Ítem de biblioteca no encontrado." };
    }

    if (lib.category === "canciones" && lib.song) {
      const payload = songToTextPayload(lib.song);
      return {
        item: {
          id: newId(),
          type: "text",
          order: opts.order,
          payload,
        },
      };
    }

    if (lib.category === "textos" && lib.text) {
      return {
        item: {
          id: newId(),
          type: "text",
          order: opts.order,
          payload: lib.text,
        },
      };
    }

    if (lib.category === "biblias" && lib.bible) {
      return {
        item: {
          id: newId(),
          type: "bible",
          order: opts.order,
          payload: lib.bible,
        },
      };
    }

    if (lib.category === "imagenes" && lib.original) {
      const bytes = await readFile(
        this.resolveUnderLibrary(lib.original.relativePath),
      );
      const asset = await assetStore.putProjectionImage(
        opts.sessionId,
        bytes,
        lib.original.mime.startsWith("image/")
          ? lib.original.mime
          : "image/png",
        lib.original.originalName,
      );
      if ("error" in asset) {
        return {
          error: asset.error,
          message: "No se pudo copiar la imagen a la sesión.",
        };
      }
      return {
        item: {
          id: newId(),
          type: "image",
          order: opts.order,
          payload: {
            assetId: asset.id,
            fit: "contain",
            title: lib.title,
          },
        },
      };
    }

    if (lib.category === "videos" && lib.original) {
      const bytes = await readFile(
        this.resolveUnderLibrary(lib.original.relativePath),
      );
      const asset = await assetStore.putByMime(
        opts.sessionId,
        bytes,
        lib.original.mime,
        lib.original.originalName,
      );
      if ("error" in asset) {
        return {
          error: asset.error,
          message: "No se pudo copiar el vídeo a la sesión.",
        };
      }
      return {
        item: {
          id: newId(),
          type: "video",
          order: opts.order,
          payload: {
            sourceKind: "file",
            assetId: asset.id,
            title: lib.title,
            autoplay: true,
            muted: false,
            fit: "contain",
          },
        },
      };
    }

    if (lib.category === "presentaciones") {
      if (!lib.slides || lib.slides.length === 0) {
        return {
          error: "no_slides",
          message:
            "Esta presentación no tiene diapositivas proyectables. Reimportá como .pptx o .pdf.",
        };
      }
      const slides: { id: string; assetId: string }[] = [];
      for (const slide of lib.slides) {
        const bytes = await readFile(
          this.resolveUnderLibrary(slide.relativePath),
        );
        const asset = await assetStore.putProjectionImage(
          opts.sessionId,
          bytes,
          slide.mime,
          path.basename(slide.relativePath),
        );
        if ("error" in asset) {
          return {
            error: asset.error,
            message: "No se pudieron copiar las diapositivas a la sesión.",
          };
        }
        slides.push({ id: slide.id, assetId: asset.id });
      }
      return {
        item: {
          id: newId(),
          type: "presentation",
          order: opts.order,
          payload: {
            title: lib.title,
            fit: "contain",
            slides,
            originalName: lib.original?.originalName,
            libraryItemId: lib.id,
          },
        },
      };
    }

    return {
      error: "unsupported_item",
      message: "Este ítem de biblioteca no se puede añadir al Guion aún.",
    };
  }
}

export const libraryStore = new LibraryStore();
