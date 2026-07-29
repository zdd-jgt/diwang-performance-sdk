import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type {
  DashboardMetricName,
  DashboardRange,
  DashboardVitalsPoint
} from "@diwang/contracts";
import type { EChartsCoreOption } from "echarts/core";

type EChartsInstance = ReturnType<
  (typeof import("./chart-runtime"))["createVitalsChart"]
>;

interface VitalsChartProps {
  points: DashboardVitalsPoint[];
  range: DashboardRange;
}

const METRICS: Array<{
  name: DashboardMetricName;
  label: string;
  unit: string;
  good: number;
  poor: number;
}> = [
  {
    name: "LCP",
    label: "Largest Contentful Paint",
    unit: "ms",
    good: 2_500,
    poor: 4_000
  },
  {
    name: "CLS",
    label: "Cumulative Layout Shift",
    unit: "",
    good: 0.1,
    poor: 0.25
  },
  {
    name: "INP",
    label: "Interaction to Next Paint",
    unit: "ms",
    good: 200,
    poor: 500
  }
];

const SERIES = [
  { key: "p50", label: "P50", color: "#42dbff" },
  { key: "p95", label: "P95", color: "#7b7cff" },
  { key: "p99", label: "P99", color: "#b46cff" }
] as const;

function formatAxisTime(timestamp: string, range: DashboardRange): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("zh-CN", {
    month: range === "24h" ? undefined : "2-digit",
    day: range === "24h" ? undefined : "2-digit",
    hour: range === "24h" ? "2-digit" : undefined,
    hour12: false
  }).format(date);
}

function formatMetricValue(metric: DashboardMetricName, value: number): string {
  return metric === "CLS"
    ? value.toFixed(3)
    : Math.round(value).toLocaleString("zh-CN");
}

function metricStatus(
  metric: DashboardMetricName,
  value: number
): "good" | "needs-improvement" | "poor" {
  const config = METRICS.find((item) => item.name === metric)!;
  if (value <= config.good) return "good";
  if (value <= config.poor) return "needs-improvement";
  return "poor";
}

