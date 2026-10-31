// Brushes off the whole-unit grid: a box nudged by half a unit (a fractional
// grid, a scale, an imported prefab) leaves hairline gaps and micro-leaks that
// Hammer never shows. A box whose size is whole but whose corner is not can be
// moved back exactly; the check finds those and the fix moves them all at once.

type Vec3 = [number, number, number];

/** Whether a value is a whole number within `tol`. */
export const isWhole = (v: number, tol = 0.01) => Math.abs(v - Math.round(v)) <= tol;

/** The move that puts a box's corner on whole units, or null when it already is there or its size is not whole (moving would not help). */
export function offGridShift(box: [Vec3, Vec3], tol = 0.01): Vec3 | null {
  const [lo, hi] = box;
  if (![0, 1, 2].every((k) => isWhole(hi[k] - lo[k], tol))) return null;
  if (lo.every((v) => isWhole(v, tol))) return null;
  return lo.map((v) => Math.round(v) - v) as Vec3;
}
