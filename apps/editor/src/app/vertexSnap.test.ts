import { describe, expect, it } from "vitest";
import { snapVertices } from "./vertexSnap";

describe("vertexSnap", () => {
  // A 64-unit box at the origin moving right; another box's corner at (100, 3).
  const mine = [0, 0, 64, 0, 64, 64, 0, 64];
  const others = [100, 3, 100, 67, 200, 200];

  it("lands the vertex nearest the cursor on the nearest other vertex", () => {
    const s = snapVertices(mine, others, [33, 1], [97, 2], 8);
    expect(s).not.toBeNull();
    expect(s!.source).toEqual([64, 0]);
    expect(s!.target).toEqual([100, 3]);
    expect(s!.delta).toEqual([36, 3]);
  });

  it("stays quiet beyond the threshold or without vertices", () => {
    expect(snapVertices(mine, others, [10, 0], [74, 0], 8)).toBeNull();
    expect(snapVertices([], others, [0, 0], [0, 0], 8)).toBeNull();
    expect(snapVertices(mine, [], [0, 0], [0, 0], 8)).toBeNull();
  });

  it("picks the closest candidate when several are in reach", () => {
    const s = snapVertices(mine, [100, 3, 102, 0], [37, 0], [101, 1], 8);
    expect(s!.target).toEqual([102, 0]);
    expect(s!.delta).toEqual([38, 0]);
  });
});
