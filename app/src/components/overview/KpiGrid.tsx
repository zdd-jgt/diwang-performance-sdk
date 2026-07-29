import type { DashboardOverview } from "@diwang/contracts";

interface KpiGridProps {
  overview: DashboardOverview;
}

const NUMBER_FORMATTER = new Intl.NumberFormat("zh-CN");

export function KpiGrid({ overview }: KpiGridProps) {
  const items = [
    {
      key: "events",
      label: "TOTAL EVENTS",
      title: "事件总量",
      value: NUMBER_FORMATTER.format(overview.totalEvents),
      suffix: "records",
      tone: "cyan"
    },
    {
      key: "sessions",
      label: "ACTIVE SESSIONS",
      title: "会话数",
      value: NUMBER_FORMATTER.format(overview.sessions),
      suffix: "sessions",
      tone: "blue"
    },
    {
      key: "errors",
      label: "ERROR SIGNALS",
      title: "错误数",
      value: NUMBER_FORMATTER.format(overview.errors),
      suffix: "events",
      tone: "purple"
    },
    {
      key: "error-rate",
      label: "ERROR RATIO",
      title: "错误率",
      value: overview.errorRate.toFixed(2),
      suffix: "%",
      tone: overview.errorRate >= 2 ? "warning" : "cyan"
    }
  ] as const;

  return (
    <section className="kpi-grid" aria-label="性能概览">
      {items.map((item, index) => (
        <article
          className={`kpi-card kpi-card--${item.tone}`}
          key={item.key}
        >
          <div className="kpi-card__index">0{index + 1}</div>
          <div className="kpi-card__heading">
            <span>{item.label}</span>
            <i aria-hidden="true" />
          </div>
          <p>{item.title}</p>
          <strong>
            {item.value}
            <small>{item.suffix}</small>
          </strong>
          <div className="kpi-card__signal" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </article>
      ))}
    </section>
  );
}
