import { SQSClient } from "@aws-sdk/client-sqs";

import { createIngestHandler } from "./handler.js";
import { errorResponse } from "./response.js";
import type { HttpApiEvent, HttpApiResponse } from "./types.js";

export {
  createIngestHandler,
  type IngestHandlerDependencies,
  type SQSClientLike
} from "./handler.js";
export { MAX_REQUEST_BYTES } from "./body.js";
export type { HttpApiEvent, HttpApiResponse } from "./types.js";

let sqsClient: SQSClient | undefined;

export async function handler(
  event: HttpApiEvent
): Promise<HttpApiResponse> {
  const queueUrl = process.env.INGEST_QUEUE_URL?.trim();
  const allowedProjectIds = process.env.ALLOWED_PROJECT_IDS
    ?.split(",")
    .map((projectId) => projectId.trim())
    .filter(Boolean);
  if (!queueUrl || !allowedProjectIds?.length) {
    return errorResponse(
      500,
      "SERVER_MISCONFIGURED",
      "日志接收服务尚未正确配置"
    );
  }

  sqsClient ??= new SQSClient({});
  return createIngestHandler({
    queueUrl,
    allowedProjectIds,
    sqsClient
  })(event);
}
