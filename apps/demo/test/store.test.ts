import type { TelemetryBatch } from "@diwang/contracts";
import { describe, expect, it } from "vitest";

import { parseTelemetryBatch } from "../src/receiver.js";
import { DemoStore } from "../src/store.js";

const validBatch: TelemetryBatch = {
  schemaVersion: 1,
  batchId: "8a4eab5d-30b3-4dd7-8fce-01bbf67b9b88",
  events: [
    {
      schemaVersion: 1,
      eventId: "e2dc9f6f-d0bb-42e9-8d7d-b58acc27fd2a",
      projectId: "diwang-demo",
      sessionId: "session-demo",
      clientTimestamp: 1_785_251_200_000,
      sdkVersion: "0.1.0",
      sampleRate: 1,
      page: {
        url: "http://127.0.0.1:4174/"
      },
      eventType: "metric",
      metric: {
        name: "LCP",
        value: 1_800,
        rating: "good"
      }
    }
  ]
};

describe("DemoStore", () => {
  it("解析并汇总有效 SDK 批次", () => {
    const parsed = parseTelemetryBatch(validBatch);
    expect(parsed).toEqual(validBatch);

    const store = new DemoStore(
      10,
      () => new Date("2026-07-29T10:00:00.000Z")
    );
    store.add(parsed!);

    expect(store.snapshot()).toMatchObject({
      batchCount: 1,
      eventCount: 1,
      lastReceivedAt: "2026-07-29T10:00:00.000Z",
      events: [validBatch.events[0]]
    });
  });

  it("拒绝无效批次并限制内存批次数", () => {
    expect(parseTelemetryBatch({ events: [] })).toBeUndefined();

    const store = new DemoStore(1);
    store.add(validBatch);
    store.add({
      ...validBatch,
      batchId: "698a99a7-a4d7-41a6-847a-44297340b0a8"
    });
    expect(store.snapshot()).toMatchObject({
      batchCount: 1,
      eventCount: 1
    });
  });

  it("可以清空本地接收数据", () => {
    const store = new DemoStore();
    store.add(validBatch);
    store.clear();
    expect(store.snapshot()).toEqual({
      batchCount: 0,
      eventCount: 0,
      events: []
    });
  });
});
