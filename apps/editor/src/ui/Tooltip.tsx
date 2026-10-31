// One styled tooltip for the whole editor. Any element with a `title` gets
// it: the first time the pointer lands on such an element the title moves
// to `data-help`, so the browser's own plain tooltip never shows. The text's
// first line (or the part before a colon) is the heading; a trailing
// "(Ctrl+E)" becomes a key badge.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { zoomed } from "../viewport/dpi";

interface Tip {
  head: string;
  body: string;
  keys: string[];
  x: number;
  y: number;
  up: boolean;
}

const KEY_RE = /\s*\(((?:Ctrl|Shift|Alt|F\d{1,2}|Esc|Enter|Delete|Backspace|Space|Tab|Home|End|PageUp|PageDown|Numpad\w*|[A-Z0-9↑↓←→,;'`\[\]\\/.-])(?:\+[^\s()]+)*(?:,\s*[^()]+)?)\)\s*$/;

/** Splits a title into heading, body and key badges. */
export function parseTip(text: string): { head: string; body: string; keys: string[] } {
  let t = text.trim();
  const keys: string[] = [];
  const m = KEY_RE.exec(t);
  if (m && m[1].length <= 24) {
    keys.push(...m[1].split(/,\s*/));
    t = t.slice(0, m.index).trim();
  }
  const nl = t.indexOf("\n");
  if (nl > 0) return { head: t.slice(0, nl).trim(), body: t.slice(nl + 1).trim(), keys };
  const colon = t.indexOf(": ");
  if (colon > 0 && colon <= 40) return { head: t.slice(0, colon), body: t.slice(colon + 2), keys };
  return t.length <= 48 ? { head: t, body: "", keys } : { head: "", body: t, keys };
}

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Keep the box inside the window: measure it and shift it off the edge it would cross.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !tip) return;
    const w = el.offsetWidth;
    const left = Math.max(8, Math.min(tip.x - w / 2, zoomed(window.innerWidth) - w - 8));
    el.style.left = `${left}px`;
  }, [tip]);

  useEffect(() => {
    let timer: number | null = null;
    let target: Element | null = null;
    const hide = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      target = null;
      setTip(null);
    };
    const over = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[title], [data-help]") as HTMLElement | null;
      if (!el || el === target) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      target = el;
      setTip(null);
      const title = el.getAttribute("title");
      if (title !== null) {
        el.setAttribute("data-help", title);
        el.removeAttribute("title");
      }
      const text = el.getAttribute("data-help") ?? "";
      if (!text.trim() || el.matches("input:not([type]), input[type='text'], textarea")) return;
      timer = window.setTimeout(() => {
        timer = null;
        if (target !== el || !el.isConnected) return;
        const rr = el.getBoundingClientRect();
        const r = { left: zoomed(rr.left), top: zoomed(rr.top), bottom: zoomed(rr.bottom), width: zoomed(rr.width) };
        const up = r.bottom + 90 > zoomed(window.innerHeight);
        const x = Math.max(8, Math.min(r.left + r.width / 2, zoomed(window.innerWidth) - 8));
        setTip({ ...parseTip(text), x, y: up ? r.top - 6 : r.bottom + 6, up });
      }, 380);
    };
    const out = (e: MouseEvent) => {
      if (!target) return;
      const to = e.relatedTarget as Node | null;
      if (to && target.contains(to)) return;
      hide();
    };
    document.addEventListener("mouseover", over, true);
    document.addEventListener("mouseout", out, true);
    document.addEventListener("mousedown", hide, true);
    document.addEventListener("keydown", hide, true);
    document.addEventListener("wheel", hide, { capture: true, passive: true });
    return () => {
      document.removeEventListener("mouseover", over, true);
      document.removeEventListener("mouseout", out, true);
      document.removeEventListener("mousedown", hide, true);
      document.removeEventListener("keydown", hide, true);
      document.removeEventListener("wheel", hide, true);
    };
  }, []);

  if (!tip) return null;
  return (
    <div ref={box} className={`tooltip${tip.up ? " up" : ""}`} style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.head && <div className="tooltip-head">{tip.head}</div>}
      {tip.body && <div className="tooltip-body">{tip.body}</div>}
      {tip.keys.length > 0 && (
        <div className="tooltip-keys">
          {tip.keys.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
        </div>
      )}
    </div>
  );
}
