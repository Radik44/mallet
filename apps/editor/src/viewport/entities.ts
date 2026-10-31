// Builds the box geometry for point entities from their FGD class bounds.

import type { ClassInfo } from "../tauri";
import type { EntityInfo } from "../map/loader";
import type { Box3 } from "./transform";

export interface EntityBoxes {
  /** Triangles: xyz per vertex, 36 per box. */
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  pickIds: Uint32Array;
  /** Lines: xyz per vertex, 24 per box. */
  edges: Float32Array;
  edgeObjects: Uint32Array;
  edgeColors: Float32Array;
  count: number;
}

// Faces as (normal, four corner selectors) with counter-clockwise winding
// seen from outside.
const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]] },
  { n: [0, 1, 0], c: [[1, 1, 0], [0, 1, 0], [0, 1, 1], [1, 1, 1]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]] },
];

const EDGES: [[number, number, number], [number, number, number]][] = [
  [[0, 0, 0], [1, 0, 0]], [[1, 0, 0], [1, 1, 0]], [[1, 1, 0], [0, 1, 0]], [[0, 1, 0], [0, 0, 0]],
  [[0, 0, 1], [1, 0, 1]], [[1, 0, 1], [1, 1, 1]], [[1, 1, 1], [0, 1, 1]], [[0, 1, 1], [0, 0, 1]],
  [[0, 0, 0], [0, 0, 1]], [[1, 0, 0], [1, 0, 1]], [[1, 1, 0], [1, 1, 1]], [[0, 1, 0], [0, 1, 1]],
];

/**
 * @param entities point entities in pick order
 * @param classes resolved class per entity (same order)
 * @param firstPickId pick id of the first entity (after all brush faces)
 * @param firstObject object index of the first entity (after all solids)
 * @param modelBounds world-space bounds per entity whose model is drawn
 *   instead of a box: the box faces are left out, the edges use these bounds
 */
export function buildEntityBoxes(
  entities: EntityInfo[],
  classes: (ClassInfo | undefined)[],
  firstPickId: number,
  firstObject: number,
  modelBounds: (Box3 | undefined)[] = [],
): EntityBoxes {
  const n = entities.length;
  const positions = new Float32Array(n * 36 * 3);
  const normals = new Float32Array(n * 36 * 3);
  const colors = new Float32Array(n * 36 * 3);
  const pickIds = new Uint32Array(n * 36);
  const edges = new Float32Array(n * 24 * 3);
  const edgeObjects = new Uint32Array(n * 24);
  const edgeColors = new Float32Array(n * 24 * 3);

  let v = 0;
  let e = 0;
  for (let i = 0; i < n; i++) {
    const ent = entities[i];
    const cls = classes[i];
    const modelled = modelBounds[i];
    const o: [number, number, number] = modelled ? [0, 0, 0] : (ent.origin ?? [0, 0, 0]);
    const mins = modelled ? modelled[0] : (cls?.mins ?? [-8, -8, -8]);
    const maxs = modelled ? modelled[1] : (cls?.maxs ?? [8, 8, 8]);
    const rgb = cls?.color ?? [220, 30, 220];
    // sRGB bytes to linear-ish for the lit shader, then the shader's gamma
    // is skipped for entities, so use a mild curve.
    const color: [number, number, number] = [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
    const corner = (s: [number, number, number]): [number, number, number] => [
      o[0] + (s[0] ? maxs[0] : mins[0]),
      o[1] + (s[1] ? maxs[1] : mins[1]),
      o[2] + (s[2] ? maxs[2] : mins[2]),
    ];
    const pick = firstPickId + i;
    for (const f of FACES) {
      // A modelled entity shows its model; its box faces collapse to nothing.
      const c = modelled ? f.c.map(() => [0, 0, 0] as [number, number, number]) : f.c.map(corner);
      const tri = [c[0], c[1], c[2], c[0], c[2], c[3]];
      for (const p of tri) {
        positions.set(p, v * 3);
        normals.set(f.n, v * 3);
        colors.set(color, v * 3);
        pickIds[v] = pick;
        v++;
      }
    }
    const dim: [number, number, number] = [color[0] * 0.9, color[1] * 0.9, color[2] * 0.9];
    for (const [a, b] of EDGES) {
      for (const s of [a, b]) {
        edges.set(corner(s), e * 3);
        edgeObjects[e] = firstObject + i;
        edgeColors.set(dim, e * 3);
        e++;
      }
    }
  }
  return { positions, normals, colors, pickIds, edges, edgeObjects, edgeColors, count: n };
}
