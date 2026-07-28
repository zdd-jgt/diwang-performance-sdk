import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const dockerfile = readFileSync(
  fileURLToPath(new URL("../Dockerfile", import.meta.url)),
  "utf8"
);

describe("Cleaner Dockerfile", () => {
  it("使用 Node 22 多阶段构建并以非 root 用户运行", () => {
    expect(dockerfile).toContain("FROM node:22-alpine AS build");
    expect(dockerfile).toContain("FROM node:22-alpine");
    expect(dockerfile).toContain("USER node");
    expect(dockerfile).toContain("STOPSIGNAL SIGTERM");
    expect(dockerfile).toContain('CMD ["node", "main.mjs"]');
  });

  it("运行镜像只复制自包含 bundle", () => {
    expect(dockerfile).toContain(
      "/app/services/cleaner/dist/main.mjs ./main.mjs"
    );
    expect(dockerfile).not.toContain("COPY --from=build /app/node_modules");
  });
});
