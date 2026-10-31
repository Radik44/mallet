// Comparing two versions of a map object by object, the way a code diff
// compares lines: which brushes and entities a saved version has that the
// open map lost, which the open map added, and which changed (geometry,
// materials, keys, outputs). Both documents are read into snapshots of
// fingerprints first, so the comparison itself is a map lookup per id.

import { t } from "../i18n";

/** The part of the document the comparison reads (the wasm MapDoc satisfies it). */
export interface DiffDoc {
  solid_ids(): Uint32Array;
  entity_of_solid(id: number): number;
  solid_vertices(id: number): Float32Array;
  solid_sides(id: number): Uint32Array;
  face_material(solid: number, side: number): string;
  face_info(solid: number, side: number): unknown;
  entities(): { id: number; classname: string; targetname: string | null; brush: boolean }[];
  entity_details(id: number): { keyvalues: [string, string][]; connections: unknown[] } | undefined;
  entity_solids(id: number): Uint32Array;
}

interface SolidPrint {
  geometry: string;
  materials: string;
  texture: string;
}

interface EntityPrint {
  classname: string;
  targetname: string | null;
  keys: string;
  connections: string;
  solids: string;
}

export interface Snapshot {
  solids: Map<number, SolidPrint>;
  entities: Map<number, EntityPrint>;
}

const round = (v: number) => Math.round(v * 100) / 100;

function solidPrint(doc: DiffDoc, id: number): SolidPrint {
  const verts = Array.from(doc.solid_vertices(id)).map(round);
  const sides = Array.from(doc.solid_sides(id));
  return {
    geometry: verts.join(","),
    materials: sides.map((s) => doc.face_material(id, s).toLowerCase()).join("|"),
    texture: sides.map((s) => JSON.stringify(doc.face_info(id, s) ?? null)).join("|"),
  };
}

/** Fingerprints of every world brush and entity (an entity's brushes count towards the entity). */
export function snapshot(doc: DiffDoc): Snapshot {
  const solids = new Map<number, SolidPrint>();
  for (const id of doc.solid_ids()) if (doc.entity_of_solid(id) === 0) solids.set(id, solidPrint(doc, id));
  const entities = new Map<number, EntityPrint>();
  for (const e of doc.entities()) {
    const d = doc.entity_details(e.id);
    const keys = (d?.keyvalues ?? []).filter(([k]) => k !== "id").sort((a, b) => a[0].localeCompare(b[0]));
    const own = Array.from(doc.entity_solids(e.id)).map((s) => {
      const p = solidPrint(doc, s);
      return `${p.geometry}:${p.materials}:${p.texture}`;
    });
    entities.set(e.id, {
      classname: e.classname,
      targetname: e.targetname,
      keys: JSON.stringify(keys),
      connections: JSON.stringify(d?.connections ?? []),
      solids: own.join(";"),
    });
  }
  return { solids, entities };
}

export type DiffKind = "added" | "removed" | "changed";

export interface DiffRow {
  kind: DiffKind;
  object: "solid" | "entity";
  id: number;
  title: string;
  subtitle: string;
  /** What changed, for changed rows: "геометрия", "материалы", "origin, angles"… */
  detail: string;
}

/** Which keys differ between two sorted key lists (JSON), by name. */
function keyDiff(a: string, b: string): string[] {
  const pa = new Map(JSON.parse(a) as [string, string][]);
  const pb = new Map(JSON.parse(b) as [string, string][]);
  const names = new Set([...pa.keys(), ...pb.keys()]);
  return [...names].filter((k) => pa.get(k) !== pb.get(k)).sort();
}

/** Rows of what differs between `old` (a saved version) and `cur` (the open map). */
export function diffSnapshots(old: Snapshot, cur: Snapshot): DiffRow[] {
  const rows: DiffRow[] = [];
  const solidTitle = (id: number, p: SolidPrint) => ({ title: t("браш {0}", [id]), subtitle: p.materials.split("|")[0]?.split("/").pop() ?? "" });
  for (const [id, p] of cur.solids) {
    const o = old.solids.get(id);
    if (!o) rows.push({ kind: "added", object: "solid", id, ...solidTitle(id, p), detail: "" });
    else if (o.geometry !== p.geometry || o.materials !== p.materials || o.texture !== p.texture) {
      const what = [o.geometry !== p.geometry ? t("геометрия") : "", o.materials !== p.materials ? t("материалы") : "", o.geometry === p.geometry && o.materials === p.materials ? t("текстурные координаты") : ""].filter(Boolean);
      rows.push({ kind: "changed", object: "solid", id, ...solidTitle(id, p), detail: what.join(", ") });
    }
  }
  for (const [id, p] of old.solids) if (!cur.solids.has(id)) rows.push({ kind: "removed", object: "solid", id, ...solidTitle(id, p), detail: "" });
  const entTitle = (p: EntityPrint) => ({ title: p.targetname ?? p.classname, subtitle: p.targetname ? p.classname : "" });
  for (const [id, p] of cur.entities) {
    const o = old.entities.get(id);
    if (!o) rows.push({ kind: "added", object: "entity", id, ...entTitle(p), detail: "" });
    else if (o.classname !== p.classname || o.keys !== p.keys || o.connections !== p.connections || o.solids !== p.solids) {
      const what: string[] = [];
      if (o.classname !== p.classname) what.push(t("класс {0} → {1}", [o.classname, p.classname]));
      const keys = keyDiff(o.keys, p.keys);
      if (keys.length) what.push(keys.slice(0, 4).join(", ") + (keys.length > 4 ? "…" : ""));
      if (o.connections !== p.connections) what.push(t("выходы"));
      if (o.solids !== p.solids) what.push(t("браши"));
      rows.push({ kind: "changed", object: "entity", id, ...entTitle(p), detail: what.join(" · ") });
    }
  }
  for (const [id, p] of old.entities) if (!cur.entities.has(id)) rows.push({ kind: "removed", object: "entity", id, ...entTitle(p), detail: "" });
  // An object that only changed its id (a paste, a version restored) is the same object: drop the pair.
  const print = (r: DiffRow) => {
    if (r.object === "solid") {
      const p = (r.kind === "removed" ? old : cur).solids.get(r.id)!;
      return `s:${p.geometry}:${p.materials}:${p.texture}`;
    }
    const p = (r.kind === "removed" ? old : cur).entities.get(r.id)!;
    return `e:${p.classname}:${p.keys}:${p.connections}:${p.solids}`;
  };
  const removedPrints = new Map<string, DiffRow[]>();
  for (const r of rows) if (r.kind === "removed") removedPrints.set(print(r), [...(removedPrints.get(print(r)) ?? []), r]);
  const drop = new Set<DiffRow>();
  for (const r of rows) {
    if (r.kind !== "added") continue;
    const twin = removedPrints.get(print(r))?.find((x) => !drop.has(x));
    if (twin) {
      drop.add(r);
      drop.add(twin);
    }
  }
  const kept = rows.filter((r) => !drop.has(r));
  const order: Record<DiffKind, number> = { changed: 0, added: 1, removed: 2 };
  return kept.sort((a, b) => order[a.kind] - order[b.kind] || (a.object === b.object ? a.id - b.id : a.object === "entity" ? -1 : 1));
}
