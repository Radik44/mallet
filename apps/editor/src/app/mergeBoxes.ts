// Merge brushes, as Join in Blender: box brushes laid end to end (a wall built
// from four blocks, a floor cut into strips) become one box. Fewer brushes
// mean fewer faces, fewer BSP splits and a lighter map; Hammer has no way back
// from a split but to delete the pieces and draw the box again.

type Vec3 = [number, number, number];
type Box = [Vec3, Vec3];

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/** The box two boxes make together when they share a whole face, or null. */
export function joinedBox(a: Box, b: Box, tol = 0.01): Box | null {
  for (const axis of [0, 1, 2]) {
    const rest = [0, 1, 2].filter((k) => k !== axis);
    if (!rest.every((k) => near(a[0][k], b[0][k], tol) && near(a[1][k], b[1][k], tol))) continue;
    if (near(a[1][axis], b[0][axis], tol) || near(b[1][axis], a[0][axis], tol)) {
      return [[0, 1, 2].map((k) => Math.min(a[0][k], b[0][k])) as Vec3, [0, 1, 2].map((k) => Math.max(a[1][k], b[1][k])) as Vec3];
    }
  }
  return null;
}

/**
 * Boxes joined while any two share a whole face; every result lists the ids it was made of, in
 * order, and the results come in the order of their first id. Faces are matched through a hash of
 * where they lie, so a map of thousands of boxes merges in about linear time, not by trying every pair.
 */
export function mergeBoxes(items: { id: number; box: Box }[], tol = 0.01): { ids: number[]; box: Box }[] {
  type Group = { ids: number[]; box: Box; alive: boolean };
  const r = (v: number) => Math.round(v / tol) * tol;
  // A face key: the axis, the box's extent on the other two axes and where the face lies on this one.
  const faceKey = (b: Box, axis: number, hi: boolean) => {
    const rest = [0, 1, 2].filter((k) => k !== axis).map((k) => `${r(b[0][k])},${r(b[1][k])}`);
    return `${axis}|${rest.join("|")}|${r(hi ? b[1][axis] : b[0][axis])}`;
  };
  const loFaces = new Map<string, Group>();
  const hiFaces = new Map<string, Group>();
  const index = (g: Group) => {
    for (const axis of [0, 1, 2]) {
      loFaces.set(faceKey(g.box, axis, false), g);
      hiFaces.set(faceKey(g.box, axis, true), g);
    }
  };
  const unindex = (g: Group) => {
    for (const axis of [0, 1, 2]) {
      if (loFaces.get(faceKey(g.box, axis, false)) === g) loFaces.delete(faceKey(g.box, axis, false));
      if (hiFaces.get(faceKey(g.box, axis, true)) === g) hiFaces.delete(faceKey(g.box, axis, true));
    }
  };
  const groups: Group[] = items.map((it) => ({ ids: [it.id], box: it.box, alive: true }));
  const queue: Group[] = [];
  for (const g of groups) {
    // A box exactly over another (same face keys) is left alone: it is not a neighbour.
    if ([0, 1, 2].some((axis) => loFaces.has(faceKey(g.box, axis, false)))) continue;
    index(g);
    queue.push(g);
  }
  while (queue.length) {
    const g = queue.pop()!;
    if (!g.alive) continue;
    let other: Group | undefined;
    for (const axis of [0, 1, 2]) {
      // My high face against its low face, or my low face against its high face.
      other = loFaces.get(faceKey(g.box, axis, true)) ?? hiFaces.get(faceKey(g.box, axis, false));
      if (other && other !== g) break;
      other = undefined;
    }
    if (!other) continue;
    const box = joinedBox(g.box, other.box, tol);
    if (!box) continue;
    unindex(g);
    unindex(other);
    g.alive = other.alive = false;
    const merged: Group = { ids: [...g.ids, ...other.ids].sort((a, b) => a - b), box, alive: true };
    groups.push(merged);
    index(merged);
    queue.push(merged);
  }
  return groups
    .filter((g) => g.alive)
    .map((g) => ({ ids: g.ids, box: g.box }))
    .sort((a, b) => a.ids[0] - b.ids[0]);
}
