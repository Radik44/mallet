// Reading the compile tools' output the way Hammer's compile window does:
// which lines are findings, what object or place they point at, and the
// pointfile VBSP writes when the map leaks.

import type { Vec3 } from "../viewport/transform";

/** Where a log line points: an object by VMF id, an entity by index, or a place. */
export type LogRef = { kind: "brush"; id: number } | { kind: "entity"; index: number } | { kind: "point"; pos: Vec3 };

export interface Finding {
  /** Index into the log lines. */
  line: number;
  text: string;
  ref: LogRef | null;
  /** The map leaked here (VBSP's "leaked!"). */
  leak: boolean;
}

const NUM = "([-+]?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?)";
const TRIPLE = new RegExp(`\\(\\s*${NUM}\\s+${NUM}\\s+${NUM}\\s*\\)`, "i");
const ENTITY_BRUSH = /Entity (\d+), Brush (\d+)/i;
const BRUSH = /\bBrush (\d+)\b/i;
const ENTITY_LEAK = /Entity (\S+) \(([-+\d.e]+) ([-+\d.e]+) ([-+\d.e]+)\) leaked!/i;

/** What a line points at, when it names something the editor can show. */
export function refOf(line: string): LogRef | null {
  const leak = ENTITY_LEAK.exec(line);
  if (leak) return { kind: "point", pos: [Number(leak[2]), Number(leak[3]), Number(leak[4])] };
  const eb = ENTITY_BRUSH.exec(line);
  if (eb) return { kind: "brush", id: Number(eb[2]) };
  const b = BRUSH.exec(line);
  if (b) return { kind: "brush", id: Number(b[1]) };
  const t = TRIPLE.exec(line);
  if (t) return { kind: "point", pos: [Number(t[1]), Number(t[2]), Number(t[3])] };
  const e = /\bEntity (\d+)\b/i.exec(line);
  if (e) return { kind: "entity", index: Number(e[1]) };
  return null;
}

/** True for lines worth listing apart from the full log. */
export function isFinding(line: string): boolean {
  const l = line.toLowerCase();
  if (l.includes("leaked") || l.includes("*** leaked") || l.includes("error") || l.includes("warning")) return true;
  if (/\bbrush \d+/i.test(line) && !/^\[\w+\] (writing|loading)/i.test(line)) return true;
  if (l.includes("couldn't find") || l.includes("bad normal") || l.includes("degenerate") || l.includes("too many") || l.includes("out of range")) return true;
  if (l.includes("not found") || l.includes("material ") && l.includes("not")) return true;
  return false;
}

/** Findings of a compile log, in order, without the progress noise. */
export function collectFindings(lines: string[]): Finding[] {
  const out: Finding[] = [];
  lines.forEach((text, line) => {
    if (!isFinding(text)) return;
    // Tool banners and the editor's own command echoes are not findings.
    if (text.startsWith(">") || /^\[\w+\] (valve software|\d+ threads)/i.test(text)) return;
    out.push({ line, text, ref: refOf(text), leak: /leaked/i.test(text) });
  });
  return out;
}

/**
 * VBSP's `<map>.lin` pointfile: one "x y z" per line, the path from the
 * leaking entity out of the map. Returned as line-segment pairs for an overlay.
 */
export function parsePointfile(text: string): Float32Array {
  const pts: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const parts = raw.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [x, y, z] = parts.map(Number);
    if ([x, y, z].some((v) => !Number.isFinite(v))) continue;
    pts.push(x, y, z);
  }
  const n = pts.length / 3;
  if (n < 2) return new Float32Array(0);
  const out = new Float32Array((n - 1) * 6);
  for (let i = 0; i < n - 1; i++) {
    out.set(pts.slice(i * 3, i * 3 + 6), i * 6);
  }
  return out;
}

/**
 * VVIS's `<map>.prt` portal file: "PRT1", cluster and portal counts, then
 * one portal per line: point count, two clusters, and the points in
 * parentheses. Returned as line segments outlining every portal polygon.
 */
export function parsePortalfile(text: string): { segments: Float32Array; portals: number } {
  const lines = text.split(/\r?\n/);
  if (!lines.length || !lines[0].trim().startsWith("PRT")) return { segments: new Float32Array(0), portals: 0 };
  const segs: number[] = [];
  let portals = 0;
  const point = /\(\s*([-+\d.e]+)\s+([-+\d.e]+)\s+([-+\d.e]+)\s*\)/g;
  for (const line of lines.slice(3)) {
    const pts: number[][] = [];
    let m: RegExpExecArray | null;
    point.lastIndex = 0;
    while ((m = point.exec(line))) pts.push([Number(m[1]), Number(m[2]), Number(m[3])]);
    if (pts.length < 3) continue;
    portals++;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      segs.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  }
  return { segments: new Float32Array(segs), portals };
}

/** Palette input that names a place ("100 200 64") as a point. */
export function parseCoords(query: string): Vec3 | null {
  const m = /^\s*([-+]?\d+(?:\.\d+)?)[\s,]+([-+]?\d+(?:\.\d+)?)[\s,]+([-+]?\d+(?:\.\d+)?)\s*$/.exec(query);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
