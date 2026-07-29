import type {
  DashboardProject,
  DashboardQuery,
  DashboardRange,
  DashboardSnapshot
} from "@diwang/contracts";

import {
  AthenaQueryFailure,
  createAthenaQueryExecutor,
  type AthenaQueryExecutor,
  type AthenaTable
} from "./athena-client.js";
import { AsyncTtlCache } from "./cache.js";
import {
  mapDashboardSnapshot,
  type DashboardAthenaTables
} from "./mapper.js";
import { buildDashboardQueries } from "./queries.js";
import type { QueryApiConfig } from "./types.js";

const VALID_RANGES = new Set<DashboardRange>(["24h", "7d", "30d"]);

export interface DashboardExecutor {
  execute(sql: string): Promise<AthenaTable>;
}

export interface HttpResult {
  readonly status: number;
  readonly payload: unknown;
}

export class DashboardQueryService {
  private readonly cache: AsyncTtlCache<DashboardSnapshot>;

  public constructor(
    private readonly config: QueryApiConfig,
    private readonly executor: DashboardExecutor,
    cache?: AsyncTtlCache<DashboardSnapshot>
  ) {
    this.cache = cache ?? new AsyncTtlCache(config.cacheTtlMs);
  }

  public projects(): DashboardProject[] {
    return this.config.allowedProjects.map((id) => ({
      id,
      name: id === "hono-sam-aws-learning" ? "Hono SAM 学习站" : id
    }));
  }

  public hasProject(projectId: string): boolean {
    return this.config.allowedProjects.includes(projectId);
  }

  public snapshot(query: DashboardQuery): Promise<DashboardSnapshot> {
    return this.cache.getOrLoad(
      `${query.projectId}:${query.range}`,
      async () => {
        const now = new Date();
        const queries = buildDashboardQueries(
          this.config,
          query.projectId,
          query.range,
          now
        );
        const [
          overview,
          vitals,
          slowPages,
          errorBreakdown,
          errorDetails
        ] = await Promise.all([
          this.executor.execute(queries.overview),
          this.executor.execute(queries.vitals),
          this.executor.execute(queries.slowPages),
          this.executor.execute(queries.errorBreakdown),
          this.executor.execute(queries.errorDetails)
        ]);
        const tables: DashboardAthenaTables = {
          overview,
          vitals,
          slowPages,
          errorBreakdown,
          errorDetails
        };
        return mapDashboardSnapshot(tables, query.range, now);
      }
    );
  }
}

function errorResult(error: unknown): HttpResult {
  if (error instanceof AthenaQueryFailure) {
    return {
      status: error.kind === "timeout" ? 504 : 503,
      payload: { message: error.message }
    };
  }
  return {
    status: 500,
    payload: { message: "地网查询服务暂时不可用，请稍后重试" }
  };
}

function parseSnapshotQuery(url: URL): DashboardQuery | HttpResult {
  const projectId = url.searchParams.get("projectId")?.trim() ?? "";
  const range = url.searchParams.get("range")?.trim() ?? "";
  if (!projectId || !VALID_RANGES.has(range as DashboardRange)) {
    return {
      status: 400,
      payload: { message: "查询参数无效" }
    };
  }
  return { projectId, range: range as DashboardRange };
}

function isHttpResult(
  value: DashboardQuery | HttpResult
): value is HttpResult {
  return "status" in value;
}

export async function routeDashboardRequest(
  service: DashboardQueryService,
  method: string | undefined,
  requestUrl: string | undefined
): Promise<HttpResult | null> {
  const url = new URL(requestUrl ?? "/", "http://127.0.0.1");

  if (method !== "GET") return null;
  if (url.pathname === "/health") {
    return { status: 200, payload: { status: "ok" } };
  }
  if (url.pathname === "/api/dashboard/projects") {
    return { status: 200, payload: service.projects() };
  }
  if (url.pathname !== "/api/dashboard/snapshot") return null;

  const parsed = parseSnapshotQuery(url);
  if (isHttpResult(parsed)) return parsed;
  if (!service.hasProject(parsed.projectId)) {
    return {
      status: 404,
      payload: { message: "项目不存在或无权查询" }
    };
  }

  try {
    return { status: 200, payload: await service.snapshot(parsed) };
  } catch (error) {
    return errorResult(error);
  }
}

export function createDashboardQueryService(
  config: QueryApiConfig,
  executor: DashboardExecutor = createAthenaQueryExecutor(config)
): DashboardQueryService {
  return new DashboardQueryService(config, executor);
}

export type { AthenaQueryExecutor };
