import { useState } from "react";
import { DEFAULT_LOCALE, t } from "@promedia/i18n";
import { useSessionConnection } from "../hooks/useSessionConnection";

const locale = DEFAULT_LOCALE;

function opaqueOutputUrl(accessToken: string): string {
  return `${window.location.origin}/output?token=${encodeURIComponent(accessToken)}`;
}

function codeOutputUrl(code: string): string {
  return `${window.location.origin}/output?code=${encodeURIComponent(code)}`;
}

/** Product Control shell — three zones + Abrir salida (subtarea 3). */
export function ControlPage() {
  const session = useSessionConnection("control");
  const [joinCode, setJoinCode] = useState("");
  const [popupBlockedUrl, setPopupBlockedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const outputByCode = session.code ? codeOutputUrl(session.code) : "";
  const outputByToken = session.accessToken
    ? opaqueOutputUrl(session.accessToken)
    : "";

  const flashCopied = (label: string) => {
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1500);
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      flashCopied(label);
    } catch {
      flashCopied("?");
    }
  };

  const openOutput = () => {
    if (!session.code) {
      return;
    }
    const url = codeOutputUrl(session.code);
    const win = window.open(url, "promedia-output", "noopener,noreferrer");
    if (!win) {
      setPopupBlockedUrl(url);
      return;
    }
    setPopupBlockedUrl(null);
  };

  return (
    <div className="control-shell">
      <header className="control-header">
        <div className="control-brand">
          <span className="control-brand-name">{t(locale, "app.name")}</span>
          <span className="control-brand-role">Control</span>
        </div>

        <div className="control-session-actions">
          {!session.hasSession ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void session.create()}
              >
                {t(locale, "control.createSession")}
              </button>
              <label className="field-inline">
                <span className="sr-only">{t(locale, "control.code")}</span>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder={t(locale, "control.joinPlaceholder")}
                  maxLength={8}
                />
              </label>
              <button
                type="button"
                className="btn"
                disabled={!joinCode.trim()}
                onClick={() => void session.join({ code: joinCode.trim() })}
              >
                {t(locale, "control.joinSession")}
              </button>
            </>
          ) : (
            <>
              <div className="session-chip">
                <span className="session-chip-label">{t(locale, "control.code")}</span>
                <strong className="session-chip-value">{session.code}</strong>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void copyText(session.code, "code")}
                >
                  {t(locale, "control.copyCode")}
                </button>
              </div>
              {outputByToken ? (
                <div className="session-chip session-chip-link">
                  <span className="session-chip-label">
                    {t(locale, "control.link")}
                  </span>
                  <code className="session-chip-mono" title={outputByToken}>
                    {outputByToken}
                  </code>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void copyText(outputByToken, "link")}
                  >
                    {t(locale, "control.copyLink")}
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className="btn btn-primary"
                onClick={openOutput}
              >
                {t(locale, "control.openOutput")}
              </button>
            </>
          )}
        </div>
      </header>

      {session.hasSession ? (
        <p className="control-drag-hint">{t(locale, "control.dragHint")}</p>
      ) : null}

      {popupBlockedUrl ? (
        <div className="control-banner" role="status">
          <p>{t(locale, "control.popupBlocked")}</p>
          <a href={popupBlockedUrl} target="_blank" rel="noreferrer">
            {popupBlockedUrl}
          </a>
        </div>
      ) : null}

      {session.error ? (
        <div className="control-banner control-banner-error" role="alert">
          {session.error}
        </div>
      ) : null}

      <div className="control-zones">
        <section className="zone zone-playlist" aria-label={t(locale, "control.playlist")}>
          <h2>{t(locale, "control.playlist")}</h2>
          <div className="zone-body zone-placeholder">
            <p>{t(locale, "control.playlistEmpty")}</p>
          </div>
        </section>

        <section className="zone zone-preview" aria-label={t(locale, "control.preview")}>
          <h2>{t(locale, "control.preview")}</h2>
          <div className="zone-body zone-stage">
            <p>{t(locale, "control.previewEmpty")}</p>
          </div>
        </section>

        <section className="zone zone-live" aria-label={t(locale, "control.live")}>
          <h2>{t(locale, "control.live")}</h2>
          <div className="zone-body zone-stage">
            <p>{t(locale, "control.liveEmpty")}</p>
          </div>
          <div className="live-controls">
            <button type="button" className="btn btn-primary" disabled>
              {t(locale, "control.goLive")}
            </button>
            <button type="button" className="btn" disabled>
              {t(locale, "control.sceneLogo")}
            </button>
            <button type="button" className="btn" disabled>
              {t(locale, "control.sceneBlack")}
            </button>
            <button type="button" className="btn" disabled>
              {t(locale, "control.sceneClear")}
            </button>
          </div>
        </section>
      </div>

      <footer className="control-footer">
        <span
          className={
            session.wsStatus === "open" ? "status-dot on" : "status-dot"
          }
        />
        <span>
          {session.wsStatus === "open"
            ? t(locale, "control.wsConnected")
            : t(locale, "control.wsDisconnected")}
        </span>
        <span className="footer-sep">·</span>
        <span>
          seq {session.lastSeq >= 0 ? session.lastSeq : "—"}
        </span>
        {outputByCode ? (
          <>
            <span className="footer-sep">·</span>
            <span className="footer-muted">salida {session.code}</span>
          </>
        ) : null}
        {copied ? (
          <>
            <span className="footer-sep">·</span>
            <span className="footer-muted">copiado</span>
          </>
        ) : null}
      </footer>
    </div>
  );
}
