import type {
  DashboardErrorDetail,
  DashboardErrorKind,
  DashboardMetricName,
  DashboardMetricRating,
  DashboardProject,
  DashboardQuery,
  DashboardRange,
  DashboardSlowPage,
  DashboardSnapshot,
  DashboardVitalsPoint
} from "@diwang/contracts";

export const DASHBOARD_PROJECTS: DashboardProject[] = [
  { id: "shop-web", name: "星环商城 Web" },
  { id: "member-center", name: "会员中心" },
  { id: "campaign-hub", name: "活动中台" }
];

const RANGE_CONFIG = {
  "24h": { points: 24, stepMs: 60 * 60 * 1_000, granularity: "hour" },
  "7d": { points: 7, stepMs: 24 * 60 * 60 * 1_000, granularity: "day" },
  "30d": { points: 30, stepMs: 24 * 60 * 60 * 1_000, granularity: "day" }
} as const;

const METRICS: DashboardMetricName[] = ["LCP", "CLS", "INP"];
const ERROR_KINDS: DashboardErrorKind[] = [
  "js",
  "resource",
  "unhandled_rejection"
];

function hashText(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function rounded(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function metricValues(
  metric: DashboardMetricName,
  seed: number
): Pick<DashboardVitalsPoint, "p50" | "p95" | "p99"> {
  const noise = seededUnit(seed);

  if (metric === "CLS") {
    const p50 = 0.025 + noise * 0.045;
    return {
      p50: rounded(p50, 3),
      p95: rounded(p50 + 0.055 + noise * 0.07, 3),
      p99: rounded(p50 + 0.15 + noise * 0.1, 3)
    };
  }

  if (metric === "INP") {
    const p50 = 92 + noise * 68;
    return {
      p50: rounded(p50),
      p95: rounded(p50 + 105 + noise * 95),
      p99: rounded(p50 + 230 + noise * 140)
    };
  }

  const p50 = 1_250 + noise * 650;
  return {
    p50: rounded(p50),
    p95: rounded(p50 + 800 + noise * 850),
    p99: rounded(p50 + 1_650 + noise * 1_100)
  };
}

function createVitals(
  query: DashboardQuery,
  now: Date
): DashboardVitalsPoint[] {
  const config = RANGE_CONFIG[query.range];
  const seedBase = hashText(`${query.projectId}:${query.range}`);
  const points: DashboardVitalsPoint[] = [];

  for (let index = 0; index < config.points; index += 1) {
    const timestamp = new Date(
      now.getTime() - (config.points - index - 1) * config.stepMs
    ).toISOString();

    METRICS.forEach((metric, metricIndex) => {
      const values = metricValues(
        metric,
        seedBase + index * 17 + metricIndex * 101
      );
      points.push({
        timestamp,
        metric,
        ...values,
        sampleCount: 820 + Math.floor(seededUnit(seedBase + index * 29) * 2_600)
      });
    });
  }

  return points;
}

function lcpRating(value: number): DashboardMetricRating {
  if (value <= 2_500) return "good";
  if (value <= 4_000) return "needs-improvement";
  return "poor";
}

function createSlowPages(projectId: string): DashboardSlowPage[] {
  const paths = [
    "/checkout/confirm",
    "/campaign/summer",
    "/product/aurora-phone",
    "/search",
    "/member/orders",
    "/cart",
    "/product/luna-watch",
    "/category/electronics",
    "/member/profile",
    "/help/shipping",
    "/",
    "/login"
  ];
  const seedBase = hashText(projectId);

  return paths
    .map((path, index) => {
      const lcpP95 = rounded(
        1_900 + seededUnit(seedBase + index * 73) * 3_500
      );
      return {
        pageUrl: `https://${projectId}.example${path}`,
        lcpP95,
        visits: 420 + Math.floor(seededUnit(seedBase + index * 41) * 8_000),
        rating: lcpRating(lcpP95)
      };
    })
    .sort((left, right) => right.lcpP95 - left.lcpP95)
    .slice(0, 10);
}

function errorMessage(kind: DashboardErrorKind, index: number): string {
  if (kind === "resource") {
    return "静态资源加载失败：/assets/product-card.webp";
  }
  if (kind === "unhandled_rejection") {
    return "异步请求被拒绝：模拟库存接口超时";
  }
  return index % 2 === 0
    ? "Cannot read properties of undefined"
    : "模拟组件渲染异常";
}

function createErrors(
  projectId: string,
  now: Date
): DashboardErrorDetail[] {
  return Array.from({ length: 8 }, (_, index) => {
    const kind = ERROR_KINDS[index % ERROR_KINDS.length]!;
    const recordSuffix = String(index + 1).padStart(12, "0");
    return {
      recordId: `10000000-0000-4000-8000-${recordSuffix}`,
      kind,
      message: errorMessage(kind, index),
      pageUrl: `https://${projectId}.example/${
        index % 2 === 0 ? "checkout/confirm" : "product/aurora-phone"
      }`,
      browserName: index % 3 === 0 ? "Safari" : "Chrome",
      browserVersion: index % 3 === 0 ? "19.0" : "142.0",
      osName: index % 3 === 0 ? "iOS" : "macOS",
      osVersion: index % 3 === 0 ? "19.0" : "16.0",
      occurredAt: new Date(now.getTime() - index * 17 * 60 * 1_000).toISOString(),
      stack: [
        `${errorMessage(kind, index)}`,
        "    at renderCard ([app]/assets/main.js:1:4821)",
        "    at updateView ([app]/assets/main.js:1:7314)"
      ].join("\n")
    };
  });
}

function rangeScale(range: DashboardRange): number {
  if (range === "24h") return 1;
  if (range === "7d") return 6.4;
  return 25.8;
}

export function createEmptyDashboardSnapshot(
  range: DashboardRange,
  now = new Date()
): DashboardSnapshot {
  return {
    generatedAt: now.toISOString(),
    freshnessMinutes: 7,
    granularity: RANGE_CONFIG[range].granularity,
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
}

export function createDashboardSnapshot(
  query: DashboardQuery,
  now = new Date()
): DashboardSnapshot {
  const scale = rangeScale(query.range);
  const projectSeed = hashText(query.projectId);
  const totalEvents = Math.round(
    (48_200 + seededUnit(projectSeed) * 18_000) * scale
  );
  const errors = Math.max(
    1,
    Math.round(totalEvents * (0.011 + seededUnit(projectSeed + 7) * 0.009))
  );
  const errorDetails = createErrors(query.projectId, now);
  const kindCounts = ERROR_KINDS.map((kind, index) => ({
    kind,
    count: Math.round(errors * [0.54, 0.28, 0.18][index]!)
  }));

  return {
    generatedAt: now.toISOString(),
    freshnessMinutes: 7,
    granularity: RANGE_CONFIG[query.range].granularity,
    overview: {
      totalEvents,
      sessions: Math.round(totalEvents * 0.31),
      errors,
      errorRate: rounded((errors / totalEvents) * 100, 2)
    },
    vitals: createVitals(query, now),
    slowPages: createSlowPages(query.projectId),
    errorBreakdown: kindCounts,
    errors: errorDetails
  };
}
