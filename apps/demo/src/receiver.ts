import { telemetryBatchSchema } from "@diwang/contracts/schema";
import type { TelemetryBatch } from "@diwang/contracts";

export function parseTelemetryBatch(value: unknown): TelemetryBatch | undefined {
  const result = telemetryBatchSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
