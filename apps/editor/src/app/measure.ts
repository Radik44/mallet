// The ruler: two points in any view, the distance between them in units
// and metres, broken down by axis. Hammer never had one; mappers counted
// grid squares.

import type { Vec3 } from "../viewport/transform";
import { t as tr } from "../i18n";

export interface Measurement {
  a: Vec3;
  b: Vec3;
}

/** One Hammer unit is 0.75 inch. */
export const METRES_PER_UNIT = 0.01905;

const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));

/** "линейка: 523 юн. (10 м) · X 480 · Y 200 · Z 64". */
export function measureText(m: Measurement): string {
  const d: Vec3 = [m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  const metres = len * METRES_PER_UNIT;
  const parts = (["X", "Y", "Z"] as const).map((n, i) => `${n} ${fmt(Math.abs(d[i]))}`).join(" · ");
  return tr("линейка: {0} юн. ({1} м) · {2}", [fmt(len), metres >= 10 ? metres.toFixed(1) : metres.toFixed(2), parts]);
}

/** Line-list positions for the renderer: the segment, a cross at each end and the axis staircase between them. */
export function measureOverlay(m: Measurement): Float32Array {
  const out: number[] = [];
  const seg = (p: Vec3, q: Vec3) => out.push(p[0], p[1], p[2], q[0], q[1], q[2]);
  seg(m.a, m.b);
  const t = Math.max(4, Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]) * 0.03);
  for (const p of [m.a, m.b]) {
    seg([p[0] - t, p[1], p[2]], [p[0] + t, p[1], p[2]]);
    seg([p[0], p[1] - t, p[2]], [p[0], p[1] + t, p[2]]);
    seg([p[0], p[1], p[2] - t], [p[0], p[1], p[2] + t]);
  }
  // The staircase: how far along each axis, for a glance at the components.
  const x: Vec3 = [m.b[0], m.a[1], m.a[2]];
  const xy: Vec3 = [m.b[0], m.b[1], m.a[2]];
  if (x[0] !== m.a[0]) seg(m.a, x);
  if (xy[1] !== x[1]) seg(x, xy);
  if (m.b[2] !== xy[2]) seg(xy, m.b);
  return new Float32Array(out);
}

/** The size of a box for the status bar: "768 × 512 × 256 (14.6 × 9.8 × 4.9 м)"; a point gives "". */
export function sizeText(box: [[number, number, number], [number, number, number]] | null): string {
  if (!box) return "";
  const d = [0, 1, 2].map((k) => Math.max(0, box[1][k] - box[0][k]));
  if (d.every((v) => v < 0.5)) return "";
  const units = d.map((v) => String(Math.round(v))).join(" × ");
  const metres = d.map((v) => (v * METRES_PER_UNIT).toFixed(1)).join(" × ");
  return tr("{0} ({1} м)", [units, metres]);
}

/** Two selected objects in the status bar: distance between their centres and the gap between their boxes, "между центрами 256 (4.9 м) · зазор 64"; touching or overlapping boxes say so. */
export function pairText(a: [[number, number, number], [number, number, number]], b: [[number, number, number], [number, number, number]]): string {
  const centre = [0, 1, 2].map((k) => (b[0][k] + b[1][k]) / 2 - (a[0][k] + a[1][k]) / 2);
  const dist = Math.hypot(...centre);
  const sep = [0, 1, 2].map((k) => Math.max(0, b[0][k] - a[1][k], a[0][k] - b[1][k]));
  const gap = Math.hypot(...sep);
  const overlap = [0, 1, 2].every((k) => Math.min(a[1][k], b[1][k]) - Math.max(a[0][k], b[0][k]) > 0.5);
  const gapText = gap >= 0.5 ? tr("зазор {0}", [Math.round(gap)]) : overlap ? tr("пересекаются") : tr("вплотную");
  return tr("между центрами {0} ({1} м) · {2}", [Math.round(dist), (dist * METRES_PER_UNIT).toFixed(1), gapText]);
}

/** The flight speed for the status bar: "скорость полёта 500 юн/с (9.5 м/с)". */
export function speedText(speed: number): string {
  return tr("скорость полёта {0} юн/с ({1} м/с) · колесо меняет", [Math.round(speed), (speed * METRES_PER_UNIT).toFixed(1)]);
}

/** A point as text to paste: "x y z" for entity keys, "Vector(x, y, z)" for Lua; whole numbers stay whole, the rest keep two decimals. */
export function pointText(p: [number, number, number], lua: boolean): string {
  const n = (v: number) => {
    const r = Math.round(v * 100) / 100;
    return String(Object.is(r, -0) ? 0 : r);
  };
  return lua ? `Vector(${p.map(n).join(", ")})` : p.map(n).join(" ");
}

/** What a selection is made of, for the status bar: "6 брашей, 2 энтити"; one kind gives just that kind. */
export function selectionMix(brushes: number, entities: number): string {
  const word = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? tr("браш") : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? tr("браша") : tr("брашей"));
  const parts: string[] = [];
  if (brushes) parts.push(`${brushes} ${word(brushes)}`);
  if (entities) parts.push(tr("{0} энтити", [entities]));
  return parts.join(", ");
}
