import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../src/api/errors";
import {
  queryMockDashboard,
  queryMockProjects
} from "../src/api/mock-api";

const NOW = new Date("2026-07-29T06:00:00.000Z");

describe("Dashboard Mock API", () => {
  it("提供单选项目列表", async () => {
    const projects = await queryMockProjects({ delayMs: 0 });

    expect(projects).toHaveLength(3);
    expect(new Set(projects.map((project) => project.id)).size).toBe(3);
  });

  it.each([
    ["24h", "hour", 24],
    ["7d", "day", 7],
    ["30d", "day", 30]
  ] as const)("为 %s 返回正确粒度和时间点", async (range, granularity, points) => {
    const snapshot = await queryMockDashboard(
      {
        projectId: "shop-web",
        range,
        scenario: "success"
      },
      { delayMs: 0, now: NOW }
    );

    expect(snapshot.granularity).toBe(granularity);
    expect(snapshot.vitals).toHaveLength(points * 3);
    expect(snapshot.overview.totalEvents).toBeGreaterThan(0);
    expect(snapshot.slowPages).toHaveLength(10);
    expect(
      snapshot.slowPages.every(
        (page, index, pages) =>
          index === 0 || pages[index - 1]!.lcpP95 >= page.lcpP95
      )
    ).toBe(true);
  });

  it("空数据场景不返回伪指标", async () => {
    const snapshot = await queryMockDashboard(
      {
        projectId: "shop-web",
        range: "7d",
        scenario: "empty"
      },
      { delayMs: 0, now: NOW }
    );

    expect(snapshot.overview).toEqual({
      totalEvents: 0,
      sessions: 0,
      errors: 0,
      errorRate: 0
    });
    expect(snapshot.vitals).toEqual([]);
    expect(snapshot.slowPages).toEqual([]);
    expect(snapshot.errors).toEqual([]);
  });

  it("查询失败场景返回可识别的服务错误", async () => {
    await expect(
      queryMockDashboard(
        {
          projectId: "shop-web",
          range: "7d",
          scenario: "error"
        },
        { delayMs: 0, now: NOW }
      )
    ).rejects.toEqual(
      expect.objectContaining<Partial<DashboardApiError>>({
        name: "DashboardApiError",
        status: 503
      })
    );
  });

  it("拒绝未知项目", async () => {
    await expect(
      queryMockDashboard(
        {
          projectId: "unknown-project",
          range: "7d"
        },
        { delayMs: 0, now: NOW }
      )
    ).rejects.toEqual(
      expect.objectContaining<Partial<DashboardApiError>>({
        status: 404
      })
    );
  });

  it("支持取消过期查询", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      queryMockDashboard(
        {
          projectId: "shop-web",
          range: "7d"
        },
        { delayMs: 1_000, signal: controller.signal }
      )
    ).rejects.toEqual(
      expect.objectContaining({
        name: "AbortError"
      })
    );
  });
});
