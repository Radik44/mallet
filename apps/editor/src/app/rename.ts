// Rename (F2), as in Unity and Blender: one name for one entity, a numbered
// series for several (lamp_1, lamp_2…), continuing from a number the name
// already ends with (door5 → door5, door6…).

/** Names for `count` entities from `base`; a trailing number is where the series starts. */
export function numberedNames(base: string, count: number): string[] {
  const name = base.trim();
  if (count <= 1) return [name];
  const m = /^(.*?)(\d+)$/.exec(name);
  if (m) {
    const start = Number(m[2]);
    const width = m[2].length;
    return Array.from({ length: count }, (_, i) => `${m[1]}${String(start + i).padStart(width, "0")}`);
  }
  return Array.from({ length: count }, (_, i) => `${name}_${i + 1}`);
}

/** A name Source's I/O accepts: no spaces, commas (the old output separator) or quotes. */
export function cleanName(name: string): string {
  return name
    .trim()
    .replace(/[\s,]+/g, "_")
    .replace(/["']/g, "");
}

/**
 * Names the I/O cannot reach - a space, comma or quote in a targetname makes every output aimed
 * at it fail without a word in Hammer. Each bad name with the clean one it becomes; a clean name
 * already taken by another entity gets "_2", "_3"… so two groups never merge.
 */
export function badNames(names: (string | null)[]): { old: string; next: string }[] {
  const taken = new Set(names.filter((n): n is string => !!n && cleanName(n) === n));
  const out: { old: string; next: string }[] = [];
  for (const old of new Set(names.filter((n): n is string => !!n && cleanName(n) !== n))) {
    const base = cleanName(old) || "unnamed";
    let next = base;
    for (let i = 2; taken.has(next); i++) next = `${base}_${i}`;
    taken.add(next);
    out.push({ old, next });
  }
  return out;
}

/** Old name → new name, only where the old name now belongs to nobody and all its holders took one new name; the rest are ambiguous. */
export function renameMap(renamed: { old: string | null; next: string }[], keptNames: Set<string>): { map: Map<string, string>; ambiguous: string[] } {
  const seen = new Map<string, Set<string>>();
  for (const r of renamed) {
    if (!r.old || r.old === r.next) continue;
    const set = seen.get(r.old) ?? new Set<string>();
    set.add(r.next);
    seen.set(r.old, set);
  }
  const map = new Map<string, string>();
  const ambiguous: string[] = [];
  for (const [old, nexts] of seen) {
    if (nexts.size === 1 && !keptNames.has(old)) map.set(old, [...nexts][0]);
    else ambiguous.push(old);
  }
  return { map, ambiguous };
}

/** Keys that point at another entity by name. */
export const NAME_KEYS = ["target", "parentname", "filtername", "damagefilter", "lightingorigin"];

/** Connections with renamed targets, or null when none changes. */
export function retargetConnections<T extends { target: string }>(list: T[], renames: Map<string, string>): T[] | null {
  let changed = false;
  const out = list.map((c) => {
    const next = renames.get(c.target);
    if (next === undefined) return c;
    changed = true;
    return { ...c, target: next };
  });
  return changed ? out : null;
}

/** Key changes for name-pointing keys whose value was renamed. */
export function retargetKeys(keys: [string, string][], renames: Map<string, string>): [string, string][] {
  return keys.filter(([k, v]) => NAME_KEYS.includes(k.toLowerCase()) && renames.has(v)).map(([k, v]) => [k, renames.get(v)!]);
}

/** Whether one name in an output or key hits any of `names`: Source compares names without case, and a trailing * matches every name with that start. */
export function nameHits(ref: string, names: Set<string>): boolean {
  const r = ref.trim().toLowerCase();
  if (!r) return false;
  if (r.endsWith("*")) {
    const head = r.slice(0, -1);
    for (const n of names) if (n.startsWith(head)) return true;
    return false;
  }
  return names.has(r);
}

/** Whether an entity points at `names` (lower case) through an output or a name key such as target or parentname: Unreal's reference viewer for Source I/O. */
export function refersTo(d: { keyvalues: [string, string][]; connections: { target: string }[] }, names: Set<string>): boolean {
  if (d.connections.some((c) => nameHits(c.target, names))) return true;
  return d.keyvalues.some(([k, v]) => NAME_KEYS.includes(k.toLowerCase()) && nameHits(v, names));
}

/** The next file in a numbered series (Blender's Save Incremental): room.vmf → room_2.vmf, room_2.vmf → room_3.vmf, room_v09.vmf → room_v10.vmf. */
export function nextIncrementPath(path: string): string {
  const m = /^(.*?)(\.[^./\\]+)?$/.exec(path)!;
  const stem = m[1];
  const ext = m[2] ?? "";
  const n = /^(.*?)(\d+)$/.exec(stem);
  if (n && /[_\-v ]$/i.test(n[1])) {
    const next = String(Number(n[2]) + 1).padStart(n[2].length, "0");
    return `${n[1]}${next}${ext}`;
  }
  return `${stem}_2${ext}`;
}

/** The name after `name` in its series: a trailing number goes up by one (door9 → door10, lamp_01 → lamp_02), else "_2" is added. */
export function nextInSeries(name: string): string {
  const m = /^(.*?)(\d+)$/.exec(name);
  if (!m) return `${name}_2`;
  return `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, "0")}`;
}

/**
 * Hammer's Paste Special with unique names, done right: every name of a copied group moves to the
 * next free one in its series, so a copied door and its button open each other and not the
 * originals. Names already taken are skipped; a name the group uses twice keeps one new name.
 */
export function freshNames(names: string[], taken: Set<string>): Map<string, string> {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  const out = new Map<string, string>();
  for (const name of names) {
    if (!name || out.has(name)) continue;
    let next = nextInSeries(name);
    while (used.has(next.toLowerCase())) next = nextInSeries(next);
    used.add(next.toLowerCase());
    out.set(name, next);
  }
  return out;
}
