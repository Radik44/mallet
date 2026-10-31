// Clipping-plane math for the clipper tool: a line drawn in a 2D view
// defines a plane perpendicular to that view; this builds the plane and
// the overlay that shows where the cut goes and which side survives.

import type { Box3, Vec3 } from "./transform";
import { t, lazy } from "../i18n";

export interface ClipLine {
  /** World axes shown by the view the line was drawn in. */
  axes: [number, number];
  a: [number, number];
  b: [number, number];
}

/** 0 keeps both halves, 1 the front (positive side), 2 the back. */
export type ClipKeep = 0 | 1 | 2;

export const CLIP_KEEP_NAMES = lazy(() => [t("обе части"), t("передняя часть"), t("задняя часть")]);

/** Unit normal and distance of the cut plane, or null for a zero-length line. */
export function clipPlane(line: ClipLine): { normal: Vec3; dist: number } | null {
  const [ax, ay] = line.axes;
  const dx = line.b[0] - line.a[0];
  const dy = line.b[1] - line.a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const normal: Vec3 = [0, 0, 0];
  // Perpendicular to the line, in the view plane: rotate the direction by +90°.
  normal[ax] = -dy / len;
  normal[ay] = dx / len;
  const a3: Vec3 = [0, 0, 0];
  a3[ax] = line.a[0];
  a3[ay] = line.a[1];
  return { normal, dist: normal[0] * a3[0] + normal[1] * a3[1] + normal[2] * a3[2] };
}

/**
 * Line list for the overlay: the cut rectangle spanning `bounds` along the
 * view's depth axis (extended a little past the line's ends), plus ticks at
 * the midpoint on the side(s) that survive.
 */
export function clipOverlay(line: ClipLine, keep: ClipKeep, bounds: Box3 | null): Float32Array {
  const [ax, ay] = line.axes;
  const az = 3 - ax - ay;
  const plane = clipPlane(line);
  if (!plane) return new Float32Array(0);
  const zlo = bounds ? bounds[0][az] - 32 : -64;
  const zhi = bounds ? bounds[1][az] + 32 : 64;
  const dx = line.b[0] - line.a[0];
  const dy = line.b[1] - line.a[1];
  const ext = 0.25;
  const p0: [number, number] = [line.a[0] - dx * ext, line.a[1] - dy * ext];
  const p1: [number, number] = [line.b[0] + dx * ext, line.b[1] + dy * ext];
  const at = (p: [number, number], z: number): Vec3 => {
    const v: Vec3 = [0, 0, 0];
    v[ax] = p[0];
    v[ay] = p[1];
    v[az] = z;
    return v;
  };
  const pts: Vec3[] = [];
  const seg = (p: Vec3, q: Vec3) => pts.push(p, q);
  seg(at(p0, zlo), at(p1, zlo));
  seg(at(p1, zlo), at(p1, zhi));
  seg(at(p1, zhi), at(p0, zhi));
  seg(at(p0, zhi), at(p0, zlo));
  // Ticks: from the midpoint towards the kept side(s).
  const mid: [number, number] = [(line.a[0] + line.b[0]) / 2, (line.a[1] + line.b[1]) / 2];
  const tick = Math.max(8, Math.hypot(dx, dy) * 0.12);
  const n2: [number, number] = [plane.normal[ax], plane.normal[ay]];
  const zmid = (zlo + zhi) / 2;
  for (const sign of keep === 0 ? [1, -1] : keep === 1 ? [1] : [-1]) {
    const tip: [number, number] = [mid[0] + n2[0] * tick * sign, mid[1] + n2[1] * tick * sign];
    seg(at(mid, zmid), at(tip, zmid));
    seg(at(mid, zlo), at(tip, zlo));
    seg(at(mid, zhi), at(tip, zhi));
  }
  const out = new Float32Array(pts.length * 3);
  pts.forEach((p, i) => out.set(p, i * 3));
  return out;
}
