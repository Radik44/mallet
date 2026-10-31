import { effectiveDpr, pointerCss } from "./dpi";
import { CURSORS } from "../ui/cursors";
import { t, lazy } from "../i18n";
// Orthographic cameras for Hammer's 2D views. Each view shows two world axes:
// Top is X/Y, Front is X/Z, Side is Y/Z. Middle mouse (or Space + left
// button) pans, the wheel zooms around the cursor. Plain left-button presses
// and drags are reported to the editor through `OrthoHandlers`.

export type ViewKind = "top" | "front" | "side";

/** Indices of the world axes shown horizontally and vertically. */
export function viewAxes(kind: ViewKind): [number, number] {
  switch (kind) {
    case "top":
      return [0, 1];
    case "front":
      return [0, 2];
    case "side":
      return [1, 2];
  }
}

export const VIEW_TITLES: Record<ViewKind, string> = lazy(() => ({
  top: t("Сверху (X/Y)"),
  front: t("Спереди (X/Z)"),
  side: t("Сбоку (Y/Z)"),
}));

export interface OrthoHandlers {
  /** Left button pressed at a world point (view axes). Return true to start a drag. */
  press(view: OrthoCamera, world: [number, number], e: MouseEvent): boolean;
  /** Mouse moved while dragging; `delta` is world units from the press point. */
  drag(view: OrthoCamera, delta: [number, number], e: MouseEvent): void;
  /** Drag finished. */
  release(view: OrthoCamera, delta: [number, number], e: MouseEvent): void;
  /** Mouse entered the view (for keyboard nudges). */
  enter(view: OrthoCamera): void;
  /** Left button double-clicked at a world point. */
  dblclick?(view: OrthoCamera, world: [number, number], e: MouseEvent): void;
  /** Mouse moved over the view without a drag in progress (hover feedback). */
  hover?(view: OrthoCamera, css: [number, number], e: MouseEvent): void;
  /** The wheel changed this view's zoom (for the zoom lock across views). */
  zoomed?(view: OrthoCamera): void;
}

export class OrthoCamera {
  /** World coordinate at the viewport centre, in view axes. */
  center: [number, number] = [0, 0];
  /** World units per device pixel. */
  unitsPerPixel = 4;
  /** Editing grid in world units; minor grid lines never go below it. */
  gridSize = 64;
  readonly axes: [number, number];
  handlers: OrthoHandlers | null = null;
  private panning = false;
  private cursorBefore = "";
  private dragging = false;
  private pressWorld: [number, number] = [0, 0];
  private last: [number, number] = [0, 0];
  private spaceHeld = false;
  private canvas: HTMLCanvasElement | null = null;

