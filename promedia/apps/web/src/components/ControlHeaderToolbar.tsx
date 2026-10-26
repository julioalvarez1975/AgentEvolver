import type { ReactNode } from "react";
import type { Locale } from "@promedia/i18n";
import type {
  SceneMode,
  SubtitleFontSize,
  SubtitleLeadMs,
  ThemeBackground,
  ThemeId,
  ThemeOverrides,
  TransitionEffect,
} from "@promedia/shared";
import {
  DEFAULT_SUBTITLE_LEAD_MS,
  SUBTITLE_FONT_SIZES,
  SUBTITLE_LEAD_MS_OPTIONS,
} from "@promedia/shared";
import { LOCALE_SHORT, useLocale } from "../locale/LocaleContext";
import {
  ThemePanel,
  type ThemeBackgroundAssetOption,
} from "./ThemePanel";
import { StatusTip } from "./StatusTip";
import {
  IconAbout,
  IconLanguage,
  IconLibrary,
  IconProject,
  IconSceneBlack,
  IconSceneClear,
  IconSceneLogo,
  IconSceneNormal,
  IconSubtitles,
} from "./UiIcons";

export type ControlHeaderToolbarProps = {
  projectionBusy: boolean;
  hubUnreachable: boolean;
  canMutate: boolean;
  hasSession: boolean;
  sceneMode: SceneMode;
  themeId: ThemeId;
  themeOverrides: ThemeOverrides | null;
  themeBackground: ThemeBackground;
  transitionEffect: TransitionEffect;
  uploadingBackground?: boolean;
  /** Session-uploaded stage backgrounds for the Theme dropdown. */
  backgroundAssets?: ThemeBackgroundAssetOption[];
  onProject: () => void;
  /** Open local Biblioteca (songs / bibles / texts / presentations / media). */
  onOpenLibrary: () => void;
  onSceneNormal: () => void;
  onToggleScene: (mode: Exclude<SceneMode, "normal">) => void;
  onThemeChange: (patch: {
    themeId?: ThemeId;
    themeOverrides?: ThemeOverrides | null;
    themeBackground?: ThemeBackground | null;
    transitionEffect?: TransitionEffect;
  }) => void;
  onUploadBackground?: (file: File) => void | Promise<void>;
  onAbout: () => void;
  /** Manual create/join when no session yet (rare after auto-session). */
  sessionFallback?: ReactNode;
  /** Local AI subtitle agent (Phase 1). */
  subtitleAgentEnabled?: boolean;
  /** Caption size SM–XL (session-persisted). */
  subtitleAgentFontSize?: SubtitleFontSize;
  /** Cue anticipation vs mediaClock (1.5–3s). */
  subtitleAgentLeadMs?: SubtitleLeadMs;
  /** Tooltip: help text, download progress, or ASR errors (incl. yt-dlp). */
  subtitleAgentTitle?: string;
  /**
   * When set (missing yt-dlp/ffmpeg), show a StatusTip beside the
   * Agente subtítulos button — not only the button title attribute.
   */
  subtitleAgentErrorMessage?: string | null;
  onToggleSubtitleAgent?: () => void;
  onSubtitleFontSizeChange?: (size: SubtitleFontSize) => void;
  onSubtitleLeadMsChange?: (leadMs: SubtitleLeadMs) => void;
};

function ToolbarBtn({
  active,
  disabled,
  title,
  label,
  onClick,
  icon,
  className,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  label: string;
  onClick: () => void;
  icon: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`btn toolbar-icon-btn${active ? " active" : ""}${className ? ` ${className}` : ""}`}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="toolbar-icon-btn-glyph" aria-hidden>
        {icon}
      </span>
      <span className="toolbar-icon-btn-label">{label}</span>
    </button>
  );
}

/**
 * Flat Control tools strip (below title-only header): every control is a peer
 * item in one flex-wrap toolbar — no TEMA zone / clustered wrappers.
 * Julio will re-group later; do not invent groups here.
 */
