// Vertex snapping while moving in a 2D view (Unity's V, Blender's snap to
// vertex): the moving selection's vertex nearest the cursor lands exactly on
// the nearest vertex of any other object, so brushes meet corner to corner
// without counting grid units. Everything here is flat: pairs of
// coordinates along the view's two axes.

export interface VertexSnap {
  /** The move delta on the view's two axes after snapping. */
  delta: [number, number];
  /** The vertex of another object the selection now touches. */
  target: [number, number];
  /** The selection's vertex (at its original place) that was snapped. */
  source: [number, number];
}

/**
 * `mine` and `others` are flat `[a0, b0, a1, b1, …]` lists of vertices on the view axes,
 * `mine` at the selection's original place; `delta` is the move so far and `cursor` where the
 * pointer is now. Null when no other vertex is within `threshold` of the moved vertex nearest the cursor.
 */
export function snapVertices(mine: ArrayLike<number>, others: ArrayLike<number>, delta: [number, number], cursor: [number, number], threshold: number): VertexSnap | null {
  if (mine.length < 2 || others.length < 2) return null;
  // The selection vertex closest to the pointer, at its moved place.
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i + 1 < mine.length; i += 2) {
    const d = Math.hypot(mine[i] + delta[0] - cursor[0], mine[i + 1] + delta[1] - cursor[1]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const sa = mine[best];
  const sb = mine[best + 1];
  const ma = sa + delta[0];
  const mb = sb + delta[1];
  let hit = -1;
  let hitD = threshold;
  for (let i = 0; i + 1 < others.length; i += 2) {
    const d = Math.hypot(others[i] - ma, others[i + 1] - mb);
    if (d <= hitD) {
      hitD = d;
      hit = i;
    }
  }
  if (hit < 0) return null;
  const ta = others[hit];
  const tb = others[hit + 1];
  return { delta: [round(ta - sa), round(tb - sb)], target: [ta, tb], source: [sa, sb] };
}

const round = (v: number) => Math.round(v * 100) / 100;
