// Copy and paste a transform, as Unity's Copy/Paste Component Values on the
// Transform: take where one object stands (and how a point entity is turned)
// and put another object there. In Hammer that means retyping the origin and
// angles keys by hand, three numbers at a time.

type Vec3 = [number, number, number];

/** What a transform copy holds: the point, and the angles when it came from one point entity. */
export type TransformClip = { pos: Vec3; angles: string | null };

/** The point a selection stands at: the origin of a single point entity, else the middle of its box. */
export function pivotOf(singleOrigin: Vec3 | null, bounds: [Vec3, Vec3]): Vec3 {
  if (singleOrigin) return [...singleOrigin];
  return [0, 1, 2].map((k) => (bounds[0][k] + bounds[1][k]) / 2) as Vec3;
}

/** The move that takes `from` to `to`, rounded to hundredths to keep keys tidy. */
export function deltaTo(from: Vec3, to: Vec3): Vec3 {
  return [0, 1, 2].map((k) => Math.round((to[k] - from[k]) * 100) / 100) as Vec3;
}

/**
 * Blender's Origin to Geometry for a brush entity: the middle of the box around all its brushes,
 * rounded to whole units, as an "x y z" origin key. A func_rotating or a door turns about it.
 */
export function originAtCentre(boxes: [Vec3, Vec3][]): string | null {
  if (!boxes.length) return null;
  const lo = [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b[0][k])));
  const hi = [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b[1][k])));
  return [0, 1, 2].map((k) => Math.round((lo[k] + hi[k]) / 2) || 0).join(" ");
}

/** Brush entities that turn about their origin; one left outside its brushes swings in a wide circle instead of spinning. */
export const ROTATING_CLASSES = ["func_rotating", "func_rot_button", "momentary_rot_button"];

/** Whether a point lies outside a box grown by `slack` units on every side. */
export function outsideBox(p: Vec3, box: [Vec3, Vec3], slack = 1): boolean {
  return [0, 1, 2].some((k) => p[k] < box[0][k] - slack || p[k] > box[1][k] + slack);
}
