import type {
  DashboardErrorBreakdown,
  DashboardErrorDetail,
  DashboardErrorKind,
  DashboardMetricName,
  DashboardRange,
  DashboardSnapshot
} from "@diwang/contracts";

import type { AthenaTable } from "./athena-client.js";

export interface DashboardAthenaTables {
  readonly overview: AthenaTable;
  readonly vitals: AthenaTable;
  readonly slowPages: AthenaTable;
  readonly errorBreakdown: AthenaTable;
  readonly errorDetails: AthenaTable;
}

function numberValue(value: string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: string | null | undefined): string {
  return value ?? "";
}

function isMetricName(value: string): value is DashboardMetricName {
  return value === "LCP" || value === "CLS" || value === "INP";
}

function isErrorKind(value: string): value is DashboardErrorKind {
  return (
    value === "js" ||
    value === "resource" ||
    value === "unhandled_rejection"
  );
}

function lcpRating(value: number): "good" | "needs-improvement" | "poor" {
  if (value <= 2_500) return "good";
  if (value <= 4_000) return "needs-improvement";
  return "poor";
}

function calculateFreshness(
  latestReceivedAt: string,
  now: Date
): number {
  const timestamp = Date.parse(latestReceivedAt);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
}

function mapErrorBreakdown(
  table: AthenaTable
): DashboardErrorBreakdown[] {
  return table.rows.flatMap((row) => {
    const kind = stringValue(row.errorkind);
    return isErrorKind(kind)
      ? [{ kind, count: numberValue(row.error_count) }]
      : [];
  });
}

function mapErrorDetails(table: AthenaTable): DashboardErrorDetail[] {
  return table.rows.flatMap((row) => {
    const kind = stringValue(row.errorkind);
    if (!isErrorKind(kind)) return [];
    return [
      {
        recordId: stringValue(row.recordid),
        kind,
        message: stringValue(row.errormessage),
        pageUrl: stringValue(row.pageurl),
        browserName: stringValue(row.browsername),
        browserVersion: stringValue(row.browserversion),
        osName: stringValue(row.osname),
        osVersion: stringValue(row.osversion),
        occurredAt: stringValue(row.occurred_at),
        stack: stringValue(row.errorstack)
      }
    ];
  });
}

export function mapDashboardSnapshot(
  tables: DashboardAthenaTables,
  range: DashboardRange,
  now = new Date()
): DashboardSnapshot {
  const overviewRow = tables.overview.rows[0] ?? {};
  const totalEvents = numberValue(overviewRow.total_events);
  const errors = numberValue(overviewRow.errors);

  return {
    generatedAt: now.toISOString(),
    freshnessMinutes: calculateFreshness(
      stringValue(overviewRow.latest_received_at),
      now
    ),
    granularity: range === "24h" ? "hour" : "day",
    overview: {
      totalEvents,
      sessions: numberValue(overviewRow.sessions),
      errors,
      errorRate:
        totalEvents === 0
          ? 0
          : Number(((errors / totalEvents) * 100).toFixed(2))
    },
    vitals: tables.vitals.rows.flatMap((row) => {
      const metric = stringValue(row.metricname);
      return isMetricName(metric)
        ? [
            {
              timestamp: stringValue(row.bucket),
              metric,
              p50: numberValue(row.p50),
              p95: numberValue(row.p95),
              p99: numberValue(row.p99),
              sampleCount: numberValue(row.sample_count)
            }
          ]
        : [];
    }),
    slowPages: tables.slowPages.rows.map((row) => {
      const lcpP95 = numberValue(row.lcp_p95);
      return {
        pageUrl: stringValue(row.pageurl),
        lcpP95,
        visits: numberValue(row.visits),
        rating: lcpRating(lcpP95)
      };
    }),
    errorBreakdown: mapErrorBreakdown(tables.errorBreakdown),
    errors: mapErrorDetails(tables.errorDetails)
  };
}
