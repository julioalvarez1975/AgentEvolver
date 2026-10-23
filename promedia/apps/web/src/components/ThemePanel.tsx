import {
  DEFAULT_THEME_ID,
  THEME_PRESETS,
  type ThemeFontFamily,
  type ThemeFontSize,
  type ThemeId,
  type ThemeOverrides,
  type TextAlign,
} from "@promedia/shared";
import { DEFAULT_LOCALE, t } from "@promedia/i18n";

const locale = DEFAULT_LOCALE;

export type ThemePanelProps = {
  themeId: ThemeId;
  themeOverrides: ThemeOverrides | null;
  disabled?: boolean;
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
  onChange,
}: ThemePanelProps) {
  const values = merged(themeId || DEFAULT_THEME_ID, themeOverrides);

  const patchOverride = (partial: ThemeOverrides) => {
    onChange({
      themeOverrides: { ...(themeOverrides ?? {}), ...partial },
    });
  };

  return (
    <div className="theme-panel">
      <div className="theme-presets" role="group" aria-label={t(locale, "theme.title")}>
        {THEME_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={
              themeId === preset.id ? "btn btn-scene active" : "btn btn-scene"
            }
            disabled={disabled}
            aria-pressed={themeId === preset.id}
            onClick={() => onChange({ themeId: preset.id, themeOverrides: null })}
          >
            {t(locale, preset.labelKey)}
          </button>
        ))}
        {themeOverrides ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={disabled}
            onClick={() => onChange({ themeOverrides: null })}
            title={t(locale, "theme.resetOverrides")}
          >
            {t(locale, "theme.resetOverrides")}
          </button>
        ) : null}
      </div>

      <div className="theme-editor">
        <label>
          {t(locale, "theme.bg")}
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(values.bg) ? values.bg : "#0a0e14"}
            disabled={disabled}
            onChange={(e) => patchOverride({ bg: e.target.value })}
          />
        </label>
        <label>
          {t(locale, "theme.fg")}
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(values.fg) ? values.fg : "#f2f5f8"}
            disabled={disabled}
            onChange={(e) => patchOverride({ fg: e.target.value })}
          />
        </label>
        <label>
          {t(locale, "theme.align")}
          <select
            value={values.align}
            disabled={disabled}
            onChange={(e) =>
              patchOverride({ align: e.target.value as TextAlign })
            }
          >
            <option value="left">{t(locale, "text.alignLeft")}</option>
            <option value="center">{t(locale, "text.alignCenter")}</option>
            <option value="right">{t(locale, "text.alignRight")}</option>
          </select>
        </label>
        <label>
          {t(locale, "theme.fontFamily")}
          <select
            value={values.fontFamily}
            disabled={disabled}
            onChange={(e) =>
              patchOverride({
                fontFamily: e.target.value as ThemeFontFamily,
              })
            }
          >
            <option value="sans">{t(locale, "theme.fontSans")}</option>
            <option value="serif">{t(locale, "theme.fontSerif")}</option>
          </select>
        </label>
        <label>
          {t(locale, "theme.fontSize")}
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
      </div>
      <p className="theme-hint">{t(locale, "theme.hint")}</p>
    </div>
  );
}
