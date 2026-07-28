import {
  PutRecordBatchCommand,
  type PutRecordBatchCommandOutput
} from "@aws-sdk/client-firehose";
import type { CleanTelemetryRecord } from "@diwang/contracts";

const MAX_FIREHOSE_RECORDS = 500;

export interface FirehoseClientLike {
  send(
    command: PutRecordBatchCommand
  ): Promise<
    Pick<PutRecordBatchCommandOutput, "FailedPutCount" | "RequestResponses">
  >;
}

export interface FirehoseWriterOptions {
  streamName: string;
  client: FirehoseClientLike;
  maxAttempts?: number;
}

export class FirehoseWriter {
  private readonly maxAttempts: number;

  public constructor(private readonly options: FirehoseWriterOptions) {
    if (!options.streamName.trim()) {
      throw new TypeError("streamName 不能为空");
    }
    this.maxAttempts = options.maxAttempts ?? 3;
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new TypeError("maxAttempts 必须是正整数");
    }
  }

  public async write(records: CleanTelemetryRecord[]): Promise<void> {
    for (let index = 0; index < records.length; index += MAX_FIREHOSE_RECORDS) {
      await this.writeChunk(records.slice(index, index + MAX_FIREHOSE_RECORDS));
    }
  }

  private async writeChunk(
    records: CleanTelemetryRecord[]
  ): Promise<void> {
    let pending = records.map((record) => ({
      Data: Buffer.from(`${JSON.stringify(record)}\n`, "utf8")
    }));

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const response = await this.options.client.send(
        new PutRecordBatchCommand({
          DeliveryStreamName: this.options.streamName,
          Records: pending
        })
      );

      if (response.FailedPutCount === 0) {
        return;
      }
      if (response.FailedPutCount === undefined) {
        throw new Error("FIREHOSE_INVALID_RESPONSE");
      }

      const failed = pending.filter(
        (_record, index) => response.RequestResponses?.[index]?.ErrorCode
      );
      if (failed.length === 0) {
        throw new Error("FIREHOSE_PARTIAL_FAILURE");
      }
      pending = failed;
    }

    throw new Error("FIREHOSE_RETRY_EXHAUSTED");
  }
}
