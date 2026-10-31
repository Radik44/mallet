import { describe, expect, it } from "vitest";
import { overlayFaces, parseSides, staleSides, type FaceRef } from "./overlaySides";

// A floor slab (top face side 11 at z = 0) and a wall beside it (side 21 facing +x at x = 64).
const faces: FaceRef[] = [
  {
    side: 11,
    normal: [0, 0, 1],
    dist: 0,
    box: [
      [-128, -128, -16],
      [128, 128, 0],
    ],
  },
  {
    side: 12,
    normal: [0, 0, -1],
    dist: 16,
    box: [
      [-128, -128, -16],
      [128, 128, 0],
    ],
  },
  {
    side: 21,
    normal: [1, 0, 0],
    dist: 64,
    box: [
      [48, -128, 0],
      [64, 128, 128],
    ],
  },
];

describe("overlay faces", () => {
  it("finds the floor under a floor decal, not the wall or the floor's underside", () => {
    const frame = {
      origin: [0, 0, 0] as [number, number, number],
      n: [0, 0, 1] as [number, number, number],
      corners: [
        [-16, -16, 0],
        [-16, 16, 0],
        [16, 16, 0],
        [16, -16, 0],
      ] as [number, number, number][],
    };
    expect(overlayFaces(frame, faces)).toEqual([11]);
  });

  it("finds nothing for a decal floating in the air", () => {
    const frame = { origin: [0, 0, 300] as [number, number, number], n: [0, 0, 1] as [number, number, number], corners: [] };
    expect(overlayFaces(frame, faces)).toEqual([]);
  });

  it("calls the list stale when a face is gone or none is under it", () => {
    expect(staleSides([11], new Set([11, 12]), [11])).toBe(false);
    expect(staleSides([99], new Set([11, 12]), [11])).toBe(true);
    expect(staleSides([12], new Set([11, 12]), [11])).toBe(true);
    expect(staleSides([99], new Set([11]), [])).toBe(false);
    expect(parseSides(" 11 21 ")).toEqual([11, 21]);
  });
});
