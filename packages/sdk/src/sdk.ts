import type {
  ErrorEvent as TelemetryErrorEvent,
  MetricEvent,
  TelemetryEvent
} from "@diwang/contracts";

import {
  normalizeOptions,
  type NormalizedSDKOptions
} from "./config.js";
import {
  ErrorCollector,
  type CapturedError
} from "./error/collector.js";
import { PerformanceCollector } from "./performance/collector.js";
import { TelemetryReporter } from "./reporter.js";
import {
  createBrowserRuntime,
  type SDKRuntime
} from "./runtime.js";
import { sanitizeUrl, sanitizeUserAgent } from "./sanitize.js";
import type { MetricSample, SDKOptions } from "./types.js";

const SCHEMA_VERSION = 1 as const;
const SDK_VERSION = "0.1.0";

export class DiwangPerformanceSDK {
  private readonly options: NormalizedSDKOptions;
  private readonly runtime: SDKRuntime | undefined;
  private readonly sessionId: string;
  private readonly sampled: boolean;
  private reporter: TelemetryReporter | undefined;
  private performanceCollector: PerformanceCollector | undefined;
  private errorCollector: ErrorCollector | undefined;
  private eventTimestamps: number[] = [];
  private started = false;
  private performanceFinalized = false;

  private readonly visibilityHandler: EventListener = () => {
    if (this.runtime?.document.visibilityState === "hidden") {
      this.finalizePerformance();
      this.reporter?.flush(true);
    }
  };

  private readonly pageHideHandler: EventListener = () => {
    this.finalizePerformance();
    this.reporter?.flush(true);
  };

  public constructor(options: SDKOptions, runtime = createBrowserRuntime()) {
    this.options = normalizeOptions(options);
    this.runtime = runtime;
    this.sessionId = runtime?.randomUUID() ?? "";
    this.sampled = (runtime?.random() ?? 1) < this.options.sampleRate;
  }

  public start(): this {
    if (this.started || !this.runtime) {
      return this;
    }
    this.started = true;
    this.performanceFinalized = false;
    this.reporter = new TelemetryReporter(this.options, this.runtime);

    if (this.sampled) {
      this.performanceCollector = new PerformanceCollector(
        this.runtime,
        (metric) => this.captureMetric(metric)
      );
      this.performanceCollector.start();
    }

    if (this.options.captureError) {
      this.errorCollector = new ErrorCollector(this.runtime, (error) =>
        this.captureError(error)
      );
      this.errorCollector.start();
    }

    this.runtime.document.addEventListener(
      "visibilitychange",
      this.visibilityHandler
    );
    this.runtime.addEventListener("pagehide", this.pageHideHandler);
    return this;
  }

  public stop(): void {
    if (!this.started || !this.runtime) {
      return;
    }

    this.finalizePerformance();
    this.performanceCollector?.stop();
    this.errorCollector?.stop();
    this.runtime.document.removeEventListener(
      "visibilitychange",
      this.visibilityHandler
    );
    this.runtime.removeEventListener("pagehide", this.pageHideHandler);
    this.reporter?.destroy(true);
    this.performanceCollector = undefined;
    this.errorCollector = undefined;
    this.reporter = undefined;
    this.started = false;
  }

  public flush(): void {
    this.reporter?.flush(false);
  }

  public isStarted(): boolean {
    return this.started;
  }

  private captureMetric(metric: MetricSample): void {
    const event: MetricEvent = {
      ...this.baseEvent(),
      eventType: "metric",
      metric: {
        name: metric.name,
        value: metric.value,
        ...(metric.rating ? { rating: metric.rating } : {})
      }
    };
    this.enqueue(event);
  }

  private captureError(error: CapturedError): void {
    const event: TelemetryErrorEvent = {
      ...this.baseEvent(),
      eventType: "error",
      error
    };
    this.enqueue(event, true);
  }

  private enqueue(event: TelemetryEvent, urgent = false): void {
    if (!this.takeRateLimitSlot()) {
      return;
    }
    this.reporter?.enqueue(event, urgent);
  }

  private finalizePerformance(): void {
    if (this.performanceFinalized || !this.performanceCollector) {
      return;
    }
    this.performanceFinalized = true;
    for (const metric of this.performanceCollector.finalize()) {
      this.captureMetric(metric);
    }
    this.performanceCollector.stop();
  }

  private baseEvent(): Omit<MetricEvent, "eventType" | "metric"> {
    const pageUrl =
      sanitizeUrl(this.runtime?.location.href) ?? "http://invalid.local/";
    const referrer = sanitizeUrl(this.runtime?.document.referrer);
    const userAgent = sanitizeUserAgent(this.runtime?.userAgent);
    return {
      schemaVersion: SCHEMA_VERSION,
      eventId: this.runtime?.randomUUID() ?? "",
      projectId: this.options.projectId,
      sessionId: this.sessionId,
      clientTimestamp: Date.now(),
      sdkVersion: SDK_VERSION,
      ...(this.options.release ? { release: this.options.release } : {}),
      sampleRate: this.options.sampleRate,
      ...(userAgent ? { userAgent } : {}),
      page: {
        url: pageUrl,
        ...(referrer ? { referrer } : {})
      }
    };
  }

  private takeRateLimitSlot(): boolean {
    const now = Date.now();
    const windowStart = now - 60_000;
    this.eventTimestamps = this.eventTimestamps.filter(
      (timestamp) => timestamp > windowStart
    );
    if (this.eventTimestamps.length >= this.options.maxEventsPerMinute) {
      return false;
    }
    this.eventTimestamps.push(now);
    return true;
  }
}
