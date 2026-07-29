import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type ReceiveMessageCommandOutput,
  type Message
} from "@aws-sdk/client-sqs";
import { ingestQueueMessageSchema } from "@diwang/contracts/schema";

import { cleanMessage } from "./clean.js";
import type { FirehoseWriter } from "./firehose.js";
import { consoleLogger, type Logger } from "./logger.js";

export interface CleanerSQSClient {
  receive(
    command: ReceiveMessageCommand,
    options?: { abortSignal?: AbortSignal }
  ): Promise<Pick<ReceiveMessageCommandOutput, "Messages">>;
  delete(command: DeleteMessageCommand): Promise<unknown>;
}

export interface CleanerWorkerOptions {
  queueUrl: string;
  sqsClient: CleanerSQSClient;
  firehoseWriter: Pick<FirehoseWriter, "write">;
  waitTimeSeconds?: number;
  maxMessages?: number;
  retryDelayMs?: number;
  logger?: Logger;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface CleanerRunSummary {
  received: number;
  processed: number;
  failed: number;
}

export interface CleanerDrainSummary extends CleanerRunSummary {
  polls: number;
  pollFailures: number;
}

export class CleanerWorker {
  private readonly waitTimeSeconds: number;
  private readonly maxMessages: number;
  private readonly retryDelayMs: number;
  private readonly logger: Logger;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  public constructor(private readonly options: CleanerWorkerOptions) {
    if (!options.queueUrl.trim()) {
      throw new TypeError("queueUrl 不能为空");
    }
    this.waitTimeSeconds = options.waitTimeSeconds ?? 20;
    this.maxMessages = options.maxMessages ?? 10;
    this.retryDelayMs = options.retryDelayMs ?? 1_000;
    assertIntegerRange("waitTimeSeconds", this.waitTimeSeconds, 0, 20);
    assertIntegerRange("maxMessages", this.maxMessages, 1, 10);
    assertIntegerRange("retryDelayMs", this.retryDelayMs, 0, 60_000);
    this.logger = options.logger ?? consoleLogger;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  public async runOnce(
    signal?: AbortSignal
  ): Promise<CleanerRunSummary> {
    const response = await this.options.sqsClient.receive(
      new ReceiveMessageCommand({
        QueueUrl: this.options.queueUrl,
        MaxNumberOfMessages: this.maxMessages,
        WaitTimeSeconds: this.waitTimeSeconds
      }),
      signal ? { abortSignal: signal } : undefined
    );
    const messages = response.Messages ?? [];
    const summary: CleanerRunSummary = {
      received: messages.length,
      processed: 0,
      failed: 0
    };

    for (const message of messages) {
      const succeeded = await this.processMessage(message);
      if (succeeded) {
        summary.processed += 1;
      } else {
        summary.failed += 1;
      }
    }
    return summary;
  }

  public async run(signal: AbortSignal): Promise<void> {
    this.logger.info("Cleaner 已启动");
    while (!signal.aborted) {
      try {
        await this.runOnce();
      } catch {
        this.logger.error("Cleaner 轮询失败", {
          code: "POLL_FAILED"
        });
        if (!signal.aborted) {
          await this.sleep(this.retryDelayMs);
        }
      }
    }
    this.logger.info("Cleaner 已停止");
  }

  public async runUntilDrained(
    signal: AbortSignal,
    emptyPollsBeforeExit: number
  ): Promise<CleanerDrainSummary> {
    assertIntegerRange(
      "emptyPollsBeforeExit",
      emptyPollsBeforeExit,
      1,
      10
    );
    const total: CleanerDrainSummary = {
      received: 0,
      processed: 0,
      failed: 0,
      polls: 0,
      pollFailures: 0
    };
    let consecutiveEmptyPolls = 0;

    this.logger.info("Cleaner 排空任务已启动");
    while (!signal.aborted) {
      try {
        const summary = await this.runOnce(signal);
        total.polls += 1;
        total.received += summary.received;
        total.processed += summary.processed;
        total.failed += summary.failed;

        consecutiveEmptyPolls =
          summary.received === 0 ? consecutiveEmptyPolls + 1 : 0;
        if (consecutiveEmptyPolls >= emptyPollsBeforeExit) {
          break;
        }
      } catch {
        if (signal.aborted) {
          break;
        }
        total.pollFailures += 1;
        this.logger.error("Cleaner 轮询失败", {
          code: "POLL_FAILED"
        });
        await this.sleep(this.retryDelayMs);
      }
    }
    this.logger.info("Cleaner 排空任务已结束", {
      received: total.received,
      processed: total.processed,
      failed: total.failed,
      polls: total.polls,
      pollFailures: total.pollFailures
    });
    return total;
  }

  private async processMessage(message: Message): Promise<boolean> {
    const messageId = message.MessageId ?? "unknown";
    if (!message.Body || !message.ReceiptHandle) {
      this.logger.warn("SQS 消息缺少必要字段", {
        code: "INVALID_SQS_MESSAGE",
        messageId
      });
      return false;
    }

    let unknownBody: unknown;
    try {
      unknownBody = JSON.parse(message.Body);
    } catch {
      this.logger.warn("SQS 消息不是有效 JSON", {
        code: "INVALID_JSON",
        messageId
      });
      return false;
    }

    const parsed = ingestQueueMessageSchema.safeParse(unknownBody);
    if (!parsed.success) {
      this.logger.warn("SQS 消息不符合接收协议", {
        code: "INVALID_INGEST_MESSAGE",
        messageId
      });
      return false;
    }

    try {
      const records = cleanMessage(parsed.data);
      await this.options.firehoseWriter.write(records);
      await this.options.sqsClient.delete(
        new DeleteMessageCommand({
          QueueUrl: this.options.queueUrl,
          ReceiptHandle: message.ReceiptHandle
        })
      );
      return true;
    } catch {
      this.logger.error("SQS 消息处理失败", {
        code: "PROCESSING_FAILED",
        messageId
      });
      return false;
    }
  }
}

function assertIntegerRange(
  name: string,
  value: number,
  minimum: number,
  maximum: number
): void {
  if (
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new TypeError(
      `${name} 必须是 ${minimum}-${maximum} 范围内的整数`
    );
  }
}
