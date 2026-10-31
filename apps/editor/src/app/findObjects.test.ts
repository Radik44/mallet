import { describe, expect, it } from "vitest";
import { findMaterials, findObjects, matchesKey, parentLoops, parseKeyQuery, parentsOf, similarKey, withChildren } from "./findObjects";

const ents = [
  { id: 5, classname: "light", targetname: "hall_lamp", model: null },
  { id: 6, classname: "prop_physics", targetname: null, model: "models/props_c17/oildrum001.mdl" },
  { id: 7, classname: "func_door", targetname: "door_main", model: null, hidden: true },
  { id: 8, classname: "light_spot", targetname: "lamp", model: null },
];

describe("find objects", () => {
  it("ranks an exact name above a prefix and a substring", () => {
    const r = findObjects(ents, "lamp");
    expect(r.map((x) => x.id)).toEqual([8, 5]);
    expect(r[0].title).toBe("lamp · light_spot");
  });

  it("finds by class and by model file name", () => {
    expect(findObjects(ents, "light").map((x) => x.id)).toEqual([5, 8]);
    expect(findObjects(ents, "oildrum")[0].title).toBe("prop_physics · oildrum001");
  });

  it("marks hidden objects and ignores one-letter queries", () => {
    expect(findObjects(ents, "door")[0].title).toContain("(скрыт)");
    expect(findObjects(ents, "d")).toEqual([]);
  });

  it("adds children through parentname at any depth", () => {
    const list = [
      { id: 1, targetname: "train", parent: null },
      { id: 2, targetname: "wagon", parent: "train" },
      { id: 3, targetname: null, parent: "wagon" },
      { id: 4, targetname: "other", parent: null },
    ];
    expect(withChildren(list, [1]).sort()).toEqual([1, 2, 3]);
    expect(withChildren(list, [4])).toEqual([4]);
  });
});

describe("find materials", () => {
  it("ranks the whole file name above its start and the path", () => {
    const mats = ["DEV/DEV_BRICKWALL012D", "concrete/concretefloor001", "dev/dev_concretefloor006a", "tools/toolsnodraw"];
    expect(findMaterials(mats, "concrete")).toEqual([1, 2]);
    expect(findMaterials(mats, "toolsnodraw")).toEqual([3]);
    expect(findMaterials(mats, "brick")).toEqual([0]);
    expect(findMaterials(mats, "de")).toEqual([]);
  });
});

describe("similar entities", () => {
  it("matches props by model and everything else by class", () => {
    const a = similarKey({ classname: "prop_static", model: "models/props_c17/oildrum001.mdl" });
    expect(a).toBe(similarKey({ classname: "prop_static", model: "MODELS/props_c17/OilDrum001.mdl" }));
    expect(a).not.toBe(similarKey({ classname: "prop_static", model: "models/props_c17/chair02a.mdl" }));
    expect(a).not.toBe(similarKey({ classname: "prop_physics", model: "models/props_c17/oildrum001.mdl" }));
    expect(similarKey({ classname: "light", model: null })).toBe("light");
  });
});

describe("select parent", () => {
  const list = [
    { id: 1, targetname: "train", parent: null },
    { id: 2, targetname: "cart", parent: "TRAIN" },
    { id: 3, targetname: null, parent: "cart" },
    { id: 4, targetname: "loose", parent: null },
  ];

  it("goes one level up, or to the top of the chain", () => {
    expect(parentsOf(list, [3])).toEqual([2]);
    expect(parentsOf(list, [3], true)).toEqual([1]);
    expect(parentsOf(list, [2, 3], true)).toEqual([1]);
  });

  it("finds nothing above an object without a parent", () => {
    expect(parentsOf(list, [4, 1])).toEqual([]);
  });
});

describe("parent loops", () => {
  it("finds each loop once, a self-parent too, and leaves chains that end", () => {
    const list = [
      { id: 1, targetname: "a", parent: "b" },
      { id: 2, targetname: "b", parent: "A" },
      { id: 3, targetname: "c", parent: "a" },
      { id: 4, targetname: "self", parent: "self" },
      { id: 5, targetname: "free", parent: "nobody" },
    ];
    expect(parentLoops(list)).toEqual([[1, 2], [4]]);
  });
});

describe("find by key", () => {
  it("reads key=value and key= from the palette, leaving other text alone", () => {
    expect(parseKeyQuery(" Spawnflags = 256 ")).toEqual({ key: "spawnflags", value: "256", op: "has" });
    expect(parseKeyQuery("parentname=")).toEqual({ key: "parentname", value: "", op: "has" });
    expect(parseKeyQuery("classname==Light")).toEqual({ key: "classname", value: "light", op: "eq" });
    expect(parseKeyQuery("skin != 0")).toEqual({ key: "skin", value: "0", op: "not" });
    expect(parseKeyQuery("lamp_1")).toBeNull();
    expect(parseKeyQuery("0 0 64")).toBeNull();
  });

  it("matches the value anywhere without case, or any value when none is asked", () => {
    const kv: [string, string][] = [
      ["model", "models/props_c17/OilDrum001.mdl"],
      ["parentname", ""],
    ];
    expect(matchesKey(kv, { key: "model", value: "oildrum" })).toBe(true);
    expect(matchesKey(kv, { key: "model", value: "crate" })).toBe(false);
    expect(matchesKey(kv, { key: "parentname", value: "" })).toBe(false);
    expect(matchesKey(kv, { key: "model", value: "" })).toBe(true);
  });
});

describe("exact and negative key search", () => {
  it("tells light from light_spot and finds what is not set", () => {
    const lamp: [string, string][] = [["classname", "light"]];
    const spot: [string, string][] = [
      ["classname", "light_spot"],
      ["skin", "2"],
    ];
    expect([lamp, spot].map((kv) => matchesKey(kv, { key: "classname", value: "light", op: "eq" }))).toEqual([true, false]);
    expect([lamp, spot].map((kv) => matchesKey(kv, { key: "skin", value: "2", op: "not" }))).toEqual([true, false]);
    expect([lamp, spot].map((kv) => matchesKey(kv, { key: "skin", value: "", op: "not" }))).toEqual([true, false]);
  });
});
