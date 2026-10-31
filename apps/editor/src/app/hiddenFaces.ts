// Nodraw on hidden faces: a face pressed flat against another brush is never
// seen, yet it still gets a lightmap and a texture in the compiled map (VBSP
// only culls such faces between world brushes, not on func_detail or brush
// entities). Hammer users paint them with tools/toolsnodraw by hand, face by
// face; here one command finds them for the selected box brushes.

type Vec3 = [number, number, number];
type Box = [Vec3, Vec3];

/** The axis a face looks along and its sign, or null when the face is slanted. */
export function faceAxis(normal: Vec3, eps = 1e-4): { axis: 0 | 1 | 2; sign: 1 | -1 } | null {
  for (const axis of [0, 1, 2] as const) {
    const n = normal[axis];
    const rest = [0, 1, 2].filter((k) => k !== axis).every((k) => Math.abs(normal[k]) < eps);
    if (rest && Math.abs(Math.abs(n) - 1) < eps) return { axis, sign: n > 0 ? 1 : -1 };
  }
  return null;
}

/**
 * Whether the face of `box` looking along `normal` lies flat against one of `others`: that box
 * starts where the face is and spans the whole face on the other two axes.
 */
export function faceCovered(box: Box, normal: Vec3, others: Box[], tol = 0.5): boolean {
  const fa = faceAxis(normal);
  if (!fa) return false;
  const { axis, sign } = fa;
  const plane = sign > 0 ? box[1][axis] : box[0][axis];
  const across = [0, 1, 2].filter((k) => k !== axis);
  return others.some((o) => {
    const touch = sign > 0 ? o[0][axis] : o[1][axis];
    if (Math.abs(touch - plane) > tol) return false;
    return across.every((k) => o[0][k] <= box[0][k] + tol && o[1][k] >= box[1][k] - tol);
  });
}

/** Materials that hide what is behind them: anything but tool textures, nodraw included (it is solid and opaque to VVIS). */
export function hidesBehind(material: string): boolean {
  const m = material.toLowerCase();
  return !m.startsWith("tools/") || m === "tools/toolsnodraw";
}
