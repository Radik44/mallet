// Small affine-transform helpers for live previews. The document applies the
// real edit in Rust; this only moves preview wireframes on the JS side.

export type Vec3 = [number, number, number];
export type Box3 = [Vec3, Vec3];

/** Row-major 3×3 linear part plus translation: p' = M p + t. */
export interface Affine {
  m: [number, number, number, number, number, number, number, number, number];
  t: Vec3;
}

export const IDENTITY: Affine = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };

export function translation(d: Vec3): Affine {
  return { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [d[0], d[1], d[2]] };
}

/** Rotation by `degrees` about the unit `axis` through `pivot`. */
export function rotationAbout(pivot: Vec3, axis: Vec3, degrees: number): Affine {
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const [x, y, z] = [axis[0] / len, axis[1] / len, axis[2] / len];
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const k = 1 - c;
  const m: Affine["m"] = [
    c + x * x * k, x * y * k - z * s, x * z * k + y * s,
    y * x * k + z * s, c + y * y * k, y * z * k - x * s,
    z * x * k - y * s, z * y * k + x * s, c + z * z * k,
  ];
  return withPivot(m, pivot);
}

/** Per-axis scaling about `pivot`; negative factors mirror. */
export function scalingAbout(pivot: Vec3, factors: Vec3): Affine {
  return withPivot([factors[0], 0, 0, 0, factors[1], 0, 0, 0, factors[2]], pivot);
}

function withPivot(m: Affine["m"], pivot: Vec3): Affine {
  const mp = mulVec(m, pivot);
  return { m, t: [pivot[0] - mp[0], pivot[1] - mp[1], pivot[2] - mp[2]] };
}

function mulVec(m: Affine["m"], p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2],
    m[3] * p[0] + m[4] * p[1] + m[5] * p[2],
    m[6] * p[0] + m[7] * p[1] + m[8] * p[2],
  ];
}

export function applyAffine(a: Affine, p: Vec3): Vec3 {
  const q = mulVec(a.m, p);
  return [q[0] + a.t[0], q[1] + a.t[1], q[2] + a.t[2]];
}

/** Transforms a flat xyz array in place-sized copy. */
export function transformPoints(a: Affine, src: Float32Array): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i + 2 < src.length; i += 3) {
    const q = applyAffine(a, [src[i], src[i + 1], src[i + 2]]);
    out[i] = q[0];
    out[i + 1] = q[1];
    out[i + 2] = q[2];
  }
  return out;
}

export function boxCenter(b: Box3): Vec3 {
  return [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2];
}

export function boxSize(b: Box3): Vec3 {
  return [b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]];
}

export function boxesIntersect(a: Box3, b: Box3): boolean {
  for (let k = 0; k < 3; k++) if (a[1][k] < b[0][k] || a[0][k] > b[1][k]) return false;
  return true;
}
