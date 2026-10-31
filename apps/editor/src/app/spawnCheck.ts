// Player starts stuck in brushes: the player hull (32 × 32 × 72 from the
// feet) of an info_player_start that cuts into a wall or floor. Hammer says
// nothing; in the game the player spawns stuck or falls through.

type Vec3 = [number, number, number];
type Box = [Vec3, Vec3];

/** The standing player hull of Source: 16 units each side, 72 up from the origin at the feet. */
export function playerHull(origin: Vec3): Box {
  return [
    [origin[0] - 16, origin[1] - 16, origin[2]],
    [origin[0] + 16, origin[1] + 16, origin[2] + 72],
  ];
}

/** Ids of the starts whose hull cuts more than `depth` units into any of `solids` on every axis (touching a floor is fine). Brush boxes are bounding boxes, so a slanted brush may give a false alarm. */
export function stuckStarts(starts: { id: number; origin: Vec3 }[], solids: Box[], depth = 1): number[] {
  const out: number[] = [];
  for (const s of starts) {
    const [lo, hi] = playerHull(s.origin);
    if (solids.some(([blo, bhi]) => [0, 1, 2].every((k) => Math.min(hi[k], bhi[k]) - Math.max(lo[k], blo[k]) > depth))) out.push(s.id);
  }
  return out;
}

/** How far up a start sunk into a floor must go so its hull stands clear: it climbs onto the boxes it cuts into from above (their top in the hull's lower half), a few steps for stacked brushes. Null when it is stuck sideways in a wall, or already clear. */
export function liftOut(origin: Vec3, solids: Box[], depth = 1): number | null {
  let z = origin[2];
  for (let step = 0; step < 8; step++) {
    const [lo, hi] = playerHull([origin[0], origin[1], z]);
    const hits = solids.filter(([blo, bhi]) => [0, 1, 2].every((k) => Math.min(hi[k], bhi[k]) - Math.max(lo[k], blo[k]) > depth));
    if (!hits.length) return z === origin[2] ? null : z - origin[2];
    const floors = hits.filter(([, bhi]) => bhi[2] <= z + 36);
    if (floors.length < hits.length) return null;
    z = Math.max(...floors.map(([, bhi]) => bhi[2]));
  }
  return null;
}

/** Ids of the points lying inside a box by more than `depth` on every axis: a light sunk into a wall or ceiling lights nothing, VRAD only sees it from inside the brush. */
export function pointsInside(points: { id: number; origin: Vec3 }[], solids: Box[], depth = 1): number[] {
  return points.filter((p) => solids.some(([lo, hi]) => [0, 1, 2].every((k) => p.origin[k] > lo[k] + depth && p.origin[k] < hi[k] - depth))).map((p) => p.id);
}

/** Where a point sunk into a brush comes out: through the box face nearest to it, `margin` units clear of it (a lamp 4 units into a ceiling drops back into the room). Null when that spot is inside another box too. */
export function pushOut(p: Vec3, solids: Box[], margin = 8): Vec3 | null {
  const inside = (q: Vec3) => solids.find(([lo, hi]) => [0, 1, 2].every((k) => q[k] > lo[k] && q[k] < hi[k]));
  const box = inside(p);
  if (!box) return null;
  const [lo, hi] = box;
  let best: { k: number; to: number; d: number } | null = null;
  for (let k = 0; k < 3; k++) {
    for (const [to, d] of [
      [lo[k] - margin, p[k] - lo[k]],
      [hi[k] + margin, hi[k] - p[k]],
    ] as const) {
      if (!best || d < best.d) best = { k, to, d };
    }
  }
  const out: Vec3 = [p[0], p[1], p[2]];
  out[best!.k] = best!.to;
  return inside(out) ? null : out;
}

/** The box around all `solids`, or null when there are none. */
export function unionBox(solids: Box[]): Box | null {
  if (!solids.length) return null;
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const [blo, bhi] of solids) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], blo[k]);
      hi[k] = Math.max(hi[k], bhi[k]);
    }
  }
  return [lo, hi];
}

/** Ids of the points outside `world` (the box around the world brushes): such an entity sits in the void and VBSP reports a leak. */
export function outsideWorld(points: { id: number; origin: Vec3 }[], world: Box | null): number[] {
  if (!world) return [];
  const [lo, hi] = world;
  return points.filter((p) => [0, 1, 2].some((k) => p.origin[k] < lo[k] || p.origin[k] > hi[k])).map((p) => p.id);
}

/** Tool textures players walk through: a brush made only of these does not block the hull. */
export const NONSOLID_TOOLS = ["tools/toolstrigger", "tools/toolshint", "tools/toolsskip", "tools/toolsareaportal", "tools/toolsoccluder", "tools/toolsfog", "tools/toolsinvisibleladder"];

/** Props the physics engine moves: sunk into a brush they shoot out or hang stuck when the map starts. */
export const isPhysicsProp = (classname: string) => /^prop_(physics(_multiplayer|_override|_respawnable)?|ragdoll)$/i.test(classname);

/** A brush as its box and its face planes (outward normal, n·p = dist on the face). */
export type Shape = { box: Box; planes: [Vec3, number][]; id?: number };

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Whether a point is inside a convex brush by more than `depth` from every face; the box alone would count air beside a slope or a cylinder. */
export function insideShape(p: Vec3, shape: Shape, depth = 1): boolean {
  if (![0, 1, 2].every((k) => p[k] > shape.box[0][k] + depth && p[k] < shape.box[1][k] - depth)) return false;
  return shape.planes.every(([n, d]) => dot(n, p) < d - depth);
}

/** Whether a box cuts into a convex brush deeper than `depth`: overlapping boxes, and no face of the brush with the whole box `depth` outside it. */
export function boxCutsShape(lo: Vec3, hi: Vec3, shape: Shape, depth = 1): boolean {
  const [blo, bhi] = shape.box;
  if (![0, 1, 2].every((k) => Math.min(hi[k], bhi[k]) - Math.max(lo[k], blo[k]) > depth)) return false;
  // The corner of the box deepest into each face's half-space.
  return shape.planes.every(([n, d]) => dot(n, [n[0] > 0 ? lo[0] : hi[0], n[1] > 0 ? lo[1] : hi[1], n[2] > 0 ? lo[2] : hi[2]]) < d - depth);
}

/** The points sunk into some brush, by its faces, not just its box. */
export function pointsInsideShapes(points: { id: number; origin: Vec3 }[], shapes: Shape[], depth = 1): number[] {
  return points.filter((p) => shapes.some((s) => insideShape(p.origin, s, depth))).map((p) => p.id);
}

/** Player starts whose hull cuts into some brush, by its faces. */
export function stuckStartsShapes(starts: { id: number; origin: Vec3 }[], shapes: Shape[], depth = 1): number[] {
  return starts
    .filter((s) => {
      const [lo, hi] = playerHull(s.origin);
      return shapes.some((sh) => boxCutsShape(lo, hi, sh, depth));
    })
    .map((s) => s.id);
}

/** The brush a point is sunk into, by its faces, or undefined. */
export const shapeAround = (p: Vec3, shapes: Shape[], depth = 1) => shapes.find((s) => insideShape(p, s, depth));
