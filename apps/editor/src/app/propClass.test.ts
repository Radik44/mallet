import { describe, expect, it } from "vitest";
import { propClassFor } from "./propClass";

describe("prop class for a model", () => {
  it("keeps static models static and picks physics or dynamic for the rest", () => {
    expect(propClassFor(0x10, true)).toBe("prop_static");
    expect(propClassFor(0x11, false)).toBe("prop_static");
    expect(propClassFor(0x1, true)).toBe("prop_physics");
    expect(propClassFor(0, false)).toBe("prop_dynamic");
  });

  it("falls back to prop_static when the header is unknown", () => {
    expect(propClassFor(null, false)).toBe("prop_static");
  });
});
