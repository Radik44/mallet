// Studio models in the viewport: the GMDL container from the shell parsed
// into typed arrays, and the placement maths of a prop (Source's angle
// convention) as a column-major matrix for the instanced model pipeline.

import type { MeshBuffers } from "../map/loader";
import type { Box3, Vec3 } from "./transform";

export interface ModelMesh {
  /** Material name as written in a VMF (`models/props_c17/oil_drum001a`). */
  material: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

export interface ModelData {
  mins: Vec3;
  maxs: Vec3;
  meshes: ModelMesh[];
  /** UVs are texel coordinates (brush geometry), not 0..1. */
  texels?: boolean;
  /** An editor icon: one quad drawn as a billboard with its alpha. */
  sprite?: boolean;
}

/** Half-size in units of an entity icon (Hammer draws them 16 wide). */
export const SPRITE_HALF = 8;

/**
 * The quad of an `iconsprite()` material, in view-plane coordinates: x to
 * the right, y up. The renderer orients it towards the camera.
 */
export function spriteModel(material: string): ModelData {
  const h = SPRITE_HALF;
  return {
    mins: [-h, -h, -h],
    maxs: [h, h, h],
    sprite: true,
    // UVs are already 0..1.
    texels: false,
    meshes: [
      {
        material,
        positions: new Float32Array([-h, -h, 0, h, -h, 0, h, h, 0, -h, h, 0]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
        // Image rows run top to bottom, so v is 1 at the bottom edge.
        uvs: new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]),
      },
    ],
  };
}

/** Instance placement of a sprite: translation only, with the billboard mark in c0.w. */
export function spriteMatrix(origin: Vec3): Float32Array {
  return new Float32Array([1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, origin[0], origin[1], origin[2], 1]);
}

/**
 * The brush mesh of an instance VMF as a model: one mesh per material,
 * texel UVs, so func_instance entities draw through the model pipeline.
 */
export function modelFromMesh(mesh: MeshBuffers, bounds: [Vec3, Vec3] | null): ModelData {
  const meshes: ModelMesh[] = [];
  for (let r = 0; r < mesh.ranges.length; r += 3) {
    const material = mesh.materials[mesh.ranges[r]];
    const first = mesh.ranges[r + 1];
    const count = mesh.ranges[r + 2];
    const remap = new Map<number, number>();
    const indices = new Uint32Array(count);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    for (let i = 0; i < count; i++) {
      const v = mesh.indices[first + i];
      let n = remap.get(v);
      if (n === undefined) {
        n = remap.size;
        remap.set(v, n);
        positions.push(mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]);
        normals.push(mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2]);
        uvs.push(mesh.texcoords[v * 2], mesh.texcoords[v * 2 + 1]);
      }
      indices[i] = n;
    }
    meshes.push({ material, positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices });
  }
  return { mins: bounds ? bounds[0] : [0, 0, 0], maxs: bounds ? bounds[1] : [0, 0, 0], meshes, texels: true };
}

/** Parses the shell's `GMDL` container (see `assets.rs`). */
export function parseModel(bytes: Uint8Array<ArrayBuffer>): ModelData {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 36 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "GMDL") throw new Error("bad model container");
  let at = 8;
  const f = () => {
    const v = dv.getFloat32(at, true);
    at += 4;
    return v;
  };
  const u = () => {
    const v = dv.getUint32(at, true);
    at += 4;
    return v;
  };
  const mins: Vec3 = [f(), f(), f()];
  const maxs: Vec3 = [f(), f(), f()];
  const meshCount = u();
  const meshes: ModelMesh[] = [];
  const decoder = new TextDecoder();
  for (let m = 0; m < meshCount; m++) {
    const nameLen = u();
    const material = decoder.decode(bytes.subarray(at, at + nameLen));
    at += nameLen;
    while (at % 4 !== 0) at++;
    const vertexCount = u();
    const indexCount = u();
    const floats = (n: number) => {
      const arr = new Float32Array(bytes.buffer.slice(bytes.byteOffset + at, bytes.byteOffset + at + n * 4));
      at += n * 4;
      return arr;
    };
    const positions = floats(vertexCount * 3);
    const normals = floats(vertexCount * 3);
    const uvs = floats(vertexCount * 2);
    const indices = new Uint32Array(bytes.buffer.slice(bytes.byteOffset + at, bytes.byteOffset + at + indexCount * 4));
    at += indexCount * 4;
    meshes.push({ material, positions, normals, uvs, indices });
  }
  return { mins, maxs, meshes };
}

/**
 * Source's AngleMatrix for `angles` = pitch, yaw, roll in degrees: the
 * columns are the model's forward, left and up directions in world space.
 */
export function angleMatrix(angles: Vec3): number[] {
  const d = Math.PI / 180;
  const [sp, cp] = [Math.sin(angles[0] * d), Math.cos(angles[0] * d)];
  const [sy, cy] = [Math.sin(angles[1] * d), Math.cos(angles[1] * d)];
  const [sr, cr] = [Math.sin(angles[2] * d), Math.cos(angles[2] * d)];
  // Row-major 3×3: world = M · local.
  return [cp * cy, sr * sp * cy - cr * sy, cr * sp * cy + sr * sy, cp * sy, sr * sp * sy + cr * cy, cr * sp * sy - sr * cy, -sp, sr * cp, cr * cp];
}

/** Column-major 4×4 placing a model at `origin` with `angles`, for the GPU. */
export function instanceMatrix(origin: Vec3, angles: Vec3, scale = 1): Float32Array {
  const m = angleMatrix(angles);
  return new Float32Array([m[0] * scale, m[3] * scale, m[6] * scale, 0, m[1] * scale, m[4] * scale, m[7] * scale, 0, m[2] * scale, m[5] * scale, m[8] * scale, 0, origin[0], origin[1], origin[2], 1]);
}

/** World-space axis-aligned bounds of a placed model. */
export function modelWorldBounds(data: ModelData, origin: Vec3, angles: Vec3, scale = 1): Box3 {
  const m = angleMatrix(angles);
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    const p = [(i & 1 ? data.maxs[0] : data.mins[0]) * scale, (i & 2 ? data.maxs[1] : data.mins[1]) * scale, (i & 4 ? data.maxs[2] : data.mins[2]) * scale];
    for (let r = 0; r < 3; r++) {
      const w = origin[r] + m[r * 3] * p[0] + m[r * 3 + 1] * p[1] + m[r * 3 + 2] * p[2];
      lo[r] = Math.min(lo[r], w);
      hi[r] = Math.max(hi[r], w);
    }
  }
  return [lo, hi];
}
