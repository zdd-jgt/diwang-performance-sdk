import { afterEach, describe, expect, it } from "vitest";

import { handler } from "../src/index.js";

const originalQueueUrl = process.env.INGEST_QUEUE_URL;
const originalAllowedProjectIds = process.env.ALLOWED_PROJECT_IDS;

afterEach(() => {
  if (originalQueueUrl === undefined) {
    delete process.env.INGEST_QUEUE_URL;
  } else {
    process.env.INGEST_QUEUE_URL = originalQueueUrl;
  }
  if (originalAllowedProjectIds === undefined) {
    delete process.env.ALLOWED_PROJECT_IDS;
  } else {
    process.env.ALLOWED_PROJECT_IDS = originalAllowedProjectIds;
  }
});

describe("生产 Lambda 入口", () => {
  it("缺少队列配置时返回 500，且不会尝试访问 AWS", async () => {
    delete process.env.INGEST_QUEUE_URL;

    const response = await handler({
      body: "{}",
      headers: { "content-type": "application/json" },
      requestContext: {
        requestId: "request-1",
        http: { method: "POST" }
      }
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).toContain("SERVER_MISCONFIGURED");
    expect(response.body).not.toContain("INGEST_QUEUE_URL");
  });

  it("缺少项目白名单时返回 500", async () => {
    process.env.INGEST_QUEUE_URL =
      "https://sqs.ap-northeast-1.amazonaws.com/123/ingest";
    delete process.env.ALLOWED_PROJECT_IDS;

    const response = await handler({
      body: "{}",
      headers: { "content-type": "application/json" },
      requestContext: {
        requestId: "request-1",
        http: { method: "POST" }
      }
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).toContain("SERVER_MISCONFIGURED");
    expect(response.body).not.toContain("ALLOWED_PROJECT_IDS");
  });
});
