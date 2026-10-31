import { describe, expect, it } from "vitest";
import { joinedBox, mergeBoxes } from "./mergeBoxes";

type Box = [[number, number, number], [number, number, number]];
const b = (x0: number, x1: number, y0 = 0, y1 = 64): Box => [
  [x0, y0, 0],
  [x1, y1, 128],
];

describe("merge box brushes", () => {
  it("joins boxes sharing a whole face, not a part of one", () => {
    expect(joinedBox(b(0, 64), b(64, 128))).toEqual([
      [0, 0, 0],
      [128, 64, 128],
    ]);
    expect(joinedBox(b(0, 64), b(64, 128, 0, 32))).toBeNull();
    expect(joinedBox(b(0, 64), b(80, 128))).toBeNull();
  });

  it("joins a row of four into one and leaves a stray", () => {
    const got = mergeBoxes([
      { id: 1, box: b(0, 64) },
      { id: 3, box: b(128, 192) },
      { id: 2, box: b(64, 128) },
      { id: 4, box: b(192, 256) },
      { id: 9, box: b(0, 64, 100, 164) },
    ]);
    expect(got).toEqual([
      {
        ids: [1, 2, 3, 4],
        box: [
          [0, 0, 0],
          [256, 64, 128],
        ],
      },
      { ids: [9], box: b(0, 64, 100, 164) },
    ]);
  });

  it("merges a row of 3000 boxes and a 40 × 40 floor quickly", () => {
    const row = Array.from({ length: 3000 }, (_, i) => ({ id: i + 1, box: b(i * 16, i * 16 + 16) }));
    const floor = Array.from({ length: 1600 }, (_, i) => ({
      id: 10000 + i,
      box: [
        [(i % 40) * 32, Math.floor(i / 40) * 32, -16],
        [(i % 40) * 32 + 32, Math.floor(i / 40) * 32 + 32, 0],
      ] as Box,
    }));
    const t0 = performance.now();
    const got = mergeBoxes([...row, ...floor]);
    const ms = performance.now() - t0;
    expect(got[0]).toEqual({
      ids: row.map((r) => r.id),
      box: [
        [0, 0, 0],
        [48000, 64, 128],
      ],
    });
    // The floor joins into strips and the strips into one slab.
    expect(got.slice(1).map((g) => g.box)).toEqual([
      [
        [0, 0, -16],
        [1280, 1280, 0],
      ],
    ]);
    expect(ms).toBeLessThan(2000);
  });
});
