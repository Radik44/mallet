// Entity name labels over the 3D view, as Unreal's actor labels: named
// entities show their targetname where they stand, so I/O work does not mean
// clicking every lamp and door to read its name. Hammer's 3D view has none.

type Vec3 = [number, number, number];

/** Where a world point lands on a w×h view (CSS pixels) for a column-major view-projection matrix, or null behind the camera or off screen. */
export function projectToCss(m: ArrayLike<number>, p: Vec3, w: number, h: number): [number, number] | null {
  const cw = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  if (cw <= 1e-6) return null;
  const cx = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / cw;
  const cy = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / cw;
  if (cx < -1 || cx > 1 || cy < -1 || cy > 1) return null;
  return [((cx + 1) / 2) * w, ((1 - cy) / 2) * h];
}

/** The labels worth drawing: named entities within `range` of the eye, nearest first, at most `limit`. */
export function pickLabels(entities: { id: number; targetname: string | null; origin: Vec3 | null }[], eye: Vec3, range = 3072, limit = 48): { id: number; text: string; origin: Vec3; dist: number }[] {
  const out: { id: number; text: string; origin: Vec3; dist: number }[] = [];
  for (const e of entities) {
    if (!e.targetname || !e.origin) continue;
    const d = Math.hypot(e.origin[0] - eye[0], e.origin[1] - eye[1], e.origin[2] - eye[2]);
    if (d <= range) out.push({ id: e.id, text: e.targetname, origin: e.origin, dist: d });
  }
  out.sort((a, b) => a.dist - b.dist);
  return out.slice(0, limit);
}
