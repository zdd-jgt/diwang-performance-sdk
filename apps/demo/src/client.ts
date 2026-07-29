import { init } from "@diwang/sdk";
import type { TelemetryEvent } from "@diwang/contracts";
import { telemetryEventSchema } from "@diwang/contracts/schema";

interface DemoState {
  batchCount: number;
  eventCount: number;
  lastReceivedAt?: string;
  events: TelemetryEvent[];
}

const sdkStatus = requiredElement<HTMLElement>("#sdk-status");
const receiverStatus = requiredElement<HTMLElement>("#receiver-status");
const localCount = requiredElement<HTMLElement>("#local-count");
const batchCount = requiredElement<HTMLElement>("#batch-count");
const eventCount = requiredElement<HTMLElement>("#event-count");
const lastReceived = requiredElement<HTMLElement>("#last-received");
const eventList = requiredElement<HTMLElement>("#event-list");
const rawOutput = requiredElement<HTMLElement>("#raw-output");
const actionMessage = requiredElement<HTMLElement>("#action-message");

let localEvents = 0;
let latestLocalEvent: TelemetryEvent | undefined;

const sdk = init({
  logUrl: `${location.origin}/collect`,
  projectId: "diwang-demo",
  release: "local-demo",
  sampleRate: 1,
  batchSize: 1,
  flushIntervalMs: 500,
  onEvent: (event) => {
    const parsed = telemetryEventSchema.safeParse(event);
    if (!parsed.success) {
      return;
    }
    localEvents += 1;
    latestLocalEvent = parsed.data;
    renderLocalState();
  }
});

sdkStatus.textContent = sdk.isStarted() ? "运行中" : "未启动";
sdkStatus.dataset.state = sdk.isStarted() ? "ok" : "error";

document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    void runAction(button.dataset.action ?? "");
  });
});

window.addEventListener("pagehide", () => sdk.stop(), { once: true });

renderLocalState();
void refreshState();
const refreshTimer = window.setInterval(() => {
  void refreshState();
}, 1_000);
window.addEventListener(
  "pagehide",
  () => window.clearInterval(refreshTimer),
  { once: true }
);

async function runAction(action: string): Promise<void> {
  switch (action) {
    case "js-error":
      window.dispatchEvent(
        new ErrorEvent("error", {
          message: "Authorization: Bearer demo-secret",
          filename: `${location.origin}/demo-source.js?token=demo-secret`,
          lineno: 42,
          colno: 7,
          error: new Error("Authorization: Bearer demo-secret")
        })
      );
      showAction("已生成 JS 错误；敏感令牌应显示为 [REDACTED]。");
      break;
    case "promise-error":
      dispatchPromiseRejection();
      showAction("已生成未处理 Promise 异常。");
      break;
    case "resource-error":
      triggerResourceError();
      showAction("已请求不存在的图片，等待资源错误被采集。");
      break;
    case "flush":
      sdk.flush();
      showAction("已要求 SDK 立即刷新内存队列。");
      break;
    case "clear":
      await fetch("/api/state", { method: "DELETE" });
      showAction("本地接收端数据已清空。");
      break;
    default:
      return;
  }
  sdk.flush();
  await sleep(200);
  await refreshState();
}

function dispatchPromiseRejection(): void {
  const reason = new Error("Demo Promise rejection");
  if (typeof PromiseRejectionEvent === "function") {
    window.dispatchEvent(
      new PromiseRejectionEvent("unhandledrejection", {
        promise: new Promise(() => undefined),
        reason
      })
    );
    return;
  }
  const event = new Event("unhandledrejection");
  Object.defineProperty(event, "reason", { value: reason });
  window.dispatchEvent(event);
}

function triggerResourceError(): void {
  const image = document.createElement("img");
  image.alt = "";
  image.hidden = true;
  image.src = `${location.origin}/missing-demo-image.png?token=demo-secret`;
  image.addEventListener("error", () => image.remove(), { once: true });
  document.body.append(image);
}

async function refreshState(): Promise<void> {
  try {
    const response = await fetch("/api/state", {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      throw new Error("receiver unavailable");
    }
    const state = (await response.json()) as DemoState;
    receiverStatus.textContent = "本地在线";
    receiverStatus.dataset.state = "ok";
    renderServerState(state);
  } catch {
    receiverStatus.textContent = "连接失败";
    receiverStatus.dataset.state = "error";
  }
}

function renderLocalState(): void {
  localCount.textContent = String(localEvents);
  if (latestLocalEvent) {
    rawOutput.textContent = JSON.stringify(latestLocalEvent, null, 2);
  }
}

function renderServerState(state: DemoState): void {
  batchCount.textContent = String(state.batchCount);
  eventCount.textContent = String(state.eventCount);
  lastReceived.textContent = state.lastReceivedAt
    ? formatTime(state.lastReceivedAt)
    : "等待事件";

  eventList.replaceChildren();
  if (state.events.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "还没有收到事件，点击上方按钮开始演示。";
    eventList.append(empty);
    return;
  }

  for (const event of state.events.slice(0, 12)) {
    const item = document.createElement("li");
    item.className = "event-item";

    const badge = document.createElement("span");
    badge.className = `event-badge ${event.eventType}`;
    badge.textContent = event.eventType === "metric" ? "指标" : "错误";

    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent =
      event.eventType === "metric"
        ? `${event.metric.name} · ${formatMetric(event.metric.value)}`
        : `${errorKindLabel(event.error.kind)} · ${event.error.message}`;
    const meta = document.createElement("small");
    meta.textContent = `${formatTime(event.clientTimestamp)} · ${event.projectId}`;
    content.append(title, meta);

    item.append(badge, content);
    eventList.append(item);
  }
}

function errorKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    js: "JS",
    resource: "资源",
    unhandled_rejection: "Promise"
  };
  return labels[kind] ?? kind;
}

function formatMetric(value: number): string {
  return Number.isInteger(value) ? `${value} ms` : value.toFixed(3);
}

function formatTime(value: string | number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function showAction(message: string): void {
  actionMessage.textContent = message;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`缺少页面元素: ${selector}`);
  }
  return element;
}
