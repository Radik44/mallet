import { describe, expect, it } from "vitest";
import { silentEntities } from "./silentEntities";

describe("entities without outputs", () => {
  it("flags triggers, buttons and logic with no outputs only", () => {
    const list = [
      { id: 1, classname: "trigger_once", outputs: 0 },
      { id: 2, classname: "trigger_once", outputs: 2 },
      { id: 3, classname: "light", outputs: 0 },
      { id: 4, classname: "logic_auto", outputs: 0 },
      { id: 5, classname: "trigger_push", outputs: 0 },
    ];
    expect(silentEntities(list)).toEqual([1, 4]);
  });
});
