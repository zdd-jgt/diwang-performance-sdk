import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      "public/app": "src/client.ts"
    },
    format: ["esm"],
    platform: "browser",
    target: "es2022",
    outDir: "dist",
    clean: false,
    minify: false,
    splitting: false,
    sourcemap: true,
    noExternal: [/.*/]
  },
  {
    entry: {
      server: "src/server.ts"
    },
    format: ["esm"],
    platform: "node",
    target: "node22",
    outDir: "dist",
    clean: false,
    minify: false,
    splitting: false,
    sourcemap: true,
    noExternal: [/.*/]
  }
]);
