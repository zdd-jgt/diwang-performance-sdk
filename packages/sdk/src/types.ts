import type { TelemetryEvent } from "@diwang/contracts";

export interface SDKOptions {
  /** 日志接收地址，仅允许 http/https。 */
  logUrl: string;
  /** 项目标识，只允许字母、数字、下划线和短横线。 */
  projectId: string;
  /** 当前发布版本。 */
  release?: string;
  /** 性能指标会话采样率，错误事件始终采集。默认 1。 */
  sampleRate?: number;
  /** 是否捕获 JS、资源和未处理 Promise 异常。默认 true。 */
  captureError?: boolean;
  /** 单批最大事件数，默认 20，最大 50。 */
  batchSize?: number;
  /** 空闲队列最大等待时间，默认 5000ms。 */
  flushIntervalMs?: number;
  /** 内存队列上限，默认 200。 */
  maxQueueSize?: number;
  /** 单页每分钟最多接收的事件数，默认 50。 */
  maxEventsPerMinute?: number;
  /** 事件入队前的只读观察回调；回调异常会被 SDK 隔离。 */
  onEvent?: (event: TelemetryEvent) => void;
}

export type MetricRating = "good" | "needs-improvement" | "poor";

export interface MetricSample {
  name:
    | "LCP"
    | "CLS"
    | "INP"
    | "FP"
    | "FCP"
    | "TBT"
    | "TTFB"
    | "DNS"
    | "TCP"
    | "DOM_CONTENT_LOADED"
    | "LOAD";
  value: number;
  rating?: MetricRating;
}
