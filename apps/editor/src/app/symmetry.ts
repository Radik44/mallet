// Symmetry: a mirror plane through the map. "Отразить" clones the selection
// across it; with the mode on, every new brush and entity gets its twin at
// once, so a symmetrical arena or corridor is built once. Hammer has only a
// one-off flip.

import type { Vec3 } from "../viewport/transform";

export interface SymmetrySettings {
  on: boolean;
  /** The axis the plane is perpendicular to: 0 for a YZ plane (mirrors along X), 1 for XZ, 2 for XY. */
  axis: 0 | 1 | 2;
  /** Where the plane sits on that axis. */
  pos: number;
}

export const DEFAULT_SYMMETRY: SymmetrySettings = { on: false, axis: 0, pos: 0 };

export const AXIS_NAMES = ["X", "Y", "Z"] as const;

/** The pivot of the mirroring scale: a point on the plane. */
export function mirrorPivot(s: SymmetrySettings): Vec3 {
  const p: Vec3 = [0, 0, 0];
  p[s.axis] = s.pos;
  return p;
}

/** Scale factors that mirror across the plane. */
export function mirrorFactors(s: SymmetrySettings): Vec3 {
  const f: Vec3 = [1, 1, 1];
  f[s.axis] = -1;
  return f;
}

export function mirroredPoint(s: SymmetrySettings, p: Vec3): Vec3 {
  const q: Vec3 = [...p] as Vec3;
  q[s.axis] = 2 * s.pos - p[s.axis];
  return q;
}

/** True when the point sits on the plane: its mirror would land on itself. */
export function onPlane(s: SymmetrySettings, p: Vec3, tolerance = 0.5): boolean {
  return Math.abs(p[s.axis] - s.pos) <= tolerance;
}

/** Line-list positions of the plane's outline and a cross at its centre, for the views. */
export function symmetryOverlay(s: SymmetrySettings, extent = 4096): Float32Array {
  const out: number[] = [];
  const seg = (p: Vec3, q: Vec3) => out.push(p[0], p[1], p[2], q[0], q[1], q[2]);
  const u = ((s.axis + 1) % 3) as 0 | 1 | 2;
  const v = ((s.axis + 2) % 3) as 0 | 1 | 2;
  const at = (a: number, b: number): Vec3 => {
    const p: Vec3 = [0, 0, 0];
    p[s.axis] = s.pos;
    p[u] = a;
    p[v] = b;
    return p;
  };
  const corners = [at(-extent, -extent), at(extent, -extent), at(extent, extent), at(-extent, extent)];
  for (let i = 0; i < 4; i++) seg(corners[i], corners[(i + 1) % 4]);
  seg(at(-extent, 0), at(extent, 0));
  seg(at(0, -extent), at(0, extent));
  return new Float32Array(out);
}
