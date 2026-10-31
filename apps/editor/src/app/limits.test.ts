import { describe, expect, it } from "vitest";
import { limitIssues } from "./limits";

describe("Source map limits", () => {
  it("warns from 80 % on, fullest first", () => {
    const r = limitIssues({ brushes: 7000, sides: 10000, entities: 8000, displacements: 100 });
    expect(r.map((x) => x.key)).toEqual(["entities", "brushes"]);
    expect(r[0].fill).toBeCloseTo(0.977, 3);
  });

  it("is quiet for an ordinary map", () => {
    expect(limitIssues({ brushes: 900, sides: 6000, entities: 400, displacements: 30 })).toEqual([]);
  });
});
