import { z } from "zod";

import { MAX_BATCH_EVENTS, SCHEMA_VERSION } from "./constants.js";

export { MAX_BATCH_EVENTS, SCHEMA_VERSION } from "./constants.js";

export const metricNameSchema = z.enum([
  "LCP",
  "CLS",
  "INP",
  "FP",
  "FCP",
  "TBT",
  "TTFB",
  "DNS",
  "TCP",
  "DOM_CONTENT_LOADED",
  "LOAD"
]);

export const metricRatingSchema = z.enum([
  "good",
  "needs-improvement",
  "poor"
]);

const projectIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);

const httpUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "URL 仅支持 http/https");

const pageSchema = z
  .object({
    url: httpUrlSchema,
    referrer: httpUrlSchema.optional()
  })
  .strict();

const baseEventFields = {
  schemaVersion: z.literal(SCHEMA_VERSION),
  eventId: z.string().uuid(),
  projectId: projectIdSchema,
  sessionId: z.string().min(1).max(128),
  clientTimestamp: z.number().int().nonnegative(),
  sdkVersion: z.string().min(1).max(32),
  release: z.string().min(1).max(128).optional(),
  traceId: z.string().min(1).max(128).optional(),
  sampleRate: z.number().min(0).max(1).optional(),
  userAgent: z.string().min(1).max(512).optional(),
  page: pageSchema
} as const;

export const metricEventSchema = z
  .object({
    ...baseEventFields,
    eventType: z.literal("metric"),
    metric: z
      .object({
        name: metricNameSchema,
        value: z.number().finite().nonnegative(),
        rating: metricRatingSchema.optional()
      })
      .strict()
  })
  .strict();

export const errorEventSchema = z
  .object({
    ...baseEventFields,
    eventType: z.literal("error"),
    error: z
      .object({
        kind: z.enum(["js", "resource", "unhandled_rejection"]),
        message: z.string().min(1).max(4096),
        stack: z.string().max(32768).optional(),
        sourceUrl: httpUrlSchema.optional(),
        line: z.number().int().nonnegative().optional(),
        column: z.number().int().nonnegative().optional()
      })
      .strict()
  })
  .strict();

export const telemetryEventSchema = z.discriminatedUnion("eventType", [
  metricEventSchema,
  errorEventSchema
]);

export const telemetryBatchSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    batchId: z.string().uuid(),
    events: z.array(telemetryEventSchema).min(1).max(MAX_BATCH_EVENTS)
  })
  .strict()
  .superRefine((batch, context) => {
    const projectId = batch.events[0]?.projectId;
    batch.events.forEach((event, index) => {
      if (event.projectId !== projectId) {
        context.addIssue({
          code: "custom",
          path: ["events", index, "projectId"],
          message: "同一批次只能包含同一 projectId"
        });
      }
    });
  });

export const ingestQueueMessageSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    receivedAt: z.string().datetime({ offset: true }),
    requestId: z.string().min(1).max(128),
    batch: telemetryBatchSchema
  })
  .strict();

const cleanRecordBaseFields = {
  schemaVersion: z.literal(SCHEMA_VERSION),
  receivedAt: z.string().datetime({ offset: true }),
  partitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestId: z.string().min(1).max(128),
  batchId: z.string().uuid(),
  recordId: z.string().uuid(),
  eventId: z.string().uuid(),
  projectId: projectIdSchema,
  sessionId: z.string().min(1).max(128),
  clientTimestamp: z.number().int().nonnegative(),
  sdkVersion: z.string().min(1).max(32),
  release: z.string().min(1).max(128).optional(),
  traceId: z.string().min(1).max(128).optional(),
  sampleRate: z.number().min(0).max(1).optional(),
  pageUrl: httpUrlSchema,
  referrer: httpUrlSchema.optional(),
  browserName: z.string().min(1).max(64).optional(),
  browserVersion: z.string().min(1).max(64).optional(),
  osName: z.string().min(1).max(64).optional(),
  osVersion: z.string().min(1).max(64).optional(),
  platformType: z.string().min(1).max(32).optional()
} as const;

export const cleanMetricRecordSchema = z
  .object({
    ...cleanRecordBaseFields,
    eventType: z.literal("metric"),
    metricName: metricNameSchema,
    metricValue: z.number().finite().nonnegative(),
    metricRating: metricRatingSchema.optional()
  })
  .strict();

export const cleanErrorRecordSchema = z
  .object({
    ...cleanRecordBaseFields,
    eventType: z.literal("error"),
    errorKind: z.enum(["js", "resource", "unhandled_rejection"]),
    errorMessage: z.string().min(1).max(4096),
    errorStack: z.string().max(32768).optional(),
    errorSourceUrl: httpUrlSchema.optional(),
    errorLine: z.number().int().nonnegative().optional(),
    errorColumn: z.number().int().nonnegative().optional()
  })
  .strict();

export const cleanTelemetryRecordSchema = z.discriminatedUnion("eventType", [
  cleanMetricRecordSchema,
  cleanErrorRecordSchema
]);
