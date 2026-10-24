import type { ReactNode } from "react";
import type { Locale } from "@promedia/i18n";
import type { SceneMode, ThemeId, ThemeOverrides } from "@promedia/shared";
import { LOCALE_SHORT, useLocale } from "../locale/LocaleContext";
import { ThemePanel } from "./ThemePanel";
import {
  IconAbout,
  IconLanguage,
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
  onProject: () => void;
  onSceneNormal: () => void;
  onToggleScene: (mode: Exclude<SceneMode, "normal">) => void;
  onThemeChange: (patch: {
    themeId?: ThemeId;
    themeOverrides?: ThemeOverrides | null;
  }) => void;
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
  primary,
}: {
  active?: boolean;
  disabled?: boolean;
  title: string;
  label: string;
  onClick: () => void;
  icon: ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn toolbar-icon-btn${active ? " active" : ""}${primary ? " btn-primary" : ""}`}
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
 * Single-row header toolbar: Proyectar · idioma · escenas · Tema · Acerca de.
 * Icon above, short label below — no overflow wrapping of the primary row.
 */
export function ControlHeaderToolbar({
  projectionBusy,
  hubUnreachable,
  canMutate,
  hasSession,
  sceneMode,
  themeId,
  themeOverrides,
  onProject,
  onSceneNormal,
  onToggleScene,
  onThemeChange,
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
      <ToolbarBtn
        primary
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

      <div className="toolbar-theme" aria-label={t("theme.title")}>
        <ThemePanel
          toolbar
          themeId={themeId}
          themeOverrides={themeOverrides}
          disabled={!canMutate}
          onChange={onThemeChange}
        />
      </div>

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
  );
}
