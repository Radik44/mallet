// Entity helpers drawn as line overlays, like Hammer's: input/output
// connection lines between the selected entities and their targets, and the
// cone of a spot light.

import type { EntityInfo } from "../map/loader";
import type { EntityDetails } from "../ui/PropertiesPanel";
import { angleMatrix } from "./models";
import type { Vec3 } from "./transform";
import { NAME_KEYS } from "../app/rename";

export interface HelperLines {
  positions: Float32Array;
  colors: Float32Array;
}

/** The targets an output's target names: the entity of that name, or with a trailing * every name starting so (Source compares without case). */
export function targetOrigins(target: string, originsByName: Map<string, Vec3[]>): Vec3[] {
  const t = target.trim().toLowerCase();
  if (!t.endsWith("*")) return originsByName.get(t) ?? [];
  const head = t.slice(0, -1);
  const out: Vec3[] = [];
  for (const [name, list] of originsByName) if (!name.startsWith("->") && name.startsWith(head)) out.push(...list);
  return out;
}

const OUT_COLOR: Vec3 = [0.3, 0.9, 1];
/** Lines drawn by name keys (target, parentname…), as Hammer's path and parent lines. */
const KEY_COLOR: Vec3 = [1, 0.95, 0.55];
const IN_COLOR: Vec3 = [1, 0.7, 0.2];
const CONE_COLOR: Vec3 = [1, 1, 0.5];

/**
 * Lines for the selected entities: outputs to their targets (cyan), inputs
 * from entities targeting them (orange), and spot-light cones.
 * `details` are the selected entities' key-values and connections.
 */
export function helperLines(entities: (EntityInfo & { bounds?: [Vec3, Vec3] })[], selected: EntityDetails[], originsByName: Map<string, Vec3[]>): HelperLines | null {
  const pos: number[] = [];
  const col: number[] = [];
  const line = (a: Vec3, b: Vec3, c: Vec3) => {
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    col.push(c[0], c[1], c[2], c[0], c[1], c[2]);
  };
  const byId = new Map(entities.map((e) => [e.id, e]));
  const selectedNames = new Set<string>();
  for (const d of selected) {
    const self = byId.get(d.id);
    if (!self?.origin) continue;
    const name = d.keyvalues.find(([k]) => k.toLowerCase() === "targetname")?.[1];
    if (name) selectedNames.add(name.toLowerCase());
    for (const c of d.connections) {
      for (const target of targetOrigins(c.target, originsByName)) line(self.origin, target, OUT_COLOR);
    }
    // Name keys point too: a path_track to the next one, a child to its parent, a trigger to its filter.
    for (const [k, v] of d.keyvalues) {
      if (!v || !NAME_KEYS.includes(k.toLowerCase())) continue;
      for (const target of targetOrigins(v, originsByName)) line(self.origin, target, KEY_COLOR);
    }
    cone(self, d, line);
    moveArrow(self, d, line);
    swing(self, d, line);
    reach(self, d, line);
  }
  // Inputs: every entity whose outputs name a selected entity.
  if (selectedNames.size) {
    for (const d of selected) {
      const self = byId.get(d.id);
      if (!self?.origin) continue;
      const name = d.keyvalues.find(([k]) => k.toLowerCase() === "targetname")?.[1]?.toLowerCase();
      if (!name) continue;
      for (const src of originsByName.get(`->${name}`) ?? []) line(src, self.origin, IN_COLOR);
    }
  }
  if (!pos.length) return null;
  return { positions: new Float32Array(pos), colors: new Float32Array(col) };
}

