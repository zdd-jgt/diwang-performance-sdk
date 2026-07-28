import type {
  CleanTelemetryRecord,
  IngestQueueMessage,
  MetricName,
  MetricRating,
  TelemetryEvent
} from "@diwang/contracts";
import { SCHEMA_VERSION } from "@diwang/contracts";
import { cleanTelemetryRecordSchema } from "@diwang/contracts/schema";

import { sanitizeText, sanitizeUrl } from "./sanitize.js";
import { parseUserAgent } from "./user-agent.js";

export function cleanMessage(
  message: IngestQueueMessage
): CleanTelemetryRecord[] {
  return message.batch.events.map((event) => {
    const record = cleanEvent(message, event);
    return cleanTelemetryRecordSchema.parse(record);
  });
}

function cleanEvent(
  message: IngestQueueMessage,
  event: TelemetryEvent
): CleanTelemetryRecord {
  const pageUrl = sanitizeUrl(event.page.url);
  if (!pageUrl) {
    throw new TypeError("页面 URL 无法清洗");
  }
  const referrer = sanitizeUrl(event.page.referrer);
  const parsedUserAgent = parseUserAgent(event.userAgent);

  const base = {
    schemaVersion: SCHEMA_VERSION,
    receivedAt: message.receivedAt,
    partitionDate: message.receivedAt.slice(0, 10),
    requestId: message.requestId,
    batchId: message.batch.batchId,
    recordId: event.eventId,
    eventId: event.eventId,
    projectId: event.projectId,
    sessionId: event.sessionId,
    clientTimestamp: event.clientTimestamp,
    sdkVersion: event.sdkVersion,
    ...(event.release ? { release: event.release } : {}),
    ...(event.traceId ? { traceId: event.traceId } : {}),
    ...(event.sampleRate !== undefined
      ? { sampleRate: event.sampleRate }
      : {}),
    pageUrl,
    ...(referrer ? { referrer } : {}),
    ...parsedUserAgent
  };

  if (event.eventType === "metric") {
    const rating = rateMetric(event.metric.name, event.metric.value);
    return {
      ...base,
      eventType: "metric",
      metricName: event.metric.name,
      metricValue: event.metric.value,
      ...(rating ? { metricRating: rating } : {})
    };
  }

  const errorMessage =
    sanitizeText(event.error.message, 4_096) ?? "已清理的错误信息";
  const errorStack = sanitizeText(event.error.stack, 32_768);
  const errorSourceUrl = sanitizeUrl(event.error.sourceUrl);
  return {
    ...base,
    eventType: "error",
    errorKind: event.error.kind,
    errorMessage,
    ...(errorStack ? { errorStack } : {}),
    ...(errorSourceUrl ? { errorSourceUrl } : {}),
    ...(event.error.line !== undefined
      ? { errorLine: event.error.line }
      : {}),
    ...(event.error.column !== undefined
      ? { errorColumn: event.error.column }
      : {})
  };
}

export function rateMetric(
  name: MetricName,
  value: number
): MetricRating | undefined {
  if (name === "LCP") {
    return value <= 2_500
      ? "good"
      : value <= 4_000
        ? "needs-improvement"
        : "poor";
  }
  if (name === "CLS") {
    return value <= 0.1
      ? "good"
      : value <= 0.25
        ? "needs-improvement"
        : "poor";
  }
  if (name === "INP") {
    return value <= 200
      ? "good"
      : value <= 500
        ? "needs-improvement"
        : "poor";
  }
  return undefined;
}
