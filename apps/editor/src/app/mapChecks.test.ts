import { describe, expect, it } from "vitest";
import type { LoadedMap } from "../map/loader";
import { displacementsInEntities, missingCubemap } from "./mapChecks";

describe("displacements in brush entities", () => {
  it("groups the displacement brushes of each brush entity, world ones left out", () => {
    // Solids 1 and 2 in func_detail 10 (only 2 has a displacement), solid 3 a world displacement.
    const owner: Record<number, number> = { 1: 10, 2: 10, 3: 0 };
    const disp: Record<number, number> = { 1: 0, 2: 3, 3: 2 };
    const map = {
      mesh: { solidIds: [1, 2, 3] },
      entities: [{ id: 10, classname: "func_detail" }],
      doc: {
        entity_of_solid: (id: number) => owner[id],
        solid_sides: (id: number) => new Uint32Array([id * 10, id * 10 + 1]),
        face_info: (id: number, side: number) => ({ disp_power: side === id * 10 ? disp[id] : 0 }),
      },
    } as unknown as LoadedMap;
    expect(displacementsInEntities(map)).toEqual([{ entity: 10, classname: "func_detail", solids: [2] }]);
  });
});

describe("missing cubemap", () => {
  const map = (classes: { classname: string; origin?: [number, number, number] }[], solids = [1]) =>
    ({
      mesh: { solidIds: solids },
      stats: {
        bounds: [
          [-512, -512, 0],
          [512, 512, 256],
        ],
      },
      entities: classes.map((c, i) => ({ id: i + 1, ...c })),
    }) as unknown as LoadedMap;

  it("asks for one above the player start", () => {
    expect(missingCubemap(map([{ classname: "info_player_start", origin: [100, 50, 16] }]))).toEqual([100, 50, 80]);
  });

  it("falls back to the middle near the top, and stays quiet with a cubemap or no brushes", () => {
    expect(missingCubemap(map([]))).toEqual([0, 0, 192]);
    expect(missingCubemap(map([{ classname: "ENV_CUBEMAP" }]))).toBeNull();
    expect(missingCubemap(map([], []))).toBeNull();
  });
});
