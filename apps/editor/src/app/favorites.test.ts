import { beforeEach, describe, expect, it } from "vitest";
import { loadFavorites, toggleFavorite } from "./favorites";

describe("favourites", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
  });

  it("stars and unstars a name and keeps the list", () => {
    let favs = loadFavorites("k");
    expect(favs.size).toBe(0);
    favs = toggleFavorite("k", favs, "models/a.mdl");
    expect(loadFavorites("k").has("models/a.mdl")).toBe(true);
    favs = toggleFavorite("k", favs, "models/a.mdl");
    expect(loadFavorites("k").size).toBe(0);
  });

  it("survives a broken stored value", () => {
    store.set("k", "{oops");
    expect(loadFavorites("k").size).toBe(0);
  });
});
