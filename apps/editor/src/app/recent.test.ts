import { describe, expect, it } from "vitest";
import { recentFirst, pushRecent } from "./recent";

describe("recent assets", () => {
  it("moves a name to the front without duplicates", () => {
    expect(pushRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
    expect(pushRecent(["Dev/Wall"], "dev/wall")).toEqual(["dev/wall"]);
  });

  it("keeps at most the limit and ignores empty names", () => {
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
    expect(pushRecent(["a"], "")).toEqual(["a"]);
  });
});

describe("recent commands", () => {
  it("moves recently run items to the top, newest first", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(recentFirst(items, ["c", "x", "a"]).map((x) => x.id)).toEqual(["c", "a", "b", "d"]);
    expect(recentFirst(items, []).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
});
