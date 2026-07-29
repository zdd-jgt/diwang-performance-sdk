import type { SendMessageCommand } from "@aws-sdk/client-sqs";
import type { TelemetryBatch } from "@diwang/contracts";
import { describe, expect, it, vi } from "vitest";

import { MAX_REQUEST_BYTES } from "../src/body.js";
import {
  createIngestHandler,
  type SQSClientLike
} from "../src/handler.js";
import type {
  ApiErrorBody,
  ApiSuccessBody,
  HttpApiEvent
} from "../src/types.js";

const validBatch: TelemetryBatch = {
  schemaVersion: 1,
  batchId: "df3e4e46-cc68-4923-af39-a684909f35a7",
  events: [
    {
      schemaVersion: 1,
      eventId: "a30bbfac-9f31-4f8b-bd1f-01e03ac94f8f",
      projectId: "demo-project",
      sessionId: "session-1",
      clientTimestamp: 1_722_144_000_000,
      sdkVersion: "0.1.0",
      page: {
        url: "https://example.com/products"
      },
      eventType: "metric",
      metric: {
        name: "INP",
        value: 180,
        rating: "good"
      }
    }
  ]
};

describe("createIngestHandler", () => {
  it("校验有效批次并写入包含服务端时间的 SQS 消息", async () => {
    const send = vi.fn().mockResolvedValue({});
    const handler = createHandler(send);

    const response = await handler(createEvent(JSON.stringify(validBatch)));

    expect(response.statusCode).toBe(202);
    expect(JSON.parse(response.body) as ApiSuccessBody).toEqual({
      success: true,
      data: {
        batchId: validBatch.batchId,
        acceptedEvents: 1
      }
    });
    expect(send).toHaveBeenCalledOnce();

    const command = send.mock.calls[0]?.[0] as SendMessageCommand;
    const message = JSON.parse(String(command.input.MessageBody)) as {
      receivedAt: string;
      requestId: string;
      batch: TelemetryBatch;
      sourceIp?: string;
    };
    expect(command.input.QueueUrl).toBe(
      "https://sqs.ap-northeast-1.amazonaws.com/123/ingest"
    );
    expect(command.input.MessageGroupId).toBe("demo-project");
    expect(command.input.MessageDeduplicationId).toBe(validBatch.batchId);
    expect(message).toEqual({
      schemaVersion: 1,
      receivedAt: "2026-07-28T06:00:00.000Z",
      requestId: "request-1",
      batch: validBatch
    });
    expect(message.sourceIp).toBeUndefined();
  });

  it("支持 API Gateway 的 Base64 请求体", async () => {
    const send = vi.fn().mockResolvedValue({});
    const handler = createHandler(send);
    const response = await handler({
      ...createEvent(Buffer.from(JSON.stringify(validBatch)).toString("base64")),
      isBase64Encoded: true
    });

    expect(response.statusCode).toBe(202);
    expect(send).toHaveBeenCalledOnce();
  });

  it.each([
    [
      {
        ...createEvent(JSON.stringify(validBatch)),
        requestContext: {
          requestId: "request-1",
          http: { method: "GET" }
        }
      },
      405,
      "METHOD_NOT_ALLOWED"
    ],
    [
      {
        ...createEvent(JSON.stringify(validBatch)),
        headers: { "content-type": "text/plain" }
      },
      415,
      "UNSUPPORTED_MEDIA_TYPE"
    ],
    [createEvent(null), 400, "EMPTY_BODY"],
    [createEvent("{"), 400, "INVALID_JSON"],
    [createEvent(JSON.stringify({ ...validBatch, extra: true })), 422, "INVALID_BATCH"],
    [createEvent("x".repeat(MAX_REQUEST_BYTES + 1)), 413, "PAYLOAD_TOO_LARGE"],
    [
      {
        ...createEvent("not-base64"),
        isBase64Encoded: true
      },
      400,
      "INVALID_BASE64"
    ]
  ] satisfies Array<[HttpApiEvent, number, string]>)(
    "拒绝非法请求 %#",
    async (event, statusCode, errorCode) => {
      const send = vi.fn().mockResolvedValue({});
      const response = await createHandler(send)(event);

      expect(response.statusCode).toBe(statusCode);
      expect((JSON.parse(response.body) as ApiErrorBody).error.code).toBe(
        errorCode
      );
      expect(send).not.toHaveBeenCalled();
    }
  );

  it("SQS 失败时返回可重试响应且不泄露内部错误", async () => {
    const send = vi.fn().mockRejectedValue(
      new Error("credentials token=不得返回")
    );
    const response = await createHandler(send)(
      createEvent(JSON.stringify(validBatch))
    );

    expect(response.statusCode).toBe(503);
    expect(response.headers["retry-after"]).toBe("1");
    expect(JSON.parse(response.body) as ApiErrorBody).toEqual({
      success: false,
      error: {
        code: "QUEUE_UNAVAILABLE",
        message: "日志队列暂时不可用"
      }
    });
    expect(response.body).not.toContain("credentials");
    expect(response.body).not.toContain("token");
  });

  it("拒绝未列入白名单的项目", async () => {
    const send = vi.fn().mockResolvedValue({});
    const response = await createIngestHandler({
      queueUrl:
        "https://sqs.ap-northeast-1.amazonaws.com/123/ingest",
      allowedProjectIds: ["another-project"],
      sqsClient: { send } as SQSClientLike
    })(createEvent(JSON.stringify(validBatch)));

    expect(response.statusCode).toBe(403);
    expect((JSON.parse(response.body) as ApiErrorBody).error.code).toBe(
      "PROJECT_NOT_ALLOWED"
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("构造时拒绝空队列地址或空项目白名单", () => {
    expect(() =>
      createIngestHandler({
        queueUrl: " ",
        allowedProjectIds: ["demo-project"],
        sqsClient: { send: vi.fn() }
      })
    ).toThrow("queueUrl");
    expect(() =>
      createIngestHandler({
        queueUrl:
          "https://sqs.ap-northeast-1.amazonaws.com/123/ingest",
        allowedProjectIds: [],
        sqsClient: { send: vi.fn() }
      })
    ).toThrow("allowedProjectIds");
  });
});

function createEvent(body: string | null): HttpApiEvent {
  return {
    body,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    requestContext: {
      requestId: "request-1",
      http: {
        method: "POST"
      }
    }
  };
}

function createHandler(
  send: ReturnType<typeof vi.fn>
): ReturnType<typeof createIngestHandler> {
  return createIngestHandler({
    queueUrl:
      "https://sqs.ap-northeast-1.amazonaws.com/123/ingest",
    allowedProjectIds: ["demo-project"],
    sqsClient: { send } as SQSClientLike,
    now: () => new Date("2026-07-28T06:00:00.000Z")
  });
}
