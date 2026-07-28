import { describe, expect, it } from "vitest";

import {
  PerformanceState,
  rateCLS,
  rateINP,
  rateLCP
} from "../src/performance/state.js";

describe("PerformanceState", () => {
  it("按 1 秒间隔和 5 秒窗口计算最大 CLS 会话窗口", () => {
    const state = new PerformanceState();

    state.addLayoutShift({
      value: 0.05,
      startTime: 100,
      hadRecentInput: false
    });
    state.addLayoutShift({
      value: 0.08,
      startTime: 900,
      hadRecentInput: false
    });
    state.addLayoutShift({
      value: 0.5,
      startTime: 1_000,
      hadRecentInput: true
    });
    state.addLayoutShift({
      value: 0.03,
      startTime: 2_100,
      hadRecentInput: false
    });

    expect(state.finalMetrics()).toContainEqual({
      name: "CLS",
      value: 0.13,
      rating: "needs-improvement"
    });
  });

  it("累计 TBT，并使用每 50 次交互一个最差值估算 INP", () => {
    const state = new PerformanceState();
    state.addLongTask(40);
    state.addLongTask(80);
    state.addLongTask(120);

    for (let interactionId = 1; interactionId <= 50; interactionId += 1) {
      state.addInteraction({
        interactionId,
        duration: interactionId === 1 ? 800 : 100 + interactionId
      });
    }

    expect(state.finalMetrics()).toEqual(
      expect.arrayContaining([
        { name: "TBT", value: 100 },
        { name: "INP", value: 150, rating: "good" }
      ])
    );
  });

  it("保留每个 interactionId 的最长事件时长", () => {
    const state = new PerformanceState();
    state.addInteraction({ interactionId: 1, duration: 120 });
    state.addInteraction({ interactionId: 1, duration: 320 });

    expect(state.finalMetrics()).toContainEqual({
      name: "INP",
      value: 320,
      rating: "needs-improvement"
    });
  });
});

describe("Core Web Vitals 评分", () => {
  it("使用当前阈值评分", () => {
    expect(rateLCP(2_500)).toBe("good");
    expect(rateLCP(4_001)).toBe("poor");
    expect(rateCLS(0.1)).toBe("good");
    expect(rateCLS(0.2)).toBe("needs-improvement");
    expect(rateINP(500)).toBe("needs-improvement");
  });
});
