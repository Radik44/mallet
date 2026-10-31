// The texture painter's pixels: straight-alpha RGBA layers with brush dabs,
// strokes, shapes, flood fill, seamless wrapping and mirroring, composited
// into one picture. Pure functions over typed arrays, so they run in tests
// and in the autotest without a DOM; the panel draws them to a canvas.

import { t as tr } from "../i18n";

export interface Pix {
  w: number;
  h: number;
  /** RGBA, straight alpha, row-major. */
  data: Uint8ClampedArray;
}

/** Red, green, blue, alpha in 0..255. */
export type Rgba = [number, number, number, number];

export interface BrushOptions {
  /** Radius in pixels; 0.5 is one pixel. */
  radius: number;
  /** 1 is a hard edge, 0 fades from the centre. */
  hardness: number;
  /** 0..1 */
  opacity: number;
  color: Rgba;
  erase?: boolean;
  /** Seamless mode: dabs that cross an edge continue on the opposite side. */
  wrap?: boolean;
  mirrorX?: boolean;
  mirrorY?: boolean;
}

export interface Layer {
  id: number;
  name: string;
  pix: Pix;
  visible: boolean;
  /** 0..1 */
  opacity: number;
}

export function makePix(w: number, h: number, fill?: Rgba): Pix {
  const data = new Uint8ClampedArray(w * h * 4);
  if (fill && fill[3] > 0) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = fill[3];
    }
  }
  return { w, h, data };
}

export function clonePix(p: Pix): Pix {
  return { w: p.w, h: p.h, data: new Uint8ClampedArray(p.data) };
}

/** Source-over of one straight-alpha colour onto pixel `i` (byte offset), `a` in 0..1. */
export function blendPixel(data: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number): void {
  if (a <= 0) return;
  const da = data[i + 3] / 255;
  const oa = a + da * (1 - a);
  if (oa <= 0) return;
  const wd = (da * (1 - a)) / oa;
  const ws = a / oa;
  data[i] = r * ws + data[i] * wd;
  data[i + 1] = g * ws + data[i + 1] * wd;
  data[i + 2] = b * ws + data[i + 2] * wd;
  data[i + 3] = oa * 255;
}

/** Takes `a` (0..1) of the pixel's alpha away. */
export function erasePixel(data: Uint8ClampedArray, i: number, a: number): void {
  if (a <= 0) return;
  data[i + 3] = data[i + 3] * (1 - a);
}

/** Where a point lands with mirroring: itself and its reflections. */
export function mirrorPoints(x: number, y: number, w: number, h: number, mirrorX: boolean, mirrorY: boolean): [number, number][] {
  const pts: [number, number][] = [[x, y]];
  if (mirrorX) pts.push([w - x, y]);
  if (mirrorY) for (const [px, py] of pts.slice()) pts.push([px, h - py]);
  return pts;
}

function dabOnce(p: Pix, cx: number, cy: number, o: BrushOptions): void {
  const r = Math.max(0.5, o.radius);
  const hard = Math.max(0, Math.min(1, o.hardness));
  const inner = r * hard;
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(p.w - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(p.h - 1, Math.ceil(cy + r + 1));
  if (x0 > x1 || y0 > y1) return;
  const [cr, cg, cb, ca] = o.color;
  const alpha = (ca / 255) * o.opacity;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const d = Math.sqrt(dx * dx + dy * dy);
      let cov: number;
      if (r <= 0.5) cov = d < 0.5 ? 1 : 0;
      else if (d <= inner) cov = 1;
      else if (d >= r) cov = 0;
      else cov = 1 - (d - inner) / (r - inner);
      // The edge gets a half-pixel of anti-aliasing even when hard.
      if (hard >= 1 && r > 0.5) cov = Math.max(0, Math.min(1, r - d + 0.5));
      if (cov <= 0) continue;
      const i = (y * p.w + x) * 4;
      if (o.erase) erasePixel(p.data, i, cov * alpha);
      else blendPixel(p.data, i, cr, cg, cb, cov * alpha);
    }
  }
}

/** One brush dab at `(cx, cy)` with wrapping and mirroring applied. */
export function dab(p: Pix, cx: number, cy: number, o: BrushOptions): void {
  const r = Math.max(0.5, o.radius) + 1;
  for (const [mx, my] of mirrorPoints(cx, cy, p.w, p.h, !!o.mirrorX, !!o.mirrorY)) {
    if (!o.wrap) {
      dabOnce(p, mx, my, o);
      continue;
    }
    // Seamless: bring the centre into the picture, then repeat across every edge it touches.
    const x = ((mx % p.w) + p.w) % p.w;
    const y = ((my % p.h) + p.h) % p.h;
    const xs = [x];
    if (x - r < 0) xs.push(x + p.w);
    if (x + r > p.w) xs.push(x - p.w);
    const ys = [y];
    if (y - r < 0) ys.push(y + p.h);
    if (y + r > p.h) ys.push(y - p.h);
    for (const px of xs) for (const py of ys) dabOnce(p, px, py, o);
  }
}

