import type {
  DashboardProject,
  DashboardRange,
  MockScenario
} from "@diwang/contracts";

interface DashboardFiltersProps {
  projects: DashboardProject[];
  projectId: string;
  range: DashboardRange;
  scenario: MockScenario;
  mockMode: boolean;
  loading: boolean;
  onProjectChange: (value: string) => void;
  onRangeChange: (value: DashboardRange) => void;
  onScenarioChange: (value: MockScenario) => void;
  onRefresh: () => void;
}

const RANGE_OPTIONS: Array<{ value: DashboardRange; label: string }> = [
  { value: "24h", label: "最近 24 小时" },
  { value: "7d", label: "最近 7 天" },
  { value: "30d", label: "最近 30 天" }
];

const SCENARIO_OPTIONS: Array<{ value: MockScenario; label: string }> = [
  { value: "success", label: "正常数据" },
  { value: "empty", label: "空数据" },
  { value: "error", label: "查询失败" }
];

export function DashboardFilters({
  projects,
  projectId,
  range,
  scenario,
  mockMode,
  loading,
  onProjectChange,
  onRangeChange,
  onScenarioChange,
  onRefresh
}: DashboardFiltersProps) {
  return (
    <section className="filter-console" aria-label="数据面板筛选条件">
      <div className="filter-console__title">
        <span aria-hidden="true">⌁</span>
        <div>
          <strong>查询控制</strong>
          <small>{mockMode ? "配置分析范围与模拟场景" : "配置真实数据分析范围"}</small>
        </div>
      </div>

      <label className="filter-field">
        <span>项目</span>
        <select
          aria-label="选择项目"
          value={projectId}
          disabled={projects.length === 0}
          onChange={(event) => onProjectChange(event.target.value)}
        >
          {projects.length === 0 ? <option value="">正在读取项目...</option> : null}
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        <span>时间范围</span>
        <select
          aria-label="选择时间范围"
          value={range}
          onChange={(event) =>
            onRangeChange(event.target.value as DashboardRange)
          }
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {mockMode ? (
        <label className="filter-field">
          <span>演示场景</span>
          <select
            aria-label="选择演示场景"
            value={scenario}
            onChange={(event) =>
              onScenarioChange(event.target.value as MockScenario)
            }
          >
            {SCENARIO_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <button
        className="refresh-button"
        type="button"
        disabled={loading || !projectId}
        onClick={onRefresh}
      >
        <span aria-hidden="true">↻</span>
        {loading ? "查询中" : "刷新数据"}
      </button>
    </section>
  );
}
