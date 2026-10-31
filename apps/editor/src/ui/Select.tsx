// Drop-down list in the editor's own style instead of the system one: a
// button with the current choice and a menu under it (above it when there
// is no room). Keyboard: arrows move, Enter picks, Esc closes. The menu is
// positioned on the viewport so panels that clip their rows cannot cut it.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { zoomed } from "../viewport/dpi";

export interface SelectOption {
  value: string;
  label: string;
  /** Second line in the menu, for options that need a word of explanation. */
  hint?: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange(value: string): void;
  title?: string;
  /** Shown when `value` matches no option (for a "pick an action" list). */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Word before the choice on the button ("Порядок: Имя"). */
  prefix?: string;
}

export function Select({ value, options, onChange, title, placeholder, disabled, className, style, prefix }: Props) {
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean }>({ left: 0, top: 0, width: 0, up: false });
  const [cursor, setCursor] = useState(0);
  const current = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const rr = btn.current.getBoundingClientRect();
    const r = { left: zoomed(rr.left), top: zoomed(rr.top), bottom: zoomed(rr.bottom), width: zoomed(rr.width) };
    const vw = zoomed(window.innerWidth);
    const vh = zoomed(window.innerHeight);
    const h = Math.min(320, options.length * 26 + 10);
    const up = r.bottom + h + 8 > vh && r.top > h + 8;
    setPos({ left: Math.max(4, Math.min(r.left, vw - Math.max(r.width, 180) - 8)), top: up ? r.top - 2 : r.bottom + 2, width: r.width, up });
    setCursor(Math.max(0, options.findIndex((o) => o.value === value)));
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && e.target !== btn.current) setOpen(false);
    };
    const away = () => setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", away, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", away);
      window.removeEventListener("scroll", away, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>(".select-item.cursor")?.scrollIntoView({ block: "nearest" });
  }, [open, cursor]);

  const pick = (v: string) => {
    setOpen(false);
    if (v !== value) onChange(v);
    btn.current?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(options.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (options[cursor]) pick(options[cursor].value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`select-btn${open ? " open" : ""}${className ? ` ${className}` : ""}`}
        style={style}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
      >
        {prefix && <span className="select-prefix">{prefix}:</span>}
        <span className="select-label">{current?.label ?? placeholder ?? value}</span>
        <span className="select-arrow" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          ref={menu}
          className="menu-list select-menu"
          style={{ left: pos.left, top: pos.top, minWidth: Math.max(pos.width, 160), transform: pos.up ? "translateY(-100%)" : undefined }}
          onKeyDown={onKey}
        >
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              className={`menu-item select-item${o.value === value ? " selected" : ""}${i === cursor ? " cursor" : ""}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => pick(o.value)}
            >
              <span className="select-check">{o.value === value ? "✓" : ""}</span>
              <span className="grow">
                {o.label}
                {o.hint && <span className="muted select-hint">{o.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
