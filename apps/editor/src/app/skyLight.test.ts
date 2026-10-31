import { describe, expect, it } from "vitest";
import { isSkyMaterial, skyLightIssues } from "./skyLight";

describe("sun of an outdoor map", () => {
  it("asks for a sun when there is sky and none", () => {
    expect(skyLightIssues(12, [])).toEqual([{ kind: "no_sun", object: 0 }]);
    expect(skyLightIssues(0, [])).toEqual([]);
    expect(skyLightIssues(12, [5])).toEqual([]);
  });

  it("flags every sun after the first", () => {
    expect(skyLightIssues(12, [5, 9, 11])).toEqual([
      { kind: "extra_sun", object: 9 },
      { kind: "extra_sun", object: 11 },
    ]);
  });

  it("knows the sky textures", () => {
    expect(isSkyMaterial("TOOLS/toolsskybox")).toBe(true);
    expect(isSkyMaterial("tools/toolsskybox2d")).toBe(true);
    expect(isSkyMaterial("tools/toolsnodraw")).toBe(false);
  });
});
