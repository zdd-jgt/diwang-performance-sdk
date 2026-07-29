import type {
  DashboardErrorBreakdown,
  DashboardErrorDetail,
  DashboardErrorKind
} from "@diwang/contracts";

interface ErrorIntelligenceProps {
  breakdown: DashboardErrorBreakdown[];
  errors: DashboardErrorDetail[];
  onSelect: (error: DashboardErrorDetail) => void;
}

const KIND_META: Record<
  DashboardErrorKind,
  { label: string; shortLabel: string }
> = {
  js: { label: "JavaScript 异常", shortLabel: "JS" },
  resource: { label: "资源加载失败", shortLabel: "RESOURCE" },
  unhandled_rejection: {
    label: "Promise 未处理",
    shortLabel: "PROMISE"
  }
};

function formatOccurredAt(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function pagePath(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
}

export function ErrorIntelligence({
  breakdown,
  errors,
  onSelect
}: ErrorIntelligenceProps) {
  const total = breakdown.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="error-intelligence">
      <div className="error-breakdown" aria-label="错误类型统计">
        {breakdown.map((item) => {
          const percent = total === 0 ? 0 : (item.count / total) * 100;
          return (
            <div className="error-breakdown__item" key={item.kind}>
              <div>
                <span>{KIND_META[item.kind].label}</span>
                <strong>{item.count.toLocaleString("zh-CN")}</strong>
              </div>
              <i aria-hidden="true">
                <b style={{ width: `${percent}%` }} />
              </i>
            </div>
          );
        })}
      </div>

      <div className="error-list__heading">
        <span>RECENT ERROR SAMPLES</span>
        <b>{errors.length} 条脱敏样本</b>
      </div>

      <div className="error-list" role="list" aria-label="最近错误样本">
        {errors.map((error) => (
          <button
            className="error-row"
            key={error.recordId}
            type="button"
            role="listitem"
            aria-label={`查看错误详情：${error.message}`}
            onClick={() => onSelect(error)}
          >
            <span className={`error-row__kind error-row__kind--${error.kind}`}>
              {KIND_META[error.kind].shortLabel}
            </span>
            <span className="error-row__content">
              <strong>{error.message}</strong>
              <small>{pagePath(error.pageUrl)}</small>
            </span>
            <time dateTime={error.occurredAt}>
              {formatOccurredAt(error.occurredAt)}
            </time>
            <i aria-hidden="true">→</i>
          </button>
        ))}
      </div>
    </div>
  );
}

