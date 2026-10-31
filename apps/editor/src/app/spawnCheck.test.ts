import { describe, expect, it } from "vitest";
import { boxCutsShape, insideShape, isPhysicsProp, liftOut, outsideWorld, playerHull, pointsInside, pushOut, type Shape, stuckStarts, unionBox } from "./spawnCheck";

describe("stuck player starts", () => {
  const floor: [[number, number, number], [number, number, number]] = [
    [-512, -512, -16],
    [512, 512, 0],
  ];
  const wall: [[number, number, number], [number, number, number]] = [
    [100, -512, 0],
    [116, 512, 256],
  ];

  it("builds the standing hull from the feet", () => {
    expect(playerHull([0, 0, 0])).toEqual([
      [-16, -16, 0],
      [16, 16, 72],
    ]);
  });

  it("lets a start stand on the floor and catches one sunk in it or in a wall", () => {
    const starts = [
      { id: 1, origin: [0, 0, 0] as [number, number, number] },
      { id: 2, origin: [0, 0, -8] as [number, number, number] },
      { id: 3, origin: [95, 0, 0] as [number, number, number] },
      { id: 4, origin: [80, 0, 0] as [number, number, number] },
    ];
    expect(stuckStarts(starts, [floor, wall])).toEqual([2, 3]);
  });

  it("lifts a start out of the floor but not out of a wall", () => {
    expect(liftOut([0, 0, -8], [floor, wall])).toBe(8);
    expect(
      liftOut(
        [0, 0, -8],
        [
          floor,
          [
            [-64, -64, 0],
            [64, 64, 16],
          ],
        ],
      ),
    ).toBe(24);
    expect(liftOut([95, 0, 0], [floor, wall])).toBeNull();
    expect(liftOut([0, 0, 0], [floor])).toBeNull();
  });

  it("finds lights sunk into a brush but not ones on its face", () => {
    const pts = [
      { id: 1, origin: [108, 0, 128] as [number, number, number] },
      { id: 2, origin: [100, 0, 128] as [number, number, number] },
      { id: 3, origin: [0, 0, 64] as [number, number, number] },
    ];
    expect(pointsInside(pts, [floor, wall])).toEqual([1]);
  });

  it("pushes a sunk light out through the nearest face", () => {
    const ceiling: [[number, number, number], [number, number, number]] = [
      [-512, -512, 256],
      [512, 512, 272],
    ];
    expect(pushOut([0, 0, 260], [ceiling])).toEqual([0, 0, 248]);
    expect(pushOut([110, 0, 128], [wall])).toEqual([124, 0, 128]);
    expect(pushOut([0, 0, 64], [wall])).toBeNull();
    // Out of the wall but into another brush: no safe spot.
    expect(
      pushOut(
        [110, 0, 128],
        [
          wall,
          [
            [118, -512, 0],
            [200, 512, 256],
          ],
        ],
      ),
    ).toBeNull();
  });

  it("finds entities out in the void around the world", () => {
    const world = unionBox([floor, wall]);
    expect(world).toEqual([
      [-512, -512, -16],
      [512, 512, 256],
    ]);
    const pts = [
      { id: 1, origin: [0, 0, 64] as [number, number, number] },
      { id: 2, origin: [0, 0, 900] as [number, number, number] },
      { id: 3, origin: [-600, 0, 0] as [number, number, number] },
    ];
    expect(outsideWorld(pts, world)).toEqual([2, 3]);
    expect(outsideWorld(pts, unionBox([]))).toEqual([]);
  });
});

describe("physics props", () => {
  it("knows the classes physics moves", () => {
    expect(["prop_physics", "PROP_PHYSICS_MULTIPLAYER", "prop_ragdoll"].every(isPhysicsProp)).toBe(true);
    expect(["prop_static", "prop_dynamic", "prop_physics_bogus"].some(isPhysicsProp)).toBe(false);
  });
});

describe("inside a brush by its faces", () => {
  // A ramp: box 0..128 on x and z, its slope face x - z = 0 facing up and back (points above the slope are outside).
  const s = Math.SQRT1_2;
  const ramp: Shape = {
    box: [
      [0, 0, 0],
      [128, 64, 128],
    ],
    planes: [
      [[0, 0, -1], 0],
      [[1, 0, 0], 128],
      [[0, -1, 0], 0],
      [[0, 1, 0], 64],
      [[-s, 0, s], 0],
    ],
  };

  it("tells the air over a slope from the ramp itself", () => {
    expect(insideShape([100, 32, 20], ramp)).toBe(true);
    expect(insideShape([20, 32, 100], ramp)).toBe(false);
  });

  it("does not call a box resting in the air above the slope stuck", () => {
    expect(boxCutsShape([10, 16, 90], [30, 48, 120], ramp)).toBe(false);
    expect(boxCutsShape([90, 16, 10], [110, 48, 40], ramp)).toBe(true);
  });
});
