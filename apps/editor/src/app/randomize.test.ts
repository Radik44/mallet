import { describe, expect, it } from "vitest";
import { anglesText, parseAngles, randomAngles, randomSubset } from "./randomize";

describe("randomize rotation", () => {
  it("parses angles with missing parts as zero", () => {
    expect(parseAngles("0 90 0")).toEqual([0, 90, 0]);
    expect(parseAngles("15")).toEqual([15, 0, 0]);
    expect(parseAngles(undefined)).toEqual([0, 0, 0]);
  });

  it("keeps yaw in a full turn and tilt within the limit", () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 50; i++) {
      const [p, y, r] = randomAngles(rand, 5);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(360);
      expect(Math.abs(p)).toBeLessThanOrEqual(5);
      expect(Math.abs(r)).toBeLessThanOrEqual(5);
    }
    expect(randomAngles(() => 0.5)).toEqual([0, 180, 0]);
  });

  it("writes angles without negative zero", () => {
    expect(anglesText([-0, 45.5, 0])).toBe("0 45.5 0");
  });
});

describe("select random", () => {
  it("keeps the asked share, in order, and at least one", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const got = randomSubset([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5, rand);
    expect(got).toHaveLength(5);
    expect([...got].sort((a, b) => a - b)).toEqual(got);
    expect(randomSubset([42], 0.1, rand)).toEqual([42]);
  });
});

