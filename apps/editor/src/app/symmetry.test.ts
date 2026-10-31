import { describe, expect, it } from "vitest";
import { DEFAULT_SYMMETRY, mirrorFactors, mirrorPivot, mirroredPoint, onPlane, symmetryOverlay } from "./symmetry";

describe("symmetry", () => {
  it("mirrors points across the plane on the chosen axis", () => {
    const s = { ...DEFAULT_SYMMETRY, axis: 0 as const, pos: 128 };
    expect(mirroredPoint(s, [200, 10, 20])).toEqual([56, 10, 20]);
    expect(mirrorPivot(s)).toEqual([128, 0, 0]);
    expect(mirrorFactors(s)).toEqual([-1, 1, 1]);
    expect(mirroredPoint({ ...s, axis: 2, pos: 0 }, [1, 2, 64])).toEqual([1, 2, -64]);
  });

  it("knows when a point lies on the plane", () => {
    const s = { ...DEFAULT_SYMMETRY, axis: 1 as const, pos: 0 };
    expect(onPlane(s, [50, 0.2, 7])).toBe(true);
    expect(onPlane(s, [50, 8, 7])).toBe(false);
  });

  it("outlines the plane with a cross: six segments on it", () => {
    const s = { ...DEFAULT_SYMMETRY, axis: 0 as const, pos: 64 };
    const o = symmetryOverlay(s, 100);
    expect(o.length).toBe(6 * 6);
    for (let i = 0; i < o.length; i += 3) expect(o[i]).toBe(64);
  });
});
