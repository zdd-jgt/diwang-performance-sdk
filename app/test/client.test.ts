import type { DashboardSnapshot } from "@diwang/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchDashboardSnapshot } from "../src/api/client";

const EMPTY_SNAPSHOT: DashboardSnapshot = {
  generatedAt: "2026-07-29T06:00:00.000Z",
  freshnessMinutes: 0,
  granularity: "day",
  overview: {
    totalEvents: 0,
    sessions: 0,
    errors: 0,
    errorRate: 0
  },
  vitals: [],
  slowPages: [],
  errorBreakdown: [],
  errors: []
};

describe("Dashboard API 客户端", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("真实数据模式不向 Query API 发送 Mock 场景", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(EMPTY_SNAPSHOT), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchDashboardSnapshot({
      projectId: "hono-sam-aws-learning",
      range: "7d",
      scenario: "error"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/snapshot?projectId=hono-sam-aws-learning&range=7d",
      { signal: undefined }
    );
  });
});
