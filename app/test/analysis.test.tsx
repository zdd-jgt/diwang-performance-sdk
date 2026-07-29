import type { DashboardSlowPage, DashboardVitalsPoint } from "@diwang/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  rankSlowPages,
  SlowPageRanking
} from "../src/components/slow-pages/SlowPageRanking";
import { VitalsChart } from "../src/components/vitals/VitalsChart";

function makePage(index: number, lcpP95: number): DashboardSlowPage {
  return {
    pageUrl: `https://shop.example/page-${index}`,
    lcpP95,
    visits: 100 + index,
    rating:
      lcpP95 <= 2_500
        ? "good"
        : lcpP95 <= 4_000
          ? "needs-improvement"
          : "poor"
  };
}

const VITALS: DashboardVitalsPoint[] = [
  {
    timestamp: "2026-07-28T00:00:00.000Z",
    metric: "LCP",
    p50: 1_200,
    p95: 2_800,
    p99: 4_200,
    sampleCount: 500
  },
  {
    timestamp: "2026-07-29T00:00:00.000Z",
    metric: "LCP",
    p50: 1_300,
    p95: 3_100,
    p99: 4_600,
    sampleCount: 600
  },
  {
    timestamp: "2026-07-29T00:00:00.000Z",
    metric: "CLS",
    p50: 0.04,
    p95: 0.12,
    p99: 0.21,
    sampleCount: 600
  },
  {
    timestamp: "2026-07-29T00:00:00.000Z",
    metric: "INP",
    p50: 120,
    p95: 260,
    p99: 420,
    sampleCount: 600
  }
];

describe("数据分析组件", () => {
  it("慢页面严格按 LCP P95 降序并只保留前 10", () => {
    const pages = Array.from({ length: 12 }, (_, index) =>
      makePage(index, 1_700 + index * 310)
    ).reverse();

    const ranked = rankSlowPages(pages);

    expect(ranked).toHaveLength(10);
    expect(ranked[0]?.lcpP95).toBe(5_110);
    expect(ranked.at(-1)?.lcpP95).toBe(2_320);
    expect(
      ranked.every(
        (page, index) =>
          index === 0 || ranked[index - 1]!.lcpP95 >= page.lcpP95
      )
    ).toBe(true);
  });

  it("慢页面组件展示访问量、等级和秒数", () => {
    render(
      <SlowPageRanking
        pages={[makePage(1, 4_520), makePage(2, 3_100)]}
      />
    );

    expect(screen.getByText("/page-1")).toBeTruthy();
    expect(screen.getByText("POOR")).toBeTruthy();
    expect(screen.getByText("4.52s")).toBeTruthy();
    expect(screen.getByText("101")).toBeTruthy();
  });

  it("Vitals 支持 LCP、CLS、INP 指标切换", async () => {
    const user = userEvent.setup();
    render(<VitalsChart points={VITALS} range="7d" />);

    const lcpTab = screen.getByRole("tab", {
      name: "LCP Largest Contentful Paint"
    });
    const clsTab = screen.getByRole("tab", {
      name: "CLS Cumulative Layout Shift"
    });
    expect(
      screen.getByRole("img", { name: "LCP P50、P95、P99 趋势图" })
    ).toBeTruthy();
    expect(screen.getByText("3,100")).toBeTruthy();

    lcpTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(clsTab);
    expect(clsTab.getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByRole("img", { name: "CLS P50、P95、P99 趋势图" })
    ).toBeTruthy();
    expect(screen.getByText("0.120")).toBeTruthy();

    await user.click(
      screen.getByRole("tab", {
        name: "INP Interaction to Next Paint"
      })
    );
    expect(
      screen.getByRole("img", { name: "INP P50、P95、P99 趋势图" })
    ).toBeTruthy();
    expect(screen.getByText("260")).toBeTruthy();
  });
});
