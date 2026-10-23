/**
 * Shared domain placeholders for ProMedia.
 * Session, playlist, and WS event logic lands in later subtareas — stubs only here.
 */

/** Placeholder session shape (no runtime logic). */
export type SessionPlaceholder = {
  id: string;
  /** Short join code — implemented in subtarea 2 */
  code?: string;
  createdAt: string;
  mode: "lan" | "cloud" | "portable";
};

/** Placeholder WS / hub event envelope (no protocol yet). */
export type HubEventPlaceholder = {
  type: string;
  /** Monotonic sequence — implemented in subtarea 2 */
  seq?: number;
  payload?: unknown;
};

export const SHARED_PACKAGE_VERSION = "0.0.0-scaffold" as const;
