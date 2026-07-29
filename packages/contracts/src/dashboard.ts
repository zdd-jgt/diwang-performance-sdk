export type DashboardRange = "24h" | "7d" | "30d";

export type DashboardGranularity = "hour" | "day";

export type MockScenario = "success" | "empty" | "error";

export type DashboardMetricName = "LCP" | "CLS" | "INP";

export type DashboardMetricRating =
  | "good"
  | "needs-improvement"
  | "poor";

export type DashboardErrorKind =
  | "js"
  | "resource"
  | "unhandled_rejection";

export interface DashboardProject {
  id: string;
  name: string;
}

export interface DashboardQuery {
  projectId: string;
  range: DashboardRange;
  scenario?: MockScenario;
}

export interface DashboardOverview {
  totalEvents: number;
  sessions: number;
  errors: number;
  errorRate: number;
}

export interface DashboardVitalsPoint {
  timestamp: string;
  metric: DashboardMetricName;
  p50: number;
  p95: number;
  p99: number;
  sampleCount: number;
}

export interface DashboardSlowPage {
  pageUrl: string;
  lcpP95: number;
  visits: number;
  rating: DashboardMetricRating;
}

export interface DashboardErrorBreakdown {
  kind: DashboardErrorKind;
  count: number;
}

export interface DashboardErrorDetail {
  recordId: string;
  kind: DashboardErrorKind;
  message: string;
  pageUrl: string;
  browserName: string;
  browserVersion: string;
  osName: string;
  osVersion: string;
  occurredAt: string;
  stack: string;
}

export interface DashboardSnapshot {
  generatedAt: string;
  freshnessMinutes: number;
  granularity: DashboardGranularity;
  overview: DashboardOverview;
  vitals: DashboardVitalsPoint[];
  slowPages: DashboardSlowPage[];
  errorBreakdown: DashboardErrorBreakdown[];
  errors: DashboardErrorDetail[];
}
