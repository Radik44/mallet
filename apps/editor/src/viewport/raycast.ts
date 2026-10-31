// Ray against the rendered mesh: the exact hit point on a picked face,
// displacement surfaces included, for tools that act where the cursor is.

import type { MeshBuffers } from "../map/loader";
import type { Vec3 } from "./transform";

/** Möller–Trumbore; returns the ray parameter or null. */
function rayTriangle(origin: Vec3, dir: Vec3, a: Vec3, b: Vec3, c: Vec3): number | null {
  const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p: Vec3 = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-9) return null;
  const inv = 1 / det;
  const t: Vec3 = [origin[0] - a[0], origin[1] - a[1], origin[2] - a[2]];
  const u = (t[0] * p[0] + t[1] * p[1] + t[2] * p[2]) * inv;
  if (u < -1e-6 || u > 1 + 1e-6) return null;
  const q: Vec3 = [t[1] * e1[2] - t[2] * e1[1], t[2] * e1[0] - t[0] * e1[2], t[0] * e1[1] - t[1] * e1[0]];
  const v = (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]) * inv;
  if (v < -1e-6 || u + v > 1 + 1e-6) return null;
  const s = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  return s > 0 ? s : null;
}

/** Nearest hit of the ray on any face: the point, the face index and the face normal. */
export function hitMesh(mesh: MeshBuffers, origin: Vec3, dir: Vec3, maxDist = Infinity): { point: Vec3; face: number; normal: Vec3 } | null {
  const { positions, indices, faceIds, normals } = mesh;
  let best: number | null = null;
  let bestIndex = 0;
  const at = (i: number): Vec3 => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const s = rayTriangle(origin, dir, at(indices[i]), at(indices[i + 1]), at(indices[i + 2]));
    if (s !== null && s <= maxDist && (best === null || s < best)) {
      best = s;
      bestIndex = indices[i];
    }
  }
  if (best === null) return null;
  return {
    point: [origin[0] + dir[0] * best, origin[1] + dir[1] * best, origin[2] + dir[2] * best],
    face: faceIds[bestIndex],
    normal: [normals[bestIndex * 3], normals[bestIndex * 3 + 1], normals[bestIndex * 3 + 2]],
  };
}

/** Triangles grouped by solid index, built once per mesh: start index into `indices` per triangle. */
const trianglesBySolid = new WeakMap<MeshBuffers, Map<number, number[]>>();

function solidTriangles(mesh: MeshBuffers): Map<number, number[]> {
  let groups = trianglesBySolid.get(mesh);
  if (groups) return groups;
  groups = new Map();
  const { indices, faceIds, faceTable } = mesh;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const solid = faceTable[faceIds[indices[i]] * 4];
    const list = groups.get(solid);
    if (list) list.push(i);
    else groups.set(solid, [i]);
  }
  trianglesBySolid.set(mesh, groups);
  return groups;
}

/**
 * Like [`hitMesh`] for a short ray: only the solids whose bounds meet the
 * ray's segment are tested, so a decal looking for its wall touches a
 * handful of brushes instead of every triangle of the map.
 */
export function hitMeshNear(mesh: MeshBuffers, origin: Vec3, dir: Vec3, maxDist: number): { point: Vec3; face: number; normal: Vec3 } | null {
  const { positions, indices, faceIds, normals, solidBounds } = mesh;
  const end: Vec3 = [origin[0] + dir[0] * maxDist, origin[1] + dir[1] * maxDist, origin[2] + dir[2] * maxDist];
  const lo = [Math.min(origin[0], end[0]), Math.min(origin[1], end[1]), Math.min(origin[2], end[2])];
  const hi = [Math.max(origin[0], end[0]), Math.max(origin[1], end[1]), Math.max(origin[2], end[2])];
  const groups = solidTriangles(mesh);
  const at = (i: number): Vec3 => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  let best: number | null = null;
  let bestIndex = 0;
  const solidCount = solidBounds.length / 6;
  for (let s = 0; s < solidCount; s++) {
    const o = s * 6;
    if (solidBounds[o] > hi[0] || solidBounds[o + 3] < lo[0] || solidBounds[o + 1] > hi[1] || solidBounds[o + 4] < lo[1] || solidBounds[o + 2] > hi[2] || solidBounds[o + 5] < lo[2]) continue;
    const tris = groups.get(s);
    if (!tris) continue;
    for (const i of tris) {
      const t = rayTriangle(origin, dir, at(indices[i]), at(indices[i + 1]), at(indices[i + 2]));
      if (t !== null && t <= maxDist && (best === null || t < best)) {
        best = t;
        bestIndex = indices[i];
      }
    }
  }
  if (best === null) return null;
  return {
    point: [origin[0] + dir[0] * best, origin[1] + dir[1] * best, origin[2] + dir[2] * best],
    face: faceIds[bestIndex],
    normal: [normals[bestIndex * 3], normals[bestIndex * 3 + 1], normals[bestIndex * 3 + 2]],
  };
}

/**
 * Nearest point where the ray meets the triangles of face `pickId` (an
 * index into the face table), or null when it misses them.
 */
export function hitFace(mesh: MeshBuffers, pickId: number, origin: Vec3, dir: Vec3): Vec3 | null {
  const { positions, indices, faceIds } = mesh;
  let best: number | null = null;
  const at = (i: number): Vec3 => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const i0 = indices[i];
    if (faceIds[i0] !== pickId) continue;
    const s = rayTriangle(origin, dir, at(i0), at(indices[i + 1]), at(indices[i + 2]));
    if (s !== null && (best === null || s < best)) best = s;
  }
  if (best === null) return null;
  return [origin[0] + dir[0] * best, origin[1] + dir[1] * best, origin[2] + dir[2] * best];
}