export function ControlHeaderToolbar({
  projectionBusy,
  hubUnreachable,
  canMutate,
  hasSession,
  sceneMode,
  themeId,
  themeOverrides,
  themeBackground,
  transitionEffect,
  uploadingBackground,
  backgroundAssets,
  onProject,
  onOpenLibrary,
  onSceneNormal,
  onToggleScene,
  onThemeChange,
  onUploadBackground,
  onAbout,
  sessionFallback,
  subtitleAgentEnabled = false,
  subtitleAgentFontSize = "md",
  subtitleAgentLeadMs = DEFAULT_SUBTITLE_LEAD_MS,
  subtitleAgentTitle,
  subtitleAgentErrorMessage,
  onToggleSubtitleAgent,
  onSubtitleFontSizeChange,
  onSubtitleLeadMsChange,
}: ControlHeaderToolbarProps) {
  const { t, locale, setLocale, locales } = useLocale();
  const subtitleSizeLabel: Record<SubtitleFontSize, string> = {
    sm: t("control.subtitleAgentFontSizeSm"),
    md: t("control.subtitleAgentFontSizeMd"),
    lg: t("control.subtitleAgentFontSizeLg"),
    xl: t("control.subtitleAgentFontSizeXl"),
  };
  const subtitleLeadLabel: Record<SubtitleLeadMs, string> = {
    1500: t("control.subtitleAgentLead15"),
    2000: t("control.subtitleAgentLead20"),
    2500: t("control.subtitleAgentLead25"),
    3000: t("control.subtitleAgentLead30"),
  };

  const sceneBtn = (
    mode: SceneMode,
    icon: ReactNode,
    labelKey: string,
    shortcutKey: string,
    onClick: () => void,
  ) => (
    <ToolbarBtn
      active={sceneMode === mode}
      disabled={!canMutate}
      title={t(shortcutKey)}
      label={t(labelKey)}
      icon={icon}
      onClick={onClick}
    />
  );

  const subtitleTitle =
    subtitleAgentTitle?.trim() ||
    t("control.subtitleAgentTitle");
  const depsError = subtitleAgentErrorMessage?.trim() || "";

  return (
    <div
      className="control-header-toolbar"
      role="toolbar"
      aria-label={t("control.toolbar")}
    >
      {/* Primary row peers: Project → Subtitle agent → Language (then Library). */}
      <ToolbarBtn
        className="toolbar-primary-action"
        disabled={projectionBusy || hubUnreachable}
        title={t("shortcuts.startProjection")}
        label={
          projectionBusy
            ? t("control.startProjectionBusy")
            : t("control.project")
        }
        icon={<IconProject />}
        onClick={onProject}
      />

      <span className="toolbar-subtitle-agent-wrap toolbar-primary-action">
        <ToolbarBtn
          className="toolbar-subtitle-agent"
          active={subtitleAgentEnabled}
          disabled={!canMutate || !onToggleSubtitleAgent}
          title={subtitleTitle}
          label={t("control.subtitleAgent")}
          icon={<IconSubtitles />}
          onClick={() => onToggleSubtitleAgent?.()}
        />
        <label
          className="toolbar-subtitle-size"
          title={t("control.subtitleAgentFontSize")}
        >
          <select
            className="toolbar-subtitle-size-select"
            value={subtitleAgentFontSize}
            disabled={!canMutate || !onSubtitleFontSizeChange}
            aria-label={t("control.subtitleAgentFontSize")}
            onChange={(e) => {
              const next = e.target.value as SubtitleFontSize;
              if (SUBTITLE_FONT_SIZES.includes(next)) {
                onSubtitleFontSizeChange?.(next);
              }
            }}
          >
            {SUBTITLE_FONT_SIZES.map((size) => (
              <option key={size} value={size}>
                {subtitleSizeLabel[size]}
              </option>
            ))}
          </select>
        </label>
        <label
          className="toolbar-subtitle-lead"
          title={t("control.subtitleAgentLead")}
        >
          <select
            className="toolbar-subtitle-lead-select"
            value={subtitleAgentLeadMs}
            disabled={!canMutate || !onSubtitleLeadMsChange}
            aria-label={t("control.subtitleAgentLead")}
            onChange={(e) => {
              const next = Number(e.target.value) as SubtitleLeadMs;
              if (SUBTITLE_LEAD_MS_OPTIONS.includes(next)) {
                onSubtitleLeadMsChange?.(next);
              }
            }}
          >
            {SUBTITLE_LEAD_MS_OPTIONS.map((ms) => (
              <option key={ms} value={ms}>
                {subtitleLeadLabel[ms]}
              </option>
            ))}
          </select>
        </label>
        {depsError ? (
          <StatusTip
            className="toolbar-subtitle-agent-error"
            tone="error"
            label={t("control.subtitleAgentError")}
            message={depsError}
          />
        ) : null}
      </span>

      <label
        className="toolbar-lang toolbar-primary-action"
        title={t("control.language")}
      >
        <span className="toolbar-icon-btn-glyph" aria-hidden>
          <IconLanguage />
        </span>
        <select
          className="toolbar-lang-select"
          value={locale}
          aria-label={t("control.language")}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          {locales.map((code) => (
            <option key={code} value={code}>
              {LOCALE_SHORT[code]}
            </option>
          ))}
        </select>
        <span className="toolbar-icon-btn-label">{t("control.languageShort")}</span>
      </label>

      <ToolbarBtn
        className="toolbar-primary-action"
        disabled={hubUnreachable}
        title={t("library.hint")}
        label={t("library.open")}
        icon={<IconLibrary />}
        onClick={onOpenLibrary}
      />

      <ToolbarBtn
        title={t("control.about")}
        label={t("control.about")}
        icon={<IconAbout />}
        onClick={onAbout}
      />

      {!hasSession && sessionFallback ? (
        <div className="toolbar-session-fallback">{sessionFallback}</div>
      ) : null}

      {sceneBtn(
        "normal",
        <IconSceneNormal />,
        "control.sceneNormal",
        "shortcuts.sceneNormal",
        onSceneNormal,
      )}
      {sceneBtn(
        "logo",
        <IconSceneLogo />,
        "control.sceneLogo",
        "shortcuts.sceneLogo",
        () => onToggleScene("logo"),
      )}
      {sceneBtn(
        "black",
        <IconSceneBlack />,
        "control.sceneBlack",
        "shortcuts.sceneBlack",
        () => onToggleScene("black"),
      )}
      {sceneBtn(
        "clear",
        <IconSceneClear />,
        "control.sceneClear",
        "shortcuts.sceneClear",
        () => onToggleScene("clear"),
      )}

      <ThemePanel
        toolbar
        themeId={themeId}
        themeOverrides={themeOverrides}
        themeBackground={themeBackground}
        transitionEffect={transitionEffect}
        disabled={!canMutate}
        uploadingBackground={uploadingBackground}
        backgroundAssets={backgroundAssets}
        onUploadBackground={onUploadBackground}
        onChange={onThemeChange}
      />
    </div>
  );
}
