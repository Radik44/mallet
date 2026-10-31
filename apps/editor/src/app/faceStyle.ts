// Copy a face's texture and its placement onto other faces, as Hammer's
// "Lift" and "Apply values" in the texture tool: material, shift, scale,
// rotation and lightmap scale travel together, so a trim or a floor pattern
// continues on the next brush without retyping five numbers.

import type { FaceEdit, FaceInfo } from "../ui/FaceEditor";

/** The edit that gives another face this face's texture and placement. */
export function faceStyleEdit(f: FaceInfo): FaceEdit {
  return {
    material: f.material,
    shift_x: f.uaxis[3],
    shift_y: f.vaxis[3],
    scale_x: f.uaxis[4],
    scale_y: f.vaxis[4],
    rotation: f.rotation,
    lightmap_scale: f.lightmap_scale,
  };
}
