import type { IncomingMessage, ServerResponse } from "node:http";
import type { DashboardQuery, DashboardRange, MockScenario } from "@diwang/contracts";
import type { Connect, Plugin } from "vite";

import { DashboardApiError } from "./errors";
import { queryMockDashboard, queryMockProjects } from "./mock-api";

const VALID_RANGES = new Set<DashboardRange>(["24h", "7d", "30d"]);
const VALID_SCENARIOS = new Set<MockScenario>(["success", "empty", "error"]);

function writeJson(
  response: ServerResponse,
  status: number,
  payload: unknown
): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function parseQuery(url: URL): DashboardQuery | null {
  const projectId = url.searchParams.get("projectId") ?? "";
  const range = url.searchParams.get("range");
  const scenario = url.searchParams.get("scenario") ?? "success";

  if (
    !projectId ||
    !range ||
    !VALID_RANGES.has(range as DashboardRange) ||
    !VALID_SCENARIOS.has(scenario as MockScenario)
  ) {
    return null;
  }

  return {
    projectId,
    range: range as DashboardRange,
    scenario: scenario as MockScenario
  };
}

async function handleDashboardRequest(
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://dashboard.local");

  if (request.method !== "GET") {
    next();
    return;
  }

  try {
    if (url.pathname === "/api/dashboard/projects") {
      writeJson(response, 200, await queryMockProjects());
      return;
    }

    if (url.pathname === "/api/dashboard/snapshot") {
      const query = parseQuery(url);
      if (!query) {
        writeJson(response, 400, { message: "查询参数无效" });
        return;
      }

      writeJson(response, 200, await queryMockDashboard(query));
      return;
    }

    next();
  } catch (error) {
    const status = error instanceof DashboardApiError ? error.status : 500;
    const message =
      error instanceof DashboardApiError
        ? error.message
        : "Dashboard Mock API 处理失败";
    writeJson(response, status, { message });
  }
}

function registerMiddleware(
  middlewares: Connect.Server
): void {
  middlewares.use((request, response, next) => {
    void handleDashboardRequest(request, response, next);
  });
}

export function dashboardMockApiPlugin(): Plugin {
  return {
    name: "diwang-dashboard-mock-api",
    configureServer(server) {
      registerMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      registerMiddleware(server.middlewares);
    }
  };
}
