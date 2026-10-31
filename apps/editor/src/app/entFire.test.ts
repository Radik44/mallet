import { describe, expect, it } from "vitest";
import { entFireCommand } from "./entFire";

describe("test an output in the game", () => {
  it("builds ent_fire with the parameter, quoted when it has spaces", () => {
    expect(entFireCommand({ target: "door_1", input: "Open", parameter: "" }, null)).toEqual({ command: "ent_fire door_1 Open" });
    expect(entFireCommand({ target: "lamp*", input: "SetBrightness", parameter: "200" }, null)).toEqual({ command: "ent_fire lamp* SetBrightness 200" });
    expect(entFireCommand({ target: "msg", input: "SetMessage", parameter: "hello world" }, null)).toEqual({ command: 'ent_fire msg SetMessage "hello world"' });
  });

  it("turns !self into the entity's name and refuses the event-only targets", () => {
    expect(entFireCommand({ target: "!self", input: "Kill", parameter: "" }, "crate_3")).toEqual({ command: "ent_fire crate_3 Kill" });
    expect("reason" in entFireCommand({ target: "!self", input: "Kill", parameter: "" }, null)).toBe(true);
    expect("reason" in entFireCommand({ target: "!activator", input: "SetHealth", parameter: "100" }, "x")).toBe(true);
    expect("reason" in entFireCommand({ target: "", input: "Open", parameter: "" }, null)).toBe(true);
  });
});
