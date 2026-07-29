import type {
  DashboardErrorBreakdown,
  DashboardErrorDetail
} from "@diwang/contracts";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { ErrorDrawer } from "../src/components/errors/ErrorDrawer";
import { ErrorIntelligence } from "../src/components/errors/ErrorIntelligence";

const ERROR: DashboardErrorDetail = {
  recordId: "10000000-0000-4000-8000-000000000001",
  kind: "js",
  message: "Cannot read properties of undefined",
  pageUrl: "https://shop-web.example/checkout/confirm",
  browserName: "Chrome",
  browserVersion: "142.0",
  osName: "macOS",
  osVersion: "16.0",
  occurredAt: "2026-07-29T08:00:00.000Z",
  stack: [
    "Cannot read properties of undefined",
    "    at renderCard ([app]/assets/main.js:1:4821)"
  ].join("\n")
};

const BREAKDOWN: DashboardErrorBreakdown[] = [
  { kind: "js", count: 54 },
  { kind: "resource", count: 28 },
  { kind: "unhandled_rejection", count: 18 }
];

function ErrorHarness() {
  const [selected, setSelected] = useState<DashboardErrorDetail | null>(null);
  return (
    <>
      <ErrorIntelligence
        breakdown={BREAKDOWN}
        errors={[ERROR]}
        onSelect={setSelected}
      />
      <ErrorDrawer error={selected} onClose={() => setSelected(null)} />
    </>
  );
}

describe("错误分析组件", () => {
  it("展示三类错误统计和脱敏样本", () => {
    render(
      <ErrorIntelligence
        breakdown={BREAKDOWN}
        errors={[ERROR]}
        onSelect={() => undefined}
      />
    );

    expect(screen.getByText("JavaScript 异常")).toBeTruthy();
    expect(screen.getByText("资源加载失败")).toBeTruthy();
    expect(screen.getByText("Promise 未处理")).toBeTruthy();
    expect(screen.getByText("1 条脱敏样本")).toBeTruthy();
    expect(screen.getByText("/checkout/confirm")).toBeTruthy();
  });

  it("点击错误样本后展示完整详情，并支持按钮关闭", async () => {
    const user = userEvent.setup();
    render(<ErrorHarness />);

    const errorRow = screen.getByRole("listitem", {
      name: "查看错误详情：Cannot read properties of undefined"
    });
    await user.click(errorRow);

    const dialog = screen.getByRole("dialog", { name: "错误详情" });
    expect(within(dialog).getByText(ERROR.message)).toBeTruthy();
    expect(within(dialog).getByText(ERROR.pageUrl)).toBeTruthy();
    expect(within(dialog).getByText("Chrome 142.0")).toBeTruthy();
    expect(within(dialog).getByText("macOS 16.0")).toBeTruthy();
    expect(within(dialog).getByText(ERROR.recordId)).toBeTruthy();
    expect(within(dialog).getByText(/renderCard \(\[app\]/)).toBeTruthy();
    expect(
      within(dialog).getByText("已移除用户输入与敏感上下文")
    ).toBeTruthy();

    const closeButton = within(dialog).getByRole("button", {
      name: "关闭错误详情"
    });
    expect(document.activeElement).toBe(closeButton);
    await user.tab();
    expect(document.activeElement).toBe(closeButton);
    await user.click(closeButton);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(errorRow);
  });

  it("错误详情支持 Escape 关闭", async () => {
    const user = userEvent.setup();
    render(<ErrorHarness />);

    await user.click(
      screen.getByRole("listitem", {
        name: "查看错误详情：Cannot read properties of undefined"
      })
    );
    expect(screen.getByRole("dialog")).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
