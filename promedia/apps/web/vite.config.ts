import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const hubUrl = process.env.VITE_HUB_URL ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/health": hubUrl,
      "/api": {
        target: hubUrl,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port: 5173,
    host: true,
  },
});
