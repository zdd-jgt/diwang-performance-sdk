import type {
  SDKPerformanceObserver,
  SDKRuntime
} from "../runtime.js";
import type { MetricSample } from "../types.js";
import { PerformanceState } from "./state.js";

type MetricHandler = (metric: MetricSample) => void;

export class PerformanceCollector {
  private readonly observers: SDKPerformanceObserver[] = [];
  private readonly reportedNavigationMetrics = new Set<string>();
  private readonly state = new PerformanceState();
  private started = false;

  private readonly loadHandler: EventListener = () => {
    this.collectNavigationTiming();
  };

  public constructor(
    private readonly runtime: SDKRuntime,
    private readonly onMetric: MetricHandler
  ) {}

  public start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.collectNavigationTiming();
    this.runtime.addEventListener("load", this.loadHandler);
    this.observePaint();
    this.observeLCP();
    this.observeCLS();
    this.observeINP();
    this.observeLongTasks();
  }

  public finalize(): MetricSample[] {
    return this.state.finalMetrics();
  }

  public stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.runtime.removeEventListener("load", this.loadHandler);
    for (const observer of this.observers.splice(0)) {
      try {
        observer.disconnect();
      } catch {
        // Observer 销毁失败不能影响宿主页面。
      }
    }
  }

  private collectNavigationTiming(): void {
    let navigation: PerformanceNavigationTiming | undefined;
    try {
      navigation = this.runtime.performance.getEntriesByType(
        "navigation"
      )[0] as PerformanceNavigationTiming | undefined;
    } catch {
      return;
    }
    if (!navigation) {
      return;
    }

    const values: MetricSample[] = [
      { name: "TTFB", value: navigation.responseStart - navigation.startTime },
      {
        name: "DNS",
        value: navigation.domainLookupEnd - navigation.domainLookupStart
      },
      { name: "TCP", value: navigation.connectEnd - navigation.connectStart },
      {
        name: "DOM_CONTENT_LOADED",
        value: navigation.domContentLoadedEventEnd - navigation.startTime
      },
      { name: "LOAD", value: navigation.loadEventEnd - navigation.startTime }
    ];

    for (const metric of values) {
      if (
        metric.value < 0 ||
        !Number.isFinite(metric.value) ||
        (metric.name === "LOAD" && metric.value === 0) ||
        this.reportedNavigationMetrics.has(metric.name)
      ) {
        continue;
      }
      this.reportedNavigationMetrics.add(metric.name);
      this.onMetric({ ...metric, value: round(metric.value) });
    }
  }

  private observePaint(): void {
    this.observe("paint", (entries) => {
      for (const entry of entries) {
        if (entry.name === "first-paint") {
          this.onMetric({ name: "FP", value: round(entry.startTime) });
        } else if (entry.name === "first-contentful-paint") {
          this.onMetric({ name: "FCP", value: round(entry.startTime) });
        }
      }
    });
  }

  private observeLCP(): void {
    this.observe("largest-contentful-paint", (entries) => {
      const lastEntry = entries.at(-1);
      if (lastEntry) {
        this.state.addLCP(lastEntry.startTime);
      }
    });
  }

  private observeCLS(): void {
    this.observe("layout-shift", (entries) => {
      for (const entry of entries) {
        const shift = entry as PerformanceEntry & {
          value?: number;
          hadRecentInput?: boolean;
        };
        this.state.addLayoutShift({
          value: shift.value ?? 0,
          startTime: shift.startTime,
          hadRecentInput: shift.hadRecentInput ?? false
        });
      }
    });
  }

  private observeINP(): void {
    this.observe(
      "event",
      (entries) => {
        for (const entry of entries) {
          const interaction = entry as PerformanceEntry & {
            interactionId?: number;
            duration: number;
          };
          this.state.addInteraction({
            interactionId: interaction.interactionId ?? 0,
            duration: interaction.duration
          });
        }
      },
      { durationThreshold: 40 }
    );
  }

  private observeLongTasks(): void {
    this.observe("longtask", (entries) => {
      for (const entry of entries) {
        this.state.addLongTask(entry.duration);
      }
    });
  }

  private observe(
    type: string,
    onEntries: (entries: PerformanceEntry[]) => void,
    extraOptions: Record<string, number> = {}
  ): void {
    const createObserver = this.runtime.createPerformanceObserver;
    if (
      !createObserver ||
      !supportsEntryType(this.runtime.supportedPerformanceEntryTypes, type)
    ) {
      return;
    }

    let observer: SDKPerformanceObserver | undefined;
    try {
      observer = createObserver((entries) => {
        try {
          onEntries(entries);
        } catch {
          // 单个指标解析错误不得逃逸到宿主页面。
        }
      });
      observer.observe({
        type,
        buffered: true,
        ...extraOptions
      } as PerformanceObserverInit);
      this.observers.push(observer);
    } catch {
      try {
        observer?.disconnect();
      } catch {
        // 不支持的 entry type 直接跳过。
      }
    }
  }
}

function supportsEntryType(
  supportedEntryTypes: readonly string[] | undefined,
  type: string
): boolean {
  return (
    !supportedEntryTypes ||
    supportedEntryTypes.length === 0 ||
    supportedEntryTypes.includes(type)
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
