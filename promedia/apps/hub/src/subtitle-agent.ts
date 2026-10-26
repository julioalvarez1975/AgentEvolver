import type {
  HubMessage,
  PlaylistItem,
  SubtitleAgentState,
  SubtitleTargetLang,
  VideoPlaylistItem,
} from "@promedia/shared";
import { emptySubtitleAgentState } from "@promedia/shared";
import { assetStore } from "./asset-store.js";
import { broadcastSession } from "./broadcast.js";
import { mediaFileExists, transcribeLocalFile } from "./subtitle-asr.js";
import { ensureSubtitleDirs } from "./subtitle-paths.js";
import { translateCuesLocal } from "./subtitle-translate.js";
import { ensureYoutubeAudio } from "./subtitle-youtube.js";
import type { SessionRecord } from "./session-store.js";
import { sessionStore } from "./session-store.js";

/** In-flight jobs keyed by sessionId — cancel by generation bump. */
const jobGeneration = new Map<string, number>();

function bumpJob(sessionId: string): number {
  const next = (jobGeneration.get(sessionId) ?? 0) + 1;
  jobGeneration.set(sessionId, next);
  return next;
}

function isCurrent(sessionId: string, gen: number): boolean {
  return jobGeneration.get(sessionId) === gen;
}

function patchAndBroadcast(
  session: SessionRecord,
  patch: Partial<SubtitleAgentState>,
): void {
  const prev = session.live.subtitleAgent ?? emptySubtitleAgentState();
  session.live.subtitleAgent = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const message = sessionStore.touchSubtitleAgent(session);
  broadcastSession(session.id, message);
}

type ResolveOk = {
  ok: true;
  item: VideoPlaylistItem;
  assetId: string;
  /** Absolute path once media is local (file or after yt-dlp). */
  mediaPath: string | null;
  youtube: null | { videoId: string; sourceUrl: string };
};

type ResolveFail = {
  ok: false;
  reason:
    | "no_item"
    | "not_video"
    | "no_asset"
    | "missing_file"
    | "bad_youtube";
  item: PlaylistItem | null;
};

function resolveMediaSource(
  session: SessionRecord,
  itemId: string | null | undefined,
): ResolveOk | ResolveFail {
  const id = itemId || session.live.currentItemId || null;
  if (!id) {
    return { ok: false, reason: "no_item", item: null };
  }
  const item = session.playlist.items.find((i) => i.id === id) ?? null;
  if (!item) {
    return { ok: false, reason: "no_item", item: null };
  }
  if (item.type !== "video") {
    return { ok: false, reason: "not_video", item };
  }

  if (item.payload.sourceKind === "youtube") {
    const videoId = item.payload.videoId?.trim();
    const sourceUrl = item.payload.sourceUrl?.trim();
    if (!videoId) {
      return { ok: false, reason: "bad_youtube", item };
    }
    return {
      ok: true,
      item,
      assetId: `yt_${videoId}`,
      mediaPath: null,
      youtube: {
        videoId,
        sourceUrl: sourceUrl || `https://www.youtube.com/watch?v=${videoId}`,
      },
    };
  }

  const assetId = item.payload.assetId;
  const asset = assetStore.get(session.id, assetId);
  if (!asset || asset.kind !== "video") {
    return { ok: false, reason: "no_asset", item };
  }
  let mediaPath: string;
  try {
    mediaPath = assetStore.getAdapter().resolvePath(asset.storageKey);
  } catch {
    return { ok: false, reason: "missing_file", item };
  }
  return {
    ok: true,
    item,
    assetId,
    mediaPath,
    youtube: null,
  };
}

function hintForReason(
  reason: ResolveFail["reason"],
  item: PlaylistItem | null,
): string {
  switch (reason) {
    case "not_video":
      if (item?.type === "text" || item?.type === "bible") {
        return "text_only_no_audio";
      }
      return "not_local_av";
    case "no_item":
      return "no_item";
    case "no_asset":
    case "missing_file":
      return "missing_local_file";
    case "bad_youtube":
      return "youtube_invalid";
    default:
      return "unsupported";
  }
}

/**
 * Apply enable/lang patch and kick off local ASR when appropriate.
 * Always returns a HubMessage (session.updated).
 */
export function setSubtitleAgent(
  session: SessionRecord,
  patch: {
    enabled?: boolean;
    targetLang?: SubtitleTargetLang;
    itemId?: string;
  },
): HubMessage {
  const prev = session.live.subtitleAgent ?? emptySubtitleAgentState();
  const enabled = patch.enabled ?? prev.enabled;
  const targetLang = patch.targetLang ?? prev.targetLang;

  if (!enabled) {
    bumpJob(session.id);
    session.live.subtitleAgent = {
      ...emptySubtitleAgentState(targetLang),
      enabled: false,
      status: "off",
      updatedAt: new Date().toISOString(),
    };
    return sessionStore.touchSubtitleAgent(session);
  }

  session.live.subtitleAgent = {
    ...prev,
    enabled: true,
    targetLang,
    status:
      prev.status === "ready" && prev.targetLang === targetLang
        ? "ready"
        : "idle",
    hint: null,
    updatedAt: new Date().toISOString(),
  };

  const message = sessionStore.touchSubtitleAgent(session);

  // Fire-and-forget local job (does not block WS).
  void runSubtitleJob(session.id, patch.itemId);

  return message;
}

/** Re-run when Go Live changes the A/V item under an active agent. */
export function maybeRefreshSubtitleAgent(session: SessionRecord): void {
  const agent = session.live.subtitleAgent;
  if (!agent?.enabled) return;
  void runSubtitleJob(session.id, session.live.currentItemId ?? undefined);
}

