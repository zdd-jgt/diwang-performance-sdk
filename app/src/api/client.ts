import type {
  DashboardProject,
  DashboardQuery,
  DashboardSnapshot
} from "@diwang/contracts";

import { DashboardApiError } from "./errors";

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { message?: string };

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : "Dashboard 查询失败";
    throw new DashboardApiError(message, response.status);
  }

  return payload as T;
}

export async function fetchDashboardProjects(
  signal?: AbortSignal
): Promise<DashboardProject[]> {
  const response = await fetch("/api/dashboard/projects", { signal });
  return readJson<DashboardProject[]>(response);
}

export async function fetchDashboardSnapshot(
  query: DashboardQuery,
  signal?: AbortSignal
): Promise<DashboardSnapshot> {
  const search = new URLSearchParams({
    projectId: query.projectId,
    range: query.range
  });
  if (import.meta.env.MODE === "mock") {
    search.set("scenario", query.scenario ?? "success");
  }
  const response = await fetch(`/api/dashboard/snapshot?${search}`, {
    signal
  });
  return readJson<DashboardSnapshot>(response);
}
