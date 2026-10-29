import { Fragment, useMemo, useRef } from "react";
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
  type ThemeId,
  type ThemeOverrides,
  type TransitionEffect,
} from "@promedia/shared";
import { useLocale } from "../locale/LocaleContext";
import { IconBackground, IconEffects } from "./UiIcons";

export type ThemeBackgroundAssetOption = {
  assetId: string;
  label: string;
  mediaKind: "video" | "image";
};

export type ThemePanelProps = {
  themeId: ThemeId;
  themeOverrides: ThemeOverrides | null;
  themeBackground?: ThemeBackground | null;
  transitionEffect?: TransitionEffect;
  disabled?: boolean;
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

/** FreeShow set (De22bDYtucC) + ProMedia extras. softScale uses scale label. */
const TRANSITION_LABEL_KEYS: Record<TransitionEffect, string> = {
  none: "theme.transitionNone",
  fade: "theme.transitionFade",
  crossfade: "theme.transitionCrossfade",
  blur: "theme.transitionBlur",
  scale: "theme.transitionScale",
  softScale: "theme.transitionScale",
  slide: "theme.transitionSlide",
  fly: "theme.transitionFly",
  spin: "theme.transitionSpin",
  motionBlur: "theme.transitionMotionBlur",
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
const BROWSE_VALUE = "__browse__";
/** Images + common graphics (and short video loops for stage BG). */
const BG_FILE_ACCEPT =
  "image/*,video/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.avif,.heic,.tif,.tiff,.mp4,.webm,.mov";
const packValue = (id: ThemeBackgroundPackId) => `pack:${id}`;
const assetValue = (id: string) => `asset:${id}`;

function solidBg(
  themeId: ThemeId,
  overrides: ThemeOverrides | null,
): string {
  const preset =
    THEME_PRESETS.find((p) => p.id === themeId) ?? THEME_PRESETS[0]!;
  return overrides?.bg ?? preset.values.bg;
}

/**
 * Control toolbar theme peers: transition + stage background only
 * (presets / fg / align / fontSize removed for Guion width).
 */
export function ThemePanel({
  themeId,
  themeOverrides,
  themeBackground,
  transitionEffect = DEFAULT_TRANSITION_EFFECT,
  disabled,
  backgroundAssets = [],
  onUploadBackground,
  uploadingBackground,
  onChange,
}: ThemePanelProps) {
  const { t } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const effect = transitionEffect || DEFAULT_TRANSITION_EFFECT;
  const bg = normalizeThemeBackground(
    themeBackground ?? DEFAULT_THEME_BACKGROUND,
  );
  const bgColor = solidBg(themeId || DEFAULT_THEME_ID, themeOverrides);

  const assetOptions = useMemo(
    () =>
      backgroundAssets.filter(
        (a) => a.assetId && (a.mediaKind === "video" || a.mediaKind === "image"),
      ),
    [backgroundAssets],
  );

  const selectValue = (() => {
    if (bg.mode === "media" && bg.assetId) {
      return assetValue(bg.assetId);
    }
    if (bg.mode === "media" && bg.packId) {
      return packValue(bg.packId);
    }
    return SOLID_VALUE;
  })();

  const patchOverride = (partial: ThemeOverrides) => {
    onChange({
      themeOverrides: { ...(themeOverrides ?? {}), ...partial },
    });
  };

  const onBackgroundSelect = (raw: string) => {
    if (raw === BROWSE_VALUE) {
      if (!disabled && onUploadBackground) {
        fileRef.current?.click();
      }
      return;
    }
    if (raw === SOLID_VALUE) {
      onChange({
        themeBackground: {
          mode: "solid",
          dotsOverlay: bg.dotsOverlay === true,
        },
      });
      return;
    }
    if (raw.startsWith("pack:")) {
      const packId = raw.slice("pack:".length) as ThemeBackgroundPackId;
      if ((THEME_BACKGROUND_PACK_IDS as readonly string[]).includes(packId)) {
        onChange({
          themeBackground: {
            mode: "media",
            packId,
            assetId: null,
            mediaKind: null,
            dotsOverlay: bg.dotsOverlay === true,
          },
        });
      }
      return;
    }
    if (raw.startsWith("asset:")) {
      const assetId = raw.slice("asset:".length);
      const hit = assetOptions.find((a) => a.assetId === assetId);
      if (hit) {
        onChange({
          themeBackground: {
            mode: "media",
            packId: null,
            assetId: hit.assetId,
            mediaKind: hit.mediaKind,
            dotsOverlay: bg.dotsOverlay === true,
          },
        });
      }
    }
  };

  return (
    <Fragment>
      <label className="toolbar-effects" title={t("theme.transition")}>
        <span className="toolbar-icon-btn-glyph" aria-hidden>
          <IconEffects size={16} />
        </span>
        <span className="toolbar-icon-btn-label">
          {t("theme.effectsShort")}
        </span>
        <select
          className="toolbar-effects-select"
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

      <label
        className="toolbar-effects toolbar-fondo"
        title={
          uploadingBackground ? t("theme.bgUploading") : t("theme.bg")
        }
      >
        <span className="toolbar-icon-btn-glyph" aria-hidden>
          <IconBackground size={16} />
        </span>
        <span className="toolbar-icon-btn-label">{t("theme.bg")}</span>
        <select
          className="toolbar-effects-select"
          value={selectValue}
          disabled={disabled || uploadingBackground}
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
          {onUploadBackground ? (
            <option value={BROWSE_VALUE}>{t("theme.bgBrowse")}</option>
          ) : null}
        </select>
      </label>

      {bg.mode === "solid" ? (
        <label
          className="toolbar-tool theme-bg-color"
          title={t("theme.bgSolid")}
        >
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(bgColor) ? bgColor : "#0a0e14"}
            disabled={disabled}
            aria-label={t("theme.bgSolid")}
            onChange={(e) => patchOverride({ bg: e.target.value })}
          />
        </label>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept={BG_FILE_ACCEPT}
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
    </Fragment>
  );
}
