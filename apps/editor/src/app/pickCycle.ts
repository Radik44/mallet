// Click again to pick what is behind, as Blender's repeated click and
// Unity's: the objects whose boxes the view ray passes through, nearest
// first; a second click on the same spot moves to the next one. Hammer only
// ever gives the front-most object.

type Vec3 = [number, number, number];
type Box = [Vec3, Vec3];

/** Where the ray enters the box (0 when it starts inside), or null when it misses. Slab test. */
export function rayBoxEntry(origin: Vec3, dir: Vec3, [lo, hi]: Box): number | null {
  let near = -Infinity;
  let far = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(dir[k]) < 1e-12) {
      if (origin[k] < lo[k] || origin[k] > hi[k]) return null;
      continue;
    }
    const a = (lo[k] - origin[k]) / dir[k];
    const b = (hi[k] - origin[k]) / dir[k];
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  if (near > far || far < 0) return null;
  return Math.max(0, near);
}

/** Ids of the boxes the ray passes through, nearest entry first. */
export function rayOrder(origin: Vec3, dir: Vec3, boxes: { id: number; box: Box }[]): number[] {
  const hits: [number, number][] = [];
  for (const b of boxes) {
    const t = rayBoxEntry(origin, dir, b.box);
    if (t !== null) hits.push([t, b.id]);
  }
  hits.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return hits.map(([, id]) => id);
}

/** The object after `current` along the ray, wrapping to the nearest; the nearest when `current` is not on it. */
export function nextAlong(order: number[], current: number | null): number | null {
  if (!order.length) return null;
  const i = current === null ? -1 : order.indexOf(current);
  return order[(i + 1) % order.length];
}
