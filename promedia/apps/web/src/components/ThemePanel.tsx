import { useRef } from "react";
import {
  DEFAULT_THEME_BACKGROUND,
  DEFAULT_THEME_ID,
  DEFAULT_TRANSITION_EFFECT,
  THEME_BACKGROUND_PACK_IDS,
  THEME_PRESETS,
  TRANSITION_EFFECTS,
  normalizeThemeBackground,
  type ThemeBackground,
  type ThemeBackgroundPackId,
  type ThemeFontFamily,
  type ThemeFontSize,
  type ThemeId,
  type ThemeOverrides,
  type TextAlign,
  type TransitionEffect,
} from "@promedia/shared";
import { useLocale } from "../locale/LocaleContext";
import { StatusTip } from "./StatusTip";
import { IconTheme } from "./UiIcons";

export type ThemePanelProps = {
  themeId: ThemeId;
  themeOverrides: ThemeOverrides | null;
  themeBackground?: ThemeBackground | null;
  transitionEffect?: TransitionEffect;
  disabled?: boolean;
  /** Compact header strip (presets + editor in one dense block). */
  compact?: boolean;
  /** Single toolbar row: presets as icon+label + essential picks. */
  toolbar?: boolean;
  /** When true, omit the inline TEMA label (parent zone already shows it). */
  hideTitle?: boolean;
  /** Upload background video/image (session asset). */
  onUploadBackground?: (file: File) => void | Promise<void>;
  uploadingBackground?: boolean;
  onChange: (patch: {
    themeId?: ThemeId;
    themeOverrides?: ThemeOverrides | null;
    themeBackground?: ThemeBackground | null;
    transitionEffect?: TransitionEffect;
  }) => void;
};

const TRANSITION_LABEL_KEYS: Record<TransitionEffect, string> = {
  none: "theme.transitionNone",
  fade: "theme.transitionFade",
  blur: "theme.transitionBlur",
  pixelate: "theme.transitionPixelate",
};

const PACK_LABEL_KEYS: Record<ThemeBackgroundPackId, string> = {
  aurora: "theme.bgPackAurora",
  embers: "theme.bgPackEmbers",
  ocean: "theme.bgPackOcean",
  softgrid: "theme.bgPackSoftgrid",
};

function merged(
  themeId: ThemeId,
  overrides: ThemeOverrides | null,
): Required<
  Pick<ThemeOverrides, "bg" | "fg" | "align" | "fontFamily" | "fontSize">
> {
  const preset =
    THEME_PRESETS.find((p) => p.id === themeId) ?? THEME_PRESETS[0]!;
  const o = overrides ?? {};
  return {
    bg: o.bg ?? preset.values.bg,
    fg: o.fg ?? preset.values.fg,
    align: o.align ?? preset.values.align,
    fontFamily: o.fontFamily ?? preset.values.fontFamily,
    fontSize: o.fontSize ?? preset.values.fontSize,
  };
}

