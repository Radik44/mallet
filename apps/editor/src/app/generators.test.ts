import { describe, expect, it } from "vitest";
import { findGenerator, generatorFields, isGeneratorKind, rebuildBounds, replaceRecord, withPatch, type GeneratorRecord } from "./generators";

const rec: GeneratorRecord = {
  group: 7,
  kind: "arch",
  axis: 2,
  sides: 8,
  wall: 32,
  arc: 180,
  step: 16,
  reverse: false,
  material: "dev/dev_measuregeneric01",
  // Built in a 256 × 256 box; a half arch only fills the lower 128 of it.
  bounds: [
    [0, 0, 0],
    [256, 256, 64],
  ],
  extent: [
    [0, 0, 0],
    [256, 128, 64],
  ],
};

describe("generators", () => {
  it("knows which shapes stay editable", () => {
    expect(["cylinder", "sphere", "arch", "stairs"].every(isGeneratorKind)).toBe(true);
    expect(isGeneratorKind("block") || isGeneratorKind("wedge")).toBe(false);
    expect(generatorFields("arch")).toEqual(["sides", "wall", "arc"]);
    expect(generatorFields("stairs")).toEqual(["step", "reverse"]);
  });

  it("finds a record by group and ignores group 0", () => {
    expect(findGenerator([rec], 7)).toBe(rec);
    expect(findGenerator([rec], 8)).toBeUndefined();
    expect(findGenerator([rec], 0)).toBeUndefined();
    expect(findGenerator(undefined, 7)).toBeUndefined();
  });

  it("clamps patched numbers and moves a record to its new group", () => {
    const next = withPatch(rec, { sides: 500, wall: 0.2, arc: 90.4 });
    expect([next.sides, next.wall, next.arc]).toEqual([64, 1, 90]);
    const moved = replaceRecord([rec, { ...rec, group: 9 }], 7, { ...next, group: 11 });
    expect(moved.map((r) => r.group)).toEqual([9, 11]);
    expect(replaceRecord([rec], 7, null)).toEqual([]);
  });

  it("rebuilds in the original box, carried along with a move and a scale", () => {
    // Unmoved: the box is the one it was built in, not the brushes' own (shorter) bounds.
    expect(rebuildBounds(rec, rec.extent)).toEqual(rec.bounds);
    // Moved by 100 on X and doubled on Y.
    expect(
      rebuildBounds(rec, [
        [100, 0, 0],
        [356, 256, 64],
      ]),
    ).toEqual([
      [100, 0, 0],
      [356, 512, 64],
    ]);
  });
});
