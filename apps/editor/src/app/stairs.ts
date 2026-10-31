// A flight of stairs from one dragged box: Hammer has no stairs tool, so
// mappers stack blocks by hand. The steps rise along the box's longer
// horizontal side toward its far end, each a slab from its own front edge to
// the back of the box, so the flight is solid underneath (no gaps for
// players to snag on, one brush per step).

type Vec3 = [number, number, number];

/** The step boxes for a flight filling `lo`–`hi`, steps about `step` high (at least one step, never taller than the box); `reverse` makes it rise toward the near end instead. */
export function stairBoxes(lo: Vec3, hi: Vec3, step: number, reverse = false): [Vec3, Vec3][] {
  const height = hi[2] - lo[2];
  const axis = hi[0] - lo[0] >= hi[1] - lo[1] ? 0 : 1;
  const run = hi[axis] - lo[axis];
  if (height <= 0 || run <= 0) return [];
  const n = Math.max(1, Math.round(height / Math.max(1, step)));
  const out: [Vec3, Vec3][] = [];
  for (let i = 0; i < n; i++) {
    const a: Vec3 = [lo[0], lo[1], lo[2] + (height * i) / n];
    const b: Vec3 = [hi[0], hi[1], lo[2] + (height * (i + 1)) / n];
    if (reverse) b[axis] = hi[axis] - (run * i) / n;
    else a[axis] = lo[axis] + (run * i) / n;
    const r = (v: number) => Math.round(v * 100) / 100;
    out.push([a.map(r) as Vec3, b.map(r) as Vec3]);
  }
  return out;
}
