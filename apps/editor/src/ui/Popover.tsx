// A small floating panel anchored under a button, positioned on the viewport
// so panels that clip their rows cannot cut it (the same trick as Select).
// Closes on a click outside, Esc, resize or scroll.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { zoomed } from "../viewport/dpi";

interface Props {
  /** The element the popover hangs under. */
  anchor: HTMLElement | null;
  open: boolean;
  onClose(): void;
  width: number;
  /** Rough height, for flipping above the anchor when there is no room below. */
  height: number;
  className?: string;
  children: ReactNode;
}

export function Popover({ anchor, open, onClose, width, height, className, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const rr = anchor.getBoundingClientRect();
    const r = { left: zoomed(rr.left), right: zoomed(rr.right), top: zoomed(rr.top), bottom: zoomed(rr.bottom) };
    const vw = zoomed(window.innerWidth);
    const vh = zoomed(window.innerHeight);
    const up = r.bottom + height + 8 > vh && r.top > height + 8;
    // Right-aligned to the anchor when it would stick out on the right.
    const left = Math.max(4, Math.min(r.left, vw - width - 8));
    setPos({ left, top: up ? r.top - height - 4 : r.bottom + 4 });
  }, [open, anchor, width, height]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const away = () => onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", away, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", away);
      window.removeEventListener("scroll", away, true);
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return (
    <div ref={box} className={`popover${className ? ` ${className}` : ""}`} style={{ left: pos.left, top: pos.top, width }} onMouseDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}
