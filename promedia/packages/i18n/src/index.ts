/**
 * i18n placeholders (ES / EN / PT / FR / zh-CN).
 * Locale JSON files live in ../locales/ (source of truth for strings).
 * Catalogs below mirror those files so the package builds for Node + Vite.
 * UI language selector lands in subtarea 4.
 */

export type Locale = "es" | "en" | "pt" | "fr" | "zh-CN";

export const LOCALES: readonly Locale[] = ["es", "en", "pt", "fr", "zh-CN"] as const;

export const DEFAULT_LOCALE: Locale = "es";

type Messages = Record<string, string>;

/** Mirrors packages/i18n/locales/*.json */
const catalogs: Record<Locale, Messages> = {
  es: {
    "app.name": "ProMedia",
    "scaffold.placeholder": "Scaffold — sin funciones de producto aún",
  },
  en: {
    "app.name": "ProMedia",
    "scaffold.placeholder": "Scaffold — no product features yet",
  },
  pt: {
    "app.name": "ProMedia",
    "scaffold.placeholder": "Scaffold — ainda sem funções de produto",
  },
  fr: {
    "app.name": "ProMedia",
    "scaffold.placeholder": "Scaffold — pas encore de fonctionnalités produit",
  },
  "zh-CN": {
    "app.name": "ProMedia",
    "scaffold.placeholder": "脚手架 — 尚无产品功能",
  },
};

/** Minimal lookup; missing keys return the key itself. */
export function t(locale: Locale, key: string): string {
  const catalog = catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
  return catalog[key] ?? catalogs[DEFAULT_LOCALE][key] ?? key;
}
