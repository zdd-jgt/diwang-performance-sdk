import type { QueryApiConfig, QueryApiEnvironment } from "./types.js";

const IDENTIFIER_PATTERN = /^[a-z0-9_]+$/;
const WORKGROUP_PATTERN = /^[a-z0-9-]+$/;
const PROJECT_PATTERN = /^[a-z0-9-]+$/;

const DEFAULTS = {
  region: "ap-northeast-1",
  database: "diwang_performance_production",
  view: "telemetry_deduplicated",
  workgroup: "diwang-performance-production-telemetry",
  allowedProjects: "hono-sam-aws-learning",
  port: 4174,
  cacheTtlMs: 60_000,
  queryTimeoutMs: 20_000,
  pollIntervalMs: 500
} as const;

function readString(
  environment: QueryApiEnvironment,
  key: string,
  fallback: string
): string {
  return environment[key]?.trim() || fallback;
}

function assertPattern(
  key: string,
  value: string,
  pattern: RegExp
): string {
  if (!pattern.test(value)) {
    throw new Error(`${key} 配置格式无效`);
  }
  return value;
}

function readPort(environment: QueryApiEnvironment): number {
  const raw = readString(environment, "QUERY_API_PORT", String(DEFAULTS.port));
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1024 || value > 65_535) {
    throw new Error("QUERY_API_PORT 必须是 1024 到 65535 之间的整数");
  }
  return value;
}

function readAllowedProjects(environment: QueryApiEnvironment): string[] {
  const raw = readString(
    environment,
    "DASHBOARD_ALLOWED_PROJECTS",
    DEFAULTS.allowedProjects
  );
  const projects = [...new Set(raw.split(",").map((value) => value.trim()))]
    .filter(Boolean)
    .map((value) =>
      assertPattern("DASHBOARD_ALLOWED_PROJECTS", value, PROJECT_PATTERN)
    );

  if (projects.length === 0) {
    throw new Error("DASHBOARD_ALLOWED_PROJECTS 至少需要一个项目");
  }
  return projects;
}

export function readQueryApiConfig(
  environment: QueryApiEnvironment = process.env
): QueryApiConfig {
  return {
    region: readString(environment, "AWS_REGION", DEFAULTS.region),
    database: assertPattern(
      "ATHENA_DATABASE",
      readString(environment, "ATHENA_DATABASE", DEFAULTS.database),
      IDENTIFIER_PATTERN
    ),
    view: assertPattern(
      "ATHENA_VIEW",
      readString(environment, "ATHENA_VIEW", DEFAULTS.view),
      IDENTIFIER_PATTERN
    ),
    workgroup: assertPattern(
      "ATHENA_WORKGROUP",
      readString(environment, "ATHENA_WORKGROUP", DEFAULTS.workgroup),
      WORKGROUP_PATTERN
    ),
    allowedProjects: readAllowedProjects(environment),
    host: "127.0.0.1",
    port: readPort(environment),
    cacheTtlMs: DEFAULTS.cacheTtlMs,
    queryTimeoutMs: DEFAULTS.queryTimeoutMs,
    pollIntervalMs: DEFAULTS.pollIntervalMs
  };
}
