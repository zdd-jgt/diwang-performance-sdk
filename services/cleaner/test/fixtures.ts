import type { IngestQueueMessage } from "@diwang/contracts";

export const ingestMessage: IngestQueueMessage = {
  schemaVersion: 1,
  receivedAt: "2026-07-28T06:00:00.000Z",
  requestId: "request-1",
  batch: {
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
        release: "2026.07.28",
        sampleRate: 0.5,
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/124.0.0.0 Safari/537.36",
        page: {
          url: "https://user:pass@example.com/products?token=secret#detail",
          referrer: "https://search.example.com/?q=private"
        },
        eventType: "metric",
        metric: {
          name: "LCP",
          value: 2_600,
          rating: "poor"
        }
      },
      {
        schemaVersion: 1,
        eventId: "8c108ec1-44e2-4266-a53d-c1ef13b469c4",
        projectId: "demo-project",
        sessionId: "session-1",
        clientTimestamp: 1_722_144_000_001,
        sdkVersion: "0.1.0",
        page: {
          url: "https://example.com/products"
        },
        eventType: "error",
        error: {
          kind: "js",
          message: "token=secret 请求失败",
          stack: "Error: password=hunter2\n at app.js:1:1",
          sourceUrl:
            "https://example.com/app.js?authorization=secret#source",
          line: 1,
          column: 2
        }
      }
    ]
  }
};