/** The way a func_door, func_movelinear or func_button moves, from its `movedir` angles (pitch positive down, as AngleVectors); Hammer's old "0 -1 0" means up and "0 -2 0" down. */
export function moveDirection(movedir: string | undefined): Vec3 {
  const [p, y] = (movedir ?? "0 0 0").trim().split(/\s+/).map(Number);
  const pitch = Number.isFinite(p) ? p : 0;
  const yaw = Number.isFinite(y) ? y : 0;
  if (pitch === 0 && yaw === -1) return [0, 0, 1];
  if (pitch === 0 && yaw === -2) return [0, 0, -1];
  const m = angleMatrix([pitch, yaw, 0]);
  const r = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
  return [r(m[0]), r(m[3]), r(m[6])];
}

const MOVE_COLOR: Vec3 = [0.5, 1, 0.5];
const OPEN_COLOR: Vec3 = [0.35, 0.7, 0.35];

/** How far a door travels along `dir`: its size along that direction less `lip` (Source's func_door rule), never below zero. */
export function doorTravel(dir: Vec3, bounds: [Vec3, Vec3], lip: number): number {
  const size = [0, 1, 2].reduce((n, k) => n + Math.abs(dir[k]) * (bounds[1][k] - bounds[0][k]), 0);
  return Math.max(0, Math.round((size - lip) * 100) / 100);
}

