// Stacked duplicates: a Ctrl+D or paste without a move leaves two identical
// props in one spot. In the game they flicker (z-fighting), physics props
// burst apart on spawn, and the entity count grows for nothing; in Hammer the
// twin hides perfectly behind the original. Found by a hash of what makes two
// entities the same, not by comparing every pair.

type Vec3 = [number, number, number];

export type StackItem = { id: number; classname: string; model: string | null; origin: Vec3 | null; angles: string | null; targetname: string | null };

/** Groups of entities that are exact twins (class, model, place to 0.1 unit, angles, name); each group lists the keeper first, then the extras. */
export function stackedTwins(items: StackItem[]): number[][] {
  const groups = new Map<string, number[]>();
  for (const e of items) {
    if (!e.origin) continue;
    const at = e.origin.map((v) => Math.round(v * 10) / 10).join(" ");
    const key = [e.classname.toLowerCase(), (e.model ?? "").toLowerCase(), at, (e.angles ?? "0 0 0").trim(), e.targetname ?? ""].join("|");
    groups.set(key, [...(groups.get(key) ?? []), e.id]);
  }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => [...g].sort((a, b) => a - b));
}

/**
 * Brushes that are exact twins: the same box (to 0.1 unit), the same number of faces and the same
 * materials, in the same owner. Each group lists the keeper first; the rest are the extras a
 * duplicate without a move left behind.
 */
export function stackedBrushes(items: { id: number; owner: number; box: [Vec3, Vec3]; materials: string[] }[]): number[][] {
  const groups = new Map<string, number[]>();
  for (const b of items) {
    const box = [...b.box[0], ...b.box[1]].map((v) => Math.round(v * 10) / 10).join(" ");
    const key = [
      b.owner,
      box,
      b.materials.length,
      [...b.materials]
        .map((m) => m.toLowerCase())
        .sort()
        .join(","),
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), b.id]);
  }
  return [...groups.values()].filter((g) => g.length > 1).map((g) => [...g].sort((a, b) => a - b));
}
