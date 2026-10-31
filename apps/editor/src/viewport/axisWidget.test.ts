import { describe, expect, it } from "vitest";
import { axisEnds, viewAlong } from "./axisWidget";

const end = (yaw: number, pitch: number, axis: "x" | "y" | "z", sign: 1 | -1) => axisEnds(yaw, pitch).find((e) => e.axis === axis && e.sign === sign)!;

describe("axis widget", () => {
  it("draws the axes as the camera sees them", () => {
    // Looking along +X (yaw 0, level): +Y points left, +Z up, +X away from us.
    expect(end(0, 0, "y", 1)).toMatchObject({ x: -1, y: 0 });
    expect(end(0, 0, "z", 1)).toMatchObject({ x: 0, y: -1 });
    expect(end(0, 0, "x", 1).depth).toBe(-1);
    // Looking down: +Z comes at us.
    expect(end(0, -89, "z", 1).depth).toBeGreaterThan(0.99);
  });

  it("turns the view along an axis around the pivot", () => {
    const fromX = viewAlong("x", 1, [0, 0, 0], 100);
    expect(fromX.yaw).toBe(180);
    expect(fromX.pitch).toBe(0);
    expect(fromX.position.map((v) => Math.round(v) + 0)).toEqual([100, 0, 0]);
    const fromTop = viewAlong("z", 1, [10, 20, 30], 100);
    expect(fromTop.pitch).toBe(-89);
    expect(Math.round(fromTop.position[2])).toBe(130);
    expect(viewAlong("y", -1, [0, 0, 0], 50).yaw).toBe(90);
  });
});
