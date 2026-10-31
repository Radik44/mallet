// Re-stick an overlay: an info_overlay lists the brush faces it is projected
// on (its "sides" key, side ids). Moved, or its wall rebuilt, the list goes
// stale and the decal vanishes in the compile; Hammer users then pick the
// faces again by hand. The faces under it are found from its frame: faces
// facing the same way whose plane holds the overlay's centre or a corner.

import type { OverlayFrame } from "../viewport/overlays";

type Vec3 = [number, number, number];

export type FaceRef = { side: number; normal: Vec3; dist: number; box: [Vec3, Vec3] };

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Side ids of the faces under the overlay: same facing (within ~25°), its centre or a corner on the face's plane and inside the brush's box. */
export function overlayFaces(frame: Pick<OverlayFrame, "origin" | "n" | "corners">, faces: FaceRef[], tol = 1): number[] {
  const points = [frame.origin, ...frame.corners];
  const out: number[] = [];
  for (const f of faces) {
    if (dot(f.normal, frame.n) < 0.9) continue;
    const on = points.some((p) => Math.abs(dot(f.normal, p) - f.dist) <= tol && [0, 1, 2].every((k) => p[k] >= f.box[0][k] - tol && p[k] <= f.box[1][k] + tol));
    if (on) out.push(f.side);
  }
  return out;
}

/** Whether the listed sides are stale: some face is gone, or none of them is under the overlay any more (and some face is). */
export function staleSides(listed: number[], existing: Set<number>, under: number[]): boolean {
  if (!under.length) return false;
  if (listed.some((s) => !existing.has(s))) return true;
  return !listed.some((s) => under.includes(s));
}

/** The "sides" key as side ids. */
export const parseSides = (text: string | undefined) => (text ?? "").split(/\s+/).filter(Boolean).map(Number).filter(Number.isFinite);
