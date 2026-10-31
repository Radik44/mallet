import { describe, expect, it } from "vitest";
import { BOOKMARK_SLOTS, bookmarkText, bookmarksKey, parseBookmarks, withBookmark } from "./bookmarks";

describe("camera bookmarks", () => {
  it("keys bookmarks by map path, case and slashes aside", () => {
    expect(bookmarksKey("C:\\Maps\\Room.vmf")).toBe(bookmarksKey("c:/maps/room.vmf"));
    expect(bookmarksKey(null)).toBe("gme.camBookmarks:");
  });

  it("round-trips through storage and drops malformed slots", () => {
    const list = withBookmark(parseBookmarks(null), 2, { pos: [1, 2, 3], pitch: -10, yaw: 90 });
    const back = parseBookmarks(JSON.stringify(list));
    expect(back.length).toBe(BOOKMARK_SLOTS);
    expect(back[2]).toEqual({ pos: [1, 2, 3], pitch: -10, yaw: 90 });
    expect(back[0]).toBeNull();
    expect(parseBookmarks('[{"pos":[1,"x",3],"pitch":0,"yaw":0}]')[0]).toBeNull();
    expect(parseBookmarks("not json")).toEqual(Array(BOOKMARK_SLOTS).fill(null));
  });

  it("describes a bookmark for the status bar", () => {
    expect(bookmarkText(0, { pos: [10.4, -20.6, 64], pitch: 0, yaw: 0 })).toBe("закладка 1: 10 -21 64");
  });
});
