import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@roundmind/engine": path.resolve(__dirname, "../../packages/engine/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: gsiProxy(),
  },
  preview: {
    proxy: gsiProxy(),
  },
});

/** The listener binds 127.0.0.1:3000 and does not send CORS headers. */
function gsiProxy() {
  return {
    "^/gsi/state$": {
      target: "http://127.0.0.1:3000",
      rewrite: () => "/state",
    },
  };
}
