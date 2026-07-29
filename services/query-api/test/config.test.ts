import { describe, expect, it } from "vitest";

import { readQueryApiConfig } from "../src/config.js";

describe("Query API 配置", () => {
  it("提供生产学习环境的非敏感默认值", () => {
    expect(readQueryApiConfig({})).toMatchObject({
      region: "ap-northeast-1",
      database: "diwang_performance_production",
      view: "telemetry_deduplicated",
      workgroup: "diwang-performance-production-telemetry",
      allowedProjects: ["hono-sam-aws-learning"],
      host: "127.0.0.1",
      port: 4174,
      cacheTtlMs: 60_000
    });
  });

  it("允许覆盖资源名称并清理重复项目", () => {
    expect(
      readQueryApiConfig({
        AWS_REGION: "us-east-1",
        ATHENA_DATABASE: "telemetry_test",
        ATHENA_VIEW: "events_view",
        ATHENA_WORKGROUP: "telemetry-test",
        DASHBOARD_ALLOWED_PROJECTS:
          "hono-sam-aws-learning,another-project,hono-sam-aws-learning",
        QUERY_API_PORT: "5174"
      })
    ).toMatchObject({
      region: "us-east-1",
      database: "telemetry_test",
      view: "events_view",
      workgroup: "telemetry-test",
      allowedProjects: ["hono-sam-aws-learning", "another-project"],
      port: 5174
    });
  });

  it.each([
    [{ ATHENA_DATABASE: "bad-name" }, "ATHENA_DATABASE"],
    [{ ATHENA_VIEW: "bad view" }, "ATHENA_VIEW"],
    [{ ATHENA_WORKGROUP: "bad_group" }, "ATHENA_WORKGROUP"],
    [{ DASHBOARD_ALLOWED_PROJECTS: "bad_project" }, "DASHBOARD_ALLOWED_PROJECTS"],
    [{ QUERY_API_PORT: "80" }, "QUERY_API_PORT"]
  ])("拒绝非法配置 %#", (environment, expectedMessage) => {
    expect(() => readQueryApiConfig(environment)).toThrow(expectedMessage);
  });
});
