import { describe, expect, it } from "vitest";
import { detailCandidates } from "./detail";

describe("func_detail candidates", () => {
  it("takes small brushes and leaves walls, floors and tool brushes", () => {
    const list = [
      { id: 1, box: [[0, 0, 0], [32, 32, 64]] as [[number, number, number], [number, number, number]], tools: false },
      { id: 2, box: [[0, 0, 0], [1024, 16, 256]] as [[number, number, number], [number, number, number]], tools: false },
      { id: 3, box: [[0, 0, 0], [64, 64, 64]] as [[number, number, number], [number, number, number]], tools: true },
      { id: 4, box: [[0, 0, 0], [128, 128, 8]] as [[number, number, number], [number, number, number]], tools: false },
    ];
    expect(detailCandidates(list)).toEqual([1, 4]);
    expect(detailCandidates(list, 64)).toEqual([1]);
  });
});
