// Transform gizmo for the 3D view at the selection centre: three axis
// arrows (move), three rings (rotate) or three axis bars with cube tips
// (scale). Hit testing and dragging are done in screen space against the
// projected lines, so the gizmo works at any camera angle without an id pass.
// Lines are drawn as bundles of nine parallel lines, since WebGPU lines are
// one pixel wide.

import { mat4, vec3, type Mat4 } from "wgpu-matrix";
import type { FlyCamera } from "./camera";
import type { Vec3 } from "./transform";

export const AXIS_COLORS: [number, number, number][] = [
  [0.95, 0.3, 0.3],
  [0.35, 0.85, 0.35],
  [0.4, 0.55, 1],
];
const HOVER_COLOR: [number, number, number] = [1, 0.9, 0.2];
/** Target on-screen length of an axis arrow in CSS pixels. */
const SCREEN_LENGTH = 90;
const HIT_PX = 9;

const AXES: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** World length that makes the arrows about `SCREEN_LENGTH` pixels long. */
export function gizmoLength(camera: FlyCamera, center: Vec3, cssHeight: number): number {
  const d = vec3.distance(camera.position, vec3.create(center[0], center[1], center[2]));
  const worldPerPixel = (2 * d * Math.tan((camera.fovDeg * Math.PI) / 360)) / Math.max(1, cssHeight);
  return Math.max(1, worldPerPixel * SCREEN_LENGTH);
}

export type GizmoMode = "move" | "rotate" | "scale";

interface Seg {
  a: Vec3;
  b: Vec3;
  axis: number;
}

/** Radius of the line bundle as a fraction of the gizmo length: about 2 px on screen. */
const THICKNESS = 0.012;
const RING_SEGMENTS = 48;
const RING_RADIUS = 0.75;

const add = (p: Vec3, d: Vec3, k: number): Vec3 => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];

/** The gizmo's line segments for a mode, each tagged with its axis. */
function segments(center: Vec3, len: number, mode: GizmoMode): Seg[] {
  const segs: Seg[] = [];
  for (let a = 0; a < 3; a++) {
    const axis = AXES[a];
    const u = AXES[(a + 1) % 3];
    const v = AXES[(a + 2) % 3];
    if (mode === "rotate") {
      const r = len * RING_RADIUS;
      let prev: Vec3 | null = null;
      for (let i = 0; i <= RING_SEGMENTS; i++) {
        const t = (i / RING_SEGMENTS) * Math.PI * 2;
        const p = add(add(center, u, Math.cos(t) * r), v, Math.sin(t) * r);
        if (prev) segs.push({ a: prev, b: p, axis: a });
        prev = p;
      }
      continue;
    }
    if (mode === "scale") {
      const tip = add(center, axis, len * 0.9);
      segs.push({ a: center, b: tip, axis: a });
      // A small cube at the end of the bar.
      const h = len * 0.06;
      const corner = (du: number, dv: number, dw: number) => add(add(add(tip, u, du * h), v, dv * h), axis, dw * h);
      for (const [du, dv, dw, eu, ev, ew] of [
        [-1, -1, -1, 1, -1, -1],
        [1, -1, -1, 1, 1, -1],
        [1, 1, -1, -1, 1, -1],
        [-1, 1, -1, -1, -1, -1],
        [-1, -1, 1, 1, -1, 1],
        [1, -1, 1, 1, 1, 1],
        [1, 1, 1, -1, 1, 1],
        [-1, 1, 1, -1, -1, 1],
        [-1, -1, -1, -1, -1, 1],
        [1, -1, -1, 1, -1, 1],
        [1, 1, -1, 1, 1, 1],
        [-1, 1, -1, -1, 1, 1],
      ])
        segs.push({ a: corner(du, dv, dw), b: corner(eu, ev, ew), axis: a });
      continue;
    }
    const tip = add(center, axis, len);
    segs.push({ a: center, b: tip, axis: a });
    // Arrow head: the two axes perpendicular to this one.
    const base = add(center, axis, len * 0.85);
    const r = len * 0.06;
    for (const [du, dv] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      segs.push({ a: tip, b: add(add(base, u, du * r), v, dv * r), axis: a });
  }
  return segs;
}

/** Two unit vectors perpendicular to `d` and to each other. */
function frame(d: Vec3): [Vec3, Vec3] {
  const dv = vec3.normalize(vec3.create(d[0], d[1], d[2]));
  const ref = Math.abs(dv[0]) < 0.9 ? vec3.create(1, 0, 0) : vec3.create(0, 1, 0);
  const u = vec3.normalize(vec3.cross(dv, ref));
  const v = vec3.cross(dv, u);
  return [
    [u[0], u[1], u[2]],
    [v[0], v[1], v[2]],
  ];
}

const BUNDLE: [number, number][] = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Line list of the gizmo: every segment as a bundle of nine parallel lines. */
export function gizmoLines(center: Vec3, len: number, mode: GizmoMode = "move"): Float32Array {
  const segs = segments(center, len, mode);
  const r = len * THICKNESS;
  const out = new Float32Array(segs.length * BUNDLE.length * 6);
  let o = 0;
  for (const s of segs) {
    const [u, v] = frame([s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]]);
    for (const [i, j] of BUNDLE) {
      const off: Vec3 = [(u[0] * i + v[0] * j) * r, (u[1] * i + v[1] * j) * r, (u[2] * i + v[2] * j) * r];
      out[o++] = s.a[0] + off[0];
      out[o++] = s.a[1] + off[1];
      out[o++] = s.a[2] + off[2];
      out[o++] = s.b[0] + off[0];
      out[o++] = s.b[1] + off[1];
      out[o++] = s.b[2] + off[2];
    }
  }
  return out;
}

