// Arrangement of the four views: grid order, floating windows, maximising.

import { describe, expect, it } from "vitest";
import { cellStyle, defaultViews, dockView, floatView, gridStyle, gridViews, moveFloat, swapViews, toggleMax } from "./viewsLayout";

describe("gridViews", () => {
  it("lists the docked views in order and only the maximised one when set", () => {
    const l = defaultViews();
    expect(gridViews(l)).toEqual(["3d", "top", "front", "side"]);
    expect(gridViews(toggleMax(l, "top"))).toEqual(["top"]);
    expect(gridViews(toggleMax(toggleMax(l, "top"), "top"))).toHaveLength(4);
  });

  it("leaves floating views out of the grid and ignores max on a floating view", () => {
    let l = floatView(defaultViews(), "side", { x: 10, y: 10, w: 300, h: 200 });
    expect(gridViews(l)).toEqual(["3d", "top", "front"]);
    l = toggleMax(l, "side");
    expect(l.max).toBeNull();
    l = dockView(l, "side");
    expect(gridViews(l)).toHaveLength(4);
  });
});

describe("swapViews, moveFloat", () => {
  it("swaps two views in the grid order", () => {
    const l = swapViews(defaultViews(), "3d", "side");
    expect(l.order).toEqual(["side", "top", "front", "3d"]);
    expect(swapViews(l, "top", "top")).toBe(l);
  });

  it("patches a floating window's rectangle and ignores docked views", () => {
    const base = defaultViews();
    expect(moveFloat(base, "top", { x: 5 })).toBe(base);
    const l = moveFloat(floatView(base, "top", { x: 1, y: 2, w: 300, h: 200 }), "top", { w: 320 });
    expect(l.floating.top).toEqual({ x: 1, y: 2, w: 320, h: 200 });
  });

  it("floating a maximised view clears the max", () => {
    const l = floatView(toggleMax(defaultViews(), "front"), "front", { x: 0, y: 0, w: 300, h: 200 });
    expect(l.max).toBeNull();
  });
});

describe("gridStyle and cellStyle", () => {
  it("gives one column for one view, two for two, two by two for four", () => {
    const l = { ...defaultViews(), col: 0.6, row: 0.4 };
    expect(gridStyle(1, l).gridTemplateColumns).toBe("1fr");
    expect(gridStyle(2, l).gridTemplateColumns).toBe("0.6fr 0.4fr");
    expect(gridStyle(2, l).gridTemplateRows).toBe("1fr");
    expect(gridStyle(4, l).gridTemplateRows).toBe("0.4fr 0.6fr");
  });

  it("spans the third of three cells across the bottom row", () => {
    expect(cellStyle(0, 1)).toEqual({ gridColumn: "1 / -1", gridRow: "1" });
    expect(cellStyle(1, 2)).toEqual({ gridColumn: "2", gridRow: "1" });
    expect(cellStyle(2, 3)).toEqual({ gridColumn: "1 / -1", gridRow: "2" });
    expect(cellStyle(3, 4)).toEqual({ gridColumn: "2", gridRow: "2" });
  });
});
