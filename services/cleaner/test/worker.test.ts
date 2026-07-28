import {
  DeleteMessageCommand,
  ReceiveMessageCommand
} from "@aws-sdk/client-sqs";
import { describe, expect, it, vi } from "vitest";

import type { Logger } from "../src/logger.js";
import { CleanerWorker } from "../src/worker.js";
import { ingestMessage } from "./fixtures.js";

describe("CleanerWorker", () => {
  it("Firehose 写入成功后删除 SQS 消息", async () => {
    const { worker, sqsSend, write } = createWorker({
      body: JSON.stringify(ingestMessage)
    });

    const summary = await worker.runOnce();

    expect(summary).toEqual({ received: 1, processed: 1, failed: 0 });
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0]?.[0]).toHaveLength(2);
    expect(
      sqsSend.mock.calls.some(
        ([command]) => command instanceof DeleteMessageCommand
      )
    ).toBe(true);
  });

  it("协议无效时保留消息以交给 SQS redrive/DLQ", async () => {
    const { worker, sqsSend, write, logger } = createWorker({
      body: JSON.stringify({ token: "不得记录" })
    });

    const summary = await worker.runOnce();

    expect(summary).toEqual({ received: 1, processed: 0, failed: 1 });
    expect(write).not.toHaveBeenCalled();
    expect(
      sqsSend.mock.calls.some(
        ([command]) => command instanceof DeleteMessageCommand
      )
    ).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      "SQS 消息不符合接收协议",
      {
        code: "INVALID_INGEST_MESSAGE",
        messageId: "message-1"
      }
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("不得记录");
  });

  it("Firehose 失败时不删除 SQS 消息", async () => {
    const { worker, sqsSend, write } = createWorker({
      body: JSON.stringify(ingestMessage),
      firehoseError: new Error("credentials=不得记录")
    });

    const summary = await worker.runOnce();

    expect(summary.failed).toBe(1);
    expect(write).toHaveBeenCalledOnce();
    expect(
      sqsSend.mock.calls.some(
        ([command]) => command instanceof DeleteMessageCommand
      )
    ).toBe(false);
  });

  it("队列为空时返回空汇总", async () => {
    const sqsSend = vi.fn().mockResolvedValue({ Messages: [] });
    const worker = new CleanerWorker({
      queueUrl: "https://sqs.example.com/queue",
      sqsClient: {
        receive: sqsSend,
        delete: vi.fn()
      },
      firehoseWriter: { write: vi.fn() },
      waitTimeSeconds: 0
    });

    await expect(worker.runOnce()).resolves.toEqual({
      received: 0,
      processed: 0,
      failed: 0
    });
  });
});

function createWorker({
  body,
  firehoseError
}: {
  body: string;
  firehoseError?: Error;
}): {
  worker: CleanerWorker;
  sqsSend: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  logger: {
    [Key in keyof Logger]: ReturnType<typeof vi.fn>;
  };
} {
  const sqsSend = vi.fn(async (command: unknown) => {
    if (command instanceof ReceiveMessageCommand) {
      return {
        Messages: [
          {
            MessageId: "message-1",
            ReceiptHandle: "receipt-1",
            Body: body
          }
        ]
      };
    }
    return {};
  });
  const write = firehoseError
    ? vi.fn().mockRejectedValue(firehoseError)
    : vi.fn().mockResolvedValue(undefined);
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  const worker = new CleanerWorker({
    queueUrl: "https://sqs.example.com/queue",
    sqsClient: {
      receive: sqsSend,
      delete: sqsSend
    },
    firehoseWriter: {
      write
    },
    waitTimeSeconds: 0,
    logger
  });
  return { worker, sqsSend, write, logger };
}
