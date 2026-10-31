import { describe, expect, it } from "vitest";
import { faceAxis, faceCovered, hidesBehind } from "./hiddenFaces";

type Box = [[number, number, number], [number, number, number]];
const wall: Box = [
  [0, 0, 0],
  [16, 128, 128],
];

describe("hidden faces", () => {
  it("reads the axis of straight faces only", () => {
    expect(faceAxis([0, -1, 0])).toEqual({ axis: 1, sign: -1 });
    expect(faceAxis([0.7071, 0.7071, 0])).toBeNull();
  });

  it("finds a face pressed against a box that spans it", () => {
    const floor: Box = [
      [-64, -64, -16],
      [256, 256, 0],
    ];
    expect(faceCovered(wall, [0, 0, -1], [floor])).toBe(true);
    expect(faceCovered(wall, [0, 0, 1], [floor])).toBe(false);
  });

  it("leaves a face only partly covered or with a gap", () => {
    const half: Box = [
      [16, 0, 0],
      [32, 64, 128],
    ];
    expect(faceCovered(wall, [1, 0, 0], [half])).toBe(false);
    const apart: Box = [
      [17, 0, 0],
      [32, 128, 128],
    ];
    expect(faceCovered(wall, [1, 0, 0], [apart])).toBe(false);
    const full: Box = [
      [16, -8, -8],
      [32, 136, 136],
    ];
    expect(faceCovered(wall, [1, 0, 0], [full])).toBe(true);
  });

  it("counts real textures and nodraw as hiding, other tools not", () => {
    expect(hidesBehind("brick/brickwall001a")).toBe(true);
    expect(hidesBehind("TOOLS/toolsnodraw")).toBe(true);
    expect(hidesBehind("tools/toolstrigger")).toBe(false);
  });
});
