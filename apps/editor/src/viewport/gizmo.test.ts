// The 3D gizmo's geometry and screen-space maths, without a GPU.

import { mat4, vec3 } from "wgpu-matrix";
import { describe, expect, it } from "vitest";
import { gizmoColors, gizmoLines, mouseRay, pickGizmoAxis, projectCss, rayPlane, ringAngle } from "./gizmo";

/** A camera at the origin looking down +X with Z up, 90° vertical FOV, square viewport. */
function viewProj() {
  const proj = mat4.perspective(Math.PI / 2, 1, 1, 10000);
  const view = mat4.lookAt(vec3.create(0, 0, 0), vec3.create(1, 0, 0), vec3.create(0, 0, 1));
  return mat4.multiply(proj, view);
}
const EYE = new Float32Array([0, 0, 0]);
const W = 800;
const H = 800;

describe("gizmoLines", () => {
  it("builds the same number of vertices as colours for every mode", () => {
    for (const mode of ["move", "rotate", "scale"] as const) {
      const lines = gizmoLines([100, 0, 0], 10, mode);
      const colors = gizmoColors(mode, null);
      expect(lines.length).toBe(colors.length);
      expect(lines.length % 6).toBe(0);
    }
  });

  it("colours the hovered axis differently", () => {
    const plain = gizmoColors("move", null);
    const hover = gizmoColors("move", 1);
    expect(plain).not.toEqual(hover);
    expect(plain.slice(0, 3)).toEqual(hover.slice(0, 3));
  });
});

describe("projection and picking", () => {
  it("projects a point ahead of the camera to the middle of the screen", () => {
    const p = projectCss(viewProj(), [100, 0, 0], W, H)!;
    expect(p[0]).toBeCloseTo(W / 2, 3);
    expect(p[1]).toBeCloseTo(H / 2, 3);
    expect(projectCss(viewProj(), [-100, 0, 0], W, H)).toBeNull();
  });

  it("picks the arrow under the cursor and nothing far away", () => {
    const vp = viewProj();
    const center: [number, number, number] = [100, 0, 0];
    // The Z arrow points up on screen: a pixel above the centre hits axis 2.
    const up = projectCss(vp, [100, 0, 10], W, H)!;
    expect(pickGizmoAxis(vp, center, 20, [up[0], up[1] + 1], W, H, "move")).toBe(2);
    // The Y arrow (world +Y is screen left for this camera) hits axis 1.
    const left = projectCss(vp, [100, 10, 0], W, H)!;
    expect(pickGizmoAxis(vp, center, 20, left, W, H, "move")).toBe(1);
    expect(pickGizmoAxis(vp, center, 20, [10, 10], W, H, "move")).toBeNull();
  });

  it("the ray through the screen centre hits the plane straight ahead", () => {
    const ray = mouseRay(viewProj(), EYE, [W / 2, H / 2], W, H);
    const hit = rayPlane(ray, [1, 0, 0], 100)!;
    expect(hit[0]).toBeCloseTo(100, 6);
    expect(Math.abs(hit[1])).toBeLessThan(1e-6);
    expect(rayPlane(ray, [1, 0, 0], -100)).toBeNull();
  });

  it("ringAngle grows as the cursor goes round the ring", () => {
    const vp = viewProj();
    const center: [number, number, number] = [100, 0, 0];
    // Ring about X lies in the YZ plane: points on it project to a circle around the centre.
    const a = ringAngle(vp, EYE, 0, center, projectCss(vp, [100, 10, 0], W, H)!, W, H)!;
    const b = ringAngle(vp, EYE, 0, center, projectCss(vp, [100, 0, 10], W, H)!, W, H)!;
    expect(a).toBeCloseTo(0, 4);
    expect(b).toBeCloseTo(90, 4);
  });
});
