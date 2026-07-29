import type { DashboardRange } from "@diwang/contracts";

import type { QueryApiConfig } from "./types.js";

export type DashboardQueryKind =
  | "overview"
  | "vitals"
  | "slow-pages"
  | "error-breakdown"
  | "error-details";

export interface DashboardSqlSet {
  readonly overview: string;
  readonly vitals: string;
  readonly slowPages: string;
  readonly errorBreakdown: string;
  readonly errorDetails: string;
}

interface TimeWindow {
  readonly startIso: string;
  readonly endIso: string;
  readonly partitionStart: string;
  readonly partitionEnd: string;
  readonly granularity: "hour" | "day";
}

const PROJECT_PATTERN = /^[a-z0-9-]+$/;

function escapeLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function shanghaiDateParts(date: Date): {
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function startOfShanghaiDay(date: Date, daysAgo: number): Date {
  const { year, month, day } = shanghaiDateParts(date);
  return new Date(Date.UTC(year, month - 1, day - daysAgo, -8));
}

export function createTimeWindow(
  range: DashboardRange,
  now = new Date()
): TimeWindow {
  const start =
    range === "24h"
      ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
      : startOfShanghaiDay(now, range === "7d" ? 6 : 29);
  return {
    startIso: start.toISOString(),
    endIso: now.toISOString(),
    partitionStart: start.toISOString().slice(0, 10),
    partitionEnd: now.toISOString().slice(0, 10),
    granularity: range === "24h" ? "hour" : "day"
  };
}

function commonFilter(projectId: string, window: TimeWindow): string {
  if (!PROJECT_PATTERN.test(projectId)) {
    throw new Error("projectId 格式无效");
  }
  return `projectid = '${escapeLiteral(projectId)}'
  AND partition_date BETWEEN '${window.partitionStart}' AND '${window.partitionEnd}'
  AND from_iso8601_timestamp(receivedat) BETWEEN
    from_iso8601_timestamp('${window.startIso}')
    AND from_iso8601_timestamp('${window.endIso}')`;
}

function bucketExpression(granularity: "hour" | "day"): string {
  const format =
    granularity === "hour"
      ? "%Y-%m-%dT%H:00:00"
      : "%Y-%m-%dT00:00:00";
  return `date_format(
    at_timezone(from_iso8601_timestamp(receivedat), 'Asia/Shanghai'),
    '${format}'
  ) || '+08:00'`;
}

export function buildDashboardQueries(
  config: Pick<QueryApiConfig, "view">,
  projectId: string,
  range: DashboardRange,
  now = new Date()
): DashboardSqlSet {
  const window = createTimeWindow(range, now);
  const filter = commonFilter(projectId, window);
  const bucket = bucketExpression(window.granularity);
  const view = config.view;

  return {
    overview: `SELECT
  count(*) AS total_events,
  approx_distinct(sessionid) AS sessions,
  count_if(eventtype = 'error') AS errors,
  max(receivedat) AS latest_received_at
FROM ${view}
WHERE ${filter}`,
    vitals: `SELECT
  ${bucket} AS bucket,
  metricname,
  approx_percentile(metricvalue, 0.50) AS p50,
  approx_percentile(metricvalue, 0.95) AS p95,
  approx_percentile(metricvalue, 0.99) AS p99,
  count(*) AS sample_count
FROM ${view}
WHERE ${filter}
  AND eventtype = 'metric'
  AND metricname IN ('LCP', 'CLS', 'INP')
GROUP BY 1, metricname
ORDER BY 1, metricname`,
    slowPages: `SELECT
  pageurl,
  approx_percentile(metricvalue, 0.95) AS lcp_p95,
  approx_distinct(sessionid) AS visits
FROM ${view}
WHERE ${filter}
  AND eventtype = 'metric'
  AND metricname = 'LCP'
  AND pageurl IS NOT NULL
  AND pageurl <> ''
GROUP BY pageurl
ORDER BY lcp_p95 DESC
LIMIT 10`,
    errorBreakdown: `SELECT
  errorkind,
  count(*) AS error_count
FROM ${view}
WHERE ${filter}
  AND eventtype = 'error'
  AND errorkind IS NOT NULL
GROUP BY errorkind
ORDER BY error_count DESC`,
    errorDetails: `SELECT
  recordid,
  errorkind,
  errormessage,
  pageurl,
  browsername,
  browserversion,
  osname,
  osversion,
  coalesce(
    to_iso8601(
      from_unixtime(CAST(clienttimestamp AS double) / 1000, 'UTC')
    ),
    receivedat
  ) AS occurred_at,
  errorstack
FROM ${view}
WHERE ${filter}
  AND eventtype = 'error'
ORDER BY from_iso8601_timestamp(receivedat) DESC
LIMIT 100`
  };
}
