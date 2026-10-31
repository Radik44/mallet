// Vertex-tool helpers: handles for the corners and edge midpoints of the
// selected brushes as seen in a 2D view, and the wireframe preview of a
// drag. Corners that project onto the same point share one handle, as in
// Hammer, so dragging it moves the whole stack.

import type { Vec3 } from "./transform";

export interface VertexHandle {
  kind: "vertex" | "edge";
  /** Position in the view's two axes. */
  world2: [number, number];
  /** World vertices that move with this handle. */
  members: Vec3[];
}

const SAME = 0.5;

function key2(p: [number, number]): string {
  return `${Math.round(p[0] / SAME)},${Math.round(p[1] / SAME)}`;
}

/**
 * Handles for a view showing axes `ax`/`ay`: one per distinct projected
 * corner, plus one per distinct projected edge midpoint. `edges` is a line
 * list (xyz xyz per edge) of the selected brushes.
 */
export function buildVertexHandles(axes: [number, number], corners: Vec3[], edges: Float32Array): VertexHandle[] {
  const [ax, ay] = axes;
  const byPoint = new Map<string, VertexHandle>();
  for (const v of corners) {
    const p: [number, number] = [v[ax], v[ay]];
    const k = key2(p);
    const h = byPoint.get(k);
    if (h) h.members.push(v);
    else byPoint.set(k, { kind: "vertex", world2: p, members: [v] });
  }
  const out = Array.from(byPoint.values());
  const edgeHandles = new Map<string, VertexHandle>();
  for (let i = 0; i + 5 < edges.length; i += 6) {
    const a: Vec3 = [edges[i], edges[i + 1], edges[i + 2]];
    const b: Vec3 = [edges[i + 3], edges[i + 4], edges[i + 5]];
    const pa: [number, number] = [a[ax], a[ay]];
    const pb: [number, number] = [b[ax], b[ay]];
    if (key2(pa) === key2(pb)) continue; // Edge seen end-on: its corners' handle covers it.
    const mid: [number, number] = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
    const k = key2(mid);
    if (byPoint.has(k)) continue; // A corner sits there already.
    const members = [...(byPoint.get(key2(pa))?.members ?? [a]), ...(byPoint.get(key2(pb))?.members ?? [b])];
    const h = edgeHandles.get(k);
    if (h) {
      for (const m of members) if (!h.members.some((x) => dist(x, m) < SAME)) h.members.push(m);
    } else edgeHandles.set(k, { kind: "edge", world2: mid, members: [...members] });
  }
  return out.concat(Array.from(edgeHandles.values()));
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** The line list with every vertex near a member moved by `delta`. */
export function previewMovedEdges(edges: Float32Array, members: Vec3[], delta: Vec3): Float32Array {
  const out = new Float32Array(edges.length);
  for (let i = 0; i + 2 < edges.length; i += 3) {
    const v: Vec3 = [edges[i], edges[i + 1], edges[i + 2]];
    const moved = members.some((m) => dist(m, v) < SAME);
    out[i] = v[0] + (moved ? delta[0] : 0);
    out[i + 1] = v[1] + (moved ? delta[1] : 0);
    out[i + 2] = v[2] + (moved ? delta[2] : 0);
  }
  return out;
}

/** Flat `[from, to]` pairs for the document, one per member. */
export function vertexMoves(members: Vec3[], delta: Vec3): Float64Array {
  const out = new Float64Array(members.length * 6);
  members.forEach((m, i) => {
    out.set(m, i * 6);
    out.set([m[0] + delta[0], m[1] + delta[1], m[2] + delta[2]], i * 6 + 3);
  });
  return out;
}