/** Dabs from `(x0, y0)` to `(x1, y1)`, spaced by a quarter of the radius. */
export function stroke(p: Pix, x0: number, y0: number, x1: number, y1: number, o: BrushOptions): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const step = Math.max(0.5, Math.max(0.5, o.radius) * 0.25);
  const n = Math.max(1, Math.ceil(len / step));
  // Overlapping soft dabs would pile up; scale each so the line reads as one stroke.
  const per = { ...o, opacity: o.hardness >= 1 ? o.opacity : 1 - Math.pow(1 - o.opacity, 1 / Math.max(1, Math.min(4, (o.radius * 2) / step / 2))) };
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    dab(p, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, per);
  }
}

/** A straight line between the points. */
export function line(p: Pix, x0: number, y0: number, x1: number, y1: number, o: BrushOptions): void {
  stroke(p, x0, y0, x1, y1, { ...o, hardness: 1 });
}

/** A rectangle: outlined with the brush when `outline`, otherwise filled. */
export function rect(p: Pix, x0: number, y0: number, x1: number, y1: number, o: BrushOptions, outline: boolean): void {
  const ax = Math.min(x0, x1);
  const bx = Math.max(x0, x1);
  const ay = Math.min(y0, y1);
  const by = Math.max(y0, y1);
  if (outline) {
    line(p, ax, ay, bx, ay, o);
    line(p, bx, ay, bx, by, o);
    line(p, bx, by, ax, by, o);
    line(p, ax, by, ax, ay, o);
    return;
  }
  const [cr, cg, cb, ca] = o.color;
  const alpha = (ca / 255) * o.opacity;
  let boxes: [number, number, number, number][] = [[ax, ay, bx, by]];
  if (o.mirrorX) boxes = boxes.concat(boxes.map(([x0, y0, x1, y1]) => [p.w - x1, y0, p.w - x0, y1] as [number, number, number, number]));
  if (o.mirrorY) boxes = boxes.concat(boxes.map(([x0, y0, x1, y1]) => [x0, p.h - y1, x1, p.h - y0] as [number, number, number, number]));
  for (const [mx0, my0, mx1, my1] of boxes) {
    const fx0 = Math.floor(mx0);
    const fx1 = Math.ceil(mx1) - 1;
    const fy0 = Math.floor(my0);
    const fy1 = Math.ceil(my1) - 1;
    for (let y = fy0; y <= fy1; y++) {
      const wy = o.wrap ? ((y % p.h) + p.h) % p.h : y;
      if (wy < 0 || wy >= p.h) continue;
      for (let x = fx0; x <= fx1; x++) {
        const wx = o.wrap ? ((x % p.w) + p.w) % p.w : x;
        if (wx < 0 || wx >= p.w) continue;
        const i = (wy * p.w + wx) * 4;
        if (o.erase) erasePixel(p.data, i, alpha);
        else blendPixel(p.data, i, cr, cg, cb, alpha);
      }
    }
  }
}

/**
 * Flood fill from `(x, y)`: every 4-connected pixel within `tolerance`
 * (0..255, over all four channels) of the start colour takes `color`.
 */
export function floodFill(p: Pix, x: number, y: number, color: Rgba, tolerance: number, wrap: boolean): number {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return 0;
  const d = p.data;
  const start = (y * p.w + x) * 4;
  const sr = d[start];
  const sg = d[start + 1];
  const sb = d[start + 2];
  const sa = d[start + 3];
  const seen = new Uint8Array(p.w * p.h);
  const stack = [y * p.w + x];
  seen[stack[0]] = 1;
  let filled = 0;
  const near = (i: number) => Math.abs(d[i] - sr) <= tolerance && Math.abs(d[i + 1] - sg) <= tolerance && Math.abs(d[i + 2] - sb) <= tolerance && Math.abs(d[i + 3] - sa) <= tolerance;
  while (stack.length) {
    const idx = stack.pop()!;
    const i = idx * 4;
    if (!near(i)) continue;
    d[i] = color[0];
    d[i + 1] = color[1];
    d[i + 2] = color[2];
    d[i + 3] = color[3];
    filled++;
    const px = idx % p.w;
    const py = (idx - px) / p.w;
    const push = (nx: number, ny: number) => {
      if (wrap) {
        nx = (nx + p.w) % p.w;
        ny = (ny + p.h) % p.h;
      } else if (nx < 0 || ny < 0 || nx >= p.w || ny >= p.h) return;
      const n = ny * p.w + nx;
      if (!seen[n]) {
        seen[n] = 1;
        stack.push(n);
      }
    };
    push(px - 1, py);
    push(px + 1, py);
    push(px, py - 1);
    push(px, py + 1);
  }
  return filled;
}

