import { describe, expect, it } from "vitest";
import { ringPlan } from "./ring";

describe("ring of copies", () => {
  it("puts the centre along −X and spreads the copies evenly", () => {
    expect(ringPlan([100, 50, 0], 256, 3)).toEqual({ pivot: [-156, 50, 0], angles: [90, 180, 270] });
    expect(ringPlan([0, 0, 0], 64, 11).angles[0]).toBe(30);
  });
});
