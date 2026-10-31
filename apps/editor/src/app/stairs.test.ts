import { describe, expect, it } from "vitest";
import { stairBoxes } from "./stairs";

describe("stairs", () => {
  it("rises along the longer side, each step a slab to the back", () => {
    const steps = stairBoxes([0, 0, 0], [128, 64, 64], 16);
    expect(steps.length).toBe(4);
    expect(steps[0]).toEqual([[0, 0, 0], [128, 64, 16]]);
    expect(steps[3]).toEqual([[96, 0, 48], [128, 64, 64]]);
  });

  it("runs along Y when that side is longer, and keeps at least one step", () => {
    const steps = stairBoxes([0, 0, 0], [64, 256, 8], 16);
    expect(steps).toEqual([[[0, 0, 0], [64, 256, 8]]]);
    expect(stairBoxes([0, 0, 0], [64, 256, 32], 16)[1][0][1]).toBe(128);
  });

  it("gives nothing for a flat box", () => {
    expect(stairBoxes([0, 0, 0], [64, 64, 0], 16)).toEqual([]);
  });

  it("rises the other way when reversed", () => {
    const steps = stairBoxes([0, 0, 0], [128, 64, 64], 16, true);
    expect(steps[0]).toEqual([[0, 0, 0], [128, 64, 16]]);
    expect(steps[3]).toEqual([[0, 0, 48], [32, 64, 64]]);
  });
});
