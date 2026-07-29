import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { dashboardMockApiPlugin } from "./src/api/mock-plugin";

export default defineConfig({
  plugins: [dashboardMockApiPlugin(), react()],
  server: {
    port: 4173,
    strictPort: true
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
});
