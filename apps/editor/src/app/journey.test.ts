import { describe, expect, it } from "vitest";
import { EMPTY_META, computeJourney, metaPathOf, parseMeta, plural, serializeMeta, stampOf, type JourneyInput } from "./journey";

const base: JourneyInput = {
  mapOpen: true,
  path: "C:/maps/room.vmf",
  stamp: "aaaa-10",
  solids: 6,
  classes: ["worldspawn", "info_player_start", "light"],
  problems: 0,
  compiling: false,
  meta: { ...EMPTY_META },
  gameRunning: false,
};

const byId = (i: JourneyInput) => Object.fromEntries(computeJourney(i).map((s) => [s.id, s]));

describe("journey", () => {
  it("walks a map from new to compile", () => {
    const empty = byId({ ...base, mapOpen: false, path: "", stamp: null, solids: 0, classes: [], problems: null });
    expect(empty.new.status).toBe("current");
    expect(empty.geometry.status).toBe("todo");

    const fresh = byId({ ...base, path: "", stamp: null, solids: 1, classes: ["worldspawn"], problems: null });
    expect(fresh.new.status).toBe("done");
    expect(fresh.new.reasons[0]).toMatch(/не сохранена/);
    expect(fresh.geometry.status).toBe("current");
    expect(fresh.geometry.reasons[0]).toMatch(/1 браш:/);
    expect(fresh.entities.status).toBe("todo");

    const room = byId({ ...base, problems: null });
    expect(room.geometry.status).toBe("done");
    expect(room.entities.status).toBe("done");
    expect(room.check.status).toBe("current");
    expect(room.compile.status).toBe("todo");

    const checked = byId(base);
    expect(checked.check.status).toBe("done");
    expect(checked.compile.status).toBe("current");
    expect(checked.compile.reasons[0]).toMatch(/не собиралась/);
  });

  it("tracks the compiled stamp, leaks and the game run", () => {
    const compiled = byId({ ...base, meta: { ...EMPTY_META, compiledStamp: "aaaa-10", compiledOk: true } });
    expect(compiled.compile.status).toBe("done");
    expect(compiled.test.status).toBe("current");

    const edited = byId({ ...base, stamp: null, meta: { ...EMPTY_META, compiledStamp: "aaaa-10", compiledOk: true } });
    expect(edited.compile.status).toBe("current");
    expect(edited.compile.reasons[0]).toMatch(/несохранённые/);

    const leaked = byId({ ...base, meta: { ...EMPTY_META, compiledStamp: "aaaa-10", compiledOk: true, leak: true } });
    expect(leaked.geometry.status).toBe("blocked");
    expect(leaked.compile.status).toBe("blocked");
    // Nothing after a blocked stage is "current".
    expect(leaked.test.status).toBe("todo");

    const tested = byId({ ...base, meta: { ...EMPTY_META, compiledStamp: "aaaa-10", compiledOk: true, testedStamp: "aaaa-10", gameErrors: 2 } });
    expect(tested.test.status).toBe("done");
    expect(tested.test.reasons[0]).toMatch(/2 ошибки/);
    expect(tested.publish.status).toBe("current");
    expect(tested.publish.reasons[0]).toMatch(/не публиковалась/);
  });

  it("stamps, paths and the project file round-trip", () => {
    expect(stampOf("abc")).not.toBe(stampOf("abd"));
    expect(stampOf("abc")).toBe(stampOf("abc"));
    expect(metaPathOf("C:/maps/room.VMF")).toBe("C:/maps/room.mallet.json");
    const m = parseMeta(serializeMeta({ ...EMPTY_META, goal: "арена", tags: ["fun"], compiledStamp: "x-1" }));
    expect(m.goal).toBe("арена");
    expect(m.tags).toEqual(["fun"]);
    expect(m.compiledStamp).toBe("x-1");
    expect(parseMeta("garbage").goal).toBe("");
    expect(plural(1, "браш", "браша", "брашей")).toBe("браш");
    expect(plural(3, "браш", "браша", "брашей")).toBe("браша");
    expect(plural(11, "браш", "браша", "брашей")).toBe("брашей");
  });
});
