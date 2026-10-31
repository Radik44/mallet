// Favourite assets, as the favourites of Unreal's content browser: a starred
// set of material or model names kept between runs, one list per browser.

export function loadFavorites(key: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** `favs` with `name` added, or taken out when it was there; the stored list follows. */
export function toggleFavorite(key: string, favs: Set<string>, name: string): Set<string> {
  const next = new Set(favs);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(next)));
  } catch {
    /* storage unavailable */
  }
  return next;
}
