import { describe, expect, it } from "vitest";

import { normalizeOptions } from "../src/config.js";

describe("normalizeOptions", () => {
  it("应用安全默认值并规范化 URL", () => {
    expect(
      normalizeOptions({
        logUrl: "https://user:pass@example.com/collect#fragment",
        projectId: "web_app"
      })
    ).toMatchObject({
      logUrl: "https://example.com/collect",
      projectId: "web_app",
      sampleRate: 1,
      captureError: true,
      batchSize: 20,
      flushIntervalMs: 5_000,
      maxQueueSize: 200,
      maxEventsPerMinute: 50
    });
  });

  it.each([
    [{ logUrl: "", projectId: "web" }, "logUrl"],
    [{ logUrl: "file:///tmp/logs", projectId: "web" }, "http/https"],
    [{ logUrl: "https://example.com", projectId: "有空格" }, "projectId"],
    [
      {
        logUrl: "https://example.com",
        projectId: "web",
        sampleRate: 1.1
      },
      "sampleRate"
    ],
    [
      {
        logUrl: "https://example.com",
        projectId: "web",
        batchSize: 51
      },
      "batchSize"
    ]
  ])("拒绝非法配置 %#", (options, message) => {
    expect(() => normalizeOptions(options)).toThrow(message);
  });
});
