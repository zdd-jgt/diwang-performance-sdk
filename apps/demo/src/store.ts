import type { TelemetryBatch, TelemetryEvent } from "@diwang/contracts";

export interface StoredBatch {
  receivedAt: string;
  batch: TelemetryBatch;
}

export interface DemoSnapshot {
  batchCount: number;
  eventCount: number;
  lastReceivedAt?: string;
  events: TelemetryEvent[];
}

export class DemoStore {
  private readonly batches: StoredBatch[] = [];

  public constructor(
    private readonly maxBatches = 100,
    private readonly now: () => Date = () => new Date()
  ) {
    if (!Number.isInteger(maxBatches) || maxBatches < 1) {
      throw new TypeError("maxBatches 必须是正整数");
    }
  }

  public add(batch: TelemetryBatch): void {
    this.batches.push({
      receivedAt: this.now().toISOString(),
      batch
    });
    if (this.batches.length > this.maxBatches) {
      this.batches.splice(0, this.batches.length - this.maxBatches);
    }
  }

  public clear(): void {
    this.batches.length = 0;
  }

  public snapshot(): DemoSnapshot {
    const events = this.batches
      .flatMap((entry) => entry.batch.events)
      .slice(-100)
      .reverse();
    const lastReceivedAt = this.batches.at(-1)?.receivedAt;
    return {
      batchCount: this.batches.length,
      eventCount: this.batches.reduce(
        (total, entry) => total + entry.batch.events.length,
        0
      ),
      ...(lastReceivedAt ? { lastReceivedAt } : {}),
      events
    };
  }
}
