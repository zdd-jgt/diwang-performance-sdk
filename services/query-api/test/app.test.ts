import { describe, expect, it, vi } from "vitest";

import {
  AthenaQueryFailure,
  type AthenaTable
} from "../src/athena-client.js";
import {
  DashboardQueryService,
  routeDashboardRequest,
  type DashboardExecutor
} from "../src/app.js";
import { readQueryApiConfig } from "../src/config.js";

const emptyTable: AthenaTable = { columns: [], rows: [] };

function createService(executor?: DashboardExecutor) {
  return new DashboardQueryService(
    readQueryApiConfig({}),
    executor ?? { execute: vi.fn(async () => emptyTable) }
  );
}

describe("地网 Query API 路由", () => {
  it("项目列表不触发 Athena 查询", async () => {
    const execute = vi.fn(async () => emptyTable);
    const result = await routeDashboardRequest(
      createService({ execute }),
      "GET",
      "/api/dashboard/projects"
    );

    expect(result).toEqual({
      status: 200,
      payload: [
        {
          id: "hono-sam-aws-learning",
          name: "Hono SAM 学习站"
        }
      ]
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["/api/dashboard/snapshot", 400],
    ["/api/dashboard/snapshot?projectId=hono-sam-aws-learning&range=year", 400],
    ["/api/dashboard/snapshot?projectId=unknown&range=7d", 404]
  ])("拒绝无效请求 %s", async (url, status) => {
    const execute = vi.fn(async () => emptyTable);
    const result = await routeDashboardRequest(
      createService({ execute }),
      "GET",
      url
    );

    expect(result?.status).toBe(status);
    expect(execute).not.toHaveBeenCalled();
  });

  it("并行执行五类聚合并返回 DashboardSnapshot", async () => {
    const execute = vi.fn(async (sql: string): Promise<AthenaTable> => {
      if (sql.includes("total_events")) {
        return {
          columns: [],
          rows: [
            {
              total_events: "2",
              sessions: "1",
              errors: "0",
              latest_received_at: new Date().toISOString()
            }
          ]
        };
      }
      return emptyTable;
    });
    const result = await routeDashboardRequest(
      createService({ execute }),
      "GET",
      "/api/dashboard/snapshot?projectId=hono-sam-aws-learning&range=7d"
    );

    expect(result?.status).toBe(200);
    expect(result?.payload).toMatchObject({
      granularity: "day",
      overview: {
        totalEvents: 2,
        sessions: 1,
        errors: 0,
        errorRate: 0
      }
    });
    expect(execute).toHaveBeenCalledTimes(5);
  });

  it.each([
    [new AthenaQueryFailure("timeout"), 504, "Athena 查询超时，请稍后重试"],
    [new AthenaQueryFailure("failed"), 503, "Athena 查询执行失败"],
    [
      new Error("s3://private-result raw SELECT secret"),
      500,
      "地网查询服务暂时不可用，请稍后重试"
    ]
  ])("映射安全错误 %#", async (error, status, message) => {
    const result = await routeDashboardRequest(
      createService({
        execute: vi.fn(async () => {
          throw error;
        })
      }),
      "GET",
      "/api/dashboard/snapshot?projectId=hono-sam-aws-learning&range=7d"
    );

    expect(result).toEqual({ status, payload: { message } });
    expect(JSON.stringify(result)).not.toContain("private-result");
    expect(JSON.stringify(result)).not.toContain("SELECT");
  });

  it("提供本地健康检查并忽略未知路由", async () => {
    await expect(
      routeDashboardRequest(createService(), "GET", "/health")
    ).resolves.toEqual({ status: 200, payload: { status: "ok" } });
    await expect(
      routeDashboardRequest(createService(), "GET", "/unknown")
    ).resolves.toBeNull();
  });
});
