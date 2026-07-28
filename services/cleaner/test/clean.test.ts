import { describe, expect, it } from "vitest";

import { cleanMessage, rateMetric } from "../src/clean.js";
import { ingestMessage } from "./fixtures.js";

describe("cleanMessage", () => {
  it("扁平化指标并按服务端规则覆盖客户端评分", () => {
    const records = cleanMessage(ingestMessage);

    expect(records[0]).toEqual({
      schemaVersion: 1,
      receivedAt: "2026-07-28T06:00:00.000Z",
      partitionDate: "2026-07-28",
      requestId: "request-1",
      batchId: "df3e4e46-cc68-4923-af39-a684909f35a7",
      recordId: "a30bbfac-9f31-4f8b-bd1f-01e03ac94f8f",
      eventId: "a30bbfac-9f31-4f8b-bd1f-01e03ac94f8f",
      projectId: "demo-project",
      sessionId: "session-1",
      clientTimestamp: 1_722_144_000_000,
      sdkVersion: "0.1.0",
      release: "2026.07.28",
      sampleRate: 0.5,
      pageUrl: "https://example.com/products",
      referrer: "https://search.example.com/",
      browserName: "Chrome",
      browserVersion: "124.0.0.0",
      osName: "macOS",
      osVersion: "10.15.7",
      platformType: "desktop",
      eventType: "metric",
      metricName: "LCP",
      metricValue: 2_600,
      metricRating: "needs-improvement"
    });
  });

  it("再次清理错误文本与资源 URL", () => {
    const records = cleanMessage(ingestMessage);

    expect(records[1]).toEqual(
      expect.objectContaining({
        eventType: "error",
        errorKind: "js",
        errorMessage: "token=[REDACTED] 请求失败",
        errorStack: "Error: password=[REDACTED]\n at app.js:1:1",
        errorSourceUrl: "https://example.com/app.js",
        errorLine: 1,
        errorColumn: 2
      })
    );
  });

  it("不修改原始队列消息", () => {
    const original = structuredClone(ingestMessage);
    cleanMessage(ingestMessage);
    expect(ingestMessage).toEqual(original);
  });

  it("相同事件重复清洗产生稳定 recordId 和相同记录", () => {
    const first = cleanMessage(ingestMessage);
    const second = cleanMessage(ingestMessage);
    expect(second).toEqual(first);
    expect(second[0]?.recordId).toBe(
      ingestMessage.batch.events[0]?.eventId
    );
  });
});

describe("rateMetric", () => {
  it("只为当前 Core Web Vitals 重新评分", () => {
    expect(rateMetric("LCP", 4_001)).toBe("poor");
    expect(rateMetric("CLS", 0.25)).toBe("needs-improvement");
    expect(rateMetric("INP", 200)).toBe("good");
    expect(rateMetric("FCP", 1_000)).toBeUndefined();
  });
});