/** Doors, linear movers and buttons show an arrow the way they move. */
function moveArrow(e: EntityInfo & { bounds?: [Vec3, Vec3] }, d: EntityDetails, line: (a: Vec3, b: Vec3, c: Vec3) => void) {
  const cls = e.classname.toLowerCase();
  if (cls !== "func_door" && cls !== "func_movelinear" && cls !== "func_button" && cls !== "func_water_analog") return;
  const kv = d.keyvalues.find(([key]) => key.toLowerCase() === "movedir")?.[1];
  const dir = moveDirection(kv);
  const o = e.origin ?? [0, 0, 0];
  // The arrow is as long as the real travel, and the box shows where the door ends up.
  const lip = Number(d.keyvalues.find(([key]) => key.toLowerCase() === "lip")?.[1] ?? 0) || 0;
  const len = e.bounds ? Math.max(16, doorTravel(dir, e.bounds, lip)) : 96;
  if (e.bounds) {
    const [lo, hi] = e.bounds;
    const t = doorTravel(dir, e.bounds, lip);
    const s: Vec3 = [dir[0] * t, dir[1] * t, dir[2] * t];
    const c = (x: number, y: number, z: number): Vec3 => [(x ? hi[0] : lo[0]) + s[0], (y ? hi[1] : lo[1]) + s[1], (z ? hi[2] : lo[2]) + s[2]];
    const corners = [c(0, 0, 0), c(1, 0, 0), c(1, 1, 0), c(0, 1, 0), c(0, 0, 1), c(1, 0, 1), c(1, 1, 1), c(0, 1, 1)];
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ])
      line(corners[a], corners[b], OPEN_COLOR);
  }
  const tip: Vec3 = [o[0] + dir[0] * len, o[1] + dir[1] * len, o[2] + dir[2] * len];
  // Arrowhead: two short strokes back from the tip, across the direction.
  const ref: Vec3 = Math.abs(dir[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const side: Vec3 = [dir[1] * ref[2] - dir[2] * ref[1], dir[2] * ref[0] - dir[0] * ref[2], dir[0] * ref[1] - dir[1] * ref[0]];
  const n = Math.hypot(...side) || 1;
  const back: Vec3 = [tip[0] - dir[0] * 20, tip[1] - dir[1] * 20, tip[2] - dir[2] * 20];
  line(o, tip, MOVE_COLOR);
  line(tip, [back[0] + (side[0] / n) * 10, back[1] + (side[1] / n) * 10, back[2] + (side[2] / n) * 10], MOVE_COLOR);
  line(tip, [back[0] - (side[0] / n) * 10, back[1] - (side[1] / n) * 10, back[2] - (side[2] / n) * 10], MOVE_COLOR);
}

/** `p` turned by `deg` about the line through `pivot` along a world axis (0 X, 1 Y, 2 Z), right-handed. */
export function rotateAbout(p: Vec3, pivot: Vec3, axis: 0 | 1 | 2, deg: number): Vec3 {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const v: Vec3 = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
  const [i, j] = axis === 0 ? [1, 2] : axis === 1 ? [2, 0] : [0, 1];
  const out: Vec3 = [...v];
  out[i] = v[i] * c - v[j] * s;
  out[j] = v[i] * s + v[j] * c;
  const r = (x: number) => Math.round(x * 1000) / 1000 + 0;
  return [r(out[0] + pivot[0]), r(out[1] + pivot[1]), r(out[2] + pivot[2])];
}

/** The swing of a func_door_rotating: its far corner turned from 0 to `distance` degrees about the hinge (the origin), in `steps` points. Axis from spawnflags (64 X, 128 Y, else Z); flag 2 turns the other way. */
export function swingArc(hinge: Vec3, bounds: [Vec3, Vec3], keys: { spawnflags: number; distance: number }, steps = 12): Vec3[] {
  const axis: 0 | 1 | 2 = keys.spawnflags & 64 ? 0 : keys.spawnflags & 128 ? 1 : 2;
  const sign = keys.spawnflags & 2 ? -1 : 1;
  // The corner farthest from the hinge across the axis: that edge sweeps the widest arc.
  let far: Vec3 = bounds[0];
  let best = -1;
  for (let m = 0; m < 8; m++) {
    const c: Vec3 = [m & 1 ? bounds[1][0] : bounds[0][0], m & 2 ? bounds[1][1] : bounds[0][1], m & 4 ? bounds[1][2] : bounds[0][2]];
    const d = [0, 1, 2].reduce((n, k) => (k === axis ? n : n + (c[k] - hinge[k]) ** 2), 0);
    if (d > best) {
      best = d;
      far = c;
    }
  }
  return Array.from({ length: steps + 1 }, (_, i) => rotateAbout(far, hinge, axis, (sign * keys.distance * i) / steps));
}

/** A hinge for a rotating door: the near end of its longer horizontal side (the far end with `far`), in the middle of the other two axes. */
export function edgeHinge(bounds: [Vec3, Vec3], far = false): Vec3 {
  const [lo, hi] = bounds;
  const along = hi[0] - lo[0] >= hi[1] - lo[1] ? 0 : 1;
  const mid: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  mid[along] = far ? hi[along] : lo[along];
  return mid;
}

/** Rotating doors show the arc their far edge sweeps, hinge to open. */
function swing(e: EntityInfo & { bounds?: [Vec3, Vec3] }, d: EntityDetails, line: (a: Vec3, b: Vec3, c: Vec3) => void) {
  if (e.classname.toLowerCase() !== "func_door_rotating" || !e.bounds || !e.origin) return;
  const kv = (k: string) => Number(d.keyvalues.find(([key]) => key.toLowerCase() === k)?.[1]);
  const distance = Number.isFinite(kv("distance")) ? kv("distance") : 90;
  const arc = swingArc(e.origin, e.bounds, { spawnflags: kv("spawnflags") || 0, distance });
  for (let i = 0; i + 1 < arc.length; i++) line(arc[i], arc[i + 1], MOVE_COLOR);
  line(e.origin, arc[0], OPEN_COLOR);
  line(e.origin, arc[arc.length - 1], MOVE_COLOR);
}

/**
 * The reach of an entity, when a key says it: ambient_generic and env_soundscape by `radius`
 * (1250 by default for sounds), env_shake and point_push by `radius` (500 and 128 by default),
 * point_hurt by `DamageRadius` (256), env_explosion by `iRadiusOverride` or 2.5 × `iMagnitude` as
 * the game does, lights only by an explicit `_distance` or `_zero_percent_distance`. Null otherwise.
 */
export function reachRadius(classname: string, kv: (k: string) => string | undefined): number | null {
  const n = (k: string) => {
    const v = Number(kv(k));
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  const cls = classname.toLowerCase();
  if (cls === "ambient_generic") return n("radius") || 1250;
  if (cls === "env_soundscape" || cls === "env_soundscape_triggerable") return n("radius") || null;
  if (cls === "env_shake") return n("radius") || 500;
  if (cls === "point_push") return n("radius") || 128;
  if (cls === "point_hurt") return n("damageradius") || 256;
  if (cls === "env_explosion") return n("iradiusoverride") || n("imagnitude") * 2.5 || null;
  if (cls.startsWith("light")) return n("_distance") || n("_zero_percent_distance") || null;
  return null;
}

/** Three rings, one in each axis plane, `segments` strokes each. */
export function ringLines(c: Vec3, r: number, segments = 24): [Vec3, Vec3][] {
  const out: [Vec3, Vec3][] = [];
  for (const [i, j] of [
    [0, 1],
    [0, 2],
    [1, 2],
  ] as const) {
    const at = (k: number): Vec3 => {
      const a = (k / segments) * Math.PI * 2;
      const p: Vec3 = [c[0], c[1], c[2]];
      p[i] += Math.cos(a) * r;
      p[j] += Math.sin(a) * r;
      return p;
    };
    for (let k = 0; k < segments; k++) out.push([at(k), at(k + 1)]);
  }
  return out;
}

const REACH_COLOR: Vec3 = [0.6, 0.75, 1];

/** Sounds, soundscapes and lights with an explicit distance show how far they reach. */
function reach(e: EntityInfo, d: EntityDetails, line: (a: Vec3, b: Vec3, c: Vec3) => void) {
  if (!e.origin) return;
  const r = reachRadius(e.classname, (k) => d.keyvalues.find(([key]) => key.toLowerCase() === k)?.[1]);
  if (!r) return;
  for (const [a, b] of ringLines(e.origin, r)) line(a, b, REACH_COLOR);
}

/** Spot lights (and point_spotlight) show their cone, 256 units long. */
function cone(e: EntityInfo, d: EntityDetails, line: (a: Vec3, b: Vec3, c: Vec3) => void) {
  const cls = e.classname.toLowerCase();
  if (cls !== "light_spot" && cls !== "point_spotlight" && cls !== "light_dynamic") return;
  const kv = (k: string) => d.keyvalues.find(([key]) => key.toLowerCase() === k)?.[1];
  const angles: Vec3 = e.angles ? [...e.angles] : [0, 0, 0];
  // The `pitch` key overrides the pitch of `angles`, with the lights'
  // convention that -90 points straight down (the opposite of AngleVectors).
  const pitch = Number(kv("pitch"));
  if (Number.isFinite(pitch) && kv("pitch") !== undefined) angles[0] = -pitch;
  const half = Number(kv("_cone") ?? kv("spotlightwidth") ?? 45);
  const m = angleMatrix(angles);
  const forward: Vec3 = [m[0], m[3], m[6]];
  const left: Vec3 = [m[1], m[4], m[7]];
  const up: Vec3 = [m[2], m[5], m[8]];
  const length = 256;
  const r = Math.tan((Math.min(Math.max(half, 1), 89) * Math.PI) / 180) * length;
  const o = e.origin ?? [0, 0, 0];
  const centre: Vec3 = [o[0] + forward[0] * length, o[1] + forward[1] * length, o[2] + forward[2] * length];
  const ring: Vec3[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const c = Math.cos(a) * r;
    const s = Math.sin(a) * r;
    ring.push([centre[0] + left[0] * c + up[0] * s, centre[1] + left[1] * c + up[1] * s, centre[2] + left[2] * c + up[2] * s]);
  }
  for (let i = 0; i < ring.length; i++) {
    line(ring[i], ring[(i + 1) % ring.length], CONE_COLOR);
    if (i % 4 === 0) line(o, ring[i], CONE_COLOR);
  }
}
