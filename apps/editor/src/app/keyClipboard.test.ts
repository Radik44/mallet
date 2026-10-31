import { describe, expect, it } from "vitest";
import { mergeConnections, copyableKeys, pasteChanges } from "./keyClipboard";

describe("entity key clipboard", () => {
  it("leaves out identity and placement keys", () => {
    const keys: [string, string][] = [
      ["classname", "light"],
      ["targetname", "lamp1"],
      ["origin", "0 0 64"],
      ["_light", "255 200 150 400"],
      ["style", "0"],
    ];
    expect(copyableKeys(keys)).toEqual([
      ["_light", "255 200 150 400"],
      ["style", "0"],
    ]);
  });

  it("pastes only what differs, case-insensitively by key", () => {
    const copied: [string, string][] = [
      ["_light", "255 200 150 400"],
      ["style", "0"],
    ];
    const target: [string, string][] = [
      ["_Light", "255 255 255 200"],
      ["style", "0"],
    ];
    expect(pasteChanges(copied, target)).toEqual([["_light", "255 200 150 400"]]);
  });
});

describe("copy outputs", () => {
  const c = (output: string, target: string) => ({ output, target, input: "Toggle", parameter: "", delay: 0, times_to_fire: -1 });
  it("adds only the outputs that are not there yet", () => {
    expect(mergeConnections([c("OnPressed", "door")], [c("OnPressed", "DOOR"), c("OnPressed", "lamp")])).toEqual([c("OnPressed", "door"), c("OnPressed", "lamp")]);
    expect(mergeConnections([c("OnPressed", "door")], [c("OnPressed", "door")])).toBeNull();
  });
});

