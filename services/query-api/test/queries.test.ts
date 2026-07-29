import { describe, expect, it } from "vitest";

import {
  buildDashboardQueries,
  createTimeWindow
} from "../src/queries.js";

const config = { view: "telemetry_deduplicated" };
const now = new Date("2026-07-29T14:00:00.000Z");

describe("Athena Dashboard SQL", () => {
  it.each(["24h", "7d", "30d"] as const)(
    "%s 的全部 SQL 都包含项目、日期分区和接收时间过滤",
    (range) => {
      const queries = buildDashboardQueries(
        config,
        "hono-sam-aws-learning",
        range,
        now
      );

      for (const sql of Object.values(queries)) {
        expect(sql).toContain("FROM telemetry_deduplicated");
        expect(sql).toContain("projectid = 'hono-sam-aws-learning'");
        expect(sql).toContain("partition_date BETWEEN");
        expect(sql).toContain("from_iso8601_timestamp(receivedat) BETWEEN");
      }
    }
  );

  it("按北京时间生成小时和自然日窗口", () => {
    expect(createTimeWindow("24h", now)).toEqual({
      startIso: "2026-07-28T14:00:00.000Z",
      endIso: "2026-07-29T14:00:00.000Z",
      partitionStart: "2026-07-28",
      partitionEnd: "2026-07-29",
      granularity: "hour"
    });
    expect(createTimeWindow("7d", now)).toEqual({
      startIso: "2026-07-22T16:00:00.000Z",
      endIso: "2026-07-29T14:00:00.000Z",
      partitionStart: "2026-07-22",
      partitionEnd: "2026-07-29",
      granularity: "day"
    });
  });

  it("拒绝可能注入 SQL 的项目值", () => {
    expect(() =>
      buildDashboardQueries(
        config,
        "project' OR 1=1",
        "7d",
        now
      )
    ).toThrow("projectId 格式无效");
  });

  it("各查询只选择需要的聚合或脱敏字段", () => {
    const queries = buildDashboardQueries(
      config,
      "hono-sam-aws-learning",
      "7d",
      now
    );

    expect(queries.overview).toContain("approx_distinct(sessionid)");
    expect(queries.vitals).toContain("approx_percentile(metricvalue, 0.95)");
    expect(queries.slowPages).toContain("LIMIT 10");
    expect(queries.errorBreakdown).toContain("GROUP BY errorkind");
    expect(queries.errorDetails).toContain(
      "from_unixtime(CAST(clienttimestamp AS double) / 1000, 'UTC')"
    );
    expect(queries.errorDetails).toContain("LIMIT 100");
    expect(Object.values(queries).join("\n")).not.toContain("SELECT *");
  });
});
