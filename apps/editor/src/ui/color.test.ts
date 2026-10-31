import { describe, expect, it } from "vitest";
import { formatSourceColor, fromHex, hsvToRgb, kelvinToRgb, parseSourceColor, rgbToHsv, toHex } from "./color";
import { parseAngles } from "./AngleField";

describe("colour maths", () => {
  it("round-trips rgb through hsv", () => {
    for (const rgb of [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 170, 110],
      [12, 34, 56],
      [128, 128, 128],
    ] as [number, number, number][]) {
      expect(hsvToRgb(rgbToHsv(...rgb))).toEqual(rgb);
    }
  });

  it("keeps the hue of a pure colour", () => {
    expect(Math.round(rgbToHsv(0, 255, 0).h)).toBe(120);
    expect(rgbToHsv(0, 0, 0).s).toBe(0);
  });

  it("converts hex both ways", () => {
    expect(toHex([255, 170, 110])).toBe("#ffaa6e");
    expect(fromHex("#FFAA6E")).toEqual([255, 170, 110]);
    expect(fromHex("ffaa6e")).toEqual([255, 170, 110]);
    expect(fromHex("#abc")).toBeNull();
  });

  it("parses Source light keys with brightness and keeps the tail", () => {
    const c = parseSourceColor("255 200 100 300 1", 255)!;
    expect(c.rgb).toEqual([255, 200, 100]);
    expect(c.extra).toBe(300);
    expect(c.rest).toEqual(["1"]);
    expect(formatSourceColor(c, 255)).toBe("255 200 100 300 1");
    expect(parseSourceColor("1 .5 0", 1)!.rgb).toEqual([255, 128, 0]);
    expect(formatSourceColor({ rgb: [255, 128, 0], extra: null, rest: [] }, 1)).toBe("1 0.502 0");
    expect(parseSourceColor("abc", 255)).toBeNull();
  });

  it("gives warm and cold whites for the presets", () => {
    const warm = kelvinToRgb(2700);
    const cold = kelvinToRgb(7500);
    expect(warm[0]).toBeGreaterThan(warm[2]);
    expect(cold[2]).toBeGreaterThan(cold[0]);
    expect(kelvinToRgb(6600)).toEqual([255, 255, 255]);
  });

  it("parses angles leniently", () => {
    expect(parseAngles("0 90 0")).toEqual([0, 90, 0]);
    expect(parseAngles("")).toEqual([0, 0, 0]);
    expect(parseAngles("-45 x 10")).toEqual([-45, 0, 10]);
  });
});
