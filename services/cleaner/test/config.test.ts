import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("读取必要配置并应用轮询默认值", () => {
    expect(
      loadConfig({
        INGEST_QUEUE_URL: " https://sqs.example.com/queue ",
        FIREHOSE_STREAM_NAME: " telemetry-clean "
      })
    ).toEqual({
      queueUrl: "https://sqs.example.com/queue",
      firehoseStreamName: "telemetry-clean",
      waitTimeSeconds: 20,
      maxMessages: 10
    });
  });

  it("拒绝缺失或越界配置", () => {
    expect(() => loadConfig({})).toThrow("配置不完整");
    expect(() =>
      loadConfig({
        INGEST_QUEUE_URL: "https://sqs.example.com/queue",
        FIREHOSE_STREAM_NAME: "telemetry-clean",
        SQS_WAIT_TIME_SECONDS: "21"
      })
    ).toThrow("数值环境变量无效");
  });
});