export function ThemePanel({
  themeId,
  themeOverrides,
  themeBackground,
  transitionEffect = DEFAULT_TRANSITION_EFFECT,
  disabled,
  compact,
  toolbar,
  hideTitle,
  onUploadBackground,
  uploadingBackground,
  onChange,
}: ThemePanelProps) {
  const { t } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const values = merged(themeId || DEFAULT_THEME_ID, themeOverrides);
  const effect = transitionEffect || DEFAULT_TRANSITION_EFFECT;
  const bg = normalizeThemeBackground(
    themeBackground ?? DEFAULT_THEME_BACKGROUND,
  );
  const isMedia = bg.mode === "media";

  const patchOverride = (partial: ThemeOverrides) => {
    onChange({
      themeOverrides: { ...(themeOverrides ?? {}), ...partial },
    });
  };

  const patchBackground = (partial: Partial<ThemeBackground>) => {
    onChange({
      themeBackground: normalizeThemeBackground({ ...bg, ...partial }),
    });
  };

  const setSolid = () => {
    onChange({
      themeBackground: normalizeThemeBackground({
        mode: "solid",
        dotsOverlay: bg.dotsOverlay,
      }),
    });
  };

  const setPack = (packId: ThemeBackgroundPackId) => {
    onChange({
      themeBackground: normalizeThemeBackground({
        mode: "media",
        packId,
        assetId: null,
        mediaKind: null,
        dotsOverlay: bg.dotsOverlay,
      }),
    });
  };

  const transitionSelect = (
    <label
      className={toolbar ? "theme-transition-label" : undefined}
      title={t("theme.transition")}
    >
      {!toolbar ? t("theme.transition") : null}
      <select
        value={effect}
        disabled={disabled}
        aria-label={t("theme.transition")}
        onChange={(e) =>
          onChange({
            transitionEffect: e.target.value as TransitionEffect,
          })
        }
      >
        {TRANSITION_EFFECTS.map((id) => (
          <option key={id} value={id}>
            {t(TRANSITION_LABEL_KEYS[id])}
          </option>
        ))}
      </select>
    </label>
  );

  const presets = (
    <div
      className="theme-presets"
      role="group"
      aria-label={t("theme.title")}
    >
      {THEME_PRESETS.map((preset) => {
        const shortcutKey =
          preset.id === "oscuro"
            ? "shortcuts.themeOscuro"
            : preset.id === "claro"
              ? "shortcuts.themeClaro"
              : "shortcuts.themeAcento";
        const tip = t(shortcutKey);
        if (toolbar) {
          return (
            <button
              key={preset.id}
              type="button"
              className={`btn toolbar-icon-btn${themeId === preset.id ? " active" : ""}`}
              disabled={disabled}
              aria-pressed={themeId === preset.id}
              title={tip}
              aria-label={tip}
              onClick={() =>
                onChange({ themeId: preset.id, themeOverrides: null })
              }
            >
              <span className="toolbar-icon-btn-glyph" aria-hidden>
                <IconTheme />
              </span>
              <span className="toolbar-icon-btn-label">
                {t(preset.labelKey)}
              </span>
            </button>
          );
        }
        return (
          <button
            key={preset.id}
            type="button"
            className={
              themeId === preset.id ? "btn btn-scene active" : "btn btn-scene"
            }
            disabled={disabled}
            aria-pressed={themeId === preset.id}
            title={tip}
            aria-label={tip}
            onClick={() =>
              onChange({ themeId: preset.id, themeOverrides: null })
            }
          >
            {t(preset.labelKey)}
          </button>
        );
      })}
      {themeOverrides && !toolbar ? (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={disabled}
          onClick={() => onChange({ themeOverrides: null })}
          title={t("theme.resetOverrides")}
        >
          {t("theme.resetOverrides")}
        </button>
      ) : null}
    </div>
  );

  const backgroundControls = (
    <div
      className={
        toolbar
          ? "theme-bg-controls theme-bg-controls-toolbar"
          : "theme-bg-controls"
      }
      role="group"
      aria-label={t("theme.bgMode")}
    >
      <div className="theme-bg-mode" role="group" aria-label={t("theme.bgMode")}>
        <button
          type="button"
          className={`btn btn-scene${bg.mode === "solid" ? " active" : ""}`}
          disabled={disabled}
          aria-pressed={bg.mode === "solid"}
          title={t("theme.bgSolid")}
          onClick={setSolid}
        >
          {t("theme.bgSolid")}
        </button>
        <button
          type="button"
          className={`btn btn-scene${isMedia ? " active" : ""}`}
          disabled={disabled}
          aria-pressed={isMedia}
          title={t("theme.bgMedia")}
          onClick={() => {
            if (!isMedia) {
              setPack("aurora");
            }
          }}
        >
          {t("theme.bgMedia")}
        </button>
      </div>

      {bg.mode === "solid" ? (
        <label title={t("theme.bg")} className="theme-bg-color">
          {!toolbar ? t("theme.bg") : null}
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(values.bg) ? values.bg : "#0a0e14"}
            disabled={disabled}
            aria-label={t("theme.bg")}
            onChange={(e) => patchOverride({ bg: e.target.value })}
          />
        </label>
      ) : (
        <div
          className="theme-bg-packs"
          role="group"
          aria-label={t("theme.bgPack")}
        >
          {THEME_BACKGROUND_PACK_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`btn btn-scene theme-bg-pack-btn${
                bg.packId === id && !bg.assetId ? " active" : ""
              }`}
              disabled={disabled}
              aria-pressed={bg.packId === id && !bg.assetId}
              title={`${t(PACK_LABEL_KEYS[id])} · ${t("theme.bgPackHint")}`}
              onClick={() => setPack(id)}
            >
              <span
                className={`theme-bg-pack-swatch pm-stage-bg-${id}`}
                aria-hidden
              />
              <span className="theme-bg-pack-label">
                {t(PACK_LABEL_KEYS[id])}
              </span>
            </button>
          ))}
          {bg.assetId ? (
            <span className="theme-bg-upload-active" title={t("theme.bgUploadActive")}>
              {t("theme.bgUploadActive")}
            </span>
          ) : null}
        </div>
      )}

      <div className="theme-bg-actions">
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp,image/gif"
          hidden
          disabled={disabled || !onUploadBackground}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file && onUploadBackground) {
              void onUploadBackground(file);
            }
          }}
        />
        <button
          type="button"
          className="btn btn-ghost"
          disabled={disabled || !onUploadBackground || uploadingBackground}
          title={t("theme.bgUpload")}
          onClick={() => fileRef.current?.click()}
        >
          {uploadingBackground ? t("theme.bgUploading") : t("theme.bgUpload")}
        </button>
        <label className="theme-bg-dots-toggle" title={t("theme.bgDotsHint")}>
          <input
            type="checkbox"
            checked={bg.dotsOverlay === true}
            disabled={disabled}
            onChange={(e) => patchBackground({ dotsOverlay: e.target.checked })}
          />
          <span>{t("theme.bgDots")}</span>
        </label>
      </div>
    </div>
  );

  const editor = (
    <div className={toolbar ? "theme-editor theme-editor-toolbar" : "theme-editor"}>
      <label title={t("theme.fg")}>
        {!toolbar ? t("theme.fg") : null}
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(values.fg) ? values.fg : "#f2f5f8"}
          disabled={disabled}
          aria-label={t("theme.fg")}
          onChange={(e) => patchOverride({ fg: e.target.value })}
        />
      </label>
      <label title={t("theme.align")}>
        {!toolbar ? t("theme.align") : null}
        <select
          value={values.align}
          disabled={disabled}
          aria-label={t("theme.align")}
          onChange={(e) =>
            patchOverride({ align: e.target.value as TextAlign })
          }
        >
          <option value="left">{t("text.alignLeft")}</option>
          <option value="center">{t("text.alignCenter")}</option>
          <option value="right">{t("text.alignRight")}</option>
        </select>
      </label>
      {!toolbar ? (
        <>
          <label>
            {t("theme.fontFamily")}
            <select
              value={values.fontFamily}
              disabled={disabled}
              onChange={(e) =>
                patchOverride({
                  fontFamily: e.target.value as ThemeFontFamily,
                })
              }
            >
              <option value="sans">{t("theme.fontSans")}</option>
              <option value="serif">{t("theme.fontSerif")}</option>
            </select>
          </label>
          <label>
            {t("theme.fontSize")}
            <select
              value={values.fontSize}
              disabled={disabled}
              onChange={(e) =>
                patchOverride({ fontSize: e.target.value as ThemeFontSize })
              }
            >
              <option value="sm">SM</option>
              <option value="md">MD</option>
              <option value="lg">LG</option>
              <option value="xl">XL</option>
            </select>
          </label>
        </>
      ) : (
        <label title={t("theme.fontSize")}>
          <select
            value={values.fontSize}
            disabled={disabled}
            aria-label={t("theme.fontSize")}
            onChange={(e) =>
              patchOverride({ fontSize: e.target.value as ThemeFontSize })
            }
          >
            <option value="sm">SM</option>
            <option value="md">MD</option>
            <option value="lg">LG</option>
            <option value="xl">XL</option>
          </select>
        </label>
      )}
      {toolbar ? transitionSelect : null}
      {toolbar && themeOverrides ? (
        <button
          type="button"
          className="btn btn-ghost theme-toolbar-reset"
          disabled={disabled}
          onClick={() => onChange({ themeOverrides: null })}
          title={t("theme.resetOverrides")}
        >
          ↺
        </button>
      ) : null}
    </div>
  );

  if (toolbar) {
    return (
      <div className="theme-panel theme-panel-toolbar">
        {!hideTitle ? (
          <span className="toolbar-theme-title" aria-hidden>
            {t("theme.title")}
          </span>
        ) : null}
        {presets}
        {editor}
        {backgroundControls}
      </div>
    );
  }

  return (
    <div className={compact ? "theme-panel theme-panel-compact" : "theme-panel"}>
      {presets}
      {backgroundControls}
      {editor}
      {transitionSelect}
      {!compact ? (
        <div className="theme-hint-row">
          <StatusTip
            tone="info"
            label={t("control.statusTipInfo")}
            message={t("theme.hint")}
          />
        </div>
      ) : (
        <StatusTip
          tone="info"
          className="theme-compact-hint"
          label={t("control.statusTipInfo")}
          message={t("theme.hint")}
        />
      )}
    </div>
  );
}
