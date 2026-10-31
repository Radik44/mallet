import { describe, expect, it } from "vitest";
import { doorTravel, edgeHinge, helperLines, moveDirection, reachRadius, ringLines, rotateAbout, swingArc, targetOrigins } from "./helpers";

describe("I/O line targets", () => {
  const names = new Map<string, [number, number, number][]>([
    ["lamp_1", [[0, 0, 0]]],
    ["lamp_2", [[64, 0, 0]]],
    ["door", [[0, 64, 0]]],
    ["->lamp_1", [[9, 9, 9]]],
  ]);

  it("finds a target by its name without case", () => {
    expect(targetOrigins("Door", names)).toEqual([[0, 64, 0]]);
    expect(targetOrigins("nobody", names)).toEqual([]);
  });

  it("covers every name a trailing star matches, not the input marks", () => {
    expect(targetOrigins("lamp_*", names)).toEqual([[0, 0, 0], [64, 0, 0]]);
  });
});

describe("door direction", () => {
  it("reads movedir as Source angles, with Hammer's old up and down", () => {
    expect(moveDirection("0 90 0")).toEqual([0, 1, 0]);
    expect(moveDirection("-90 0 0")).toEqual([0, 0, 1]);
    expect(moveDirection("0 -1 0")).toEqual([0, 0, 1]);
    expect(moveDirection("0 -2 0")).toEqual([0, 0, -1]);
    expect(moveDirection(undefined)).toEqual([1, 0, 0]);
  });
});

describe("door travel", () => {
  it("moves by its size along the direction, less the lip", () => {
    const door: [[number, number, number], [number, number, number]] = [[0, 0, 0], [16, 64, 112]];
    expect(doorTravel([0, 0, 1], door, 0)).toBe(112);
    expect(doorTravel([0, 1, 0], door, 4)).toBe(60);
    expect(doorTravel([1, 0, 0], door, 64)).toBe(0);
  });
});

describe("rotating door swing", () => {
  it("turns points about an axis, right-handed", () => {
    expect(rotateAbout([10, 0, 0], [0, 0, 0], 2, 90)).toEqual([0, 10, 0]);
    expect(rotateAbout([0, 10, 5], [0, 0, 0], 0, 90)).toEqual([0, -5, 10]);
  });

  it("sweeps the far edge by distance about the hinge, the other way with flag 2", () => {
    const door: [[number, number, number], [number, number, number]] = [[0, 0, 0], [64, 4, 96]];
    const arc = swingArc([0, 2, 0], door, { spawnflags: 0, distance: 90 }, 2);
    expect(arc[0][0]).toBe(64);
    expect(arc[2].map((v) => Math.round(v) + 0)).toEqual([2, 66, 0]);
    const back = swingArc([0, 2, 0], door, { spawnflags: 2, distance: 90 }, 2);
    expect(Math.round(back[2][1])).toBe(-62);
  });
});

describe("door hinge", () => {
  it("sits at the near end of the longer horizontal side", () => {
    expect(edgeHinge([[0, 0, 0], [64, 4, 96]])).toEqual([0, 2, 48]);
    expect(edgeHinge([[10, 20, 0], [14, 84, 96]])).toEqual([12, 20, 48]);
    expect(edgeHinge([[0, 0, 0], [64, 4, 96]], true)).toEqual([64, 2, 48]);
  });
});

describe("reach rings", () => {
  const keys = (m: Record<string, string>) => (k: string) => m[k];
  it("takes the radius keys, with the sound default and no guess for lights", () => {
    expect(reachRadius("ambient_generic", keys({ radius: "600" }))).toBe(600);
    expect(reachRadius("ambient_generic", keys({}))).toBe(1250);
    expect(reachRadius("env_soundscape", keys({ radius: "1024" }))).toBe(1024);
    expect(reachRadius("light", keys({ _light: "255 255 255 200" }))).toBeNull();
    expect(reachRadius("light", keys({ _zero_percent_distance: "512" }))).toBe(512);
    expect(reachRadius("info_target", keys({ radius: "5" }))).toBeNull();
    expect(reachRadius("env_shake", keys({}))).toBe(500);
    expect(reachRadius("point_push", keys({ radius: "300" }))).toBe(300);
    expect(reachRadius("point_hurt", keys({ damageradius: "64" }))).toBe(64);
    expect(reachRadius("env_explosion", keys({ imagnitude: "100" }))).toBe(250);
    expect(reachRadius("env_explosion", keys({ imagnitude: "100", iradiusoverride: "40" }))).toBe(40);
  });

  it("draws three closed rings at the radius", () => {
    const lines = ringLines([0, 0, 0], 100, 8);
    expect(lines.length).toBe(24);
    expect(Math.round(Math.hypot(...lines[3][1]))).toBe(100);
  });
});

describe("name key lines", () => {
  it("draws a line from a path_track to the one its target names", () => {
    const ent = (id: number, classname: string, origin: [number, number, number]) => ({ id, classname, targetname: null, origin, angles: null, brush: false, hidden: false, model: null, skin: 0, body: 0, scale: 1, instance_file: null });
    const entities = [ent(1, "path_track", [0, 0, 0]), ent(2, "path_track", [128, 0, 0])] as unknown as Parameters<typeof helperLines>[0];
    const names = new Map<string, [number, number, number][]>([["p2", [[128, 0, 0]]]]);
    const lines = helperLines(entities, [{ id: 1, classname: "path_track", keyvalues: [["target", "p2"]], connections: [], brush: false }], names);
    expect(Array.from(lines?.positions ?? [])).toEqual([0, 0, 0, 128, 0, 0]);
  });
});

