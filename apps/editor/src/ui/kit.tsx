// The panels' shared building blocks: a frame with a title and actions,
// cards for sections, a segmented switch, labelled fields, empty states.
// Every panel is built from these so they read the same way.

import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/** A panel: title row with a subtitle and actions, then the body, then an optional footer. */
export function PanelFrame({ title, subtitle, actions, children, footer, className }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <aside className={`panel kit-panel${className ? ` ${className}` : ""}`}>
      <header className="kit-head">
        <div className="kit-head-text">
          <strong>{title}</strong>
          {subtitle ? <span className="kit-sub list-text">{subtitle}</span> : null}
        </div>
        {actions ? <div className="kit-actions">{actions}</div> : null}
      </header>
      <div className="kit-body">{children}</div>
      {footer ? <footer className="kit-foot">{footer}</footer> : null}
    </aside>
  );
}

/** A section card. `collapsible` cards remember their state per `id`. */
export function Card({ title, hint, icon, right, children, tone, collapsible, defaultOpen = true, id, flush, className }: { title?: string; hint?: ReactNode; icon?: IconName; right?: ReactNode; children: ReactNode; tone?: "ok" | "bad" | "warn" | "accent"; collapsible?: boolean; defaultOpen?: boolean; id?: string; flush?: boolean; className?: string }) {
  const key = id ? `gme.card.${id}` : null;
  const [open, setOpen] = useState(() => {
    if (!collapsible) return true;
    try {
      const v = key ? localStorage.getItem(key) : null;
      return v === null ? defaultOpen : v === "1";
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => {
    const v = !open;
    setOpen(v);
    try {
      if (key) localStorage.setItem(key, v ? "1" : "0");
    } catch {
      /* private mode */
    }
  };
  return (
    <section className={`card${tone ? ` tone-${tone}` : ""}${flush ? " flush" : ""}${collapsible && !open ? " closed" : ""}${className ? ` ${className}` : ""}`}>
      {title ? (
        <div className={`card-head${collapsible ? " clickable" : ""}`} onClick={collapsible ? toggle : undefined}>
          {collapsible ? <span className="card-chev">{open ? "▾" : "▸"}</span> : icon ? <Icon name={icon} size={13} /> : null}
          <strong>{title}</strong>
          {hint ? <span className="muted list-text card-hint">{hint}</span> : null}
          <span className="grow" />
          {right ? <span className="card-right" onClick={(e) => e.stopPropagation()}>{right}</span> : null}
        </div>
      ) : null}
      {open ? <div className="card-body">{children}</div> : null}
    </section>
  );
}

/** A switch between a few values, drawn as joined buttons. */
export function Segmented<T extends string>({ value, options, onChange, small }: { value: T; options: { value: T; label: ReactNode; title?: string; count?: number }[]; onChange(v: T): void; small?: boolean }) {
  return (
    <div className={`segmented${small ? " small" : ""}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)} title={o.title}>
          {o.label}
          {o.count !== undefined ? <span className="seg-count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Label on the left, controls on the right. */
export function Field({ label, hint, children, wide }: { label: ReactNode; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`field${wide ? " wide" : ""}`} title={hint}>
      <span className="field-label">{label}</span>
      <div className="field-ctl">{children}</div>
    </div>
  );
}

/** A row of controls. */
export function Row({ children, className, wrap, title }: { children: ReactNode; className?: string; wrap?: boolean; title?: string }) {
  return (
    <div className={`row${wrap ? " wrap" : ""}${className ? ` ${className}` : ""}`} title={title}>
      {children}
    </div>
  );
}

/** What a panel shows when there is nothing yet. */
export function Empty({ icon, title, text, action }: { icon?: IconName; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="kit-empty">
      {icon ? (
        <div className="kit-empty-icon">
          <Icon name={icon} size={20} />
        </div>
      ) : null}
      <div className="kit-empty-title">{title}</div>
      {text ? <div className="kit-empty-text">{text}</div> : null}
      {action ? <div className="kit-empty-action">{action}</div> : null}
    </div>
  );
}

export function Badge({ children, tone, title }: { children: ReactNode; tone?: "ok" | "bad" | "warn" | "muted" | "accent"; title?: string }) {
  return (
    <span className={`badge${tone ? ` ${tone}` : ""}`} title={title}>
      {children}
    </span>
  );
}

/** A status dot with a word. */
export function Status({ tone, children, title }: { tone: "ok" | "bad" | "warn" | "muted" | "busy"; children: ReactNode; title?: string }) {
  return (
    <span className={`status-dot-text ${tone}`} title={title}>
      <i />
      {children}
    </span>
  );
}
