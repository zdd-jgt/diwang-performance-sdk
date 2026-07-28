import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  minify: false,
  splitting: false,
  noExternal: [/.*/],
  outExtension: () => ({ js: ".mjs" })
});
