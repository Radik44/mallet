import { describe, expect, it } from "vitest";
import { nextAlong, rayBoxEntry, rayOrder } from "./pickCycle";

describe("click again to pick what is behind", () => {
  const near: [[number, number, number], [number, number, number]] = [[100, -10, -10], [120, 10, 10]];
  const far: [[number, number, number], [number, number, number]] = [[300, -50, -50], [400, 50, 50]];
  const aside: [[number, number, number], [number, number, number]] = [[200, 100, 100], [250, 150, 150]];

  it("finds where a ray enters a box", () => {
    expect(rayBoxEntry([0, 0, 0], [1, 0, 0], near)).toBe(100);
    expect(rayBoxEntry([110, 0, 0], [1, 0, 0], near)).toBe(0);
    expect(rayBoxEntry([0, 0, 0], [-1, 0, 0], near)).toBeNull();
    expect(rayBoxEntry([0, 0, 0], [1, 0, 0], aside)).toBeNull();
  });

  it("orders the boxes on the ray nearest first and steps through them", () => {
    const order = rayOrder([0, 0, 0], [1, 0, 0], [
      { id: 3, box: far },
      { id: 7, box: aside },
      { id: 5, box: near },
    ]);
    expect(order).toEqual([5, 3]);
    expect(nextAlong(order, 5)).toBe(3);
    expect(nextAlong(order, 3)).toBe(5);
    expect(nextAlong(order, 99)).toBe(5);
    expect(nextAlong([], 5)).toBeNull();
  });
});
