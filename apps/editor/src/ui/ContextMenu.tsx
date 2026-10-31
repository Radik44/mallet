// Right-click menu over the views: the actions a mapper reaches for most,
// taken from the command list so hotkeys and availability match the menus.

import { useEffect, useRef } from "react";
import { menuLabel } from "./MenuBar";
import type { MenuItem } from "./MenuBar";
import { zoomed } from "../viewport/dpi";

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose(): void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key, true);
    };
  }, [onClose]);
  // Keep the menu inside the window.
  const w = 280;
  const h = items.length * 26 + 10;
  const left = Math.max(4, Math.min(zoomed(x), zoomed(window.innerWidth) - w - 8));
  const top = Math.max(4, Math.min(zoomed(y), zoomed(window.innerHeight) - h - 8));
  return (
    <div ref={box} className="menu-list context-menu" style={{ left, top }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it === "sep" ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={it.id}
            className="menu-item"
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.run();
            }}
          >
            <span className="grow" title={it.title}>{menuLabel(it.title)}</span>
            {it.hotkey && <span className="muted menu-key">{it.hotkey}</span>}
          </button>
        ),
      )}
    </div>
  );
}
