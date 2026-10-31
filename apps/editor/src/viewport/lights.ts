// Lighting preview: the map's light, light_spot and light_environment
// entities packed for the shaders. No shadows and no bounce, just Source's
// colours, brightness, falloff and cones, so a mapper sees where light
// lands before running VRAD.

import type { EntityInfo } from "../map/loader";
import type { EntityDetails } from "../ui/PropertiesPanel";
import { angleMatrix } from "./models";
import type { Vec3 } from "./transform";

/** vec4 slots in the buffer before the per-light records. */
export const LIGHT_HEADER = 4;
/** vec4 slots per light. */
export const LIGHT_STRIDE = 4;
export const MAX_LIGHTS = 256;

function colorKey(v: string | undefined, fallback: [number, number, number, number]): [number, number, number, number] {
  if (!v) return fallback;
  const p = v.trim().split(/\s+/).map(Number);
  if (p.length < 3 || p.slice(0, 3).some((x) => !Number.isFinite(x))) return fallback;
  return [p[0], p[1], p[2], p.length > 3 && Number.isFinite(p[3]) ? p[3] : fallback[3]];
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return v !== undefined && v.trim() !== "" && Number.isFinite(n) ? n : fallback;
}

/** Direction a light entity points: `angles`, with the `pitch` key overriding (lights' sign). */
function lightDirection(kv: Map<string, string>): Vec3 {
  const a = (kv.get("angles") ?? "0 0 0").split(/\s+/).map(Number);
  const angles: Vec3 = [a[0] || 0, a[1] || 0, a[2] || 0];
  const pitch = kv.get("pitch");
  if (pitch !== undefined && Number.isFinite(Number(pitch))) angles[0] = -Number(pitch);
  const m = angleMatrix(angles);
  return [m[0], m[3], m[6]];
}

/**
 * Packs the lights as vec4 records: slot 0 = (count, 0, 0, 0); 1 = ambient
 * rgb; 2 = sun direction xyz + on flag; 3 = sun rgb; then per light:
 * position + kind (0 point, 1 spot), colour, (constant, linear, quadratic,
 * cos inner), direction + cos outer. Colours are linear 0..1 scaled by brightness/255.
 */
export function packLights(entities: EntityInfo[], details: (id: number) => EntityDetails | undefined): { data: Float32Array; count: number } {
  const records: number[][] = [];
  let ambient: [number, number, number] = [0.08, 0.08, 0.09];
  let sunDir: Vec3 = [0, 0, -1];
  let sunColor: [number, number, number] = [0, 0, 0];
  let hasSun = 0;
  const srgb = (c: number) => Math.pow(Math.max(0, Math.min(255, c)) / 255, 2.2);
  for (const e of entities) {
    const cls = e.classname.toLowerCase();
    if (!e.origin || (cls !== "light" && cls !== "light_spot" && cls !== "light_environment")) continue;
    const d = details(e.id);
    if (!d) continue;
    const kv = new Map(d.keyvalues.map(([k, v]) => [k.toLowerCase(), v]));
    const light = colorKey(kv.get("_light"), [255, 255, 255, 200]);
    const brightness = light[3] / 255;
    const rgb: [number, number, number] = [srgb(light[0]) * brightness, srgb(light[1]) * brightness, srgb(light[2]) * brightness];
    if (cls === "light_environment") {
      if (!hasSun) {
        hasSun = 1;
        sunColor = rgb;
        sunDir = lightDirection(kv);
        const amb = colorKey(kv.get("_ambient"), [255, 255, 255, 20]);
        const ab = amb[3] / 255;
        ambient = [srgb(amb[0]) * ab, srgb(amb[1]) * ab, srgb(amb[2]) * ab];
      }
      continue;
    }
    if (records.length >= MAX_LIGHTS) continue;
    const spot = cls === "light_spot";
    let c = num(kv.get("_constant_attn"), 0);
    let l = num(kv.get("_linear_attn"), 0);
    let q = num(kv.get("_quadratic_attn"), 0);
    const fifty = num(kv.get("_fifty_percent_distance"), 0);
    if (fifty > 0) {
      // Half brightness at that distance: a quadratic law scaled to it.
      c = 0;
      l = 0;
      q = (100 * 100) / (fifty * fifty);
    } else if (c === 0 && l === 0 && q === 0) q = 1;
    const inner = num(kv.get("_inner_cone"), 30);
    const outer = num(kv.get("_cone"), 45);
    const dir = spot ? lightDirection(kv) : [0, 0, -1];
    records.push([
      e.origin[0], e.origin[1], e.origin[2], spot ? 1 : 0,
      rgb[0], rgb[1], rgb[2], 0,
      c, l, q, Math.cos((inner * Math.PI) / 180),
      dir[0], dir[1], dir[2], Math.cos((outer * Math.PI) / 180),
    ]);
  }
  const data = new Float32Array((LIGHT_HEADER + Math.max(1, records.length) * LIGHT_STRIDE) * 4);
  data[0] = records.length;
  data.set([ambient[0], ambient[1], ambient[2], 1], 4);
  data.set([sunDir[0], sunDir[1], sunDir[2], hasSun], 8);
  data.set([sunColor[0], sunColor[1], sunColor[2], 0], 12);
  records.forEach((r, i) => data.set(r, (LIGHT_HEADER + i * LIGHT_STRIDE) * 4));
  return { data, count: records.length + hasSun };
}
