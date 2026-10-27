import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@roundmind/engine": path.resolve(__dirname, "../../packages/engine/src/index.ts"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.tsx"],
  },
});
