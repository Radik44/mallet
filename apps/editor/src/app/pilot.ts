// Pilot an entity, as Unreal's Pilot Actor: the 3D camera stands where a
// light_spot, point_viewcontrol or env_projectedtexture stands and looks the
// way it points, so aiming one is looking through it. Hammer only shows a
// line in the 2D views.

export interface EntityView {
  origin: [number, number, number];
  /** Source pitch: positive looks down. */
  pitch: number;
  yaw: number;
}

const num = (s: string | undefined) => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

/** Where an entity stands and looks, from its keys; lights take a nonzero "pitch" key over the angles' pitch, as VRAD does. Null without an origin. */
export function entityView(keys: [string, string][]): EntityView | null {
  const get = (k: string) => keys.find(([n]) => n.toLowerCase() === k)?.[1];
  const o = get("origin");
  if (!o) return null;
  const parts = o.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return null;
  const angles = (get("angles") ?? "0 0 0").trim().split(/\s+/).map(Number);
  let pitch = Number.isFinite(angles[0]) ? angles[0] : 0;
  const yaw = Number.isFinite(angles[1]) ? angles[1] : 0;
  const keyPitch = num(get("pitch"));
  if (keyPitch) pitch = keyPitch;
  return { origin: [parts[0], parts[1], parts[2]], pitch, yaw };
}

/** The angles to write back after looking around while piloting: "pitch yaw roll", keeping the roll. */
export function viewAnglesText(pitch: number, yaw: number, roll: number): string {
  const r = (v: number) => String(Math.round(v * 10) / 10);
  const y = ((yaw % 360) + 360) % 360;
  return `${r(pitch)} ${r(y)} ${r(roll)}`;
}
