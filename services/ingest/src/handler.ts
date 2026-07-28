import { SendMessageCommand } from "@aws-sdk/client-sqs";
import type { IngestQueueMessage } from "@diwang/contracts";
import { SCHEMA_VERSION } from "@diwang/contracts";
import { telemetryBatchSchema } from "@diwang/contracts/schema";

import { decodeRequestBody } from "./body.js";
import { errorResponse, successResponse } from "./response.js";
import type { HttpApiEvent, HttpApiResponse } from "./types.js";

export interface SQSClientLike {
  send(command: SendMessageCommand): Promise<unknown>;
}

export interface IngestHandlerDependencies {
  queueUrl: string;
  sqsClient: SQSClientLike;
  now?: () => Date;
}

export function createIngestHandler({
  queueUrl,
  sqsClient,
  now = () => new Date()
}: IngestHandlerDependencies): (
  event: HttpApiEvent
) => Promise<HttpApiResponse> {
  if (!queueUrl.trim()) {
    throw new TypeError("queueUrl 不能为空");
  }

  return async (event) => {
    const method = event.requestContext?.http?.method?.toUpperCase();
    if (method !== "POST") {
      return errorResponse(
        405,
        "METHOD_NOT_ALLOWED",
        "仅支持 POST 请求",
        { allow: "POST" }
      );
    }

    const contentType = findHeader(event.headers, "content-type");
    if (!contentType?.toLowerCase().startsWith("application/json")) {
      return errorResponse(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "Content-Type 必须为 application/json"
      );
    }

    if (!event.body) {
      return errorResponse(400, "EMPTY_BODY", "请求体不能为空");
    }

    const decoded = decodeRequestBody(
      event.body,
      event.isBase64Encoded === true
    );
    if (!decoded.ok) {
      return errorResponse(
        decoded.statusCode,
        decoded.code,
        decoded.message
      );
    }

    let unknownBody: unknown;
    try {
      unknownBody = JSON.parse(decoded.value);
    } catch {
      return errorResponse(400, "INVALID_JSON", "请求体不是有效 JSON");
    }

    const parsed = telemetryBatchSchema.safeParse(unknownBody);
    if (!parsed.success) {
      return errorResponse(
        422,
        "INVALID_BATCH",
        "日志批次不符合协议"
      );
    }

    const message: IngestQueueMessage = {
      schemaVersion: SCHEMA_VERSION,
      receivedAt: now().toISOString(),
      requestId: normalizeRequestId(event.requestContext?.requestId),
      batch: parsed.data
    };

    try {
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(message),
          MessageGroupId: parsed.data.events[0]!.projectId,
          MessageDeduplicationId: parsed.data.batchId
        })
      );
    } catch {
      return errorResponse(
        503,
        "QUEUE_UNAVAILABLE",
        "日志队列暂时不可用",
        { "retry-after": "1" }
      );
    }

    return successResponse(
      parsed.data.batchId,
      parsed.data.events.length
    );
  };
}

function findHeader(
  headers: HttpApiEvent["headers"],
  expectedName: string
): string | undefined {
  if (!headers) {
    return undefined;
  }
  const entry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === expectedName
  );
  return entry?.[1];
}

function normalizeRequestId(value: string | undefined): string {
  const requestId = value?.trim().slice(0, 128);
  return requestId || "unknown";
}
