import { describe, expect, it } from "vitest";
import { faceStyleEdit } from "./faceStyle";

describe("copy a face's texture", () => {
  it("carries material, shift, scale, rotation and lightmap scale", () => {
    const edit = faceStyleEdit({
      material: "brick/brickwall001a",
      uaxis: [1, 0, 0, 32, 0.5],
      vaxis: [0, 0, -1, 16, 0.25],
      rotation: 45,
      lightmap_scale: 8,
      smoothing_groups: 0,
      normal: [0, 1, 0],
      disp_power: 0,
      quad: true,
    });
    expect(edit).toEqual({ material: "brick/brickwall001a", shift_x: 32, shift_y: 16, scale_x: 0.5, scale_y: 0.25, rotation: 45, lightmap_scale: 8 });
  });
});
