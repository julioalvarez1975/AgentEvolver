import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getItemType } from "@promedia/item-types";
import { DEFAULT_LOCALE, t } from "@promedia/i18n";
import type { SceneMode } from "@promedia/shared";
import { SceneOverlay } from "../components/SceneOverlay";
import { useSessionConnection } from "../hooks/useSessionConnection";
import { buildAssetUrl } from "../lib/assets";

const locale = DEFAULT_LOCALE;

/** Product Output — live + sceneMode overlays (subtarea 7). */
export function OutputPage() {
  const [params] = useSearchParams();
  const {
    hasSession,
    code,
    lastSeq,
    wsStatus,
    error,
    join,
    reconnect,
    snapshot,
    sessionId,
    wsTicket,
  } = useSessionConnection("output");
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const autoJoinStarted = useRef(false);
  const joinRef = useRef(join);
  const reconnectRef = useRef(reconnect);
  joinRef.current = join;
  reconnectRef.current = reconnect;

  const queryCode = (params.get("code") ?? "").trim().toUpperCase();
  const queryToken =
    (params.get("token") ?? params.get("accessToken") ?? "").trim();

  const liveItem = useMemo(() => {
    const id = snapshot?.live.currentItemId;
    if (!id || !snapshot) {
      return null;
    }
    return snapshot.playlist.items.find((i) => i.id === id) ?? null;
  }, [snapshot]);

  const liveSlideIndex = snapshot?.live.currentSlideIndex ?? 0;
  const mediaClock = snapshot?.live.mediaClock ?? null;
  const sceneMode: SceneMode = snapshot?.live.sceneMode ?? "normal";
  const OutputRenderer = liveItem
    ? getItemType(liveItem.type)?.OutputRenderer
    : undefined;

  const assetSrc = (() => {
    if (!liveItem || !sessionId || !wsTicket) {
      return undefined;
    }
    if (liveItem.type === "image") {
      return buildAssetUrl(sessionId, liveItem.payload.assetId, wsTicket);
    }
    if (liveItem.type === "video" && liveItem.payload.sourceKind === "file") {
      return buildAssetUrl(sessionId, liveItem.payload.assetId, wsTicket);
    }
    return undefined;
  })();

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (autoJoinStarted.current || hasSession) {
      return;
    }
    if (queryCode) {
      autoJoinStarted.current = true;
      void joinRef.current({ code: queryCode });
      return;
    }
    if (queryToken) {
      autoJoinStarted.current = true;
      void joinRef.current({ accessToken: queryToken });
    }
  }, [queryCode, queryToken, hasSession]);

  useEffect(() => {
    if (wsStatus !== "closed" || !hasSession) {
      return;
    }
    const timer = window.setTimeout(() => {
      reconnectRef.current();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [wsStatus, hasSession]);

  const enterFullscreen = async () => {
    const el = stageRef.current;
    if (!el) {
      return;
    }
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch {
      // Browser denied — F11 hint remains visible
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore
    }
  };

  const showJoinForm = !hasSession && !queryCode && !queryToken;

  return (
    <div className="output-shell">
      <div
        ref={stageRef}
        className={
          isFullscreen ? "output-stage output-stage-fs" : "output-stage"
        }
      >
        {wsStatus === "connecting" && !hasSession ? (
          <p className="output-waiting">{t(locale, "output.joining")}</p>
        ) : error && !hasSession ? (
          <p className="output-waiting output-error">
            {t(locale, "output.joinFailed")}
          </p>
        ) : (
          <>
            {/* Keep item mounted under overlays so video clock/audio continue (Q1). */}
            {liveItem && OutputRenderer ? (
              <div
                className="output-item-layer"
                aria-hidden={sceneMode !== "normal"}
              >
                <OutputRenderer
                  item={liveItem}
                  slideIndex={liveSlideIndex}
                  assetSrc={assetSrc}
                  mediaClock={mediaClock}
                />
              </div>
            ) : sceneMode === "normal" ? (
              <p className="output-waiting">{t(locale, "output.waiting")}</p>
            ) : null}
            <SceneOverlay mode={sceneMode} />
          </>
        )}

        {!isFullscreen ? (
          <div className="output-chrome">
            {showJoinForm ? (
              <form
                className="output-join"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (manualCode.trim()) {
                    void join({ code: manualCode.trim().toUpperCase() });
                  }
                }}
              >
                <label>
                  {t(locale, "output.codeLabel")}
                  <input
                    value={manualCode}
                    onChange={(e) =>
                      setManualCode(e.target.value.toUpperCase())
                    }
                    placeholder="AB12"
                    maxLength={8}
                    autoFocus
                  />
                </label>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!manualCode.trim()}
                >
                  {t(locale, "output.join")}
                </button>
              </form>
            ) : null}

            <p className="output-hint">{t(locale, "output.fullscreenHint")}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void enterFullscreen()}
            >
              {t(locale, "output.enterFullscreen")}
            </button>
            {hasSession ? (
              <p className="output-meta">
                {code} · seq {lastSeq >= 0 ? lastSeq : "—"} ·{" "}
                {wsStatus === "open" ? "WS" : wsStatus}
                {sceneMode !== "normal" ? ` · ${sceneMode}` : ""}
              </p>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            className="output-exit-fs"
            onClick={() => void exitFullscreen()}
            aria-label="Exit fullscreen"
          />
        )}
      </div>
    </div>
  );
}
