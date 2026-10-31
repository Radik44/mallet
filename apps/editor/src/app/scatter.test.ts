import { describe, expect, it } from "vitest";
import { DEFAULT_SCATTER, addScatterModel, pickScatter } from "./scatter";

describe("prop brush", () => {
  it("keeps the spacing between placed props", () => {
    const s = { ...DEFAULT_SCATTER, on: true, spacing: 64 };
    expect(pickScatter(s, [0, 0, 0], [], "models/a.mdl", () => 0.5)).not.toBeNull();
    expect(pickScatter(s, [10, 10, 0], [[0, 0, 0]], "models/a.mdl", () => 0.5)).toBeNull();
    expect(pickScatter(s, [70, 0, 0], [[0, 0, 0]], "models/a.mdl", () => 0.5)).not.toBeNull();
  });

  it("draws from the set, or the current model when the set is empty", () => {
    const s = { ...DEFAULT_SCATTER, models: ["models/x.mdl", "models/y.mdl"] };
    expect(pickScatter(s, [0, 0, 0], [], "models/a.mdl", () => 0.9)?.model).toBe("models/y.mdl");
    expect(pickScatter(s, [0, 0, 0], [], "models/a.mdl", () => 0.1)?.model).toBe("models/x.mdl");
    expect(pickScatter(DEFAULT_SCATTER, [0, 0, 0], [], "models/a.mdl", () => 0.1)?.model).toBe("models/a.mdl");
  });

  it("rounds the random yaw to five degrees and can switch it off", () => {
    const yaw = pickScatter({ ...DEFAULT_SCATTER, randomYaw: true }, [0, 0, 0], [], "m", () => 0.5)?.yaw ?? -1;
    expect(yaw % 5).toBe(0);
    expect(pickScatter({ ...DEFAULT_SCATTER, randomYaw: false }, [0, 0, 0], [], "m", () => 0.5)?.yaw).toBe(0);
  });

  it("adds models once and keeps eight at most", () => {
    let s = DEFAULT_SCATTER;
    for (let i = 0; i < 10; i++) s = addScatterModel(s, `m${i}`);
    s = addScatterModel(s, "m9");
    expect(s.models).toHaveLength(8);
    expect(s.models[0]).toBe("m2");
  });
});
