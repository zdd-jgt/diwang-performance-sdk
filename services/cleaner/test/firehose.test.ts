import { PutRecordBatchCommand } from "@aws-sdk/client-firehose";
import { describe, expect, it, vi } from "vitest";

import { cleanMessage } from "../src/clean.js";
import {
  FirehoseWriter,
  type FirehoseClientLike
} from "../src/firehose.js";
import { ingestMessage } from "./fixtures.js";

describe("FirehoseWriter", () => {
  it("写入换行分隔的 JSON 记录", async () => {
    const send = vi.fn().mockResolvedValue({ FailedPutCount: 0 });
    const writer = createWriter(send);
    const records = cleanMessage(ingestMessage);

    await writer.write(records);

    const command = send.mock.calls[0]?.[0] as PutRecordBatchCommand;
    expect(command.input.DeliveryStreamName).toBe("telemetry-clean");
    expect(command.input.Records).toHaveLength(2);
    const first = Buffer.from(
      command.input.Records?.[0]?.Data ?? []
    ).toString("utf8");
    expect(first.endsWith("\n")).toBe(true);
    expect(JSON.parse(first)).toEqual(records[0]);
  });

  it("只重试 Firehose 返回的失败记录", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        FailedPutCount: 1,
        RequestResponses: [{}, { ErrorCode: "ServiceUnavailable" }]
      })
      .mockResolvedValueOnce({
        FailedPutCount: 0,
        RequestResponses: [{}]
      });
    const writer = createWriter(send);

    await writer.write(cleanMessage(ingestMessage));

    expect(send).toHaveBeenCalledTimes(2);
    const retry = send.mock.calls[1]?.[0] as PutRecordBatchCommand;
    expect(retry.input.Records).toHaveLength(1);
  });

  it("部分失败超过重试次数时抛错", async () => {
    const send = vi.fn().mockResolvedValue({
      FailedPutCount: 1,
      RequestResponses: [{ ErrorCode: "ServiceUnavailable" }]
    });
    const writer = createWriter(send, 2);

    await expect(
      writer.write([cleanMessage(ingestMessage)[0]!])
    ).rejects.toThrow("FIREHOSE_RETRY_EXHAUSTED");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("拒绝缺少失败计数的异常 Firehose 响应", async () => {
    const writer = createWriter(vi.fn().mockResolvedValue({}));
    await expect(
      writer.write([cleanMessage(ingestMessage)[0]!])
    ).rejects.toThrow("FIREHOSE_INVALID_RESPONSE");
  });
});

function createWriter(
  send: FirehoseClientLike["send"],
  maxAttempts = 3
): FirehoseWriter {
  return new FirehoseWriter({
    streamName: "telemetry-clean",
    client: { send },
    maxAttempts
  });
}
