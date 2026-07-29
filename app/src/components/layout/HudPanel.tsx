import type { PropsWithChildren } from "react";

interface HudPanelProps extends PropsWithChildren {
  title: string;
  code?: string;
  accent?: boolean;
  className?: string;
}

export function HudPanel({
  title,
  code,
  accent = false,
  className = "",
  children
}: HudPanelProps) {
  return (
    <article
      className={`hud-panel${accent ? " hud-panel--accent" : ""} ${className}`}
    >
      <span className="hud-panel__notch" aria-hidden="true" />
      <header className="hud-panel__header">
        <div>
          <i aria-hidden="true" />
          <h2>{title}</h2>
        </div>
        {code ? <span>{code}</span> : null}
      </header>
      <div className="hud-panel__body">{children}</div>
    </article>
  );
}
