// Arrangement of the four views (3D camera and the three 2D views): their
// order in the grid, the split between columns and rows, which ones float
// in their own window and which one fills the whole area. The canvases
// stay mounted whatever the arrangement, since a WebGPU canvas cannot be
// moved in the DOM without losing its context; only CSS positions change.

import type { CSSProperties } from "react";
import { t, lazy } from "../i18n";

export type ViewId = "3d" | "top" | "front" | "side";
export const ALL_VIEWS: ViewId[] = ["3d", "top", "front", "side"];
export const VIEW_NAMES: Record<ViewId, string> = lazy(() => ({ "3d": t("Камера"), top: t("Сверху (X/Y)"), front: t("Спереди (X/Z)"), side: t("Сбоку (Y/Z)") }));

export interface FloatRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ViewsLayout {
  /** Grid order: first two on the top row, the rest below. */
  order: ViewId[];
  /** Share of the width taken by the left column and of the height by the top row. */
  col: number;
  row: number;
  /** Views shown in their own window over the grid, with its place. */
  floating: Partial<Record<ViewId, FloatRect>>;
  /** The one view that fills the grid, or null for all of them. */
  max: ViewId | null;
}

const KEY = "gme.views";

export function defaultViews(): ViewsLayout {
  return { order: [...ALL_VIEWS], col: 0.5, row: 0.5, floating: {}, max: null };
}

const share = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0.15 && n <= 0.85 ? n : fallback;
};

export function loadViews(): ViewsLayout {
  const base = defaultViews();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const r = JSON.parse(raw) as Partial<ViewsLayout>;
    const order = Array.isArray(r.order) ? r.order.filter((v): v is ViewId => ALL_VIEWS.includes(v as ViewId)) : [];
    for (const v of ALL_VIEWS) if (!order.includes(v)) order.push(v);
    const floating: Partial<Record<ViewId, FloatRect>> = {};
    if (r.floating && typeof r.floating === "object") {
      for (const v of ALL_VIEWS) {
        const f = (r.floating as Record<string, Partial<FloatRect> | undefined>)[v];
        if (f) floating[v] = { x: Math.max(0, Number(f.x) || 0), y: Math.max(0, Number(f.y) || 0), w: Math.max(200, Number(f.w) || 480), h: Math.max(140, Number(f.h) || 360) };
      }
    }
    const max = ALL_VIEWS.includes(r.max as ViewId) && !floating[r.max as ViewId] ? (r.max as ViewId) : null;
    return { order: Array.from(new Set(order)), col: share(r.col, 0.5), row: share(r.row, 0.5), floating, max };
  } catch {
    return base;
  }
}

export function saveViews(l: ViewsLayout) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* storage unavailable */
  }
}

/** The views laid out in the grid, in grid order. */
export function gridViews(l: ViewsLayout): ViewId[] {
  if (l.max && !l.floating[l.max]) return [l.max];
  return l.order.filter((v) => !l.floating[v]);
}

/** Grid template for `count` cells: one column, two columns, or two by two (three cells: the last spans the bottom row). */
export function gridStyle(count: number, l: ViewsLayout): CSSProperties {
  return {
    gridTemplateColumns: count >= 2 ? `${l.col}fr ${1 - l.col}fr` : "1fr",
    gridTemplateRows: count >= 3 ? `${l.row}fr ${1 - l.row}fr` : "1fr",
  };
}

export function cellStyle(index: number, count: number): CSSProperties {
  if (count <= 1) return { gridColumn: "1 / -1", gridRow: "1" };
  if (count === 2) return { gridColumn: String(index + 1), gridRow: "1" };
  if (count === 3) return index < 2 ? { gridColumn: String(index + 1), gridRow: "1" } : { gridColumn: "1 / -1", gridRow: "2" };
  return { gridColumn: String((index % 2) + 1), gridRow: String(Math.floor(index / 2) + 1) };
}

export function swapViews(l: ViewsLayout, a: ViewId, b: ViewId): ViewsLayout {
  if (a === b) return l;
  const order = l.order.map((v) => (v === a ? b : v === b ? a : v));
  return { ...l, order };
}

export function floatView(l: ViewsLayout, id: ViewId, rect: FloatRect): ViewsLayout {
  return { ...l, floating: { ...l.floating, [id]: rect }, max: l.max === id ? null : l.max };
}

export function dockView(l: ViewsLayout, id: ViewId): ViewsLayout {
  const floating = { ...l.floating };
  delete floating[id];
  return { ...l, floating };
}

export function moveFloat(l: ViewsLayout, id: ViewId, patch: Partial<FloatRect>): ViewsLayout {
  const f = l.floating[id];
  if (!f) return l;
  return { ...l, floating: { ...l.floating, [id]: { ...f, ...patch } } };
}

/** Fills the grid with one view, or restores all of them when it already fills it. */
export function toggleMax(l: ViewsLayout, id: ViewId): ViewsLayout {
  if (l.floating[id]) return l;
  return { ...l, max: l.max === id ? null : id };
}
