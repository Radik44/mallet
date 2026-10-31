// Recently used assets, as the recent lists in Unreal's content browser: the
// last few materials (or models) picked, newest first, kept between runs.

export const RECENT_MAX = 8;

/** `list` with `name` moved to the front, without duplicates, at most `max` long. */
export function pushRecent(list: string[], name: string, max = RECENT_MAX): string[] {
  if (!name) return list;
  const key = name.toLowerCase();
  return [name, ...list.filter((x) => x.toLowerCase() !== key)].slice(0, max);
}

export function loadRecent(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function storeRecent(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

/** Recently run commands first (Blender's F3 search): items whose id is in `recent` move to the top in that order, the rest keep theirs. */
export function recentFirst<T extends { id: string }>(items: T[], recent: string[]): T[] {
  const rank = new Map(recent.map((id, i) => [id, i]));
  const top = items.filter((x) => rank.has(x.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return top.concat(items.filter((x) => !rank.has(x.id)));
}
