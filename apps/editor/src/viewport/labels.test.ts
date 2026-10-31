import { describe, expect, it } from "vitest";
import { pickLabels, projectToCss } from "./labels";

// Identity view-projection with w = 1: x and y are already clip space.
const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe("entity labels", () => {
  it("maps clip space onto the view and drops what is off screen", () => {
    expect(projectToCss(ID, [0, 0, 0], 200, 100)).toEqual([100, 50]);
    expect(projectToCss(ID, [-1, 1, 0], 200, 100)).toEqual([0, 0]);
    expect(projectToCss(ID, [2, 0, 0], 200, 100)).toBeNull();
  });

  it("drops points behind the camera", () => {
    const behind = [...ID];
    behind[15] = -1;
    expect(projectToCss(behind, [0, 0, 0], 200, 100)).toBeNull();
  });

  it("keeps named entities in range, nearest first", () => {
    const list = [
      { id: 1, targetname: "far_lamp", origin: [5000, 0, 0] as [number, number, number] },
      { id: 2, targetname: "door", origin: [100, 0, 0] as [number, number, number] },
      { id: 3, targetname: null, origin: [10, 0, 0] as [number, number, number] },
      { id: 4, targetname: "button", origin: [50, 0, 0] as [number, number, number] },
    ];
    expect(pickLabels(list, [0, 0, 0]).map((l) => l.text)).toEqual(["button", "door"]);
    expect(pickLabels(list, [0, 0, 0], 3072, 1).map((l) => l.text)).toEqual(["button"]);
  });
});
