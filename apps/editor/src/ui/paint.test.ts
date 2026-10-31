import { describe, expect, it } from "vitest";
import { composite, dab, floodFill, makePix, pickColor, rect, resizePix, stamp, stroke, vtfSize, hasAlpha, type Layer } from "./paint";

const red: [number, number, number, number] = [255, 0, 0, 255];

describe("paint", () => {
  it("dabs a hard circle and wraps it across the edges in seamless mode", () => {
    const p = makePix(32, 32, [0, 0, 0, 255]);
    dab(p, 16, 16, { radius: 4, hardness: 1, opacity: 1, color: red });
    expect(pickColor(p, 16, 16)).toEqual(red);
    expect(pickColor(p, 16, 22)).toEqual([0, 0, 0, 255]);
    const q = makePix(32, 32);
    dab(q, 0, 0, { radius: 3, hardness: 1, opacity: 1, color: red, wrap: true });
    // All four corners get a quarter of the dab.
    expect(pickColor(q, 0, 0)![3]).toBe(255);
    expect(pickColor(q, 31, 31)![3]).toBe(255);
    expect(pickColor(q, 31, 0)![3]).toBe(255);
    expect(pickColor(q, 16, 16)![3]).toBe(0);
    const m = makePix(32, 32);
    dab(m, 4, 4, { radius: 2, hardness: 1, opacity: 1, color: red, mirrorX: true, mirrorY: true });
    expect(pickColor(m, 27, 27)![3]).toBe(255);
    expect(pickColor(m, 27, 4)![3]).toBe(255);
    expect(pickColor(m, 4, 27)![3]).toBe(255);
  });

  it("strokes, erases and fills rectangles", () => {
    const p = makePix(40, 10);
    stroke(p, 2, 5, 37, 5, { radius: 1, hardness: 1, opacity: 1, color: red });
    for (let x = 3; x < 36; x++) expect(pickColor(p, x, 5)![3]).toBe(255);
    stroke(p, 10, 5, 20, 5, { radius: 1, hardness: 1, opacity: 1, color: red, erase: true });
    expect(pickColor(p, 15, 5)![3]).toBe(0);
    rect(p, 0, 0, 4, 4, { radius: 1, hardness: 1, opacity: 0.5, color: red }, false);
    expect(pickColor(p, 1, 1)![3]).toBe(128);
    expect(pickColor(p, 1, 1)![0]).toBe(255);
  });

  it("flood-fills a region, through the seam when wrapping", () => {
    const p = makePix(8, 8, [10, 10, 10, 255]);
    rect(p, 2, 0, 3, 8, { radius: 1, hardness: 1, opacity: 1, color: red }, false);
    const n = floodFill(p, 0, 0, [0, 0, 255, 255], 0, false);
    expect(n).toBe(16);
    expect(pickColor(p, 6, 6)).toEqual([10, 10, 10, 255]);
    expect(floodFill(p, 7, 7, [0, 255, 0, 255], 0, false)).toBe(40);
    // Through the seam: the grey to the right of the stripe joins the grey to its left.
    const q = makePix(8, 8, [10, 10, 10, 255]);
    rect(q, 3, 0, 5, 8, { radius: 1, hardness: 1, opacity: 1, color: red }, false);
    expect(floodFill(q, 6, 0, [0, 255, 0, 255], 0, true)).toBe(48);
    expect(pickColor(q, 0, 7)).toEqual([0, 255, 0, 255]);
    expect(pickColor(q, 3, 3)).toEqual(red);
  });

  it("composites layers with opacity and stamps pictures", () => {
    const a: Layer = { id: 1, name: "a", pix: makePix(4, 4, [0, 0, 255, 255]), visible: true, opacity: 1 };
    const b: Layer = { id: 2, name: "b", pix: makePix(4, 4, red), visible: true, opacity: 0.5 };
    const out = composite([a, b], makePix(4, 4));
    const c = pickColor(out, 1, 1)!;
    expect(Math.abs(c[0] - 128)).toBeLessThanOrEqual(1);
    expect(Math.abs(c[2] - 128)).toBeLessThanOrEqual(1);
    expect(c[3]).toBe(255);
    b.visible = false;
    expect(pickColor(composite([a, b], makePix(4, 4)), 0, 0)).toEqual([0, 0, 255, 255]);
    const dst = makePix(4, 4);
    stamp(dst, makePix(2, 2, red), 3, 3, 1, true);
    expect(pickColor(dst, 0, 0)).toEqual(red);
    expect(pickColor(dst, 3, 3)).toEqual(red);
    expect(hasAlpha(dst)).toBe(true);
    expect(resizePix(dst, 8, 8).w).toBe(8);
    expect(pickColor(resizePix(dst, 8, 8), 7, 7)).toEqual(red);
    expect(vtfSize(64, 64)).toBe(80 + 4 * (4096 + 1024 + 256 + 64 + 16 + 4 + 1));
  });
});
