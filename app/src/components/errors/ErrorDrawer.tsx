import { useEffect, useRef } from "react";
import type { DashboardErrorDetail, DashboardErrorKind } from "@diwang/contracts";

interface ErrorDrawerProps {
  error: DashboardErrorDetail | null;
  onClose: () => void;
}

const KIND_LABEL: Record<DashboardErrorKind, string> = {
  js: "JavaScript 异常",
  resource: "资源加载失败",
  unhandled_rejection: "Promise 未处理"
};

function formatOccurredAt(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function ErrorDrawer({ error, onClose }: ErrorDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!error) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'button, a[href], select, textarea, input, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [error, onClose]);

  if (!error) return null;

  return (
    <div
      className="error-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={drawerRef}
        className="error-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="error-drawer-title"
      >
        <span className="error-drawer__edge" aria-hidden="true" />
        <header className="error-drawer__header">
          <div>
            <p>ERROR FORENSICS / SANITIZED SAMPLE</p>
            <h2 id="error-drawer-title">错误详情</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="关闭错误详情"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="error-drawer__body">
          <section className="error-drawer__message" aria-label="错误摘要">
            <span>{KIND_LABEL[error.kind]}</span>
            <strong>{error.message}</strong>
          </section>

          <dl className="error-metadata">
            <div>
              <dt>页面</dt>
              <dd>{error.pageUrl}</dd>
            </div>
            <div>
              <dt>浏览器</dt>
              <dd>
                {error.browserName} {error.browserVersion}
              </dd>
            </div>
            <div>
              <dt>操作系统</dt>
              <dd>
                {error.osName} {error.osVersion}
              </dd>
            </div>
            <div>
              <dt>发生时间</dt>
              <dd>{formatOccurredAt(error.occurredAt)}</dd>
            </div>
            <div>
              <dt>Record ID</dt>
              <dd>{error.recordId}</dd>
            </div>
          </dl>

          <section className="error-stack">
            <div>
              <span>SANITIZED STACK</span>
              <small>已移除用户输入与敏感上下文</small>
            </div>
            <pre>{error.stack}</pre>
          </section>

          <p className="error-drawer__note">
            第一版仅展示已脱敏的聚合样本，不执行 Source Map 还原。
          </p>
        </div>
      </aside>
    </div>
  );
}
