// Colour maths for the pickers: Source keeps colours as "r g b" (0–255) or
// "r g b" in 0–1, often with a fourth number for brightness.

export interface Hsv {
  /** 0–360 */
  h: number;
  /** 0–1 */
  s: number;
  /** 0–1 */
  v: number;
}

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-9) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max > 1e-9 ? d / max : 0, v: max / 255 };
}

/** 0–255 components. */
export function hsvToRgb({ h, s, v }: Hsv): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((k) => Math.round((k + m) * 255)) as [number, number, number];
}

export function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;
}

export function fromHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  return [0, 2, 4].map((i) => Number.parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number];
}

/** A Source colour key: the three channels in 0–255 plus whatever follows (brightness). */
export interface SourceColor {
  rgb: [number, number, number];
  /** The fourth number when there is one (light brightness). */
  extra: number | null;
  /** Anything after the fourth number, kept as is. */
  rest: string[];
}

export function parseSourceColor(value: string, scale: 1 | 255): SourceColor | null {
  const parts = value.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const n = parts.slice(0, 3).map(Number);
  if (n.some((x) => !Number.isFinite(x))) return null;
  const rgb = n.map((x) => Math.max(0, Math.min(255, Math.round((x / scale) * 255)))) as [number, number, number];
  const extra = parts.length >= 4 && Number.isFinite(Number(parts[3])) ? Number(parts[3]) : null;
  return { rgb, extra, rest: parts.slice(extra === null ? 3 : 4) };
}

export function formatSourceColor(c: SourceColor, scale: 1 | 255): string {
  const rgb = scale === 1 ? c.rgb.map((x) => (x / 255).toFixed(3).replace(/\.?0+$/, "") || "0") : c.rgb.map(String);
  const out = [...rgb];
  if (c.extra !== null) out.push(String(Math.round(c.extra * 1000) / 1000));
  return [...out, ...c.rest].join(" ");
}

/** Colour temperature in kelvin to RGB (Tanner Helland's fit), for the light presets. */
export function kelvinToRgb(k: number): [number, number, number] {
  const t = Math.max(1000, Math.min(40000, k)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c)))) as [number, number, number];
}