async function runSubtitleJob(
  sessionId: string,
  preferredItemId?: string,
): Promise<void> {
  const gen = bumpJob(sessionId);
  const session = sessionStore.get(sessionId);
  if (!session) return;

  const agent = session.live.subtitleAgent;
  if (!agent?.enabled) return;

  const targetLang = agent.targetLang;
  const resolved = resolveMediaSource(session, preferredItemId);

  if (!resolved.ok) {
    if (!isCurrent(sessionId, gen)) return;
    patchAndBroadcast(session, {
      enabled: true,
      targetLang,
      status: "unsupported",
      itemId: resolved.item?.id ?? null,
      assetId: null,
      sourceLang: null,
      translated: false,
      cues: [],
      hint: hintForReason(resolved.reason, resolved.item),
    });
    return;
  }

  // Same asset already ready for this target — keep cues.
  if (
    agent.status === "ready" &&
    agent.assetId === resolved.assetId &&
    agent.targetLang === targetLang &&
    agent.cues.length > 0
  ) {
    if (agent.itemId !== resolved.item.id) {
      patchAndBroadcast(session, { itemId: resolved.item.id });
    }
    return;
  }

  try {
    await ensureSubtitleDirs();
    if (!isCurrent(sessionId, gen)) return;

    let mediaPath = resolved.mediaPath;
    let assetId = resolved.assetId;

    if (resolved.youtube) {
      patchAndBroadcast(session, {
        enabled: true,
        targetLang,
        status: "downloading",
        itemId: resolved.item.id,
        assetId,
        hint: "youtube_audio",
        cues: [],
        translated: false,
        sourceLang: null,
      });

      const yt = await ensureYoutubeAudio({
        videoId: resolved.youtube.videoId,
        sourceUrl: resolved.youtube.sourceUrl,
      });
      if (!isCurrent(sessionId, gen)) return;
      mediaPath = yt.mediaPath;
      assetId = yt.assetId;
    }

    if (!mediaPath) {
      if (!isCurrent(sessionId, gen)) return;
      patchAndBroadcast(session, {
        enabled: true,
        targetLang,
        status: "error",
        itemId: resolved.item.id,
        assetId,
        cues: [],
        hint: "missing_local_file",
      });
      return;
    }

    const exists = await mediaFileExists(mediaPath);
    if (!exists) {
      if (!isCurrent(sessionId, gen)) return;
      patchAndBroadcast(session, {
        enabled: true,
        targetLang,
        status: "unsupported",
        itemId: resolved.item.id,
        assetId,
        cues: [],
        hint: "missing_local_file",
      });
      return;
    }

    patchAndBroadcast(session, {
      enabled: true,
      targetLang,
      status: "extracting",
      itemId: resolved.item.id,
      assetId,
      hint: null,
      cues: [],
      translated: false,
      sourceLang: null,
    });

    // Prefer Whisper translate→EN when target is English (one model pass).
    const translateToEn = targetLang === "en";

    const asr = await transcribeLocalFile({
      mediaPath,
      assetId,
      translateToEn,
      targetLang,
      onStatus: (st) => {
        if (!isCurrent(sessionId, gen)) return;
        const live = sessionStore.get(sessionId);
        if (!live?.live.subtitleAgent?.enabled) return;
        patchAndBroadcast(live, { status: st, hint: null });
      },
    });

    if (!isCurrent(sessionId, gen)) return;
    const liveAfterAsr = sessionStore.get(sessionId);
    if (!liveAfterAsr?.live.subtitleAgent?.enabled) return;

    let cues = asr.cues;
    let translated = asr.whisperTranslatedToEn && targetLang === "en";
    let hint: string | null = null;
    let sourceLang = asr.sourceLang;

    if (targetLang !== "en" || !asr.whisperTranslatedToEn) {
      patchAndBroadcast(liveAfterAsr, { status: "translating" });
      const mt = await translateCuesLocal({
        cues,
        sourceLang,
        targetLang,
        alreadyEnglish: asr.whisperTranslatedToEn,
      });
      cues = mt.cues;
      translated = mt.translated || translated;
      if (mt.note && !mt.translated) {
        hint = mt.note.startsWith("mt_unavailable")
          ? "mt_source_only"
          : mt.note;
      }
      if (!sourceLang && asr.whisperTranslatedToEn) {
        sourceLang = "en";
      }
    }

    if (!isCurrent(sessionId, gen)) return;
    const liveFinal = sessionStore.get(sessionId);
    if (!liveFinal?.live.subtitleAgent?.enabled) return;

    if (!cues.length) {
      patchAndBroadcast(liveFinal, {
        status: "ready",
        cues: [],
        sourceLang,
        translated: false,
        hint: "no_speech",
        itemId: resolved.item.id,
        assetId,
      });
      return;
    }

    patchAndBroadcast(liveFinal, {
      status: "ready",
      cues,
      sourceLang,
      translated,
      hint,
      itemId: resolved.item.id,
      assetId,
    });
  } catch (err) {
    console.error(
      "[subtitle] job failed:",
      err instanceof Error ? err.message : err,
    );
    if (!isCurrent(sessionId, gen)) return;
    const live = sessionStore.get(sessionId);
    if (!live) return;
    const msg = err instanceof Error ? err.message : "asr_failed";
    patchAndBroadcast(live, {
      status: "error",
      cues: [],
      hint: msg.slice(0, 180),
      itemId: resolved.item.id,
      assetId: resolved.assetId,
    });
  }
}
