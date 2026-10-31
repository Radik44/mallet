import { describe, expect, it } from "vitest";
import { deltaTo, originAtCentre, outsideBox, pivotOf } from "./transformClip";

describe("transform clipboard", () => {
  it("stands a single point entity at its origin, anything else at its box middle", () => {
    expect(
      pivotOf(
        [10, 20, 30],
        [
          [0, 0, 0],
          [64, 64, 64],
        ],
      ),
    ).toEqual([10, 20, 30]);
    expect(
      pivotOf(null, [
        [0, 0, 0],
        [64, 32, 16],
      ]),
    ).toEqual([32, 16, 8]);
  });

  it("moves from one point to the other", () => {
    expect(deltaTo([32, 16, 8], [100, 0, 8.333])).toEqual([68, -16, 0.33]);
  });
});

describe("origin to the middle", () => {
  it("puts the origin in the middle of all the brushes, in whole units", () => {
    expect(
      originAtCentre([
        [
          [0, 0, 0],
          [64, 16, 128],
        ],
        [
          [64, 0, 0],
          [129, 16, 128],
        ],
      ]),
    ).toBe("65 8 64");
    expect(
      originAtCentre([
        [
          [-16, -16, -16],
          [16, 16, 16],
        ],
      ]),
    ).toBe("0 0 0");
    expect(originAtCentre([])).toBeNull();
  });
});

describe("pivot outside the brushes", () => {
  it("tells a far origin from one on the edge", () => {
    const box: [[number, number, number], [number, number, number]] = [
      [100, 100, 0],
      [164, 116, 128],
    ];
    expect(outsideBox([0, 0, 0], box)).toBe(true);
    expect(outsideBox([132, 108, 64], box)).toBe(false);
    expect(outsideBox([164.5, 108, 64], box)).toBe(false);
  });
});
