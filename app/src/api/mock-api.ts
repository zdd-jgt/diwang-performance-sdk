import type {
  DashboardProject,
  DashboardQuery,
  DashboardSnapshot
} from "@diwang/contracts";

import {
  createDashboardSnapshot,
  createEmptyDashboardSnapshot,
  DASHBOARD_PROJECTS
} from "../data/mock-dashboard";
import { DashboardApiError } from "./errors";

interface MockQueryOptions {
  delayMs?: number;
  now?: Date;
  signal?: AbortSignal;
}

function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("请求已取消", "AbortError"));
  }

  if (delayMs <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("请求已取消", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function randomQueryDelay(): number {
  return 1_000 + Math.floor(Math.random() * 4_001);
}

export async function queryMockProjects(
  options: MockQueryOptions = {}
): Promise<DashboardProject[]> {
  await abortableDelay(options.delayMs ?? 120, options.signal);
  return DASHBOARD_PROJECTS.map((project) => ({ ...project }));
}

export async function queryMockDashboard(
  query: DashboardQuery,
  options: MockQueryOptions = {}
): Promise<DashboardSnapshot> {
  await abortableDelay(
    options.delayMs ?? randomQueryDelay(),
    options.signal
  );

  const projectExists = DASHBOARD_PROJECTS.some(
    (project) => project.id === query.projectId
  );

  if (!projectExists) {
    throw new DashboardApiError("项目不存在", 404);
  }

  if (query.scenario === "error") {
    throw new DashboardApiError("模拟 Athena 查询暂时不可用", 503);
  }

  if (query.scenario === "empty") {
    return createEmptyDashboardSnapshot(query.range, options.now);
  }

  return createDashboardSnapshot(query, options.now);
}
