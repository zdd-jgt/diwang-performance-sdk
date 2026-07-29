interface QueryStatePanelProps {
  tone: "loading" | "empty" | "error";
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function QueryStatePanel({
  tone,
  title,
  description,
  actionLabel,
  onAction
}: QueryStatePanelProps) {
  return (
    <section
      className={`query-state query-state--${tone}`}
      aria-live={tone === "loading" ? "polite" : "assertive"}
    >
      <div className="query-state__graphic" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div>
        <p>{tone === "loading" ? "查询流程" : "查询响应"}</p>
        <h2>{title}</h2>
        <span>{description}</span>
      </div>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}
