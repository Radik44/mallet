import { describe, expect, it } from "vitest";
import { chainIds, routeLength } from "./pathChain";

describe("path chain", () => {
  const nodes = [
    { id: 1, name: "train", next: ["p1"] },
    { id: 2, name: "p1", next: ["p2"] },
    { id: 3, name: "p2", next: ["P3"] },
    { id: 4, name: "p3", next: ["p1"] },
    { id: 5, name: "other", next: [] },
    { id: 6, name: "branch", next: ["p2"] },
  ];

  it("follows the chain both ways from one node, loops and case included", () => {
    expect(chainIds(nodes, [3])).toEqual([1, 2, 3, 4, 6]);
  });

  it("leaves unrelated entities out", () => {
    expect(chainIds(nodes, [5])).toEqual([5]);
  });
});

describe("route length", () => {
  const n = (id: number, name: string, next: string[], origin: [number, number, number]) => ({ id, name, next, origin });

  it("adds up the legs of an open route from its first stop", () => {
    const r = routeLength([n(2, "b", ["c"], [100, 0, 0]), n(1, "a", ["b"], [0, 0, 0]), n(3, "c", [], [100, 50, 0])]);
    expect(r).toEqual({ length: 150, loop: false, stops: 3 });
  });

  it("closes a loop back to the start", () => {
    const r = routeLength([n(1, "a", ["b"], [0, 0, 0]), n(2, "b", ["c"], [30, 0, 0]), n(3, "c", ["a"], [30, 40, 0])]);
    expect(r).toEqual({ length: 120, loop: true, stops: 3 });
  });
});
