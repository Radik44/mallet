import { describe, expect, it } from "vitest";
import { stackedBrushes, stackedTwins, type StackItem } from "./stacked";

const prop = (id: number, origin: [number, number, number], angles = "0 0 0", model = "models/props_c17/oildrum001.mdl"): StackItem => ({
  id,
  classname: "prop_physics",
  model,
  origin,
  angles,
  targetname: null,
});

describe("stacked duplicates", () => {
  it("groups exact twins, keeper first, and leaves moved, turned or different ones", () => {
    const got = stackedTwins([
      prop(7, [0, 0, 0]),
      prop(3, [0, 0, 0.01]),
      prop(9, [0, 0, 0]),
      prop(4, [64, 0, 0]),
      prop(5, [0, 0, 0], "0 90 0"),
      prop(6, [0, 0, 0], "0 0 0", "models/props_c17/oildrum001_explosive.mdl"),
    ]);
    expect(got).toEqual([[3, 7, 9]]);
  });
});

describe("stacked brushes", () => {
  it("groups brushes with the same box and textures in the same owner only", () => {
    const box = (x: number): [[number, number, number], [number, number, number]] => [
      [x, 0, 0],
      [x + 64, 64, 64],
    ];
    const six = (m: string) => Array.from({ length: 6 }, () => m);
    const got = stackedBrushes([
      { id: 10, owner: 0, box: box(0), materials: six("brick/brick01") },
      { id: 11, owner: 0, box: box(0), materials: six("BRICK/brick01") },
      { id: 12, owner: 0, box: box(0), materials: six("tools/toolsnodraw") },
      { id: 13, owner: 5, box: box(0), materials: six("brick/brick01") },
      { id: 14, owner: 0, box: box(64), materials: six("brick/brick01") },
    ]);
    expect(got).toEqual([[10, 11]]);
  });
});
