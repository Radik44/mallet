// Grow the selection to its neighbours, as Blender's Select More: every
// object whose box touches (or overlaps) one of the selected boxes joins in.
// Pressed again it grows another ring, so a whole structure - a wall with its
// pillars, stairs with their rails - comes in a few presses instead of
// clicking every brush as in Hammer.

type Vec3 = [number, number, number];
type Box = [Vec3, Vec3];

/** Whether two boxes touch or overlap, with `tol` units of slack on every axis. */
export function boxesTouch(a: Box, b: Box, tol = 0.5): boolean {
  return [0, 1, 2].every((k) => a[0][k] <= b[1][k] + tol && b[0][k] <= a[1][k] + tol);
}

/** The longest side of a box. */
const extent = (b: Box) => Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]);

/**
 * The candidates touching any of the selected boxes, not already selected, split into those
 * that join and those left out for being far larger than anything selected (a floor or a wall
 * of the room would pull in everything standing on it): over 4× the largest selected side and
 * over 256 units.
 */
export function touchingIds(selected: Box[], candidates: { id: number; box: Box }[], already: Set<number>, tol = 0.5): { ids: number[]; tooBig: number[] } {
  const limit = Math.max(256, 4 * Math.max(0, ...selected.map(extent)));
  const ids: number[] = [];
  const tooBig: number[] = [];
  for (const c of candidates) {
    if (already.has(c.id) || !selected.some((s) => boxesTouch(s, c.box, tol))) continue;
    (extent(c.box) > limit ? tooBig : ids).push(c.id);
  }
  return { ids, tooBig };
}