export function gizmoColors(mode: GizmoMode, hoverAxis: number | null): Float32Array {
  const segs = segments([0, 0, 0], 1, mode);
  const out = new Float32Array(segs.length * BUNDLE.length * 6);
  segs.forEach((s, n) => {
    const c = s.axis === hoverAxis ? HOVER_COLOR : AXIS_COLORS[s.axis];
    for (let k = 0; k < BUNDLE.length * 2; k++) out.set(c, (n * BUNDLE.length * 2 + k) * 3);
  });
  return out;
}

/** Projects a world point to CSS pixels; null when behind the camera. */
export function projectCss(viewProj: Mat4, p: Vec3, w: number, h: number): [number, number] | null {
  const x = viewProj[0] * p[0] + viewProj[4] * p[1] + viewProj[8] * p[2] + viewProj[12];
  const y = viewProj[1] * p[0] + viewProj[5] * p[1] + viewProj[9] * p[2] + viewProj[13];
  const cw = viewProj[3] * p[0] + viewProj[7] * p[1] + viewProj[11] * p[2] + viewProj[15];
  if (cw <= 1e-6) return null;
  return [((x / cw) * 0.5 + 0.5) * w, (0.5 - (y / cw) * 0.5) * h];
}

/** Axis index under the cursor (the arrow, ring or bar of that axis), or null. */
export function pickGizmoAxis(viewProj: Mat4, center: Vec3, len: number, css: [number, number], w: number, h: number, mode: GizmoMode = "move"): number | null {
  let best: number | null = null;
  let bestDist = HIT_PX;
  for (const s of segments(center, len, mode)) {
    const a = projectCss(viewProj, s.a, w, h);
    const b = projectCss(viewProj, s.b, w, h);
    if (!a || !b) continue;
    const d = segmentDistance(css, a, b);
    if (d < bestDist) {
      bestDist = d;
      best = s.axis;
    }
  }
  return best;
}

/**
 * Angle of the cursor around `axisIndex` through `center`, in degrees, from
 * where the mouse ray meets the ring's plane; null when the ray misses it.
 */
export function ringAngle(viewProj: Mat4, eye: Float32Array, axisIndex: number, center: Vec3, css: [number, number], w: number, h: number): number | null {
  const axis = AXES[axisIndex];
  const hit = rayPlane(mouseRay(viewProj, eye, css, w, h), axis, axis[0] * center[0] + axis[1] * center[1] + axis[2] * center[2]);
  if (!hit) return null;
  const u = AXES[(axisIndex + 1) % 3];
  const v = AXES[(axisIndex + 2) % 3];
  const d: Vec3 = [hit[0] - center[0], hit[1] - center[1], hit[2] - center[2]];
  return (Math.atan2(d[0] * v[0] + d[1] * v[1] + d[2] * v[2], d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) * 180) / Math.PI;
}

function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const l2 = abx * abx + aby * aby;
  let t = l2 > 0 ? ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + aby * t));
}

/** World-space ray from the camera through a CSS pixel of the 3D canvas. */
export function mouseRay(viewProj: Mat4, eye: Float32Array, css: [number, number], w: number, h: number): { origin: Vec3; dir: Vec3 } {
  const inv = mat4.inverse(viewProj);
  const ndcX = (css[0] / w) * 2 - 1;
  const ndcY = 1 - (css[1] / h) * 2;
  const far = vec3.transformMat4(vec3.create(ndcX, ndcY, 1), inv);
  const dir = vec3.normalize(vec3.sub(far, eye));
  return { origin: [eye[0], eye[1], eye[2]], dir: [dir[0], dir[1], dir[2]] };
}

/** Where the ray meets the plane `normal · p = dist`, or null when parallel or behind. */
export function rayPlane(ray: { origin: Vec3; dir: Vec3 }, normal: Vec3, dist: number): Vec3 | null {
  const denom = normal[0] * ray.dir[0] + normal[1] * ray.dir[1] + normal[2] * ray.dir[2];
  if (Math.abs(denom) < 1e-9) return null;
  const t = (dist - (normal[0] * ray.origin[0] + normal[1] * ray.origin[1] + normal[2] * ray.origin[2])) / denom;
  if (t < 0) return null;
  return [ray.origin[0] + ray.dir[0] * t, ray.origin[1] + ray.dir[1] * t, ray.origin[2] + ray.dir[2] * t];
}

/**
 * Parameter along the world axis line through `center` closest to the
 * mouse ray; null when the ray is parallel to the axis.
 */
export function axisParam(viewProj: Mat4, eye: Float32Array, axisIndex: number, center: Vec3, css: [number, number], w: number, h: number): number | null {
  const ray = mouseRay(viewProj, eye, css, w, h);
  const dir = vec3.create(ray.dir[0], ray.dir[1], ray.dir[2]);
  const axis = AXES[axisIndex];
  const a = vec3.create(axis[0], axis[1], axis[2]);
  const w0 = vec3.sub(vec3.create(center[0], center[1], center[2]), eye);
  const b = vec3.dot(a, dir);
  const denom = 1 - b * b;
  if (Math.abs(denom) < 1e-6) return null;
  const d = vec3.dot(a, w0);
  const e = vec3.dot(dir, w0);
  return (b * e - d) / denom;
}

export { AXES as GIZMO_AXES };
