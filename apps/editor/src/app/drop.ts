// Drop to floor, as End in Unreal: the selection falls straight down until its
// bottom rests on the highest object under it. Hammer makes you nudge props
// down by eye in a side view.

type Vec3 = [number, number, number];
export type Box = [Vec3, Vec3];

/** How far (≤ 0) the selection moves along Z to rest on the highest box under it, or null when nothing is below. */
export function dropDelta(sel: Box, others: Box[], tolerance = 0.5): number | null {
  const [lo, hi] = sel;
  let best: number | null = null;
  for (const [olo, ohi] of others) {
    const overlapX = olo[0] < hi[0] - tolerance && ohi[0] > lo[0] + tolerance;
    const overlapY = olo[1] < hi[1] - tolerance && ohi[1] > lo[1] + tolerance;
    if (!overlapX || !overlapY) continue;
    const top = ohi[2];
    if (top > lo[2] + tolerance) continue;
    if (best === null || top > best) best = top;
  }
  return best === null ? null : best - lo[2];
}

/** Hammer's Snap to Grid (Ctrl+B): the move that puts the min corner `lo` on the nearest grid node; tiny float noise counts as already snapped. */
export function gridSnapDelta(lo: Vec3, grid: number): Vec3 {
  const g = grid > 0 ? grid : 1;
  return lo.map((v) => {
    const d = Math.round(v / g) * g - v;
    return Math.abs(d) < 1e-3 ? 0 : Math.round(d * 1000) / 1000;
  }) as Vec3;
}

/** Indices of `boxes` lying wholly inside `container` (with a little slack), for «Выбрать внутри». */
export function boxesInside(container: Box, boxes: (Box | null)[], tolerance = 0.5): number[] {
  const [lo, hi] = container;
  const out: number[] = [];
  boxes.forEach((b, i) => {
    if (!b) return;
    if ([0, 1, 2].every((k) => b[0][k] >= lo[k] - tolerance && b[1][k] <= hi[k] + tolerance)) out.push(i);
  });
  return out;
}

/** Distribute evenly (Blender/Figma): moves for each centre so that, in their order along the axis, the first and last stay and the rest are equally spaced. */
export function distributeDeltas(centres: number[]): number[] {
  const n = centres.length;
  if (n < 3) return centres.map(() => 0);
  const order = centres.map((c, i) => [c, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const first = order[0][0];
  const step = (order[n - 1][0] - first) / (n - 1);
  const out = Array(n).fill(0);
  order.forEach(([c, i], k) => {
    out[i] = Math.round((first + step * k - c) * 1000) / 1000;
  });
  return out;
}

/** Index pairs of boxes that overlap by more than `depth` on every axis (touching faces do not count), found by sweeping along X. */
export function overlappingPairs(boxes: Box[], depth = 1): [number, number][] {
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a][0][0] - boxes[b][0][0]);
  const out: [number, number][] = [];
  for (let p = 0; p < order.length; p++) {
    const i = order[p];
    const [ilo, ihi] = boxes[i];
    for (let q = p + 1; q < order.length; q++) {
      const j = order[q];
      const [jlo, jhi] = boxes[j];
      if (jlo[0] > ihi[0] - depth) break;
      if ([0, 1, 2].every((k) => Math.min(ihi[k], jhi[k]) - Math.max(ilo[k], jlo[k]) > depth)) out.push(i < j ? [i, j] : [j, i]);
    }
  }
  return out;
}
