import type { z } from "zod";

import type {
  cleanErrorRecordSchema,
  cleanMetricRecordSchema,
  cleanTelemetryRecordSchema,
  errorEventSchema,
  ingestQueueMessageSchema,
  metricEventSchema,
  metricNameSchema,
  metricRatingSchema,
  telemetryBatchSchema,
  telemetryEventSchema
} from "./schema.js";

export type MetricName = z.infer<typeof metricNameSchema>;
export type MetricRating = z.infer<typeof metricRatingSchema>;
export type MetricEvent = z.infer<typeof metricEventSchema>;
export type ErrorEvent = z.infer<typeof errorEventSchema>;
export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;
export type TelemetryBatch = z.infer<typeof telemetryBatchSchema>;
export type IngestQueueMessage = z.infer<typeof ingestQueueMessageSchema>;
export type CleanMetricRecord = z.infer<typeof cleanMetricRecordSchema>;
export type CleanErrorRecord = z.infer<typeof cleanErrorRecordSchema>;
export type CleanTelemetryRecord = z.infer<
  typeof cleanTelemetryRecordSchema
>;
