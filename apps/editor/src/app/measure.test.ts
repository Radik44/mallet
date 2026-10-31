import { describe, expect, it } from "vitest";
import { measureOverlay, measureText, pairText, speedText, pointText, selectionMix, sizeText } from "./measure";

describe("ruler", () => {
  it("reports the length in units and metres with the axis parts", () => {
    expect(measureText({ a: [0, 0, 0], b: [480, 200, 64] })).toBe("линейка: 523.9 юн. (9.98 м) · X 480 · Y 200 · Z 64");
    expect(measureText({ a: [10, 10, 10], b: [10, 10, 10] })).toBe("линейка: 0 юн. (0.00 м) · X 0 · Y 0 · Z 0");
    expect(measureText({ a: [0, 0, 0], b: [1024, 0, 0] })).toContain("(19.5 м)");
  });

  it("draws the segment, the end crosses and the staircase", () => {
    const o = measureOverlay({ a: [0, 0, 0], b: [100, 50, 20] });
    // 1 segment + 2 crosses × 3 + 3 staircase legs = 10 segments of 2 points × 3 floats.
    expect(o.length).toBe(10 * 6);
    expect(Array.from(o.slice(0, 6))).toEqual([0, 0, 0, 100, 50, 20]);
  });

  it("skips staircase legs of zero length", () => {
    const o = measureOverlay({ a: [0, 0, 0], b: [100, 0, 0] });
    expect(o.length).toBe((1 + 6 + 1) * 6);
  });

  it("describes a box size in units and metres", () => {
    expect(sizeText([[0, 0, 0], [768, 512, 256]])).toBe("768 × 512 × 256 (14.6 × 9.8 × 4.9 м)");
    expect(sizeText([[5, 5, 5], [5, 5, 5]])).toBe("");
    expect(sizeText(null)).toBe("");
  });

  it("formats a point for keys and for Lua", () => {
    expect(pointText([128, -64.333, 0], false)).toBe("128 -64.33 0");
    expect(pointText([1.5, -0, 32], true)).toBe("Vector(1.5, 0, 32)");
  });

  it("names what a selection is made of", () => {
    expect(selectionMix(6, 2)).toBe("6 брашей, 2 энтити");
    expect(selectionMix(1, 0)).toBe("1 браш");
    expect(selectionMix(22, 0)).toBe("22 браша");
    expect(selectionMix(12, 0)).toBe("12 брашей");
    expect(selectionMix(0, 3)).toBe("3 энтити");
  });
});

describe("two objects", () => {
  it("gives the centre distance and the gap", () => {
    expect(pairText([[0, 0, 0], [64, 64, 64]], [[128, 0, 0], [192, 64, 64]])).toBe("между центрами 128 (2.4 м) · зазор 64");
    expect(pairText([[0, 0, 0], [64, 64, 64]], [[64, 0, 0], [128, 64, 64]])).toContain("вплотную");
    expect(pairText([[0, 0, 0], [64, 64, 64]], [[32, 32, 32], [96, 96, 96]])).toContain("пересекаются");
  });
});

describe("flight speed", () => {
  it("shows units and metres per second", () => {
    expect(speedText(500)).toBe("скорость полёта 500 юн/с (9.5 м/с) · колесо меняет");
  });
});
