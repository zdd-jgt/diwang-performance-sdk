import type { MetricRating, MetricSample } from "../types.js";

interface LayoutShiftLike {
  value: number;
  startTime: number;
  hadRecentInput: boolean;
}

interface InteractionLike {
  interactionId: number;
  duration: number;
}

export class PerformanceState {
  private lcp: number | undefined;
  private tbt = 0;
  private currentCLSWindow = 0;
  private currentCLSWindowStart = 0;
  private lastCLSEntryTime = 0;
  private maximumCLSWindow = 0;
  private readonly interactions = new Map<number, number>();

  public addLCP(value: number): void {
    if (isNonNegativeFinite(value)) {
      this.lcp = value;
    }
  }

  public addLayoutShift(entry: LayoutShiftLike): void {
    if (
      entry.hadRecentInput ||
      !isNonNegativeFinite(entry.value) ||
      !isNonNegativeFinite(entry.startTime)
    ) {
      return;
    }

    const continuesWindow =
      this.currentCLSWindow > 0 &&
      entry.startTime - this.lastCLSEntryTime <= 1_000 &&
      entry.startTime - this.currentCLSWindowStart <= 5_000;

    if (continuesWindow) {
      this.currentCLSWindow += entry.value;
    } else {
      this.currentCLSWindow = entry.value;
      this.currentCLSWindowStart = entry.startTime;
    }
    this.lastCLSEntryTime = entry.startTime;
    this.maximumCLSWindow = Math.max(
      this.maximumCLSWindow,
      this.currentCLSWindow
    );
  }

  public addLongTask(duration: number): void {
    if (isNonNegativeFinite(duration) && duration > 50) {
      this.tbt += duration - 50;
    }
  }

  public addInteraction(entry: InteractionLike): void {
    if (
      !Number.isInteger(entry.interactionId) ||
      entry.interactionId <= 0 ||
      !isNonNegativeFinite(entry.duration)
    ) {
      return;
    }
    this.interactions.set(
      entry.interactionId,
      Math.max(
        entry.duration,
        this.interactions.get(entry.interactionId) ?? 0
      )
    );
  }

  public finalMetrics(): MetricSample[] {
    const metrics: MetricSample[] = [
      {
        name: "CLS",
        value: round(this.maximumCLSWindow, 4),
        rating: rateCLS(this.maximumCLSWindow)
      },
      { name: "TBT", value: round(this.tbt, 2) }
    ];

    if (this.lcp !== undefined) {
      metrics.unshift({
        name: "LCP",
        value: round(this.lcp, 2),
        rating: rateLCP(this.lcp)
      });
    }

    const inp = this.getINP();
    if (inp !== undefined) {
      metrics.push({
        name: "INP",
        value: round(inp, 2),
        rating: rateINP(inp)
      });
    }
    return metrics;
  }

  private getINP(): number | undefined {
    if (this.interactions.size === 0) {
      return undefined;
    }
    const durations = [...this.interactions.values()].sort(
      (left, right) => right - left
    );
    return durations[Math.floor(durations.length / 50)];
  }
}

export function rateLCP(value: number): MetricRating {
  return value <= 2_500
    ? "good"
    : value <= 4_000
      ? "needs-improvement"
      : "poor";
}

export function rateCLS(value: number): MetricRating {
  return value <= 0.1
    ? "good"
    : value <= 0.25
      ? "needs-improvement"
      : "poor";
}

export function rateINP(value: number): MetricRating {
  return value <= 200
    ? "good"
    : value <= 500
      ? "needs-improvement"
      : "poor";
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
