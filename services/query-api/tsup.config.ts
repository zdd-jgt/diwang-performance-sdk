import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  bundle: true,
  clean: true,
  dts: false,
  sourcemap: true,
  outExtension: () => ({ js: ".mjs" })
});
