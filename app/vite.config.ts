import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { dashboardMockApiPlugin } from "./src/api/mock-plugin";

export default defineConfig(({ mode }) => ({
  plugins: [
    ...(mode === "mock" ? [dashboardMockApiPlugin()] : []),
    react()
  ],
  server: {
    port: 4173,
    strictPort: true,
    proxy:
      mode === "mock"
        ? undefined
        : {
            "/api": {
              target: "http://127.0.0.1:4174",
              changeOrigin: false
            }
          }
  },
  preview: {
    port: 4173,
    strictPort: true
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    css: true
  }
}));
