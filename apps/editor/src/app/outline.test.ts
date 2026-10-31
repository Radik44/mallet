import { describe, expect, it } from "vitest";
import { buildOutline, filterOutline, parentOf, pathsTo, type OutlineEntity } from "./outline";

const ent = (id: number, classname: string, targetname: string | null = null, extra: Partial<OutlineEntity> = {}): OutlineEntity => ({
  id,
  classname,
  targetname,
  brush: false,
  hidden: false,
  parentname: null,
  instance_file: null,
  ...extra,
});

describe("outline", () => {
  const entities = [
    ent(10, "prop_dynamic", "wheel", { parentname: "car,attach" }),
    ent(11, "prop_physics", "car"),
    ent(12, "light", "lamp", { hidden: true }),
    ent(13, "light"),
    ent(14, "func_door", "door", { brush: true }),
    ent(15, "info_target", "a", { parentname: "b" }),
    ent(16, "info_target", "b", { parentname: "a" }),
  ];

  it("hangs children under their parent and keeps cycles in the class list", () => {
    const [world, groups, ents] = buildOutline({ entities, worldSolids: [1, 2, 3], hiddenIds: new Set([2]), groups: [] });
    expect(world.count).toBe(3);
    expect(world.hidden).toBe("some");
    expect(groups.children).toEqual([]);
    const classes = ents.children.map((c) => c.title);
    expect(classes).toEqual(["func_door", "info_target", "light", "prop_physics"]);
    const car = ents.children.find((c) => c.title === "prop_physics")!.children[0];
    expect(car.title).toBe("car");
    expect(car.children.map((c) => c.title)).toEqual(["wheel"]);
    const targets = ents.children.find((c) => c.title === "info_target")!;
    // The cycle a → b → a is broken at one link: a stays in the class list, b hangs under it.
    expect(targets.children.map((c) => c.title)).toEqual(["a"]);
    expect(targets.children[0].children.map((c) => c.title)).toEqual(["b"]);
    const light = ents.children.find((c) => c.title === "light")!;
    expect(light.hidden).toBe("some");
    expect(light.children.map((c) => c.subtitle)).toEqual(["id 13", "light"]);
  });

  it("lists groups with their members", () => {
    const [, groups] = buildOutline({
      entities,
      worldSolids: [1, 2],
      hiddenIds: new Set(),
      groups: [
        { id: 7, members: [1, 2, 12] },
        { id: 8, members: [] },
      ],
    });
    expect(groups.children).toHaveLength(1);
    expect(groups.children[0].title).toBe("7");
    expect(groups.children[0].children.map((c) => c.title)).toEqual(["lamp"]);
    expect(groups.children[0].hidden).toBe("some");
  });

  it("finds the path to a selected entity and filters with ancestors", () => {
    const nodes = buildOutline({ entities, worldSolids: [], hiddenIds: new Set(), groups: [] });
    expect([...pathsTo(nodes, new Set([10]))].sort()).toEqual(["c:prop_physics", "e:11", "section:entities"]);
    const filtered = filterOutline(nodes, "wheel");
    expect(filtered.map((n) => n.key)).toEqual(["section:entities"]);
    expect(filtered[0].children[0].children[0].children[0].title).toBe("wheel");
    expect(parentOf("car,attach")).toBe("car");
    expect(parentOf(" ")).toBeNull();
  });
});
