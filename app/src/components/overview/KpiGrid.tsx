import type { DashboardOverview } from "@diwang/contracts";

interface KpiGridProps {
  overview: DashboardOverview;
}

const NUMBER_FORMATTER = new Intl.NumberFormat("zh-CN");

export function KpiGrid({ overview }: KpiGridProps) {
  const items = [
    {
      key: "events",
      label: "事件总量",
      title: "事件总量",
      value: NUMBER_FORMATTER.format(overview.totalEvents),
      suffix: "条",
      tone: "cyan"
    },
    {
      key: "sessions",
      label: "活跃会话",
      title: "会话数",
      value: NUMBER_FORMATTER.format(overview.sessions),
      suffix: "次",
      tone: "blue"
    },
    {
      key: "errors",
      label: "错误信号",
      title: "错误数",
      value: NUMBER_FORMATTER.format(overview.errors),
      suffix: "条",
      tone: "purple"
    },
    {
      key: "error-rate",
      label: "错误占比",
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