/** Blends a picture onto `dst` at `(dx, dy)` with `opacity`, wrapping when asked. */
export function stamp(dst: Pix, src: Pix, dx: number, dy: number, opacity: number, wrap: boolean): void {
  dx = Math.round(dx);
  dy = Math.round(dy);
  for (let y = 0; y < src.h; y++) {
    let ty = y + dy;
    if (wrap) ty = ((ty % dst.h) + dst.h) % dst.h;
    else if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      let tx = x + dx;
      if (wrap) tx = ((tx % dst.w) + dst.w) % dst.w;
      else if (tx < 0 || tx >= dst.w) continue;
      const s = (y * src.w + x) * 4;
      blendPixel(dst.data, (ty * dst.w + tx) * 4, src.data[s], src.data[s + 1], src.data[s + 2], (src.data[s + 3] / 255) * opacity);
    }
  }
}

/** Visible layers, bottom first, over a transparent picture of the same size. */
export function composite(layers: Layer[], out: Pix): Pix {
  out.data.fill(0);
  for (const l of layers) {
    if (!l.visible || l.opacity <= 0) continue;
    if (l.pix.w !== out.w || l.pix.h !== out.h) continue;
    const s = l.pix.data;
    const d = out.data;
    if (l.opacity >= 1) {
      for (let i = 0; i < d.length; i += 4) {
        const a = s[i + 3];
        if (a === 0) continue;
        if (a === 255 || d[i + 3] === 0) {
          d[i] = s[i];
          d[i + 1] = s[i + 1];
          d[i + 2] = s[i + 2];
          d[i + 3] = a;
        } else blendPixel(d, i, s[i], s[i + 1], s[i + 2], a / 255);
      }
    } else {
      for (let i = 0; i < d.length; i += 4) {
        if (s[i + 3] === 0) continue;
        blendPixel(d, i, s[i], s[i + 1], s[i + 2], (s[i + 3] / 255) * l.opacity);
      }
    }
  }
  return out;
}

export function pickColor(p: Pix, x: number, y: number): Rgba | null {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return null;
  const i = (y * p.w + x) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]];
}

/** Nearest-neighbour resize (textures are powers of two; the panel scales by whole factors). */
export function resizePix(p: Pix, w: number, h: number): Pix {
  if (p.w === w && p.h === h) return clonePix(p);
  const out = makePix(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(p.h - 1, Math.floor((y * p.h) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(p.w - 1, Math.floor((x * p.w) / w));
      const s = (sy * p.w + sx) * 4;
      const d = (y * w + x) * 4;
      out.data[d] = p.data[s];
      out.data[d + 1] = p.data[s + 1];
      out.data[d + 2] = p.data[s + 2];
      out.data[d + 3] = p.data[s + 3];
    }
  }
  return out;
}

/** Whether any pixel is not fully opaque (the VMT then gets `$translucent`). */
export function hasAlpha(p: Pix): boolean {
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] !== 255) return true;
  return false;
}

/** Bytes of an uncompressed RGBA8 VTF with mips, which is what the importer writes. */
export function vtfSize(w: number, h: number): number {
  let bytes = 80;
  while (w >= 1 && h >= 1) {
    bytes += w * h * 4;
    if (w === 1 && h === 1) break;
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }
  return bytes;
}

export const PAINT_SIZES = [64, 128, 256, 512, 1024];

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/** The picture as a PNG, through a canvas (browser only). */
export async function pixToPng(p: Pix): Promise<Uint8Array> {
  const c = document.createElement("canvas");
  c.width = p.w;
  c.height = p.h;
  const g = c.getContext("2d")!;
  g.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
  if (!blob) throw new Error(tr("PNG не закодировался"));
  return new Uint8Array(await blob.arrayBuffer());
}

/** Decodes an image file (PNG, JPEG, …) into pixels (browser only). */
export async function imageToPix(bytes: Uint8Array, maxSize = 2048): Promise<Pix> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
  const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return { w, h, data: g.getImageData(0, 0, w, h).data };
}

/** Renders text into a picture just big enough for it (browser only). */
export function textToPix(text: string, px: number, color: Rgba, font = "sans-serif"): Pix | null {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  g.font = `${px}px ${font}`;
  const m = g.measureText(text);
  const w = Math.ceil(m.width) + 2;
  const h = Math.ceil(px * 1.3) + 2;
  if (w <= 2 || !text) return null;
  c.width = w;
  c.height = h;
  g.font = `${px}px ${font}`;
  g.textBaseline = "top";
  g.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${color[3] / 255})`;
  g.fillText(text, 1, 1);
  return { w, h, data: g.getImageData(0, 0, w, h).data };
}
