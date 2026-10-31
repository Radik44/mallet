import { describe, expect, it } from "vitest";
import { gridSnapDelta, boxesInside, distributeDeltas, dropDelta, overlappingPairs, type Box } from "./drop";

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => [
  [x0, y0, z0],
  [x1, y1, z1],
];

describe("drop to floor", () => {
  it("lands on the highest box under the selection", () => {
    const sel = box(0, 0, 200, 32, 32, 264);
    const floor = box(-512, -512, -16, 512, 512, 0);
    const table = box(-16, -16, 0, 48, 48, 40);
    expect(dropDelta(sel, [floor, table])).toBe(-160);
  });

  it("ignores boxes beside it and above its bottom", () => {
    const sel = box(0, 0, 100, 32, 32, 132);
    const beside = box(100, 100, 0, 200, 200, 300);
    const ceiling = box(-512, -512, 300, 512, 512, 316);
    const wallThrough = box(-512, 0, 0, 512, 16, 400);
    expect(dropDelta(sel, [beside, ceiling, wallThrough])).toBeNull();
  });

  it("does not move a selection that already rests on the floor", () => {
    expect(dropDelta(box(0, 0, 0, 16, 16, 16), [box(-64, -64, -16, 64, 64, 0)])).toBe(0);
  });

  it("finds boxes wholly inside a container", () => {
    const room = box(0, 0, 0, 512, 512, 256);
    const inside = box(10, 10, 0, 50, 50, 40);
    const across = box(500, 0, 0, 600, 64, 64);
    expect(boxesInside(room, [inside, across, null, room])).toEqual([0, 3]);
  });

  it("spaces centres evenly between the outermost ones", () => {
    expect(distributeDeltas([0, 10, 100])).toEqual([0, 40, 0]);
    expect(distributeDeltas([300, 0, 20, 90])).toEqual([0, 0, 80, 110]);
    expect(distributeDeltas([5, 7])).toEqual([0, 0]);
  });

  it("finds boxes that dig into each other but not ones that only touch", () => {
    const a = box(0, 0, 0, 128, 128, 128);
    const touching = box(128, 0, 0, 256, 128, 128);
    const digging = box(100, 100, 100, 200, 200, 200);
    const far = box(1000, 0, 0, 1100, 64, 64);
    expect(overlappingPairs([a, touching, digging, far])).toEqual([
      [0, 2],
      [1, 2],
    ]);
  });

  it("snaps the min corner to the nearest grid node", () => {
    expect(gridSnapDelta([3, -5, 64], 8)).toEqual([-3, -3, 0]);
    expect(gridSnapDelta([12.0000001, 0, 0], 16)).toEqual([4, 0, 0]);
    expect(gridSnapDelta([7.99999, 1, 2], 0)).toEqual([0, 0, 0]);
  });
});
