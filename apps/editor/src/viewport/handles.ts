// Hammer-style selection handles for the 2D views: a dashed bounds rectangle
// with square resize handles, or round rotate handles, drawn on a plain 2D
// canvas laid over each WebGPU view. Hit testing is in CSS pixels.

import type { OrthoCamera } from "./camera2d";
import type { Box3 } from "./transform";

export type HandleMode = "move" | "scale" | "rotate";

/** `sx`/`sy` pick the rectangle edge or corner in view axes (-1 low, 0 middle, 1 high). */
export type Handle = { kind: "scale"; sx: -1 | 0 | 1; sy: -1 | 0 | 1 } | { kind: "rotate"; sx: -1 | 1; sy: -1 | 1 };

const HALF = 4;
const HIT = 7;
const ROTATE_OFFSET = 12;

export function nextMode(mode: HandleMode): HandleMode {
  return mode === "move" ? "scale" : mode === "scale" ? "rotate" : "move";
}

/** Bounds rectangle of a box in CSS pixels of the view: [x0, y0, x1, y1] with y0 < y1. */
export function rectCss(view: OrthoCamera, bounds: Box3): [number, number, number, number] {
  const [ax, ay] = view.axes;
  const a = view.worldToCss([bounds[0][ax], bounds[0][ay]]);
  const b = view.worldToCss([bounds[1][ax], bounds[1][ay]]);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
}

export function handlePositions(view: OrthoCamera, bounds: Box3, mode: HandleMode): { handle: Handle; css: [number, number] }[] {
  if (mode === "move") return [];
  const [x0, y0, x1, y1] = rectCss(view, bounds);
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  const out: { handle: Handle; css: [number, number] }[] = [];
  // Screen y grows downwards while the view's vertical axis grows upwards.
  const xs: [number, -1 | 0 | 1][] = [
    [x0, -1],
    [xm, 0],
    [x1, 1],
  ];
  const ys: [number, -1 | 0 | 1][] = [
    [y1, -1],
    [ym, 0],
    [y0, 1],
  ];
  for (const [x, sx] of xs) {
    for (const [y, sy] of ys) {
      if (sx === 0 && sy === 0) continue;
      if (mode === "scale") out.push({ handle: { kind: "scale", sx, sy }, css: [x, y] });
      else if (sx !== 0 && sy !== 0) {
        out.push({ handle: { kind: "rotate", sx, sy }, css: [x + sx * ROTATE_OFFSET, y - sy * ROTATE_OFFSET] });
      }
    }
  }
  return out;
}

export function hitHandle(view: OrthoCamera, bounds: Box3, mode: HandleMode, css: [number, number]): Handle | null {
  for (const { handle, css: p } of handlePositions(view, bounds, mode)) {
    if (Math.abs(p[0] - css[0]) <= HIT && Math.abs(p[1] - css[1]) <= HIT) return handle;
  }
  return null;
}

/** CSS cursor for a hovered handle. */
export function handleCursor(h: Handle | null): string {
  if (!h) return "";
  if (h.kind === "rotate") return "rotate";
  if (h.sx === 0) return "ns-resize";
  if (h.sy === 0) return "ew-resize";
  // Screen diagonal: sx and sy equal means low-left/high-right which is the "/" diagonal.
  return h.sx === h.sy ? "nesw-resize" : "nwse-resize";
}

export interface Overlay2DState {
  bounds: Box3 | null;
  mode: HandleMode;
  hover: Handle | null;
  /** Marquee rectangle in CSS pixels, if one is being dragged. */
  marquee: [number, number, number, number] | null;
  /** Live angle text for rotate drags. */
  label: string;
  /** Vertex-tool handles in CSS pixels: corners white, edge midpoints yellow. */
  points?: { css: [number, number]; kind: "vertex" | "edge"; hot: boolean }[];
  /** Notes pinned to the map, in CSS pixels: a dot with the text beside it. */
  notes?: { css: [number, number]; text: string; done: boolean }[];
}

/** Radius in CSS pixels within which a click on a 2D view hits a note's dot. */
export const NOTE_HIT_RADIUS = 8;

export function drawOverlay2D(ctx: CanvasRenderingContext2D, view: OrthoCamera, state: Overlay2DState) {
  const [w, h] = view.cssSize();
  ctx.clearRect(0, 0, w, h);
  if (state.bounds) {
    const [x0, y0, x1, y1] = rectCss(view, state.bounds);
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = state.mode === "move" ? "rgba(255,255,255,0.75)" : "rgba(255,230,120,0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0), Math.round(y1 - y0));
    ctx.restore();
    for (const { handle, css } of handlePositions(view, state.bounds, state.mode)) {
      const hot = state.hover && sameHandle(state.hover, handle);
      ctx.fillStyle = hot ? "#ffd43b" : "#ffffff";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      if (handle.kind === "scale") {
        ctx.fillRect(css[0] - HALF, css[1] - HALF, HALF * 2, HALF * 2);
        ctx.strokeRect(css[0] - HALF + 0.5, css[1] - HALF + 0.5, HALF * 2 - 1, HALF * 2 - 1);
      } else {
        ctx.beginPath();
        ctx.arc(css[0], css[1], HALF + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    if (state.label) {
      ctx.font = "12px Segoe UI, system-ui, sans-serif";
      ctx.fillStyle = "#ffd43b";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 3;
      ctx.strokeText(state.label, x0, y0 - 6);
      ctx.fillText(state.label, x0, y0 - 6);
    }
  }
  for (const p of state.points ?? []) {
    const r = p.kind === "vertex" ? HALF : HALF - 1;
    ctx.fillStyle = p.hot ? "#ff922b" : p.kind === "vertex" ? "#ffffff" : "#ffd43b";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.fillRect(p.css[0] - r, p.css[1] - r, r * 2, r * 2);
    ctx.strokeRect(p.css[0] - r + 0.5, p.css[1] - r + 0.5, r * 2 - 1, r * 2 - 1);
  }
  for (const n of state.notes ?? []) {
    const [x, y] = [Math.round(n.css[0]), Math.round(n.css[1])];
    ctx.save();
    ctx.globalAlpha = n.done ? 0.55 : 1;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = n.done ? "#69db7c" : "#ffd43b";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    const text = n.text.length > 28 ? `${n.text.slice(0, 27)}…` : n.text || "…";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.fillStyle = n.done ? "#c9d1c9" : "#f3e6b5";
    ctx.strokeText(text, x + 9, y);
    ctx.fillText(text, x + 9, y);
    if (n.done) {
      const w = ctx.measureText(text).width;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#c9d1c9";
      ctx.beginPath();
      ctx.moveTo(x + 9, y + 0.5);
      ctx.lineTo(x + 9 + w, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (state.marquee) {
    const [x0, y0, x1, y1] = state.marquee;
    ctx.save();
    ctx.setLineDash([5, 3]);
    ctx.strokeStyle = "rgba(255,230,120,0.95)";
    ctx.fillStyle = "rgba(255,230,120,0.08)";
    ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    ctx.strokeRect(Math.round(Math.min(x0, x1)) + 0.5, Math.round(Math.min(y0, y1)) + 0.5, Math.round(Math.abs(x1 - x0)), Math.round(Math.abs(y1 - y0)));
    ctx.restore();
  }
}

function sameHandle(a: Handle, b: Handle): boolean {
  return a.kind === b.kind && a.sx === b.sx && a.sy === b.sy;
}
