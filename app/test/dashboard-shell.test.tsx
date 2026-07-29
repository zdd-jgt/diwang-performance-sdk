import type { DashboardSnapshot } from "@diwang/contracts";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import {
  fetchDashboardProjects,
  fetchDashboardSnapshot
} from "../src/api/client";

vi.mock("../src/api/client", () => ({
  fetchDashboardProjects: vi.fn(),
  fetchDashboardSnapshot: vi.fn()
}));

const PROJECTS = [
  { id: "shop-web", name: "星环商城 Web" },
  { id: "member-center", name: "会员中心" }
];

const SNAPSHOT: DashboardSnapshot = {
  generatedAt: "2026-07-29T06:00:00.000Z",
  freshnessMinutes: 7,
  granularity: "day",
  overview: {
    totalEvents: 48_200,
    sessions: 14_942,
    errors: 723,
    errorRate: 1.5
  },
  vitals: [
    {
      timestamp: "2026-07-29T00:00:00.000Z",
      metric: "LCP",
      p50: 1_400,
      p95: 2_800,
      p99: 4_200,
      sampleCount: 800
    }
  ],
  slowPages: [
    {
      pageUrl: "https://shop-web.example/checkout",
      lcpP95: 4_200,
      visits: 980,
      rating: "poor"
    }
  ],
  errorBreakdown: [{ kind: "js", count: 723 }],
  errors: [
    {
      recordId: "10000000-0000-4000-8000-000000000001",
      kind: "js",
      message: "模拟组件异常",
      pageUrl: "https://shop-web.example/checkout",
      browserName: "Chrome",
      browserVersion: "142.0",
      osName: "macOS",
      osVersion: "16.0",
      occurredAt: "2026-07-29T06:00:00.000Z",
      stack: "at render ([app]/main.js:1:1)"
    }
  ]
};

const mockProjects = vi.mocked(fetchDashboardProjects);
const mockSnapshot = vi.mocked(fetchDashboardSnapshot);

describe("Dashboard 页面骨架", () => {
  beforeEach(() => {
    mockProjects.mockReset();
    mockSnapshot.mockReset();
    mockProjects.mockResolvedValue(PROJECTS);
    mockSnapshot.mockResolvedValue(SNAPSHOT);
  });

  it("默认使用 7 天范围并展示 KPI", async () => {
    render(<App />);

    expect(screen.getByText("Athena 查询执行中")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "地网 数据分析面板" })).toBeTruthy();
    expect(screen.getByText("真实数据 · 半实时")).toBeTruthy();
    expect(screen.queryByLabelText("选择演示场景")).toBeNull();
    const overview = await screen.findByRole("region", { name: "性能概览" });
    expect(within(overview).getByText("48,200")).toBeTruthy();
    expect(within(overview).getByText("14,942")).toBeTruthy();
    expect(within(overview).getByText("723")).toBeTruthy();
    expect(within(overview).getByText("1.50")).toBeTruthy();

    await waitFor(() => {
      expect(mockSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "shop-web",
          range: "7d"
        }),
        expect.any(AbortSignal)
      );
    });
  });

  it("切换时间范围后发起小时粒度查询", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("48,200");
    await user.selectOptions(screen.getByLabelText("选择时间范围"), "24h");

    await waitFor(() => {
      expect(mockSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({
          range: "24h"
        }),
        expect.any(AbortSignal)
      );
    });
  });

  it("展示查询失败并允许重试", async () => {
    const user = userEvent.setup();
    mockSnapshot
      .mockRejectedValueOnce(new Error("模拟查询失败"))
      .mockResolvedValueOnce(SNAPSHOT);

    render(<App />);

    expect(await screen.findByText("查询节点暂时不可用")).toBeTruthy();
    expect(screen.getByText("模拟查询失败")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "重新执行查询" }));
    expect(await screen.findByText("48,200")).toBeTruthy();
    expect(mockSnapshot).toHaveBeenCalledTimes(2);
  });

  it("空数据场景不展示零值 KPI", async () => {
    mockSnapshot.mockResolvedValue({
      ...SNAPSHOT,
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

    render(<App />);

    expect(await screen.findByText("当前范围没有可分析数据")).toBeTruthy();
    expect(screen.queryByText("事件总量")).toBeNull();
  });
});
