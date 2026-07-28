import type { ErrorEvent, MetricEvent } from "@diwang/contracts";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import { normalizeOptions } from "../src/config.js";
import {
  MAX_PAYLOAD_BYTES,
  TelemetryReporter
} from "../src/reporter.js";
import type { SDKFetch, SDKRuntime } from "../src/runtime.js";

const metricEvent: MetricEvent = {
  schemaVersion: 1,
  eventId: "00000000-0000-4000-8000-000000000001",
  projectId: "web",
  sessionId: "session",
  clientTimestamp: 1,
  sdkVersion: "0.1.0",
  sampleRate: 1,
  page: { url: "https://example.com/" },
  eventType: "metric",
  metric: { name: "LCP", value: 1_000, rating: "good" }
};

describe("TelemetryReporter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("在回退计时器到期后批量发送", async () => {
    const fetchMock = createFetchMock();
    const runtime = createRuntime({
      fetch: fetchMock
    });
    const reporter = new TelemetryReporter(
      normalizeOptions({
        logUrl: "https://logs.example.com/collect",
        projectId: "web",
        flushIntervalMs: 100
      }),
      runtime
    );

    reporter.enqueue(metricEvent);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, request] = fetchMock.mock.calls[0] as [
      string,
      RequestInit
    ];
    const body = JSON.parse(String(request.body)) as {
      events: MetricEvent[];
    };
    expect(body.events).toEqual([metricEvent]);
    expect(request).toMatchObject({
      method: "POST",
      keepalive: true,
      credentials: "omit"
    });
  });

  it("紧急事件优先使用 sendBeacon", () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    const fetchMock = vi.fn();
    const reporter = new TelemetryReporter(
      normalizeOptions({
        logUrl: "https://logs.example.com/collect",
        projectId: "web"
      }),
      createRuntime({
        sendBeacon,
        fetch: fetchMock
      })
    );

    reporter.enqueue(metricEvent, true);

    expect(sendBeacon).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("达到批大小时立即发送且不超过契约上限", () => {
    const fetchMock = createFetchMock();
    const reporter = new TelemetryReporter(
      normalizeOptions({
        logUrl: "https://logs.example.com/collect",
        projectId: "web",
        batchSize: 2
      }),
      createRuntime({ fetch: fetchMock })
    );

    reporter.enqueue(metricEvent);
    reporter.enqueue({
      ...metricEvent,
      eventId: "00000000-0000-4000-8000-000000000002"
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("按 UTF-8 字节拆分批次，单次 Payload 不超过 64 KiB", async () => {
    const fetchMock = createFetchMock();
    const reporter = new TelemetryReporter(
      normalizeOptions({
        logUrl: "https://logs.example.com/collect",
        projectId: "web",
        batchSize: 50
      }),
      createRuntime({ fetch: fetchMock })
    );
    const errorEvent: ErrorEvent = {
      schemaVersion: 1,
      eventId: "00000000-0000-4000-8000-000000000000",
      projectId: "web",
      sessionId: "session",
      clientTimestamp: 1,
      sdkVersion: "0.1.0",
      sampleRate: 1,
      page: { url: "https://example.com/" },
      eventType: "error",
      error: {
        kind: "js",
        message: "错误",
        stack: "错".repeat(8_000)
      }
    };
    for (let index = 0; index < 8; index += 1) {
      reporter.enqueue({
        ...errorEvent,
        eventId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      });
    }

    reporter.flush();
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    });

    for (const [, request] of fetchMock.mock.calls as Array<
      [string, RequestInit]
    >) {
      expect(
        new TextEncoder().encode(String(request.body)).byteLength
      ).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    }
  });

  it("fetch 失败后保留同一批次并有限重试", async () => {
    const fetchMock = vi
      .fn<SDKFetch>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true });
    const reporter = new TelemetryReporter(
      normalizeOptions({
        logUrl: "https://logs.example.com/collect",
        projectId: "web",
        flushIntervalMs: 100
      }),
      createRuntime({ fetch: fetchMock })
    );

    reporter.enqueue(metricEvent);
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstBody = String(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body
    );
    const retryBody = String(
      (fetchMock.mock.calls[1]?.[1] as RequestInit).body
    );
    expect(retryBody).toBe(firstBody);
  });

  it("连续失败只执行两次重试，之后不阻塞新事件", async () => {
    const fetchMock = vi
      .fn<SDKFetch>()
      .mockRejectedValue(new Error("offline"));
    const reporter = new TelemetryReporter(
      normalizeOptions({
        logUrl: "https://logs.example.com/collect",
        projectId: "web",
        flushIntervalMs: 100
      }),
      createRuntime({ fetch: fetchMock })
    );

    reporter.enqueue(metricEvent);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockResolvedValue({ ok: true });
    reporter.enqueue({
      ...metricEvent,
      eventId: "00000000-0000-4000-8000-000000000009"
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

function createRuntime(
  overrides: Partial<SDKRuntime> = {}
): SDKRuntime {
  const eventTarget = new EventTarget();
  const documentTarget = new EventTarget();
  const document = {
    referrer: "",
    visibilityState: "visible" as const,
    addEventListener: documentTarget.addEventListener.bind(documentTarget),
    removeEventListener:
      documentTarget.removeEventListener.bind(documentTarget),
    dispatchEvent: documentTarget.dispatchEvent.bind(documentTarget)
  };

  return {
    document,
    location: new URL("https://example.com/page"),
    performance: {
      getEntriesByType: () => []
    },
    random: () => 0,
    randomUUID: () => "00000000-0000-4000-8000-000000000000",
    setTimeout,
    clearTimeout,
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    ...overrides
  };
}

function createFetchMock(): ReturnType<typeof vi.fn<SDKFetch>> {
  return vi.fn<SDKFetch>().mockResolvedValue({ ok: true });
}
