// Loads the WebAssembly map core and turns VMF text into GPU-ready arrays.

import init, { MapDoc } from "../wasm/map-core/map_core.js";

let ready: Promise<void> | null = null;
let coreMemory: WebAssembly.Memory | null = null;

export function initCore(): Promise<void> {
  ready ??= init().then((out) => {
    coreMemory = out.memory;
  });
  return ready;
}

/** Bytes the map core's linear memory has grown to (the document and its undo history live there). */
export function coreMemoryBytes(): number {
  return coreMemory?.buffer.byteLength ?? 0;
}

export interface MapStats {
  solids: number;
  invalid_solids: number;
  faces: number;
  displacement_faces: number;
  vertices: number;
  triangles: number;
  materials: number;
  entities: number;
  warnings: string[];
  bounds: [[number, number, number], [number, number, number]] | null;
  editor_build: number;
  skyname: string | null;
}

export interface MeshBuffers {
  materials: string[];
  positions: Float32Array;
  normals: Float32Array;
  texcoords: Float32Array;
  /** WorldVertexTransition blend per vertex, 0..1. */
  alphas: Float32Array;
  /** Luxel coordinates per vertex (two floats), for the lightmap grid view. */
  luxels: Float32Array;
  /** Face id per vertex, indexing `faceTable`. */
  faceIds: Uint32Array;
  indices: Uint32Array;
  /** Flat [material, firstIndex, count] triples. */
  ranges: Uint32Array;
  /** Flat [solidIndex, solidId, sideId, material] per face. */
  faceTable: Uint32Array;
  /** VMF id per solid index. */
  solidIds: Uint32Array;
  /** Axis-aligned bounds per solid index, six floats each. */
  solidBounds: Float32Array;
  /** Line list, xyz xyz per edge. */
  edges: Float32Array;
  /** Solid index per edge vertex. */
  edgeSolids: Uint32Array;
}

export interface EntityInfo {
  id: number;
  classname: string;
  targetname: string | null;
  origin: [number, number, number] | null;
  angles: [number, number, number] | null;
  brush: boolean;
  hidden: boolean;
  /** The `model` key (props), lower-case, or null. */
  model: string | null;
  skin: number;
  /** The `body` key: packed body group selection. */
  body: number;
  /** The `modelscale` key, 1 when absent. */
  scale: number;
  /** `file` of a func_instance, or null. */
  instance_file: string | null;
}

export interface EditResult {
  version: number;
  label: string;
  changed_ids: number[];
}

export interface HistoryState {
  version: number;
  dirty: boolean;
  undo: string | null;
  redo: string | null;
  /** Every undo step, oldest first, and every redo step, next first. */
  undo_labels: string[];
  redo_labels: string[];
}

/** What is under the cursor: a brush face or a point entity. */
export type PickInfo =
  | { kind: "face"; pickId: number; objectIndex: number; solidId: number; sideId: number; material: string }
  | { kind: "entity"; pickId: number; objectIndex: number; entityIndex: number; entity: EntityInfo };

export interface LoadedMap {
  doc: MapDoc;
  stats: MapStats;
  mesh: MeshBuffers;
  entities: EntityInfo[];
  /** Point entities (with an origin, not brush-based), in pick order. */
  pointEntities: EntityInfo[];
}

/**
 * Pick ids cover brush faces first, then point entities. Object indices
 * (used for selection state) cover solids first, then point entities.
 */
export function pickInfo(map: LoadedMap, pickId: number): PickInfo | null {
  const faceCount = map.mesh.faceTable.length / 4;
  const solidCount = map.mesh.solidIds.length;
  if (pickId < 0) return null;
  if (pickId < faceCount) {
    const t = map.mesh.faceTable;
    return {
      kind: "face",
      pickId,
      objectIndex: t[pickId * 4],
      solidId: t[pickId * 4 + 1],
      sideId: t[pickId * 4 + 2],
      material: map.mesh.materials[t[pickId * 4 + 3]] ?? "",
    };
  }
  const entityIndex = pickId - faceCount;
  const entity = map.pointEntities[entityIndex];
  if (!entity) return null;
  return { kind: "entity", pickId, objectIndex: solidCount + entityIndex, entityIndex, entity };
}

/** VMF id of an object index (solid or point entity). */
export function objectId(map: LoadedMap, objectIndex: number): number | null {
  const solidCount = map.mesh.solidIds.length;
  if (objectIndex < solidCount) return map.mesh.solidIds[objectIndex];
  const e = map.pointEntities[objectIndex - solidCount];
  return e ? e.id : null;
}

/** Object index of a VMF id, or null when the id is not a solid or point entity. */
export function objectIndexOf(map: LoadedMap, id: number): number | null {
  const solids = map.mesh.solidIds;
  for (let i = 0; i < solids.length; i++) if (solids[i] === id) return i;
  const e = map.pointEntities.findIndex((p) => p.id === id);
  return e >= 0 ? solids.length + e : null;
}

function readMesh(doc: MapDoc): MeshBuffers {
  return {
    materials: doc.materials(),
    positions: doc.positions(),
    normals: doc.normals(),
    texcoords: doc.texcoords(),
    alphas: doc.alphas(),
    luxels: doc.luxels(),
    faceIds: doc.face_ids(),
    indices: doc.indices(),
    ranges: doc.ranges(),
    faceTable: doc.face_table(),
    solidIds: doc.solid_ids(),
    solidBounds: doc.solid_bounds(),
    edges: doc.edges(),
    edgeSolids: doc.edge_solids(),
  };
}

function readEntities(doc: MapDoc): { entities: EntityInfo[]; pointEntities: EntityInfo[] } {
  const entities = doc.entities() as EntityInfo[];
  const pointEntities = entities.filter((e) => !e.brush && e.origin !== null && !e.hidden);
  return { entities, pointEntities };
}

/** VMF text of an empty map with this sky (Hammer 2013 layout). */
export async function emptyMapText(skyname: string): Promise<string> {
  await initCore();
  return MapDoc.empty_map_text(skyname);
}

/** VMF text from `.map` text (Quake / Valve 220); throws with the line on bad input. */
export async function importMapText(text: string): Promise<string> {
  await initCore();
  return MapDoc.import_map_text(text);
}

export async function loadMap(text: string): Promise<LoadedMap> {
  await initCore();
  const doc = new MapDoc(text);
  const stats = doc.stats() as MapStats;
  return { doc, stats, mesh: readMesh(doc), ...readEntities(doc) };
}

/** Re-reads mesh and entity arrays after an edit, in place. */
export function refreshMap(map: LoadedMap) {
  map.mesh = readMesh(map.doc);
  map.stats = map.doc.stats() as MapStats;
  const { entities, pointEntities } = readEntities(map.doc);
  map.entities = entities;
  map.pointEntities = pointEntities;
}

export function history(map: LoadedMap): HistoryState {
  return map.doc.history() as HistoryState;
}
