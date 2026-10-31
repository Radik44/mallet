import { describe, expect, it } from "vitest";
import { viewAnglesText, entityView } from "./pilot";

describe("pilot", () => {
  it("reads origin and angles", () => {
    expect(entityView([["origin", "10 20 30"], ["angles", "15 90 0"]])).toEqual({ origin: [10, 20, 30], pitch: 15, yaw: 90 });
  });

  it("lets a light's pitch key win over the angles", () => {
    expect(entityView([["origin", "0 0 0"], ["angles", "0 45 0"], ["pitch", "-60"]])?.pitch).toBe(-60);
    expect(entityView([["origin", "0 0 0"], ["angles", "20 45 0"], ["pitch", "0"]])?.pitch).toBe(20);
  });

  it("needs an origin", () => {
    expect(entityView([["angles", "0 0 0"]])).toBeNull();
    expect(entityView([["origin", "1 2"]])).toBeNull();
  });

  it("writes angles back with yaw in 0..360", () => {
    expect(viewAnglesText(12.34, -90, 0)).toBe("12.3 270 0");
  });
});
