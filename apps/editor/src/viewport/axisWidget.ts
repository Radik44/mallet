// The axis widget in the corner of the 3D view, as Unity's scene gizmo and
// Blender's navigation gizmo: X, Y, Z drawn as the camera sees them, and a
// click on an end turns the view along that axis, orbiting the point the
// camera looks at. Hammer's 3D view has nothing of the kind.

type Vec3 = [number, number, number];
const DEG = Math.PI / 180;

/** Where the six axis ends fall in the widget (x right, y down, -1…1) and how near they are (larger is nearer), for the camera's yaw and pitch (pitch positive up). */
export function axisEnds(yaw: number, pitch: number): { axis: "x" | "y" | "z"; sign: 1 | -1; x: number; y: number; depth: number }[] {
  const cy = Math.cos(yaw * DEG);
  const sy = Math.sin(yaw * DEG);
  const cp = Math.cos(pitch * DEG);
  const sp = Math.sin(pitch * DEG);
  const f: Vec3 = [cy * cp, sy * cp, sp];
  const r: Vec3 = [sy, -cy, 0];
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const out: { axis: "x" | "y" | "z"; sign: 1 | -1; x: number; y: number; depth: number }[] = [];
  (["x", "y", "z"] as const).forEach((axis, k) => {
    for (const sign of [1, -1] as const) {
      const v: Vec3 = [0, 0, 0];
      v[k] = sign;
      const round = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
      out.push({ axis, sign, x: round(v[0] * r[0] + v[1] * r[1] + v[2] * r[2]), y: round(-(v[0] * u[0] + v[1] * u[1] + v[2] * u[2])), depth: round(-(v[0] * f[0] + v[1] * f[1] + v[2] * f[2])) });
    }
  });
  return out;
}

/** The camera after a click on an axis end: it looks along the opposite of that axis (from +X it looks toward −X), orbiting `pivot` at the same distance. Straight up and down stop just short of the pole. */
export function viewAlong(axis: "x" | "y" | "z", sign: 1 | -1, pivot: Vec3, distance: number): { position: Vec3; yaw: number; pitch: number } {
  const dir: Vec3 = [0, 0, 0];
  dir[axis === "x" ? 0 : axis === "y" ? 1 : 2] = sign;
  const yaw = axis === "z" ? 90 : Math.round((Math.atan2(-dir[1], -dir[0]) / DEG + 360) % 360);
  const pitch = axis === "z" ? (sign > 0 ? -89 : 89) : 0;
  const cp = Math.cos(pitch * DEG);
  const f: Vec3 = [Math.cos(yaw * DEG) * cp, Math.sin(yaw * DEG) * cp, Math.sin(pitch * DEG)];
  return { position: [pivot[0] - f[0] * distance, pivot[1] - f[1] * distance, pivot[2] - f[2] * distance], yaw, pitch };
}
