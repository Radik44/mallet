import { describe, expect, it } from "vitest";
import { boxesTouch, touchingIds } from "./touching";

const box = (x0: number, x1: number): [[number, number, number], [number, number, number]] => [[x0, 0, 0], [x1, 64, 64]];

describe("grow the selection to neighbours", () => {
  it("counts shared faces and overlaps as touching, gaps not", () => {
    expect(boxesTouch(box(0, 64), box(64, 128))).toBe(true);
    expect(boxesTouch(box(0, 64), box(32, 96))).toBe(true);
    expect(boxesTouch(box(0, 64), box(65, 128))).toBe(false);
  });

  it("adds one ring of neighbours, leaving the selected and the far ones", () => {
    const list = [
      { id: 1, box: box(0, 64) },
      { id: 2, box: box(64, 128) },
      { id: 3, box: box(128, 192) },
      { id: 4, box: box(300, 364) },
    ];
    expect(touchingIds([box(0, 64)], list, new Set([1])).ids).toEqual([2]);
    expect(touchingIds([box(0, 64), box(64, 128)], list, new Set([1, 2])).ids).toEqual([3]);
  });

  it("leaves out a floor far larger than the selection", () => {
    const floor = { id: 9, box: [[-2048, -2048, -16], [2048, 2048, 0]] as [[number, number, number], [number, number, number]] };
    const r = touchingIds([box(0, 64)], [floor, { id: 2, box: box(64, 128) }], new Set());
    expect(r).toEqual({ ids: [2], tooBig: [9] });
  });
});
