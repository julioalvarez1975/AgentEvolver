import { Fragment, useRef } from "react";
import {
  DEFAULT_THEME_BACKGROUND,
  DEFAULT_THEME_ID,
  DEFAULT_TRANSITION_EFFECT,
  THEME_BACKGROUND_PACK_IDS,
  THEME_PRESETS,
  TRANSITION_EFFECTS,
  isThemeBackgroundPackId,
  normalizeThemeBackground,
  type ThemeBackground,
  type ThemeBackgroundMediaKind,
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

/** Uploaded/custom stage backgrounds available in this Control session. */
export type ThemeBackgroundAssetOption = {
  assetId: string;
  label: string;
  mediaKind: ThemeBackgroundMediaKind;
};

export type ThemePanelProps = {
  themeId: ThemeId;
  themeOverrides: ThemeOverrides | null;
  themeBackground?: ThemeBackground | null;
  transitionEffect?: TransitionEffect;
  disabled?: boolean;
  /** Compact header strip (presets + editor in one dense block). */
  compact?: boolean;
  /** Flat toolbar peers: presets + picks as sibling items (no TEMA card/zone). */
  toolbar?: boolean;
  /** Session-uploaded backgrounds to list in the background dropdown. */
  backgroundAssets?: ThemeBackgroundAssetOption[];
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
  "abstract-blue": "theme.bgPackAbstractBlue",
};

const SOLID_VALUE = "solid";
const packValue = (id: ThemeBackgroundPackId) => `pack:${id}`;
const assetValue = (id: string) => `asset:${id}`;

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
  backgroundAssets = [],
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

  const setAsset = (
    assetId: string,
    mediaKind: ThemeBackgroundMediaKind | null | undefined,
  ) => {
    onChange({
      themeBackground: normalizeThemeBackground({
        mode: "media",
        packId: null,
        assetId,
        mediaKind: mediaKind ?? "video",
        dotsOverlay: bg.dotsOverlay,
      }),
    });
  };

  const assetOptions: ThemeBackgroundAssetOption[] = [...backgroundAssets];
  if (
    bg.mode === "media" &&
    bg.assetId &&
    !assetOptions.some((a) => a.assetId === bg.assetId)
  ) {
    assetOptions.push({
      assetId: bg.assetId,
      label: t("theme.bgUploadActive"),
      mediaKind: bg.mediaKind ?? "video",
    });
  }

  const selectValue =
    bg.mode === "solid"
      ? SOLID_VALUE
      : bg.assetId
        ? assetValue(bg.assetId)
        : bg.packId
          ? packValue(bg.packId)
          : SOLID_VALUE;

  const onBackgroundSelect = (raw: string) => {
    if (raw === SOLID_VALUE) {
      setSolid();
      return;
    }
    if (raw.startsWith("pack:")) {
      const id = raw.slice("pack:".length);
      if (isThemeBackgroundPackId(id)) {
        setPack(id);
      }
      return;
    }
    if (raw.startsWith("asset:")) {
      const assetId = raw.slice("asset:".length);
      const entry = assetOptions.find((a) => a.assetId === assetId);
      if (assetId) {
        setAsset(assetId, entry?.mediaKind ?? bg.mediaKind);
      }
    }
  };

  const transitionSelect = (
    <label className="toolbar-tool" title={t("theme.transition")}>
      {t("theme.transition")}
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

  const fileInput = (
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
  );

  /* Flat toolbar: every control is a peer — no TEMA card / nested groups. */
  if (toolbar) {
    return (
      <Fragment>
        {THEME_PRESETS.map((preset) => {
          const shortcutKey =
            preset.id === "oscuro"
              ? "shortcuts.themeOscuro"
              : preset.id === "claro"
                ? "shortcuts.themeClaro"
                : "shortcuts.themeAcento";
          const tip = t(shortcutKey);
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
        })}

        <label className="toolbar-tool" title={t("theme.fg")}>
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(values.fg) ? values.fg : "#f2f5f8"}
            disabled={disabled}
            aria-label={t("theme.fg")}
            onChange={(e) => patchOverride({ fg: e.target.value })}
          />
        </label>

        <label className="toolbar-tool" title={t("theme.align")}>
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

        <label className="toolbar-tool" title={t("theme.fontSize")}>
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

        <label className="toolbar-tool theme-transition-label" title={t("theme.transition")}>
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

        {themeOverrides ? (
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

        <label className="toolbar-tool theme-bg-select-label" title={t("theme.bg")}>
          <select
            className="theme-bg-select"
            value={selectValue}
            disabled={disabled}
            aria-label={t("theme.bg")}
            onChange={(e) => onBackgroundSelect(e.target.value)}
          >
            <option value={SOLID_VALUE}>{t("theme.bgSolid")}</option>
            {THEME_BACKGROUND_PACK_IDS.map((id) => (
              <option key={id} value={packValue(id)}>
                {t(PACK_LABEL_KEYS[id])}
              </option>
            ))}
            {assetOptions.map((asset) => (
              <option key={asset.assetId} value={assetValue(asset.assetId)}>
                {asset.label || t("theme.bgUploadActive")}
              </option>
            ))}
          </select>
        </label>

        {bg.mode === "solid" ? (
          <label className="toolbar-tool theme-bg-color" title={t("theme.bg")}>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(values.bg) ? values.bg : "#0a0e14"}
              disabled={disabled}
              aria-label={t("theme.bg")}
              onChange={(e) => patchOverride({ bg: e.target.value })}
            />
          </label>
        ) : null}

        {fileInput}
        <button
          type="button"
          className="btn btn-ghost theme-bg-upload-btn"
          disabled={disabled || !onUploadBackground || uploadingBackground}
          title={t("theme.bgUpload")}
          onClick={() => fileRef.current?.click()}
        >
          {uploadingBackground ? t("theme.bgUploading") : t("theme.bgUpload")}
        </button>

        <label className="toolbar-tool theme-bg-dots-toggle" title={t("theme.bgDotsHint")}>
          <input
            type="checkbox"
            checked={bg.dotsOverlay === true}
            disabled={disabled}
            onChange={(e) => patchBackground({ dotsOverlay: e.target.checked })}
          />
          <span>{t("theme.bgDots")}</span>
        </label>
      </Fragment>
    );
  }

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
      {themeOverrides ? (
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
      className="theme-bg-controls"
      role="group"
      aria-label={t("theme.bg")}
    >
      <label className="theme-bg-select-label" title={t("theme.bg")}>
        {t("theme.bg")}
        <select
          className="theme-bg-select"
          value={selectValue}
          disabled={disabled}
          aria-label={t("theme.bg")}
          onChange={(e) => onBackgroundSelect(e.target.value)}
        >
          <option value={SOLID_VALUE}>{t("theme.bgSolid")}</option>
          {THEME_BACKGROUND_PACK_IDS.map((id) => (
            <option key={id} value={packValue(id)}>
              {t(PACK_LABEL_KEYS[id])}
            </option>
          ))}
          {assetOptions.map((asset) => (
            <option key={asset.assetId} value={assetValue(asset.assetId)}>
              {asset.label || t("theme.bgUploadActive")}
            </option>
          ))}
        </select>
      </label>

      {bg.mode === "solid" ? (
        <label title={t("theme.bg")} className="theme-bg-color">
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(values.bg) ? values.bg : "#0a0e14"}
            disabled={disabled}
            aria-label={t("theme.bg")}
            onChange={(e) => patchOverride({ bg: e.target.value })}
          />
        </label>
      ) : null}

      <div className="theme-bg-actions">
        {fileInput}
        <button
          type="button"
          className="btn btn-ghost theme-bg-upload-btn"
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
    <div className="theme-editor">
      <label title={t("theme.fg")}>
        {t("theme.fg")}
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(values.fg) ? values.fg : "#f2f5f8"}
          disabled={disabled}
          aria-label={t("theme.fg")}
          onChange={(e) => patchOverride({ fg: e.target.value })}
        />
      </label>
      <label title={t("theme.align")}>
        {t("theme.align")}
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
    </div>
  );

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
