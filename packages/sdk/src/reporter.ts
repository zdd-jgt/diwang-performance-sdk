import type { TelemetryBatch, TelemetryEvent } from "@diwang/contracts";

import type { NormalizedSDKOptions } from "./config.js";
import type { SDKRuntime } from "./runtime.js";

const SCHEMA_VERSION = 1 as const;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

export const MAX_PAYLOAD_BYTES = 64 * 1024;

interface QueueEntry {
  event: TelemetryEvent;
  attempts: number;
  batchId?: string;
}

interface PendingBatch {
  batchId: string;
  entries: QueueEntry[];
  body: string;
}

export class TelemetryReporter {
  private readonly queue: QueueEntry[] = [];
  private idleHandle: number | undefined;
  private timerHandle: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;
  private isFlushing = false;
  private drainRequested = false;
  private beaconRequested = false;

  public constructor(
    private readonly options: NormalizedSDKOptions,
    private readonly runtime: SDKRuntime
  ) {}

  public enqueue(event: TelemetryEvent, urgent = false): void {
    if (this.destroyed || this.queue.length >= this.options.maxQueueSize) {
      return;
    }

    this.queue.push({ event, attempts: 0 });

    try {
      this.options.onEvent?.(event);
    } catch {
      // 宿主回调异常不得影响 SDK 或页面。
    }

    if (urgent) {
      this.flush(true);
      return;
    }

    if (this.queue.length >= this.options.batchSize) {
      this.flush(false, false);
      return;
    }
    this.schedule();
  }

  public flush(preferBeacon = false, drain = true): void {
    this.cancelScheduled();
    this.drainRequested ||= drain;
    this.beaconRequested ||= preferBeacon;
    if (this.isFlushing || this.queue.length === 0) {
      return;
    }
    void this.processQueue();
  }

  public destroy(flush = true): void {
    if (flush) {
      this.flush(true);
    } else {
      this.cancelScheduled();
    }
    this.destroyed = true;
  }

  private async processQueue(): Promise<void> {
    this.isFlushing = true;
    try {
      while (this.queue.length > 0) {
        const pending = this.nextBatch();
        if (!pending) {
          // 理论上单事件不会超过 64 KiB；异常事件直接丢弃，避免阻塞队列。
          this.queue.shift();
          continue;
        }

        const preferBeacon = this.beaconRequested;
        this.beaconRequested = false;
        const sent = await this.send(pending.body, preferBeacon);
        if (sent) {
          this.queue.splice(0, pending.entries.length);
        } else {
          const attempts = pending.entries[0]!.attempts + 1;
          for (const entry of pending.entries) {
            entry.attempts = attempts;
          }
          if (attempts > MAX_RETRIES) {
            this.queue.splice(0, pending.entries.length);
          } else {
            this.scheduleRetry(attempts);
            break;
          }
        }

        if (!this.drainRequested) {
          break;
        }
      }
    } finally {
      this.isFlushing = false;
      this.drainRequested = false;
      if (this.queue.length > 0) {
        this.schedule();
      }
    }
  }

  private nextBatch(): PendingBatch | undefined {
    const first = this.queue[0];
    if (!first) {
      return undefined;
    }

    if (first.batchId) {
      const entries: QueueEntry[] = [];
      for (const entry of this.queue) {
        if (
          entry.batchId !== first.batchId ||
          entries.length >= this.options.batchSize
        ) {
          break;
        }
        entries.push(entry);
      }
      return this.serializeBatch(first.batchId, entries);
    }

    const batchId = this.runtime.randomUUID();
    const entries: QueueEntry[] = [];
    for (
      let index = 0;
      index < this.queue.length && entries.length < this.options.batchSize;
      index += 1
    ) {
      const entry = this.queue[index]!;
      if (entry.batchId) {
        break;
      }
      const candidate = [...entries, entry];
      const serialized = this.serializeBatch(batchId, candidate);
      if (!serialized) {
        break;
      }
      entries.push(entry);
    }

    if (entries.length === 0) {
      return undefined;
    }
    for (const entry of entries) {
      entry.batchId = batchId;
    }
    return this.serializeBatch(batchId, entries);
  }

  private serializeBatch(
    batchId: string,
    entries: QueueEntry[]
  ): PendingBatch | undefined {
    const batch: TelemetryBatch = {
      schemaVersion: SCHEMA_VERSION,
      batchId,
      events: entries.map((entry) => entry.event)
    };
    try {
      const body = JSON.stringify(batch);
      if (utf8ByteLength(body) > MAX_PAYLOAD_BYTES) {
        return undefined;
      }
      return { batchId, entries, body };
    } catch {
      return undefined;
    }
  }

  private schedule(): void {
    if (
      this.destroyed ||
      this.idleHandle !== undefined ||
      this.timerHandle !== undefined
    ) {
      return;
    }

    if (this.runtime.requestIdleCallback) {
      this.idleHandle = this.runtime.requestIdleCallback(
        () => {
          this.idleHandle = undefined;
          this.flush(false, false);
        },
        { timeout: this.options.flushIntervalMs }
      );
      return;
    }

    this.timerHandle = this.runtime.setTimeout(() => {
      this.timerHandle = undefined;
      this.flush(false, false);
    }, this.options.flushIntervalMs);
  }

  private scheduleRetry(attempts: number): void {
    this.cancelScheduled();
    if (this.destroyed) {
      return;
    }
    const delay = RETRY_BASE_DELAY_MS * 2 ** (attempts - 1);
    this.timerHandle = this.runtime.setTimeout(() => {
      this.timerHandle = undefined;
      this.flush(false, false);
    }, delay);
  }

  private cancelScheduled(): void {
    if (this.idleHandle !== undefined) {
      this.runtime.cancelIdleCallback?.(this.idleHandle);
      this.idleHandle = undefined;
    }
    if (this.timerHandle !== undefined) {
      this.runtime.clearTimeout(this.timerHandle);
      this.timerHandle = undefined;
    }
  }

  private async send(body: string, preferBeacon: boolean): Promise<boolean> {
    if (preferBeacon && this.runtime.sendBeacon) {
      try {
        const accepted = this.runtime.sendBeacon(
          this.options.logUrl,
          new Blob([body], { type: "application/json" })
        );
        if (accepted) {
          return true;
        }
      } catch {
        // Beacon 不可用时降级到 fetch。
      }
    }

    if (!this.runtime.fetch) {
      return false;
    }

    try {
      const response = await this.runtime.fetch(this.options.logUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "omit"
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
