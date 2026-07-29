import { describe, expect, it } from "vitest";

import {
  AthenaQueryExecutor,
  AthenaQueryFailure,
  type AthenaGateway,
  type AthenaQueryState,
  type AthenaResultPage,
  type AthenaStartInput
} from "../src/athena-client.js";
import { readQueryApiConfig } from "../src/config.js";

class FakeGateway implements AthenaGateway {
  public readonly starts: AthenaStartInput[] = [];
  public readonly stops: string[] = [];
  public readonly resultTokens: Array<string | undefined> = [];

  public constructor(
    private readonly states: AthenaQueryState[],
    private readonly pages: AthenaResultPage[] = []
  ) {}

  public async start(input: AthenaStartInput): Promise<string> {
    this.starts.push(input);
    return "query-1";
  }

  public async state(): Promise<AthenaQueryState> {
    return this.states.shift() ?? "RUNNING";
  }

  public async results(
    _queryExecutionId: string,
    nextToken?: string
  ): Promise<AthenaResultPage> {
    this.resultTokens.push(nextToken);
    const page = this.pages.shift();
    if (!page) throw new Error("missing page");
    return page;
  }

  public async stop(queryExecutionId: string): Promise<void> {
    this.stops.push(queryExecutionId);
  }
}

const config = readQueryApiConfig({});

describe("Athena 查询执行器", () => {
  it("使用指定 Database/WorkGroup 并合并分页结果", async () => {
    const gateway = new FakeGateway(
      ["QUEUED", "RUNNING", "SUCCEEDED"],
      [
        {
          columns: ["metric", "value"],
          rows: [
            ["metric", "value"],
            ["LCP", "2400"]
          ],
          nextToken: "next"
        },
        {
          columns: ["metric", "value"],
          rows: [["CLS", null]]
        }
      ]
    );
    let now = 0;
    const executor = new AthenaQueryExecutor(gateway, config, {
      now: () => now,
      delay: async (milliseconds) => {
        now += milliseconds;
      }
    });

    await expect(executor.execute("SELECT safe")).resolves.toEqual({
      columns: ["metric", "value"],
      rows: [
        { metric: "LCP", value: "2400" },
        { metric: "CLS", value: null }
      ]
    });
    expect(gateway.starts).toEqual([
      {
        sql: "SELECT safe",
        database: "diwang_performance_production",
        workgroup: "diwang-performance-production-telemetry"
      }
    ]);
    expect(gateway.resultTokens).toEqual([undefined, "next"]);
  });

  it.each([
    ["FAILED", "failed"],
    ["CANCELLED", "cancelled"]
  ] as const)("将 %s 转换为安全错误", async (state, kind) => {
    const gateway = new FakeGateway([state]);
    const executor = new AthenaQueryExecutor(gateway, config);

    await expect(executor.execute("SELECT safe")).rejects.toMatchObject({
      name: "AthenaQueryFailure",
      kind
    });
  });

  it("超时后停止查询", async () => {
    const gateway = new FakeGateway([]);
    let now = 0;
    const executor = new AthenaQueryExecutor(
      gateway,
      { ...config, queryTimeoutMs: 1_000, pollIntervalMs: 500 },
      {
        now: () => now,
        delay: async (milliseconds) => {
          now += milliseconds;
        }
      }
    );

    await expect(executor.execute("SELECT safe")).rejects.toEqual(
      new AthenaQueryFailure("timeout")
    );
    expect(gateway.stops).toEqual(["query-1"]);
  });

  it("不向上抛出 AWS 原始错误", async () => {
    const gateway: AthenaGateway = {
      start: async () => {
        throw new Error("s3://private-bucket secret sql");
      },
      state: async () => "FAILED",
      results: async () => ({ columns: [], rows: [] }),
      stop: async () => undefined
    };
    const executor = new AthenaQueryExecutor(gateway, config);

    await expect(executor.execute("SELECT private")).rejects.toEqual(
      new AthenaQueryFailure("unavailable")
    );
  });
});
