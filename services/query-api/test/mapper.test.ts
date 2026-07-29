import { describe, expect, it } from "vitest";

import type { AthenaTable } from "../src/athena-client.js";
import { mapDashboardSnapshot } from "../src/mapper.js";

function table(
  rows: Array<Record<string, string | null>>
): AthenaTable {
  return { columns: [], rows };
}

describe("Athena Dashboard DTO 映射", () => {
  it("映射完整真实快照并计算错误率和 LCP 状态", () => {
    const now = new Date("2026-07-29T14:00:00.000Z");
    const snapshot = mapDashboardSnapshot(
      {
        overview: table([
          {
            total_events: "20",
            sessions: "4",
            errors: "2",
            latest_received_at: "2026-07-29T13:53:00.000Z"
          }
        ]),
        vitals: table([
          {
            bucket: "2026-07-29T21:00:00+08:00",
            metricname: "LCP",
            p50: "1800",
            p95: "2600",
            p99: "4000",
            sample_count: "8"
          },
          { metricname: "UNKNOWN" }
        ]),
        slowPages: table([
          {
            pageurl: "https://example.test/slow",
            lcp_p95: "4100",
            visits: "3"
          }
        ]),
        errorBreakdown: table([
          { errorkind: "js", error_count: "2" },
          { errorkind: "unknown", error_count: "10" }
        ]),
        errorDetails: table([
          {
            recordid: "record-1",
            errorkind: "js",
            errormessage: "示例错误",
            pageurl: "https://example.test/",
            browsername: "Chrome",
            browserversion: "126",
            osname: "macOS",
            osversion: "15",
            occurred_at: "2026-07-29T13:50:00.000Z",
            errorstack: "at <anonymous>"
          }
        ])
      },
      "24h",
      now
    );

    expect(snapshot).toMatchObject({
      generatedAt: "2026-07-29T14:00:00.000Z",
      freshnessMinutes: 7,
      granularity: "hour",
      overview: {
        totalEvents: 20,
        sessions: 4,
        errors: 2,
        errorRate: 10
      },
      vitals: [
        {
          metric: "LCP",
          p50: 1800,
          p95: 2600,
          p99: 4000,
          sampleCount: 8
        }
      ],
      slowPages: [
        {
          lcpP95: 4100,
          visits: 3,
          rating: "poor"
        }
      ],
      errorBreakdown: [{ kind: "js", count: 2 }]
    });
    expect(snapshot.errors[0]).toMatchObject({
      recordId: "record-1",
      kind: "js",
      message: "示例错误"
    });
  });

  it("空结果返回真实空态而不是伪造数据", () => {
    const empty = table([]);
    expect(
      mapDashboardSnapshot(
        {
          overview: empty,
          vitals: empty,
          slowPages: empty,
          errorBreakdown: empty,
          errorDetails: empty
        },
        "7d",
        new Date("2026-07-29T14:00:00.000Z")
      )
    ).toEqual({
      generatedAt: "2026-07-29T14:00:00.000Z",
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
    });
  });
});
