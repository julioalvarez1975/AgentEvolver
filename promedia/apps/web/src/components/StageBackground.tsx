import {
  DEFAULT_THEME_BACKGROUND,
  normalizeThemeBackground,
  type ThemeBackground,
} from "@promedia/shared";

export type StageBackgroundProps = {
  background?: ThemeBackground | null;
  /** Authenticated URL for uploaded session asset. */
  assetSrc?: string;
};

/**
 * Full-bleed stage backdrop for Output / En vivo / Vista previa.
 * Solid mode relies on parent `.pm-theme` `--pm-bg`; media uses pack or upload.
 * Optional black-dots overlay darkens busy backgrounds for readable light text.
 */
export function StageBackground({
  background,
  assetSrc,
}: StageBackgroundProps) {
  const bg = normalizeThemeBackground(background ?? DEFAULT_THEME_BACKGROUND);
  const showMedia = bg.mode === "media";
  const showPack = showMedia && Boolean(bg.packId);
  const showAsset = showMedia && Boolean(bg.assetId && assetSrc);
  const showDots = bg.dotsOverlay === true;

  if (!showPack && !showAsset && !showDots) {
    return null;
  }

  return (
    <div className="pm-stage-bg" aria-hidden>
      {showPack ? (
        <div className={`pm-stage-bg-pack pm-stage-bg-${bg.packId}`}>
          <div className="pm-stage-bg-layer pm-stage-bg-layer-a" />
          <div className="pm-stage-bg-layer pm-stage-bg-layer-b" />
        </div>
      ) : null}
      {showAsset && assetSrc ? (
        <div className="pm-stage-bg-media">
          {bg.mediaKind === "image" ? (
            <img className="pm-stage-bg-media-el" src={assetSrc} alt="" />
          ) : (
            <video
              className="pm-stage-bg-media-el"
              src={assetSrc}
              autoPlay
              loop
              muted
              playsInline
            />
          )}
        </div>
      ) : null}
      {showDots ? <div className="pm-stage-bg-dots" /> : null}
    </div>
  );
}