export function VitalsChart({ points, range }: VitalsChartProps) {
  const [activeMetric, setActiveMetric] =
    useState<DashboardMetricName>("LCP");
  const [chartFailed, setChartFailed] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const metricTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const metricPoints = useMemo(
    () =>
      points
        .filter((point) => point.metric === activeMetric)
        .sort(
          (left, right) =>
            new Date(left.timestamp).getTime() -
            new Date(right.timestamp).getTime()
        ),
    [activeMetric, points]
  );

  const currentMetric = METRICS.find((item) => item.name === activeMetric)!;
  const latestPoint = metricPoints.at(-1);
  const latestStatus = latestPoint
    ? metricStatus(activeMetric, latestPoint.p95)
    : "good";

  const handleMetricKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % METRICS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + METRICS.length) % METRICS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = METRICS.length - 1;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    const nextMetric = METRICS[nextIndex]!;
    setActiveMetric(nextMetric.name);
    metricTabRefs.current[nextIndex]?.focus();
  };

  useEffect(() => {
    const element = chartRef.current;
    if (!element || import.meta.env.MODE === "test") return;

    setChartFailed(false);
    let disposed = false;
    let chart: EChartsInstance | null = null;
    let observer: ResizeObserver | null = null;
    const resize = () => chart?.resize();

    void import("./chart-runtime")
      .then(({ createVitalsChart }) => {
        if (disposed) return;

        chart = createVitalsChart(element);

        const labels = metricPoints.map((point) =>
          formatAxisTime(point.timestamp, range)
        );
        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;
        const option: EChartsCoreOption = {
          animationDuration: reduceMotion ? 0 : 450,
          backgroundColor: "transparent",
          grid: {
            top: 30,
            right: 20,
            bottom: 34,
            left: activeMetric === "CLS" ? 46 : 62
          },
          tooltip: {
            trigger: "axis",
            backgroundColor: "rgba(3, 13, 31, 0.96)",
            borderColor: "rgba(72, 211, 255, 0.48)",
            textStyle: { color: "#d8f8ff", fontSize: 11 },
            axisPointer: {
              lineStyle: { color: "rgba(90, 219, 255, 0.32)" }
            }
          },
          xAxis: {
            type: "category",
            boundaryGap: false,
            data: labels,
            axisLine: { lineStyle: { color: "rgba(82, 155, 187, 0.2)" } },
            axisTick: { show: false },
            axisLabel: {
              color: "#527387",
              fontSize: 9,
              interval: range === "30d" ? 4 : range === "24h" ? 3 : 0
            }
          },
          yAxis: {
            type: "value",
            scale: true,
            splitNumber: 4,
            axisLabel: {
              color: "#527387",
              fontSize: 9,
              formatter: (value: number) =>
                activeMetric === "CLS"
                  ? value.toFixed(2)
                  : `${Math.round(value / 100) / 10}k`
            },
            splitLine: {
              lineStyle: {
                color: "rgba(55, 133, 171, 0.1)",
                type: "dashed"
              }
            }
          },
          series: SERIES.map((series) => ({
            name: series.label,
            type: "line",
            smooth: 0.28,
            symbol: "circle",
            symbolSize: series.key === "p95" ? 6 : 4,
            showSymbol: metricPoints.length <= 12,
            data: metricPoints.map((point) => point[series.key]),
            lineStyle: {
              color: series.color,
              width: series.key === "p95" ? 2.4 : 1.2,
              opacity: series.key === "p95" ? 1 : 0.6
            },
            itemStyle: {
              color: series.color,
              shadowColor: series.color,
              shadowBlur: series.key === "p95" ? 9 : 3
            },
            areaStyle:
              series.key === "p95"
                ? {
                    color: "rgba(72, 177, 255, 0.08)"
                  }
                : undefined
          }))
        };

        chart.setOption(option);
        observer =
          typeof ResizeObserver === "undefined"
            ? null
            : new ResizeObserver(resize);
        observer?.observe(element);
        window.addEventListener("resize", resize);
      })
      .catch(() => {
        if (!disposed) setChartFailed(true);
      });

    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      chart?.dispose();
    };
  }, [activeMetric, metricPoints, range]);

  return (
    <div className="vitals-module">
      <div className="vitals-toolbar">
        <div className="metric-tabs" role="tablist" aria-label="选择性能指标">
          {METRICS.map((metric, index) => (
            <button
              ref={(element) => {
                metricTabRefs.current[index] = element;
              }}
              id={`metric-tab-${metric.name.toLowerCase()}`}
              key={metric.name}
              type="button"
              role="tab"
              aria-controls="vitals-chart-panel"
              aria-label={`${metric.name} ${metric.label}`}
              aria-selected={activeMetric === metric.name}
              tabIndex={activeMetric === metric.name ? 0 : -1}
              onClick={() => setActiveMetric(metric.name)}
              onKeyDown={(event) => handleMetricKeyDown(event, index)}
            >
              <strong>{metric.name}</strong>
              <span>{metric.label}</span>
            </button>
          ))}
        </div>

        <div className={`metric-reading metric-reading--${latestStatus}`}>
          <span>LATEST P95</span>
          <strong>
            {latestPoint
              ? formatMetricValue(activeMetric, latestPoint.p95)
              : "--"}
            <small>{currentMetric.unit}</small>
          </strong>
        </div>
      </div>

      <div
        className="vitals-visual"
        id="vitals-chart-panel"
        role="tabpanel"
        aria-labelledby={`metric-tab-${activeMetric.toLowerCase()}`}
      >
        <div className="chart-legend" aria-label="分位数图例">
          {SERIES.map((series) => (
            <span key={series.key}>
              <i style={{ backgroundColor: series.color }} aria-hidden="true" />
              {series.label}
            </span>
          ))}
          <b>
            {metricPoints
              .reduce((sum, point) => sum + point.sampleCount, 0)
              .toLocaleString("zh-CN")}{" "}
            SAMPLES
          </b>
        </div>

        {chartFailed ? (
          <div className="chart-fallback" role="alert">
            图表模块加载失败，请刷新页面重试。
          </div>
        ) : (
          <div
            ref={chartRef}
            className="vitals-chart"
            role="img"
            aria-label={`${activeMetric} P50、P95、P99 趋势图`}
          />
        )}
      </div>
    </div>
  );
}
