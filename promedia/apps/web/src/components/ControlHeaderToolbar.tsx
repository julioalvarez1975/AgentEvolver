import type { ReactNode } from "react";
import type { Locale } from "@promedia/i18n";
import type {
  SceneMode,
  ThemeBackground,
  ThemeId,
  ThemeOverrides,
  TransitionEffect,
} from "@promedia/shared";
import { LOCALE_SHORT, useLocale } from "../locale/LocaleContext";
import { ThemePanel } from "./ThemePanel";
import {
  IconAbout,
  IconLanguage,
  IconLibrary,
  IconProject,
  IconSceneBlack,
  IconSceneClear,
  IconSceneLogo,
  IconSceneNormal,
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
};

function ToolbarBtn({
  active,
  disabled,
  title,
  label,
  onClick,
  icon,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  label: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`btn toolbar-icon-btn${active ? " active" : ""}`}
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
 * Control tools strip (below title-only header): Proyectar · Biblioteca · idioma · Acerca de
 * + TEMA zone (escenas + presets + pickers + transitions). Icon above / label below.
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
  onProject,
  onOpenLibrary,
  onSceneNormal,
  onToggleScene,
  onThemeChange,
  onUploadBackground,
  onAbout,
  sessionFallback,
}: ControlHeaderToolbarProps) {
  const { t, locale, setLocale, locales } = useLocale();

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

  return (
    <div className="control-header-toolbar" role="toolbar" aria-label={t("control.toolbar")}>
      <div className="toolbar-commands" role="group" aria-label={t("control.toolbar")}>
        <ToolbarBtn
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

        <ToolbarBtn
          disabled={hubUnreachable}
          title={t("library.hint")}
          label={t("library.open")}
          icon={<IconLibrary />}
          onClick={onOpenLibrary}
        />

        <label className="toolbar-lang" title={t("control.language")}>
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
          title={t("control.about")}
          label={t("control.about")}
          icon={<IconAbout />}
          onClick={onAbout}
        />

        {!hasSession && sessionFallback ? (
          <div className="toolbar-session-fallback">{sessionFallback}</div>
        ) : null}
      </div>

      <div
        className="toolbar-tema-zone"
        role="group"
        aria-label={t("theme.title")}
      >
        <span className="toolbar-theme-title">{t("theme.title")}</span>
        <div
          className="toolbar-scenes"
          role="group"
          aria-label={t("control.live")}
        >
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
        </div>
        <ThemePanel
          toolbar
          hideTitle
          themeId={themeId}
          themeOverrides={themeOverrides}
          themeBackground={themeBackground}
          transitionEffect={transitionEffect}
          disabled={!canMutate}
          uploadingBackground={uploadingBackground}
          onUploadBackground={onUploadBackground}
          onChange={onThemeChange}
        />
      </div>
    </div>
  );
}
