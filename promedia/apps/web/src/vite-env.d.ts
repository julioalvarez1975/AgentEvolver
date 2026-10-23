/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HUB_URL?: string;
  /** Direct WebSocket base, e.g. ws://localhost:8787 (dev default). */
  readonly VITE_HUB_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
