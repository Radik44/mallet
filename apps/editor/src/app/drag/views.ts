// The views' layout and its dragging: swapping views, floating them into
// windows, splitting; the size of the views area. A hook with the layout state.

import { useCallback, useEffect, useRef, useState } from "react";
import { SATELLITE, SAT_ANY } from "../../ui/satellite";
import { floatView, loadViews, moveFloat, saveViews, swapViews, type ViewId, type ViewsLayout } from "../../ui/viewsLayout";

export function useViewDrag() {
  const [views, setViewsState] = useState<ViewsLayout>(() => (SATELLITE ? { ...loadViews(), floating: {}, max: SATELLITE } : loadViews()));
  const viewsRef = useRef(views);
  viewsRef.current = views;
  const viewsEl = useRef<HTMLDivElement>(null);
  /** Size of the views area, so floating views stay reachable whatever window they were saved in. */
  const [viewsSize, setViewsSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = viewsEl.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewsSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const setViews = useCallback((next: ViewsLayout) => {
    viewsRef.current = next;
    setViewsState(next);
    if (!SAT_ANY) saveViews(next);
  }, []);
  /** A view being dragged by its title: where the cursor is and what it would land on. */
  const [viewDrag, setViewDrag] = useState<{ id: ViewId; x: number; y: number; target: ViewId | "float" | null } | null>(null);
  /** Over another view: swap with it. Anywhere else (panels, a floating view, the rail): open in a window. */
  const viewDropAt = useCallback((x: number, y: number): ViewId | "float" | null => {
    const el = document.elementFromPoint(x, y)?.closest("[data-view]:not(.floating)") as HTMLElement | null;
    if (el?.dataset.view) return el.dataset.view as ViewId;
    return x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight ? "float" : null;
  }, []);
  const startViewDrag = useCallback(
    (id: ViewId, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const sx = e.clientX;
      const sy = e.clientY;
      let started = false;
      const move = (ev: MouseEvent) => {
        if (!started) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          started = true;
        }
        setViewDrag({ id, x: ev.clientX, y: ev.clientY, target: viewDropAt(ev.clientX, ev.clientY) });
      };
      const up = (ev: MouseEvent) => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        if (!started) return;
        setViewDrag(null);
        const target = viewDropAt(ev.clientX, ev.clientY);
        const l = viewsRef.current;
        if (target === "float") {
          const b = viewsEl.current!.getBoundingClientRect();
          const w = Math.min(520, Math.max(240, b.width * 0.45));
          const h = Math.min(400, Math.max(180, b.height * 0.45));
          const x = Math.max(0, Math.min(b.width - w, ev.clientX - b.left - w / 2));
          const y = Math.max(0, Math.min(b.height - h, ev.clientY - b.top - 12));
          setViews(floatView(l, id, { x, y, w, h }));
        } else if (target && target !== id) setViews(swapViews(l, id, target));
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [setViews, viewDropAt],
  );
  /** Moves or resizes a floating view window. */
  const startViewFloat = useCallback(
    (id: ViewId, mode: "move" | "resize", e: React.MouseEvent) => {
      e.preventDefault();
      const f = viewsRef.current.floating[id];
      const b = viewsEl.current?.getBoundingClientRect();
      if (!f || !b) return;
      const start = { x: e.clientX, y: e.clientY, x0: f.x, y0: f.y, w: f.w, h: f.h };
      const move = (ev: MouseEvent) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        setViews(
          moveFloat(
            viewsRef.current,
            id,
            mode === "move"
              ? { x: Math.max(-start.w + 80, Math.min(b.width - 80, start.x0 + dx)), y: Math.max(0, Math.min(b.height - 30, start.y0 + dy)) }
              : { w: Math.max(200, start.w + dx), h: Math.max(140, start.h + dy) },
          ),
        );
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [setViews],
  );
  /** Drags the split between the view columns or rows. */
  const startViewSplit = useCallback(
    (axis: "col" | "row" | "both", e: React.MouseEvent) => {
      e.preventDefault();
      const b = viewsEl.current?.getBoundingClientRect();
      if (!b) return;
      const move = (ev: MouseEvent) => {
        const cx = Math.max(0.15, Math.min(0.85, (ev.clientX - b.left) / Math.max(1, b.width)));
        const cy = Math.max(0.15, Math.min(0.85, (ev.clientY - b.top) / Math.max(1, b.height)));
        const l = viewsRef.current;
        setViews(axis === "col" ? { ...l, col: cx } : axis === "row" ? { ...l, row: cy } : { ...l, col: cx, row: cy });
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [setViews],
  );
  return { views, viewsRef, viewsEl, viewsSize, setViews, viewDrag, startViewDrag, startViewFloat, startViewSplit };
}
