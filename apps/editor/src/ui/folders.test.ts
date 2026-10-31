import { describe, expect, it } from "vitest";
import { filterInFolder, folderPrefix, parentFolder } from "./folders";

describe("folderPrefix", () => {
  it("reads the leading folder of the first word", () => {
    expect(folderPrefix("dev/")).toBe("dev/");
    expect(folderPrefix("Dev/dev_measure wall")).toBe("dev/");
    expect(folderPrefix("brick/brickwall001 red")).toBe("brick/");
    expect(folderPrefix("concrete/floor/tile")).toBe("concrete/floor/");
  });
  it("is the root without a slash and for the favourites and map lists", () => {
    expect(folderPrefix("")).toBe("");
    expect(folderPrefix("wall")).toBe("");
    expect(folderPrefix("* wall")).toBe("");
    expect(folderPrefix("@")).toBe("");
  });
});

describe("parentFolder", () => {
  it("drops the last segment", () => {
    expect(parentFolder("dev/sub/")).toBe("dev/");
    expect(parentFolder("dev/")).toBe("");
    expect(parentFolder("")).toBe("");
  });
});

describe("filterInFolder", () => {
  it("replaces the folder and keeps the words after it", () => {
    expect(filterInFolder("dev/wall", "brick/")).toBe("brick/wall");
    expect(filterInFolder("dev/ wall red", "")).toBe(" wall red");
    expect(filterInFolder("wall", "dev/")).toBe("dev/wall");
    expect(filterInFolder("", "tools/")).toBe("tools/");
  });
  it("leaves the favourites and map lists for a folder", () => {
    expect(filterInFolder("* wall", "dev/")).toBe("dev/wall");
    expect(filterInFolder("@", "dev/")).toBe("dev/");
  });
});
