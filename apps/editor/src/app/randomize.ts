// Randomize rotation, as Randomize Transforms in Blender: each selected prop
// gets its own yaw and a slight tilt, so a pile of barrels or rocks stops
// looking copy-pasted. Hammer only rotates them all by the same amount.

/** Parses Source "pitch yaw roll" angles; missing parts are 0. */
export function parseAngles(text: string | undefined): [number, number, number] {
  const p = (text ?? "").trim().split(/\s+/).map(Number);
  return [Number.isFinite(p[0]) ? p[0] : 0, Number.isFinite(p[1]) ? p[1] : 0, Number.isFinite(p[2]) ? p[2] : 0];
}

/** New angles: yaw anywhere in 0…360, pitch and roll within ±tilt of 0; `rand` returns 0…1. */
export function randomAngles(rand: () => number, tilt = 0): [number, number, number] {
  const r = (lo: number, hi: number) => lo + (hi - lo) * rand();
  const round = (v: number) => Math.round(v * 10) / 10;
  return [round(tilt ? r(-tilt, tilt) : 0), round(r(0, 360)), round(tilt ? r(-tilt, tilt) : 0)];
}

export const anglesText = (a: [number, number, number]) => a.map((v) => (Object.is(v, -0) ? 0 : v)).join(" ");

/**
 * Blender's Select Random: `ratio` of the items, at least one, picked at random and kept in their
 * order; a pile of props thinned out for variety, or half of them given another skin.
 */
export function randomSubset<T>(items: T[], ratio: number, rand: () => number): T[] {
  const want = Math.max(1, Math.min(items.length, Math.round(items.length * ratio)));
  const order = items.map((_, i) => i);
  for (let i = 0; i < want; i++) {
    const j = i + Math.floor(rand() * (order.length - i));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const keep = new Set(order.slice(0, want));
  return items.filter((_, i) => keep.has(i));
}
