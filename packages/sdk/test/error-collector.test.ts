import { describe, expect, it, vi } from "vitest";

import {
  ErrorCollector,
  type CapturedError
} from "../src/error/collector.js";
import type { SDKRuntime } from "../src/runtime.js";

describe("ErrorCollector", () => {
  it("使用事件监听捕获并脱敏 JS 异常", () => {
    const { runtime, listeners } = createRuntime();
    const onError = vi.fn<(error: CapturedError) => void>();
    const collector = new ErrorCollector(runtime, onError);
    collector.start();

    listeners.get("error")?.(
      Object.assign(new Event("error"), {
        message: "token=secret 请求失败",
        filename: "https://example.com/app.js?authorization=secret",
        lineno: 12,
        colno: 3,
        error: new Error("password=hunter2")
      })
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "js",
        message: "token=[REDACTED] 请求失败",
        sourceUrl: "https://example.com/app.js",
        line: 12,
        column: 3
      })
    );
  });

  it("不序列化任意 Promise rejection 对象", () => {
    const { runtime, listeners } = createRuntime();
    const onError = vi.fn<(error: CapturedError) => void>();
    const collector = new ErrorCollector(runtime, onError);
    collector.start();

    listeners.get("unhandledrejection")?.(
      Object.assign(new Event("unhandledrejection"), {
        reason: { password: "不得上报", businessData: "不得上报" }
      })
    );

    expect(onError).toHaveBeenCalledWith({
      kind: "unhandled_rejection",
      message: "未处理的 Promise 异常"
    });
  });

  it("stop 后移除监听器", () => {
    const { runtime, listeners } = createRuntime();
    const collector = new ErrorCollector(runtime, vi.fn());
    collector.start();
    collector.stop();

    expect(listeners.size).toBe(0);
  });
});

function createRuntime(): {
  runtime: SDKRuntime;
  listeners: Map<string, EventListener>;
} {
  const listeners = new Map<string, EventListener>();
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
    listeners,
    runtime: {
      document,
      location: new URL("https://example.com/"),
      performance: {
        getEntriesByType: () => []
      },
      random: () => 0,
      randomUUID: () => "00000000-0000-4000-8000-000000000000",
      setTimeout,
      clearTimeout,
      addEventListener: (type, listener) => {
        listeners.set(type, listener);
      },
      removeEventListener: (type) => {
        listeners.delete(type);
      }
    }
  };
}
