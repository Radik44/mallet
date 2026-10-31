import { describe, expect, it } from "vitest";
import { parseViewSettings } from "./camera";

describe("3D view settings", () => {
  it("reads stored values and falls back when missing or out of range", () => {
    expect(parseViewSettings("8192", "90")).toEqual({ far: 8192, fov: 90 });
    expect(parseViewSettings(null, null)).toEqual({ far: 65536, fov: 75 });
    expect(parseViewSettings("10", "500")).toEqual({ far: 65536, fov: 75 });
    expect(parseViewSettings("abc", "")).toEqual({ far: 65536, fov: 75 });
  });
});
