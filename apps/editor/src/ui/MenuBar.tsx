// Menu bar like every desktop program has: menus built from the editor's
// command list, each item with its hotkey, so a newcomer finds everything
// by reading instead of guessing toolbar buttons.

import { useEffect, useRef, useState } from "react";
import type { Command } from "./CommandPalette";

export type MenuItem = Command | "sep";

/** The part of a command's title before its explanation: «Сгруппировать: выбирать…» → «Сгруппировать». */
export function menuLabel(title: string): string {
  const cut = title.search(/:\s|\s\(/);
  const short = cut > 0 ? title.slice(0, cut) : title;
  return short.endsWith("…") || !title.endsWith("…") ? short : `${short}…`;
}

export interface Menu {
  title: string;
  items: MenuItem[];
}

interface Props {
  menus: Menu[];
  /** Shown at the right end: map name, state, messages. */
  right?: React.ReactNode;
}

export function MenuBar({ menus, right }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const close = (e: MouseEvent) => {
      if (bar.current && !bar.current.contains(e.target as Node)) setOpen(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);

  return (
    <div className="menubar" ref={bar}>
      {menus.map((m, i) => (
        <div key={m.title} className={`menu${open === i ? " open" : ""}`}>
          <button className="menu-title" onMouseDown={() => setOpen(open === i ? null : i)} onMouseEnter={() => open !== null && setOpen(i)}>
            {m.title}
          </button>
          {open === i && (
            <div className="menu-list">
              {m.items.map((it, j) =>
                it === "sep" ? (
                  <div key={j} className="menu-sep" />
                ) : (
                  <button
                    key={it.id}
                    className="menu-item"
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(null);
                      it.run();
                    }}
                  >
                    <span className="grow" title={it.title}>
                      {it.menuTitle ?? menuLabel(it.title)}
                    </span>
                    {it.hotkey && <span className="muted menu-key">{it.hotkey}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
      <span className="grow" />
      {right}
    </div>
  );
}
