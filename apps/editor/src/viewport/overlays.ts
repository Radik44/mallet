// Decals and overlays as flat textured quads, the way Hammer draws them:
// an `info_overlay` from its basis and four corners, an `infodecal` as a
// texture-sized square on the face it sits on. Both become one-mesh
// "models" (see models.ts) drawn once with an identity placement.

import type { EntityDetails } from "../ui/PropertiesPanel";
import type { ModelData } from "./models";
import type { Vec3 } from "./transform";

const LIFT = 0.5;

function parseVec(s: string | undefined, fallback: Vec3): Vec3 {
  if (!s) return fallback;
  const p = s.trim().split(/\s+/).map(Number);
  return p.length >= 3 && p.every(Number.isFinite) ? [p[0], p[1], p[2]] : fallback;
}

function num(s: string | undefined, fallback: number): number {
  const v = Number(s);
  return s !== undefined && Number.isFinite(v) ? v : fallback;
}

function quad(material: string, corners: [Vec3, Vec3, Vec3, Vec3], uvs: number[], normal: Vec3): ModelData {
  const positions = new Float32Array(12);
  corners.forEach((c, i) => positions.set(c, i * 3));
  const normals = new Float32Array(12);
  for (let i = 0; i < 4; i++) normals.set(normal, i * 3);
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const c of corners)
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], c[k]);
      hi[k] = Math.max(hi[k], c[k]);
    }
  return {
    mins: lo,
    maxs: hi,
    // UVs are 0..1 (StartU..EndU), not texels.
    texels: false,
    sprite: false,
    // Both windings, so the quad shows from either side of the face.
    meshes: [{ material, positions, normals, uvs: new Float32Array(uvs), indices: new Uint32Array([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]) }],
  };
}

/** Lower-case material name of an overlay or decal entity, or null. */
export function overlayMaterial(classname: string, kv: Map<string, string>): string | null {
  const c = classname.toLowerCase();
  const m = c === "info_overlay" ? kv.get("material") : c === "infodecal" ? kv.get("texture") : undefined;
  if (!m) return null;
  return m.trim().replace(/\\/g, "/").replace(/\.vmt$/i, "").toLowerCase();
}

/** An overlay's frame and its four corners in world space, for handles. */
export interface OverlayFrame {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  n: Vec3;
  /** uvN as written (x along u, y along v, z along n). */
  uv: Vec3[];
  corners: Vec3[];
}

export function overlayFrame(kv: Map<string, string>): OverlayFrame {
  const origin = parseVec(kv.get("basisorigin"), parseVec(kv.get("origin"), [0, 0, 0]));
  const n = parseVec(kv.get("basisnormal"), [0, 0, 1]);
  const u = parseVec(kv.get("basisu"), [1, 0, 0]);
  const v = parseVec(kv.get("basisv"), [0, 1, 0]);
  const uv = [0, 1, 2, 3].map((i) => parseVec(kv.get(`uv${i}`), [0, 0, 0]));
  const corners = uv.map((p): Vec3 => [0, 1, 2].map((k) => origin[k] + u[k] * p[0] + v[k] * p[1] + n[k] * p[2]) as Vec3);
  return { origin, u, v, n, uv, corners };
}

/** The uvN value that puts corner `i` at `world`: the offset projected on the basis. */
export function overlayUvFor(frame: OverlayFrame, i: number, world: Vec3): Vec3 {
  const d: Vec3 = [world[0] - frame.origin[0], world[1] - frame.origin[1], world[2] - frame.origin[2]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = frame.uv[i]?.[2] ?? 0;
  return [dot(d, frame.u), dot(d, frame.v), z];
}

/** The quad of an `info_overlay`: corners from BasisOrigin + u·BasisU + v·BasisV, UVs from StartU..EndU. */
export function overlayQuad(material: string, kv: Map<string, string>): ModelData | null {
  const o = parseVec(kv.get("basisorigin"), parseVec(kv.get("origin"), [0, 0, 0]));
  const n = parseVec(kv.get("basisnormal"), [0, 0, 1]);
  const u = parseVec(kv.get("basisu"), [1, 0, 0]);
  const v = parseVec(kv.get("basisv"), [0, 1, 0]);
  const pts = [0, 1, 2, 3].map((i) => parseVec(kv.get(`uv${i}`), [0, 0, 0]));
  const corners = pts.map((p): Vec3 => [0, 1, 2].map((k) => o[k] + u[k] * p[0] + v[k] * p[1] + n[k] * (p[2] + LIFT)) as Vec3) as [Vec3, Vec3, Vec3, Vec3];
  const su = num(kv.get("startu"), 0);
  const eu = num(kv.get("endu"), 1);
  const sv = num(kv.get("startv"), 0);
  const ev = num(kv.get("endv"), 1);
  // Source: uv0 → (StartU, StartV), then counter-clockwise around the quad.
  return quad(material, corners, [su, sv, su, ev, eu, ev, eu, sv], n);
}

/**
 * The square of an `infodecal` on a face: `size` is the texture size in
 * texels (one texel per unit), `normal` the face normal, `at` the point on
 * the face under the decal's origin.
 */
export function decalQuad(material: string, at: Vec3, normal: Vec3, size: [number, number]): ModelData {
  const up: Vec3 = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  // u = up × n, v = n × u: a right-handed frame on the face.
  const u: Vec3 = [up[1] * normal[2] - up[2] * normal[1], up[2] * normal[0] - up[0] * normal[2], up[0] * normal[1] - up[1] * normal[0]];
  const ul = Math.hypot(u[0], u[1], u[2]) || 1;
  const un: Vec3 = [u[0] / ul, u[1] / ul, u[2] / ul];
  const vn: Vec3 = [normal[1] * un[2] - normal[2] * un[1], normal[2] * un[0] - normal[0] * un[2], normal[0] * un[1] - normal[1] * un[0]];
  const hw = Math.max(1, size[0]) / 2;
  const hh = Math.max(1, size[1]) / 2;
  const c = (su: number, sv: number): Vec3 => [0, 1, 2].map((k) => at[k] + un[k] * su * hw + vn[k] * sv * hh + normal[k] * LIFT) as Vec3;
  return quad(material, [c(-1, -1), c(-1, 1), c(1, 1), c(1, -1)], [0, 1, 0, 0, 1, 0, 1, 1], normal);
}

/** Key-values of an entity as a lower-case map. */
export function keyMap(details: EntityDetails): Map<string, string> {
  return new Map(details.keyvalues.map(([k, v]) => [k.toLowerCase(), v]));
}

/** A cheap fingerprint of the keys a quad depends on, to rebuild it only when they change. */
export function overlayKey(id: number, kv: Map<string, string>): string {
  const parts = ["material", "texture", "origin", "basisorigin", "basisnormal", "basisu", "basisv", "uv0", "uv1", "uv2", "uv3", "startu", "endu", "startv", "endv"].map((k) => kv.get(k) ?? "");
  return `overlay|${id}|${parts.join("|")}`;
}
