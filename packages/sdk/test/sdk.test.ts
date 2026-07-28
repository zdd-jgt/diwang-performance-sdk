import { describe, expect, it, vi } from "vitest";

import type {
  SDKFetch,
  SDKPerformanceObserver,
  SDKRuntime
} from "../src/runtime.js";
import { DiwangPerformanceSDK } from "../src/sdk.js";

describe("DiwangPerformanceSDK 生命周期", () => {
  it("start/stop 幂等，并在停止时移除所有 Observer", () => {
    const { runtime, observers } = createRuntime();
    const onEvent = vi.fn();
    const sdk = new DiwangPerformanceSDK(
      {
        logUrl: "https://logs.example.com/collect",
        projectId: "web",
        captureError: false,
        onEvent
      },
      runtime
    );

    sdk.start().start();
    expect(sdk.isStarted()).toBe(true);
    expect(observers).toHaveLength(5);

    emitEntries(observers, "largest-contentful-paint", [
      { startTime: 2_600 }
    ]);
    emitEntries(observers, "layout-shift", [
      { startTime: 100, value: 0.12, hadRecentInput: false }
    ]);
    emitEntries(observers, "event", [
      { startTime: 200, duration: 250, interactionId: 1 }
    ]);
    emitEntries(observers, "longtask", [
      { startTime: 300, duration: 80 }
    ]);

    sdk.stop();
    sdk.stop();
    expect(sdk.isStarted()).toBe(false);
    expect(observers.every((observer) => observer.disconnected)).toBe(true);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "metric",
        userAgent: "Mozilla/5.0 TestBrowser/1.0",
        metric: expect.objectContaining({ name: "TTFB" })
      })
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: {
          name: "LCP",
          value: 2_600,
          rating: "needs-improvement"
        }
      })
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: {
          name: "INP",
          value: 250,
          rating: "needs-improvement"
        }
      })
    );
  });

  it("sampleRate 为 0 时不启动性能 Observer，但仍可启动错误采集", () => {
    const { runtime, observers } = createRuntime();
    const sdk = new DiwangPerformanceSDK(
      {
        logUrl: "https://logs.example.com/collect",
        projectId: "web",
        sampleRate: 0
      },
      runtime
    );

    sdk.start();
    expect(observers).toHaveLength(0);
    expect(sdk.isStarted()).toBe(true);
    sdk.stop();
  });
});

class FakePerformanceObserver {
  public static readonly supportedEntryTypes = [
    "paint",
    "largest-contentful-paint",
    "layout-shift",
    "event",
    "longtask"
  ];

  public disconnected = false;
  public observedType = "";

  public constructor(
    public readonly callback: (entries: PerformanceEntry[]) => void
  ) {}

  public observe(options: PerformanceObserverInit): void {
    this.observedType = options.type ?? "";
  }

  public disconnect(): void {
    this.disconnected = true;
  }

}

function emitEntries(
  observers: FakePerformanceObserver[],
  type: string,
  entries: Array<Record<string, number | boolean>>
): void {
  const observer = observers.find((candidate) => candidate.observedType === type);
  observer?.callback(entries.map((entry) => createEntry(type, entry)));
}

function createRuntime(): {
  runtime: SDKRuntime;
  observers: FakePerformanceObserver[];
} {
  const eventTarget = new EventTarget();
  const documentTarget = new EventTarget();
  const observers: FakePerformanceObserver[] = [];
  let uuidCounter = 0;

  class TrackingObserver extends FakePerformanceObserver {
    public constructor(callback: (entries: PerformanceEntry[]) => void) {
      super(callback);
      observers.push(this);
    }
  }

  const navigation = {
    startTime: 0,
    responseStart: 120,
    domainLookupStart: 10,
    domainLookupEnd: 20,
    connectStart: 20,
    connectEnd: 45,
    domContentLoadedEventEnd: 300,
    loadEventEnd: 500
  } as PerformanceNavigationTiming;

  const document = {
    referrer: "https://referrer.example/path?token=secret",
    visibilityState: "visible" as const,
    addEventListener: documentTarget.addEventListener.bind(documentTarget),
    removeEventListener:
      documentTarget.removeEventListener.bind(documentTarget),
    dispatchEvent: documentTarget.dispatchEvent.bind(documentTarget)
  };

  return {
    observers,
    runtime: {
      document,
      location: new URL(
        "https://example.com/page?authorization=secret"
      ),
      performance: {
        getEntriesByType: (type: string) =>
          type === "navigation" ? [navigation] : []
      },
      userAgent: "Mozilla/5.0 TestBrowser/1.0",
      supportedPerformanceEntryTypes:
        FakePerformanceObserver.supportedEntryTypes,
      createPerformanceObserver: (callback) =>
        new TrackingObserver(callback) satisfies SDKPerformanceObserver,
      random: () => 0.5,
      randomUUID: () => {
        uuidCounter += 1;
        return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, "0")}`;
      },
      sendBeacon: () => true,
      fetch: vi.fn<SDKFetch>().mockResolvedValue({ ok: true }),
      setTimeout,
      clearTimeout,
      addEventListener: eventTarget.addEventListener.bind(eventTarget),
      removeEventListener: eventTarget.removeEventListener.bind(eventTarget)
    }
  };
}

function createEntry(
  type: string,
  values: Record<string, number | boolean>
): PerformanceEntry {
  return {
    name: "",
    entryType: type,
    startTime: 0,
    duration: 0,
    toJSON: () => ({}),
    ...values
  };
}