  constructor(readonly kind: ViewKind) {
    this.axes = viewAxes(kind);
  }

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("mouseenter", () => this.handlers?.enter(this));
    canvas.addEventListener("dblclick", (e) => {
      if (e.button === 0) this.handlers?.dblclick?.(this, this.eventToWorld(e), e);
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 1 || (e.button === 0 && this.spaceHeld)) {
        this.panning = true;
        this.last = [e.clientX, e.clientY];
        this.cursorBefore = canvas.style.cursor;
        canvas.style.cursor = CURSORS.grabbing;
        e.preventDefault();
        return;
      }
      if (e.button === 0 && this.handlers) {
        const w = this.eventToWorld(e);
        this.pressWorld = w;
        this.dragging = this.handlers.press(this, w, e);
        e.preventDefault();
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (this.panning) canvas.style.cursor = this.cursorBefore;
      this.panning = false;
      if (this.dragging && e.button === 0) {
        this.dragging = false;
        const w = this.eventToWorld(e);
        this.handlers?.release(this, [w[0] - this.pressWorld[0], w[1] - this.pressWorld[1]], e);
      }
    });
    window.addEventListener("mousemove", (e) => {
      if (this.panning) {
        const dpr = effectiveDpr();
        const dx = (e.clientX - this.last[0]) * dpr;
        const dy = (e.clientY - this.last[1]) * dpr;
        this.last = [e.clientX, e.clientY];
        this.center[0] -= dx * this.unitsPerPixel;
        this.center[1] += dy * this.unitsPerPixel;
        return;
      }
      if (this.dragging) {
        const w = this.eventToWorld(e);
        this.handlers?.drag(this, [w[0] - this.pressWorld[0], w[1] - this.pressWorld[1]], e);
      } else if (e.target === canvas && this.handlers?.hover) {
        this.handlers.hover(this, this.eventToCss(e), e);
      }
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        const dpr = effectiveDpr();
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) * dpr - (rect.width * dpr) / 2;
        const py = (e.clientY - rect.top) * dpr - (rect.height * dpr) / 2;
        const before = this.screenToWorld(px, py);
        const factor = e.deltaY < 0 ? 1 / 1.25 : 1.25;
        this.unitsPerPixel = Math.max(0.05, Math.min(256, this.unitsPerPixel * factor));
        const after = this.screenToWorld(px, py);
        this.center[0] += before[0] - after[0];
        this.center[1] += before[1] - after[1];
        this.handlers?.zoomed?.(this);
        e.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") this.spaceHeld = true;
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.spaceHeld = false;
    });
  }

  /** The attached canvas's size in CSS pixels. */
  cssSize(): [number, number] {
    const c = this.canvas;
    return c ? [c.clientWidth, c.clientHeight] : [1, 1];
  }

  /** Client coordinates of a mouse event to CSS pixels from the canvas's top-left. */
  eventToCss(e: MouseEvent): [number, number] {
    return pointerCss(e, this.canvas!);
  }

  /** CSS pixels from the canvas's top-left to world coordinates in view axes. */
  cssToWorld(css: [number, number]): [number, number] {
    const [w, h] = this.cssSize();
    const dpr = effectiveDpr();
    return this.screenToWorld((css[0] - w / 2) * dpr, (css[1] - h / 2) * dpr);
  }

  /** World coordinates in view axes to CSS pixels from the canvas's top-left. */
  worldToCss(world: [number, number]): [number, number] {
    const [w, h] = this.cssSize();
    const dpr = effectiveDpr();
    return [w / 2 + (world[0] - this.center[0]) / this.unitsPerPixel / dpr, h / 2 - (world[1] - this.center[1]) / this.unitsPerPixel / dpr];
  }

  /** Client coordinates of a mouse event to world coordinates in view axes. */
  eventToWorld(e: MouseEvent): [number, number] {
    const canvas = this.canvas!;
    const dpr = effectiveDpr();
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * dpr - (rect.width * dpr) / 2;
    const py = (e.clientY - rect.top) * dpr - (rect.height * dpr) / 2;
    return this.screenToWorld(px, py);
  }

  /** Pixel offset from the viewport centre to world coordinates in view axes. */
  screenToWorld(px: number, py: number): [number, number] {
    return [this.center[0] + px * this.unitsPerPixel, this.center[1] - py * this.unitsPerPixel];
  }

  /** A 2D view-axes delta as a 3D world delta. */
  toWorld3(delta: [number, number]): [number, number, number] {
    const out: [number, number, number] = [0, 0, 0];
    out[this.axes[0]] = delta[0];
    out[this.axes[1]] = delta[1];
    return out;
  }

  /** Snaps a world value to the editing grid. */
  snap(v: number): number {
    return Math.round(v / this.gridSize) * this.gridSize;
  }

  /** Fits a world box into a viewport of the given pixel size. */
  frame(lo: [number, number, number], hi: [number, number, number], width: number, height: number) {
    const [ax, ay] = this.axes;
    this.center = [(lo[ax] + hi[ax]) / 2, (lo[ay] + hi[ay]) / 2];
    const ext = Math.max(hi[ax] - lo[ax], hi[ay] - lo[ay], 64);
    this.unitsPerPixel = (ext * 1.15) / Math.max(64, Math.min(width, height));
  }

  /** Minor grid spacing drawn: the editing grid, coarsened until lines are 8 px apart. */
  gridSpacing(): number {
    let s = this.gridSize;
    while (s / this.unitsPerPixel < 8) s *= 2;
    return s;
  }

  /** Column-major orthographic view-projection for a viewport in device pixels. */
  viewProjection(width: number, height: number): Float32Array {
    const [ax, ay] = this.axes;
    const sx = 2 / (width * this.unitsPerPixel);
    const sy = 2 / (height * this.unitsPerPixel);
    const m = new Float32Array(16);
    // clip.x = (world[ax] - cx) * sx ; clip.y = (world[ay] - cy) * sy ; clip.z = 0.5
    m[ax * 4] = sx;
    m[ay * 4 + 1] = sy;
    m[12] = -this.center[0] * sx;
    m[13] = -this.center[1] * sy;
    m[14] = 0.5;
    m[15] = 1;
    return m;
  }
}
