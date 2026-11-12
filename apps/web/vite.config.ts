import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const engine = path.resolve(__dirname, "../../packages/engine/src/index.ts");
const postMatch = path.resolve(__dirname, "../../post-match/src/index.ts");

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), copySampleMatch()],
  resolve: {
    alias: {
      "@roundmind/engine": engine,
      "@roundmind/post-match": postMatch,
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

/** Publish post-match/examples/match.json with the static build. */
function copySampleMatch(): Plugin {
  const from = path.resolve(__dirname, "../../post-match/examples/match.json");
  const dest = path.resolve(__dirname, "public/sample-match.json");
  const copy = () => {
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(from, dest);
  };
  return {
    name: "copy-sample-match",
    buildStart: copy,
    configureServer: copy,
    configurePreviewServer: copy,
  };
}

/** The listener binds 127.0.0.1:3000 and does not send CORS headers. */
function gsiProxy() {
  return {
    "^/gsi/state$": {
      target: "http://127.0.0.1:3000",
      rewrite: () => "/state",
    },
  };
}
