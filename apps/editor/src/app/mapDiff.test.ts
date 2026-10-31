import { describe, expect, it } from "vitest";
import { diffSnapshots, snapshot, type DiffDoc } from "./mapDiff";

/** A toy document: world brushes 1–2, brush entity 10 owning brush 3, point entity 11. */
function doc(over: Partial<{ verts: Record<number, number[]>; mats: Record<number, string[]>; keys: Record<number, [string, string][]>; conns: Record<number, unknown[]>; drop: number[]; extraSolid: boolean }> = {}): DiffDoc {
  const verts: Record<number, number[]> = { 1: [0, 0, 0, 1, 1, 1], 2: [2, 2, 2, 3, 3, 3], 3: [5, 5, 5, 6, 6, 6], ...(over.verts ?? {}) };
  const mats: Record<number, string[]> = { 1: ["dev/a", "dev/b"], 2: ["dev/c"], 3: ["tools/nodraw"], ...(over.mats ?? {}) };
  const keys: Record<number, [string, string][]> = { 10: [["classname", "func_door"], ["targetname", "door"]], 11: [["classname", "light"], ["origin", "0 0 64"]], ...(over.keys ?? {}) };
  const conns: Record<number, unknown[]> = { 10: [], 11: [], ...(over.conns ?? {}) };
  const drop = new Set(over.drop ?? []);
  const solids = [1, 2, 3, ...(over.extraSolid ? [4] : [])].filter((id) => !drop.has(id));
  if (over.extraSolid) {
    verts[4] = [9, 9, 9, 10, 10, 10];
    mats[4] = ["dev/d"];
  }
  return {
    solid_ids: () => Uint32Array.from(solids),
    entity_of_solid: (id) => (id === 3 ? 10 : 0),
    solid_vertices: (id) => Float32Array.from(verts[id]),
    solid_sides: (id) => Uint32Array.from(mats[id].map((_, i) => i + 1)),
    face_material: (id, side) => mats[id][side - 1],
    face_info: (id, side) => ({ id, side, shift: 0 }),
    entities: () =>
      [
        { id: 10, classname: keys[10][0][1], targetname: "door", brush: true },
        { id: 11, classname: "light", targetname: null, brush: false },
      ].filter((e) => !drop.has(e.id)),
    entity_details: (id) => ({ keyvalues: keys[id], connections: conns[id] }),
    entity_solids: (id) => Uint32Array.from(id === 10 && !drop.has(3) ? [3] : []),
  };
}

describe("mapDiff", () => {
  it("sees nothing between identical documents", () => {
    expect(diffSnapshots(snapshot(doc()), snapshot(doc()))).toEqual([]);
  });

  it("reports moved brushes, retextured brushes, changed keys and outputs", () => {
    const old = snapshot(doc());
    const cur = snapshot(doc({ verts: { 1: [0, 0, 0, 1, 1, 2] }, mats: { 2: ["dev/z"] }, keys: { 11: [["classname", "light"], ["origin", "0 0 96"]] }, conns: { 10: [{ output: "OnOpen" }] } }));
    const rows = diffSnapshots(old, cur);
    expect(rows.map((r) => `${r.kind}:${r.object}:${r.id}:${r.detail}`)).toEqual(["changed:entity:10:выходы", "changed:entity:11:origin", "changed:solid:1:геометрия", "changed:solid:2:материалы"]);
    expect(rows[1].title).toBe("light");
    expect(rows[2].subtitle).toBe("a");
  });

  it("reports added and removed objects, brushes of an entity counting towards it", () => {
    const old = snapshot(doc());
    const cur = snapshot(doc({ drop: [11], extraSolid: true, verts: { 3: [5, 5, 5, 7, 7, 7] } }));
    const rows = diffSnapshots(old, cur);
    expect(rows.map((r) => `${r.kind}:${r.object}:${r.id}`)).toEqual(["changed:entity:10", "added:solid:4", "removed:entity:11"]);
    expect(rows[0].detail).toBe("браши");
  });
});
