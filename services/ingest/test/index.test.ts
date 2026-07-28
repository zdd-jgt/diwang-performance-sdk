import { afterEach, describe, expect, it } from "vitest";

import { handler } from "../src/index.js";

const originalQueueUrl = process.env.INGEST_QUEUE_URL;

afterEach(() => {
  if (originalQueueUrl === undefined) {
    delete process.env.INGEST_QUEUE_URL;
  } else {
    process.env.INGEST_QUEUE_URL = originalQueueUrl;
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
});
