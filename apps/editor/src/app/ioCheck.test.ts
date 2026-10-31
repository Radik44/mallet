import { describe, expect, it } from "vitest";
import { connectionWarnings, editDistance, nearestInput, unknownInputs, unknownOutputs } from "./ioCheck";

const inputs: Record<string, string[]> = {
  func_door: ["Open", "Close", "Toggle", "Lock", "Unlock", "Kill"],
  light: ["TurnOn", "TurnOff", "Toggle", "Kill"],
};

describe("outputs to inputs that do not exist", () => {
  it("measures typos and suggests the near input only", () => {
    expect(editDistance("Toogle", "toggle")).toBe(1);
    expect(nearestInput("Toogle", inputs.func_door)).toBe("Toggle");
    expect(nearestInput("TurnOn", inputs.func_door)).toBeNull();
  });

  it("flags inputs no target accepts, quiet about special and unknown targets", () => {
    const targets: Record<string, string[]> = { door: ["func_door"], lamp: ["light"], mix: ["func_door", "light"] };
    const conns = [
      { source: 1, index: 0, target: "door", input: "Toogle" },
      { source: 1, index: 1, target: "door", input: "TurnOn" },
      { source: 1, index: 2, target: "lamp", input: "turnon" },
      { source: 1, index: 3, target: "mix", input: "TurnOn" },
      { source: 1, index: 4, target: "!activator", input: "Whatever" },
      { source: 1, index: 5, target: "nobody", input: "Open" },
    ];
    const got = unknownInputs(
      conns,
      (t) => targets[t] ?? [],
      (c) => inputs[c] ?? null,
    );
    expect(got.map((i) => [i.index, i.suggestion])).toEqual([
      [0, "Toggle"],
      [1, null],
    ]);
  });
});

describe("outputs an entity never fires", () => {
  it("flags them and suggests a near name, quiet about unknown classes", () => {
    const outputs: Record<string, string[]> = { func_button: ["OnPressed", "OnDamaged", "OnUser1"], trigger_once: ["OnTrigger", "OnStartTouch"] };
    const got = unknownOutputs(
      [
        { source: 1, index: 0, output: "OnTrigger", classname: "func_button" },
        { source: 2, index: 0, output: "OnTriger", classname: "trigger_once" },
        { source: 2, index: 1, output: "ontrigger", classname: "trigger_once" },
        { source: 3, index: 0, output: "OnAnything", classname: "mystery_entity" },
      ],
      (c) => outputs[c] ?? null,
    );
    expect(got.map((i) => [i.source, i.suggestion])).toEqual([
      [1, null],
      [2, "OnTrigger"],
    ]);
  });
});

describe("warnings on one connection", () => {
  it("names a wrong output, a missing target or a missing input, and stays quiet when unsure", () => {
    const outs = ["OnPressed", "OnUser1"];
    const ins = ["Open", "Close"];
    const names = ["door1", "lamp"];
    expect(connectionWarnings({ output: "OnPressed", target: "door1", input: "open" }, outs, ins, names)).toEqual([]);
    expect(connectionWarnings({ output: "OnTrigger", target: "door1", input: "Toogle" }, outs, ins, names)).toEqual(["класс не вызывает выход OnTrigger", "у цели нет входа Toogle"]);
    expect(connectionWarnings({ output: "OnPressed", target: "door2", input: "Open" }, outs, ins, names)).toEqual(["нет энтити с именем «door2»"]);
    expect(connectionWarnings({ output: "OnPressed", target: "!activator", input: "Anything" }, outs, [], names)).toEqual([]);
    expect(connectionWarnings({ output: "OnPressed", target: "door*", input: "Open" }, outs, ins, names)).toEqual([]);
  });
});
