// Select a whole path chain at once: path_track and path_corner name the next
// stop in their target key, so Hammer leaves you clicking every node to move
// or delete a train route. Here one node (or the train) is enough: the chain is
// followed both ways, forward through target and altpath, back through every
// node whose target names this one.

/** Keys that point along a path. */
export const PATH_KEYS = ["target", "altpath"];

export type PathNode = { id: number; name: string | null; next: string[] };

/** Every node linked to the start ones through path keys, in either direction, the start ones included. */
export function chainIds(nodes: PathNode[], start: number[]): number[] {
  const byName = new Map<string, PathNode[]>();
  const before = new Map<string, PathNode[]>();
  const add = (m: Map<string, PathNode[]>, k: string, n: PathNode) => m.set(k, [...(m.get(k) ?? []), n]);
  for (const n of nodes) {
    if (n.name) add(byName, n.name.toLowerCase(), n);
    for (const t of n.next) add(before, t.toLowerCase(), n);
  }
  const seen = new Set<number>(start);
  const queue = nodes.filter((n) => seen.has(n.id));
  while (queue.length) {
    const n = queue.pop()!;
    const linked = [...n.next.flatMap((t) => byName.get(t.toLowerCase()) ?? []), ...(n.name ? (before.get(n.name.toLowerCase()) ?? []) : [])];
    for (const m of linked) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      queue.push(m);
    }
  }
  return nodes.filter((n) => seen.has(n.id)).map((n) => n.id);
}

/**
 * The route's length along its target links, in units, and whether it closes into a loop: from a
 * node no other one points at (or any node, for a loop), following target until it ends or comes
 * back. Hammer shows nothing like it; a train's speed and timing need it.
 */
export function routeLength(nodes: (PathNode & { origin: [number, number, number] | null })[]): { length: number; loop: boolean; stops: number } {
  const byName = new Map(nodes.filter((n) => n.name).map((n) => [n.name!.toLowerCase(), n]));
  const pointedAt = new Set(nodes.flatMap((n) => n.next.slice(0, 1).map((t) => t.toLowerCase())));
  const start = nodes.find((n) => n.origin && !(n.name && pointedAt.has(n.name.toLowerCase()))) ?? nodes.find((n) => n.origin);
  let length = 0;
  let stops = 0;
  const seen = new Set<number>();
  for (let at = start; at && at.origin && !seen.has(at.id);) {
    seen.add(at.id);
    stops++;
    const next = at.next[0] ? byName.get(at.next[0].toLowerCase()) : undefined;
    if (!next?.origin) return { length, loop: false, stops };
    length += Math.hypot(next.origin[0] - at.origin[0], next.origin[1] - at.origin[1], next.origin[2] - at.origin[2]);
    if (seen.has(next.id)) return { length, loop: true, stops };
    at = next;
  }
  return { length, loop: false, stops };
}
