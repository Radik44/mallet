import { describe, expect, it } from "vitest";
import { offGridShift } from "./offGrid";

describe("off-grid boxes", () => {
  it("moves a whole-sized box nudged by a fraction back onto whole units", () => {
    const s = offGridShift([
      [0.5, 10, -3.25],
      [64.5, 74, 12.75],
    ]);
    expect(s?.map((v) => Math.abs(v))).toEqual([0.5, 0, 0.25]);
  });

  it("leaves boxes on the grid, float noise and fractional sizes alone", () => {
    expect(
      offGridShift([
        [0, 0, 0],
        [64, 64, 64],
      ]),
    ).toBeNull();
    expect(
      offGridShift([
        [0.0001, 0, 0],
        [63.9999, 64, 64],
      ]),
    ).toBeNull();
    expect(
      offGridShift([
        [0.5, 0, 0],
        [64, 64, 64],
      ]),
    ).toBeNull();
  });
});
