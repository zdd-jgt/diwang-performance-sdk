import type { SDKRuntime } from "../runtime.js";
import { sanitizeText, sanitizeUrl } from "../sanitize.js";

export interface CapturedError {
  kind: "js" | "resource" | "unhandled_rejection";
  message: string;
  stack?: string;
  sourceUrl?: string;
  line?: number;
  column?: number;
}

export class ErrorCollector {
  private started = false;

  private readonly errorHandler: EventListener = (event) => {
    this.handleError(event);
  };

  private readonly rejectionHandler: EventListener = (event) => {
    this.handleRejection(event);
  };

  public constructor(
    private readonly runtime: SDKRuntime,
    private readonly onError: (error: CapturedError) => void
  ) {}

  public start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.runtime.addEventListener("error", this.errorHandler, true);
    this.runtime.addEventListener("unhandledrejection", this.rejectionHandler);
  }

  public stop(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.runtime.removeEventListener("error", this.errorHandler, true);
    this.runtime.removeEventListener(
      "unhandledrejection",
      this.rejectionHandler
    );
  }

  private handleError(event: Event): void {
    try {
      const target = event.target as
        | (EventTarget & {
            tagName?: string;
            src?: string;
            href?: string;
            currentSrc?: string;
          })
        | null;

      if (target && target !== this.runtime.document && target.tagName) {
        const tagName = target.tagName.toUpperCase().slice(0, 32);
        const sourceUrl = sanitizeUrl(
          target.currentSrc ?? target.src ?? target.href
        );
        this.onError({
          kind: "resource",
          message: `资源加载失败: ${tagName}`,
          ...(sourceUrl ? { sourceUrl } : {})
        });
        return;
      }

      const errorEvent = event as ErrorEvent;
      const message =
        sanitizeText(errorEvent.message, 4_096) ?? "未命名 JavaScript 异常";
      const stack = sanitizeText(errorEvent.error?.stack, 32_768);
      const sourceUrl = sanitizeUrl(errorEvent.filename);
      this.onError({
        kind: "js",
        message,
        ...(stack ? { stack } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(Number.isInteger(errorEvent.lineno) && errorEvent.lineno >= 0
          ? { line: errorEvent.lineno }
          : {}),
        ...(Number.isInteger(errorEvent.colno) && errorEvent.colno >= 0
          ? { column: errorEvent.colno }
          : {})
      });
    } catch {
      // 浏览器事件结构异常时静默跳过。
    }
  }

  private handleRejection(event: Event): void {
    try {
      const reason = (event as PromiseRejectionEvent).reason as unknown;
      if (reason instanceof Error) {
        const message =
          sanitizeText(reason.message, 4_096) ?? "未处理的 Promise 异常";
        const stack = sanitizeText(reason.stack, 32_768);
        this.onError({
          kind: "unhandled_rejection",
          message,
          ...(stack ? { stack } : {})
        });
        return;
      }

      // 不序列化任意 rejection 对象，避免上报业务数据或敏感字段。
      this.onError({
        kind: "unhandled_rejection",
        message: "未处理的 Promise 异常"
      });
    } catch {
      // 浏览器事件结构异常时静默跳过。
    }
  }
}
