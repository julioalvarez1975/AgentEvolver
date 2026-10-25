import {
  DEFAULT_THEME_ID,
  THEME_PRESETS,
  type ThemeFontFamily,
  type ThemeFontSize,
  type ThemeId,
  type ThemeOverrides,
  type TextAlign,
} from "@promedia/shared";
import { useLocale } from "../locale/LocaleContext";
import { StatusTip } from "./StatusTip";
import { IconTheme } from "./UiIcons";

export type ThemePanelProps = {
  themeId: ThemeId;
  themeOverrides: ThemeOverrides | null;
  disabled?: boolean;
  /** Compact header strip (presets + editor in one dense block). */
  compact?: boolean;
  /** Single toolbar row: presets as icon+label + essential picks. */
  toolbar?: boolean;
  /** When true, omit the inline TEMA label (parent zone already shows it). */
  hideTitle?: boolean;
  onChange: (patch: {
    themeId?: ThemeId;
    themeOverrides?: ThemeOverrides | null;
  }) => void;
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
  disabled,
  compact,
  toolbar,
  hideTitle,
  onChange,
}: ThemePanelProps) {
  const { t } = useLocale();
  const values = merged(themeId || DEFAULT_THEME_ID, themeOverrides);

  const patchOverride = (partial: ThemeOverrides) => {
    onChange({
      themeOverrides: { ...(themeOverrides ?? {}), ...partial },
    });
  };

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

  const editor = (
    <div className={toolbar ? "theme-editor theme-editor-toolbar" : "theme-editor"}>
      <label title={t("theme.bg")}>
        {!toolbar ? t("theme.bg") : null}
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(values.bg) ? values.bg : "#0a0e14"}
          disabled={disabled}
          aria-label={t("theme.bg")}
          onChange={(e) => patchOverride({ bg: e.target.value })}
        />
      </label>
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
      </div>
    );
  }

  return (
    <div className={compact ? "theme-panel theme-panel-compact" : "theme-panel"}>
      {presets}
      {editor}
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
