import { describe, expect, it } from "vitest";

import {
  MAX_BATCH_EVENTS,
  cleanTelemetryRecordSchema,
  errorEventSchema,
  ingestQueueMessageSchema,
  metricEventSchema,
  telemetryBatchSchema
} from "../src/schema.js";

const commonEvent = {
  schemaVersion: 1,
  eventId: "a30bbfac-9f31-4f8b-bd1f-01e03ac94f8f",
  projectId: "demo-project",
  sessionId: "session-1",
  clientTimestamp: 1_722_144_000_000,
  sdkVersion: "0.1.0",
  page: {
    url: "https://example.com/products"
  }
} as const;

describe("metricEventSchema", () => {
  it("接受当前 Core Web Vitals 指标", () => {
    const result = metricEventSchema.safeParse({
      ...commonEvent,
      eventType: "metric",
      metric: {
        name: "INP",
        value: 180,
        rating: "good"
      }
    });

    expect(result.success).toBe(true);
  });

  it("拒绝已被 INP 取代的 FID 指标", () => {
    const result = metricEventSchema.safeParse({
      ...commonEvent,
      eventType: "metric",
      metric: {
        name: "FID",
        value: 30
      }
    });

    expect(result.success).toBe(false);
  });

  it("拒绝未知字段和非法页面地址", () => {
    const result = metricEventSchema.safeParse({
      ...commonEvent,
      page: {
        url: "not-a-url"
      },
      eventType: "metric",
      metric: {
        name: "LCP",
        value: 1200
      },
      cookie: "不应进入日志协议"
    });

    expect(result.success).toBe(false);
  });

  it("限制 User-Agent 长度", () => {
    expect(
      metricEventSchema.safeParse({
        ...commonEvent,
        userAgent: "x".repeat(513),
        eventType: "metric",
        metric: {
          name: "LCP",
          value: 1200
        }
      }).success
    ).toBe(false);
  });
});

describe("errorEventSchema", () => {
  it("接受受限长度的前端错误", () => {
    const result = errorEventSchema.safeParse({
      ...commonEvent,
      eventType: "error",
      error: {
        kind: "js",
        message: "ReferenceError",
        stack: "ReferenceError at app.js:1:1",
        sourceUrl: "https://example.com/app.js",
        line: 1,
        column: 1
      }
    });

    expect(result.success).toBe(true);
  });

  it("拒绝负数位置和过长错误消息", () => {
    const result = errorEventSchema.safeParse({
      ...commonEvent,
      eventType: "error",
      error: {
        kind: "js",
        message: "x".repeat(4097),
        line: -1
      }
    });

    expect(result.success).toBe(false);
  });
});

describe("telemetryBatchSchema", () => {
  it("限制单批事件数量", () => {
    const event = {
      ...commonEvent,
      eventType: "metric",
      metric: {
        name: "CLS",
        value: 0.05
      }
    } as const;

    const result = telemetryBatchSchema.safeParse({
      schemaVersion: 1,
      batchId: "df3e4e46-cc68-4923-af39-a684909f35a7",
      events: Array.from({ length: MAX_BATCH_EVENTS + 1 }, () => event)
    });

    expect(result.success).toBe(false);
  });

  it("拒绝一个批次混入多个项目", () => {
    const event = {
      ...commonEvent,
      eventType: "metric",
      metric: {
        name: "CLS",
        value: 0.05
      }
    } as const;
    expect(
      telemetryBatchSchema.safeParse({
        schemaVersion: 1,
        batchId: "df3e4e46-cc68-4923-af39-a684909f35a7",
        events: [
          event,
          { ...event, projectId: "another-project" }
        ]
      }).success
    ).toBe(false);
  });
});

describe("ingestQueueMessageSchema", () => {
  const batch = {
    schemaVersion: 1,
    batchId: "df3e4e46-cc68-4923-af39-a684909f35a7",
    events: [
      {
        ...commonEvent,
        eventType: "metric",
        metric: {
          name: "LCP",
          value: 1_200
        }
      }
    ]
  } as const;

  it("接受由服务端补充接收时间和请求 ID 的队列消息", () => {
    expect(
      ingestQueueMessageSchema.safeParse({
        schemaVersion: 1,
        receivedAt: "2026-07-28T06:00:00.000Z",
        requestId: "api-request-1",
        batch
      }).success
    ).toBe(true);
  });

  it("拒绝客户端时间替代服务端接收时间和额外字段", () => {
    expect(
      ingestQueueMessageSchema.safeParse({
        schemaVersion: 1,
        receivedAt: "not-an-iso-time",
        requestId: "api-request-1",
        sourceIp: "192.0.2.1",
        batch
      }).success
    ).toBe(false);
  });
});

describe("cleanTelemetryRecordSchema", () => {
  const cleanBase = {
    schemaVersion: 1,
    receivedAt: "2026-07-28T06:00:00.000Z",
    partitionDate: "2026-07-28",
    requestId: "api-request-1",
    batchId: "df3e4e46-cc68-4923-af39-a684909f35a7",
    recordId: "a30bbfac-9f31-4f8b-bd1f-01e03ac94f8f",
    eventId: "a30bbfac-9f31-4f8b-bd1f-01e03ac94f8f",
    projectId: "demo-project",
    sessionId: "session-1",
    clientTimestamp: 1_722_144_000_000,
    sdkVersion: "0.1.0",
    pageUrl: "https://example.com/products"
  } as const;

  it("接受适合 Firehose/Parquet 的扁平指标记录", () => {
    expect(
      cleanTelemetryRecordSchema.safeParse({
        ...cleanBase,
        eventType: "metric",
        metricName: "LCP",
        metricValue: 2_600,
        metricRating: "needs-improvement"
      }).success
    ).toBe(true);
  });

  it("拒绝非 HTTP URL 和指标错误字段混入", () => {
    expect(
      cleanTelemetryRecordSchema.safeParse({
        ...cleanBase,
        pageUrl: "javascript:alert(1)",
        eventType: "metric",
        metricName: "LCP",
        metricValue: 2_600,
        errorMessage: "不应混入"
      }).success
    ).toBe(false);
  });
});
