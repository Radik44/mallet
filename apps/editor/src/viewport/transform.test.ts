// Affine helpers used by moves, rotations and scales in both 2D and 3D.

import { describe, expect, it } from "vitest";
import { applyAffine, boxCenter, boxSize, boxesIntersect, rotationAbout, scalingAbout, transformPoints, translation, type Box3, type Vec3 } from "./transform";

const near = (a: Vec3, b: Vec3, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < eps);

describe("translation", () => {
  it("moves a point by the delta", () => {
    expect(applyAffine(translation([1, 2, 3]), [10, 10, 10])).toEqual([11, 12, 13]);
  });
});

describe("rotationAbout", () => {
  it("turns a point 90 degrees about Z through the pivot and keeps the pivot", () => {
    const r = rotationAbout([10, 10, 0], [0, 0, 1], 90);
    expect(near(applyAffine(r, [10, 10, 0]), [10, 10, 0])).toBe(true);
    expect(near(applyAffine(r, [20, 10, 0]), [10, 20, 0])).toBe(true);
  });

  it("is a rotation: lengths are kept", () => {
    const r = rotationAbout([0, 0, 0], [1, 1, 0], 37);
    const p = applyAffine(r, [3, 4, 5]);
    expect(Math.hypot(...p)).toBeCloseTo(Math.hypot(3, 4, 5), 9);
  });
});

describe("scalingAbout", () => {
  it("doubles distances from the pivot per axis", () => {
    const s = scalingAbout([0, 0, 100], [2, 1, 0.5]);
    expect(applyAffine(s, [4, 4, 104])).toEqual([8, 4, 102]);
  });

  it("transforms a flat point array in place-sized copy", () => {
    const out = transformPoints(translation([1, 0, 0]), new Float32Array([0, 0, 0, 5, 5, 5]));
    expect(Array.from(out)).toEqual([1, 0, 0, 6, 5, 5]);
  });
});

describe("boxes", () => {
  const a: Box3 = [[0, 0, 0], [10, 20, 30]];
  it("centre and size", () => {
    expect(boxCenter(a)).toEqual([5, 10, 15]);
    expect(boxSize(a)).toEqual([10, 20, 30]);
  });
  it("intersection is inclusive of touching faces", () => {
    expect(boxesIntersect(a, [[10, 0, 0], [20, 20, 30]])).toBe(true);
    expect(boxesIntersect(a, [[11, 0, 0], [20, 20, 30]])).toBe(false);
  });
});
