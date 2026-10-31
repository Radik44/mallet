// 3D skybox preview: the small room around `sky_camera` is drawn a second
// time, scaled up around the camera entity, where the game would show it.
// Which brushes belong to that room is guessed the way a mapper reads it:
// the brushes touching the sky_camera, and everything touching those, until
// the cluster stops growing (the skybox room is sealed off from the map).

import type { MeshBuffers } from "../map/loader";
import type { ModelData, ModelMesh } from "./models";
import type { Vec3 } from "./transform";

/** Solid indices of the brush cluster around `origin`; empty when nothing is near it. */
export function skyboxCluster(mesh: MeshBuffers, origin: Vec3, reach = 256): Set<number> {
  const n = mesh.solidIds.length;
  const b = mesh.solidBounds;
  const cluster = new Set<number>();
  const queue: number[] = [];
  // Seeds: the nearest brush (the sky_camera floats in the middle of its room,
  // so its floor can be far below) and everything within `reach`.
  const dist = new Float64Array(n);
  let nearest = Infinity;
  for (let i = 0; i < n; i++) {
    let d2 = 0;
    for (let k = 0; k < 3; k++) {
      const lo = b[i * 6 + k];
      const hi = b[i * 6 + 3 + k];
      const d = origin[k] < lo ? lo - origin[k] : origin[k] > hi ? origin[k] - hi : 0;
      d2 += d * d;
    }
    dist[i] = Math.sqrt(d2);
    nearest = Math.min(nearest, dist[i]);
  }
  if (!Number.isFinite(nearest)) return cluster;
  for (let i = 0; i < n; i++) {
    if (dist[i] <= Math.max(reach, nearest + 1)) {
      cluster.add(i);
      queue.push(i);
    }
  }
  // Grow through touching bounds (a 1-unit tolerance for brushes that share a face).
  const touches = (a: number, c: number) =>
    b[a * 6] <= b[c * 6 + 3] + 1 &&
    b[c * 6] <= b[a * 6 + 3] + 1 &&
    b[a * 6 + 1] <= b[c * 6 + 4] + 1 &&
    b[c * 6 + 1] <= b[a * 6 + 4] + 1 &&
    b[a * 6 + 2] <= b[c * 6 + 5] + 1 &&
    b[c * 6 + 2] <= b[a * 6 + 5] + 1;
  while (queue.length) {
    const a = queue.pop()!;
    for (let c = 0; c < n; c++) {
      if (cluster.has(c) || !touches(a, c)) continue;
      cluster.add(c);
      queue.push(c);
      // A runaway cluster means the skybox room is not sealed off: give up on the guess.
      if (cluster.size > 4000) return new Set();
    }
  }
  return cluster;
}

/** The cluster's faces as a model in world coordinates (texel UVs, one mesh per material). */
export function skyboxModel(mesh: MeshBuffers, cluster: Set<number>): ModelData | null {
  if (!cluster.size) return null;
  const faceInCluster = new Uint8Array(mesh.faceTable.length / 4);
  for (let f = 0; f < faceInCluster.length; f++) faceInCluster[f] = cluster.has(mesh.faceTable[f * 4]) ? 1 : 0;
  const meshes: ModelMesh[] = [];
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let r = 0; r < mesh.ranges.length; r += 3) {
    const material = mesh.materials[mesh.ranges[r]];
    const first = mesh.ranges[r + 1];
    const count = mesh.ranges[r + 2];
    const remap = new Map<number, number>();
    const indices: number[] = [];
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    for (let i = 0; i < count; i += 3) {
      const tri = [mesh.indices[first + i], mesh.indices[first + i + 1], mesh.indices[first + i + 2]];
      if (!faceInCluster[mesh.faceIds[tri[0]]]) continue;
      for (const v of tri) {
        let k = remap.get(v);
        if (k === undefined) {
          k = remap.size;
          remap.set(v, k);
          const x = mesh.positions[v * 3];
          const y = mesh.positions[v * 3 + 1];
          const z = mesh.positions[v * 3 + 2];
          positions.push(x, y, z);
          normals.push(mesh.normals[v * 3], mesh.normals[v * 3 + 1], mesh.normals[v * 3 + 2]);
          uvs.push(mesh.texcoords[v * 2], mesh.texcoords[v * 2 + 1]);
          lo[0] = Math.min(lo[0], x);
          lo[1] = Math.min(lo[1], y);
          lo[2] = Math.min(lo[2], z);
          hi[0] = Math.max(hi[0], x);
          hi[1] = Math.max(hi[1], y);
          hi[2] = Math.max(hi[2], z);
        }
        indices.push(k);
      }
    }
    if (indices.length) {
      meshes.push({ material, positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) });
    }
  }
  if (!meshes.length) return null;
  return { mins: lo, maxs: hi, meshes, texels: true };
}

/** Column-major placement that scales the skybox room by `scale` about the sky_camera. */
export function skyboxMatrix(origin: Vec3, scale: number): Float32Array {
  return new Float32Array([scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, -origin[0] * scale, -origin[1] * scale, -origin[2] * scale, 1]);
}
