import { useEffect, useMemo, useState } from "react";
import type {
  DashboardErrorDetail,
  DashboardProject,
  DashboardRange,
  DashboardSnapshot,
  MockScenario
} from "@diwang/contracts";

import {
  fetchDashboardProjects,
  fetchDashboardSnapshot
} from "./api/client";
import { ErrorDrawer } from "./components/errors/ErrorDrawer";
import { ErrorIntelligence } from "./components/errors/ErrorIntelligence";
import { DashboardFilters } from "./components/filters/DashboardFilters";
import { HudPanel } from "./components/layout/HudPanel";
import { QueryStatePanel } from "./components/layout/QueryStatePanel";
import { KpiGrid } from "./components/overview/KpiGrid";
import { SlowPageRanking } from "./components/slow-pages/SlowPageRanking";
import { VitalsChart } from "./components/vitals/VitalsChart";

const IS_MOCK_MODE = import.meta.env.MODE === "mock";

type SnapshotState =
  | { status: "idle" | "loading"; data?: DashboardSnapshot }
  | { status: "success"; data: DashboardSnapshot }
  | { status: "error"; message: string };

function formatUpdatedAt(value?: string): string {
  if (!value) return "--";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function App() {
  const [projects, setProjects] = useState<DashboardProject[]>([]);
  const [projectId, setProjectId] = useState("");
  const [range, setRange] = useState<DashboardRange>("7d");
  const [scenario, setScenario] = useState<MockScenario>("success");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [projectError, setProjectError] = useState("");
  const [selectedError, setSelectedError] =
    useState<DashboardErrorDetail | null>(null);
  const [snapshotState, setSnapshotState] = useState<SnapshotState>({
    status: "idle"
  });

  useEffect(() => {
    const controller = new AbortController();

    fetchDashboardProjects(controller.signal)
      .then((items) => {
        setProjects(items);
        setProjectId((current) => current || items[0]?.id || "");
        setProjectError("");
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setProjectError(
          error instanceof Error ? error.message : "项目列表加载失败"
        );
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!projectId) return;

    const controller = new AbortController();
    setSnapshotState({ status: "loading" });

    fetchDashboardSnapshot(
      {
        projectId,
        range,
        ...(IS_MOCK_MODE ? { scenario } : {})
      },
      controller.signal
    )
      .then((data) => {
        setSnapshotState({ status: "success", data });
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setSnapshotState({
          status: "error",
          message: error instanceof Error ? error.message : "查询执行失败"
        });
      });

    return () => controller.abort();
  }, [projectId, range, refreshVersion, scenario]);

  useEffect(() => {
    setSelectedError(null);
  }, [projectId, range, scenario]);

  const currentProjectName = useMemo(
    () => projects.find((project) => project.id === projectId)?.name ?? "--",
    [projectId, projects]
  );

  const snapshot =
    snapshotState.status === "success" ? snapshotState.data : undefined;
  const isEmpty =
    snapshot !== undefined &&
    snapshot.vitals.length === 0 &&
    snapshot.overview.totalEvents === 0;

  const statusLabel =
    snapshotState.status === "loading"
      ? "查询中"
      : snapshotState.status === "error"
        ? "服务异常"
        : snapshotState.status === "success"
          ? "数据已同步"
          : "初始化中";

  return (
    <div className="dashboard-page">
      <div className="ambient-grid" aria-hidden="true" />
      <div className="dashboard-shell">
        <span className="shell-corner shell-corner--top-left" aria-hidden="true" />
        <span
          className="shell-corner shell-corner--top-right"
          aria-hidden="true"
        />
        <span
          className="shell-corner shell-corner--bottom-left"
          aria-hidden="true"
        />
        <span
          className="shell-corner shell-corner--bottom-right"
          aria-hidden="true"
        />

        <header className="dashboard-header">
          <div>
            <p className="eyebrow">地网 · 前端性能观测与分析节点</p>
            <h1>
              地网 <span>数据分析面板</span>
            </h1>
            <p className="header-description">
              基于 Athena 半实时数据的 Web Vitals 与错误分析
            </p>
          </div>

          <div className="system-status" data-status={snapshotState.status}>
            <div className="system-status__node" aria-hidden="true">
              <span />
            </div>
            <div>
              <span className="system-status__label">系统状态</span>
              <strong>{statusLabel}</strong>
            </div>
            <div className="system-status__meta">
              <span>数据延迟</span>
              <b>{snapshot?.freshnessMinutes ?? "--"} 分钟</b>
            </div>
          </div>
        </header>

        <DashboardFilters
          projects={projects}
          projectId={projectId}
          range={range}
          scenario={scenario}
          mockMode={IS_MOCK_MODE}
          loading={snapshotState.status === "loading"}
          onProjectChange={setProjectId}
          onRangeChange={setRange}
          onScenarioChange={setScenario}
          onRefresh={() => setRefreshVersion((value) => value + 1)}
        />

        <div className="context-strip" aria-label="当前查询上下文">
          <span>
            当前项目 <strong>{currentProjectName}</strong>
          </span>
          <span>
            聚合粒度{" "}
            <strong>{snapshot?.granularity === "hour" ? "按小时" : "按天"}</strong>
          </span>
          <span>
            最近更新 <strong>{formatUpdatedAt(snapshot?.generatedAt)}</strong>
          </span>
          <span className="context-strip__live">
            <i aria-hidden="true" /> {IS_MOCK_MODE ? "模拟数据" : "真实数据 · 半实时"}
          </span>
        </div>

        {projectError ? (
          <QueryStatePanel
            tone="error"
            title="项目列表加载失败"
            description={projectError}
            actionLabel="重新加载页面"
            onAction={() => window.location.reload()}
          />
        ) : null}

        {!projectError && (!projectId || snapshotState.status === "loading") ? (
          <QueryStatePanel
            tone="loading"
            title="Athena 查询执行中"
            description="正在聚合性能分位数与错误样本，预计需要 1–5 秒。"
          />
        ) : null}

        {snapshotState.status === "error" ? (
          <QueryStatePanel
            tone="error"
            title="查询节点暂时不可用"
            description={snapshotState.message}
            actionLabel="重新执行查询"
            onAction={() => setRefreshVersion((value) => value + 1)}
          />
        ) : null}

        {isEmpty ? (
          <QueryStatePanel
            tone="empty"
            title="当前范围没有可分析数据"
            description={
              IS_MOCK_MODE
                ? "可以切换项目、时间范围，或将演示场景改回“正常数据”。"
                : "可以切换项目或时间范围；新日志完成清洗并写入 Athena 后再刷新查看。"
            }
          />
        ) : null}

        {snapshot && !isEmpty ? (
          <>
            <KpiGrid overview={snapshot.overview} />

            <section className="analysis-grid" aria-label="数据分析区域">
              <HudPanel
                className="analysis-grid__vitals"
                title="核心 Web Vitals"
                code="NODE-01"
                accent
              >
                <VitalsChart points={snapshot.vitals} range={range} />
              </HudPanel>

              <HudPanel title="慢页面排行" code="NODE-02">
                <SlowPageRanking pages={snapshot.slowPages} />
              </HudPanel>

              <HudPanel title="错误分析" code="NODE-03">
                <ErrorIntelligence
                  breakdown={snapshot.errorBreakdown}
                  errors={snapshot.errors}
                  onSelect={setSelectedError}
                />
              </HudPanel>
            </section>
          </>
        ) : null}

        <ErrorDrawer
          error={selectedError}
          onClose={() => setSelectedError(null)}
        />

        <footer className="dashboard-footer">
          <span>地网 PERFORMANCE SDK / 本地学习控制台</span>
          <span>
            {IS_MOCK_MODE
              ? "模拟数据模式 · 浏览器不保存 AWS 凭证"
              : "真实 Athena 数据 · 浏览器不保存 AWS 凭证"}
          </span>
        </footer>
      </div>
    </div>
  );
}
