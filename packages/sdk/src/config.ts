import type { SDKOptions } from "./types.js";

const MAX_BATCH_EVENTS = 50;
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export interface NormalizedSDKOptions {
  logUrl: string;
  projectId: string;
  release?: string;
  sampleRate: number;
  captureError: boolean;
  batchSize: number;
  flushIntervalMs: number;
  maxQueueSize: number;
  maxEventsPerMinute: number;
  onEvent?: SDKOptions["onEvent"];
}

export function normalizeOptions(options: SDKOptions): NormalizedSDKOptions {
  if (!options || typeof options !== "object") {
    throw new TypeError("[Diwang SDK] 初始化参数不能为空");
  }

  const logUrl = normalizeLogUrl(options.logUrl);
  const projectId = options.projectId?.trim();
  if (
    !projectId ||
    projectId.length > 64 ||
    !PROJECT_ID_PATTERN.test(projectId)
  ) {
    throw new TypeError(
      "[Diwang SDK] projectId 必须为 1-64 位字母、数字、下划线或短横线"
    );
  }

  const sampleRate = options.sampleRate ?? 1;
  assertNumberRange("sampleRate", sampleRate, 0, 1);

  const batchSize = options.batchSize ?? 20;
  assertIntegerRange("batchSize", batchSize, 1, MAX_BATCH_EVENTS);

  const flushIntervalMs = options.flushIntervalMs ?? 5_000;
  assertIntegerRange("flushIntervalMs", flushIntervalMs, 100, 60_000);

  const maxQueueSize = options.maxQueueSize ?? 200;
  assertIntegerRange("maxQueueSize", maxQueueSize, batchSize, 10_000);

  const maxEventsPerMinute = options.maxEventsPerMinute ?? 50;
  assertIntegerRange("maxEventsPerMinute", maxEventsPerMinute, 1, 10_000);

  const release = options.release?.trim();
  if (release && release.length > 128) {
    throw new TypeError("[Diwang SDK] release 不能超过 128 个字符");
  }

  return {
    logUrl,
    projectId,
    ...(release ? { release } : {}),
    sampleRate,
    captureError: options.captureError ?? true,
    batchSize,
    flushIntervalMs,
    maxQueueSize,
    maxEventsPerMinute,
    ...(options.onEvent ? { onEvent: options.onEvent } : {})
  };
}

function normalizeLogUrl(value: string): string {
  if (!value) {
    throw new TypeError("[Diwang SDK] logUrl 为必填项");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("[Diwang SDK] logUrl 必须是有效 URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("[Diwang SDK] logUrl 仅支持 http/https");
  }

  url.username = "";
  url.password = "";
  url.hash = "";
  return url.toString();
}

function assertNumberRange(
  name: string,
  value: number,
  minimum: number,
  maximum: number
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new TypeError(
      `[Diwang SDK] ${name} 必须在 ${minimum}-${maximum} 范围内`
    );
  }
}

function assertIntegerRange(
  name: string,
  value: number,
  minimum: number,
  maximum: number
): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(`[Diwang SDK] ${name} 必须是整数`);
  }
  assertNumberRange(name, value, minimum, maximum);
}
