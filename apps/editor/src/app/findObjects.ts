// Find objects by name, as the hierarchy search in Unity: the palette lists
// entities whose targetname, class or model matches what was typed. Hammer's
// "Go to Brush" only takes numeric ids.

import { t as tr } from "../i18n";

export interface Findable {
  id: number;
  classname: string;
  targetname: string | null;
  model: string | null;
  hidden?: boolean;
}

export interface Found {
  id: number;
  title: string;
  score: number;
}

const modelName = (m: string | null) => (m ? (m.split("/").pop() ?? m).replace(/\.mdl$/i, "") : "");

/** Entities matching `query`, best first: name before class before model, whole word before prefix before substring. */
export function findObjects(list: Findable[], query: string, limit = 12): Found[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const rank = (text: string, weight: number) => {
    const t = text.toLowerCase();
    if (!t) return 0;
    if (t === q) return weight * 3;
    if (t.startsWith(q)) return weight * 2;
    if (t.includes(q)) return weight;
    return 0;
  };
  const out: Found[] = [];
  for (const e of list) {
    const model = modelName(e.model);
    const score = Math.max(rank(e.targetname ?? "", 3), rank(e.classname, 2), rank(model, 1));
    if (!score) continue;
    const label = e.targetname ? `${e.targetname} · ${e.classname}` : model ? `${e.classname} · ${model}` : e.classname;
    out.push({ id: e.id, title: `${label}${e.hidden ? tr(" (скрыт)") : ""}`, score });
  }
  out.sort((a, b) => b.score - a.score || a.id - b.id);
  return out.slice(0, limit);
}

/** Materials of the map matching `query`, best first: whole file name, then its start, then anywhere in the path. Indices into `materials`. */
export function findMaterials(materials: string[], query: string, limit = 5): number[] {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const scored: [number, number][] = [];
  materials.forEach((m, i) => {
    const path = m.toLowerCase();
    const base = path.split("/").pop() ?? path;
    const score = base === q ? 3 : base.startsWith(q) ? 2 : path.includes(q) ? 1 : 0;
    if (score) scored.push([score, i]);
  });
  scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  return scored.slice(0, limit).map(([, i]) => i);
}

/** What «select similar» compares for an entity: a prop counts as similar only with the same model (Unreal's Select All With Same Mesh), anything else by class. */
export function similarKey(e: { classname: string; model: string | null }): string {
  return e.model ? `${e.classname}|${e.model.toLowerCase()}` : e.classname;
}

/** Ids of the entities hanging under `roots` through parentname, at any depth (Unity's select children); the roots stay in. */
export function withChildren(list: { id: number; targetname: string | null; parent: string | null }[], roots: Iterable<number>): number[] {
  const out = new Set<number>(roots);
  const byId = new Map(list.map((e) => [e.id, e]));
  let frontier = [...out];
  while (frontier.length) {
    const names = new Set(frontier.map((id) => byId.get(id)?.targetname).filter((n): n is string => !!n));
    frontier = [];
    if (!names.size) break;
    for (const e of list) {
      if (!out.has(e.id) && e.parent && names.has(e.parent)) {
        out.add(e.id);
        frontier.push(e.id);
      }
    }
  }
  return [...out];
}

/**
 * Unity's select parent: the entities the given ones are parented to through parentname, or with
 * `toRoot` the top of each chain (an object without a parent stays itself). Names match without case.
 */
export function parentsOf(list: { id: number; targetname: string | null; parent: string | null }[], ids: Iterable<number>, toRoot = false): number[] {
  const byId = new Map(list.map((e) => [e.id, e]));
  const byName = new Map<string, number>();
  for (const e of list) if (e.targetname && !byName.has(e.targetname.toLowerCase())) byName.set(e.targetname.toLowerCase(), e.id);
  const up = (id: number) => {
    const p = byId.get(id)?.parent;
    return p ? byName.get(p.toLowerCase()) : undefined;
  };
  const out = new Set<number>();
  for (const id of ids) {
    let at = up(id);
    if (at === undefined) continue;
    if (toRoot) {
      const seen = new Set<number>([id, at]);
      for (let next = up(at); next !== undefined && !seen.has(next); next = up(at)) {
        seen.add(next);
        at = next;
      }
    }
    out.add(at);
  }
  return [...out];
}

/**
 * Parent loops: entities whose parentname chain comes back to them (A on B, B on A). The engine
 * cannot place such a chain and warns or crashes on load; each loop comes back once, in chain order.
 */
export function parentLoops(list: { id: number; targetname: string | null; parent: string | null }[]): number[][] {
  const byName = new Map<string, number>();
  for (const e of list) if (e.targetname && !byName.has(e.targetname.toLowerCase())) byName.set(e.targetname.toLowerCase(), e.id);
  const up = new Map<number, number>();
  for (const e of list) {
    const p = e.parent ? byName.get(e.parent.toLowerCase()) : undefined;
    if (p !== undefined) up.set(e.id, p);
  }
  const done = new Set<number>();
  const loops: number[][] = [];
  for (const e of list) {
    const path: number[] = [];
    const onPath = new Map<number, number>();
    for (let at: number | undefined = e.id; at !== undefined && !done.has(at); at = up.get(at)) {
      if (onPath.has(at)) {
        loops.push(path.slice(onPath.get(at)));
        break;
      }
      onPath.set(at, path.length);
      path.push(at);
    }
    for (const id of path) done.add(id);
  }
  return loops;
}

/** How a key search compares: the value contains the asked text, equals it, or does not contain it. */
export type KeyOp = "has" | "eq" | "not";

/**
 * A key search typed into the palette, as Hammer's Find Entities by key and value: "key=value"
 * (value matched anywhere, without case), "key==value" (the whole value), "key!=value" (anything
 * else, a missing key included) or "key=" for every entity that has the key set.
 */
export function parseKeyQuery(query: string): { key: string; value: string; op: KeyOp } | null {
  const m = /^([A-Za-z_][\w.]*)\s*(==|!=|=)\s*(.*)$/.exec(query.trim());
  if (!m) return null;
  const op: KeyOp = m[2] === "==" ? "eq" : m[2] === "!=" ? "not" : "has";
  return { key: m[1].toLowerCase(), value: m[3].trim().toLowerCase(), op };
}

/** Whether keyvalues answer the search; the key name matches without case. */
export function matchesKey(keyvalues: [string, string][], q: { key: string; value: string; op?: KeyOp }): boolean {
  const v = keyvalues.find(([k]) => k.toLowerCase() === q.key)?.[1].toLowerCase() ?? null;
  if (q.op === "not") return v === null || (q.value ? !v.includes(q.value) : v.trim() === "");
  if (v === null) return false;
  if (q.op === "eq") return v.trim() === q.value;
  return q.value ? v.includes(q.value) : v.trim() !== "";
}
