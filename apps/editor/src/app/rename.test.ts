import { describe, expect, it } from "vitest";
import { badNames, freshNames, nextInSeries, nameHits, refersTo, cleanName, nextIncrementPath, numberedNames, renameMap, retargetConnections, retargetKeys } from "./rename";

describe("rename", () => {
  it("keeps one name as it is", () => {
    expect(numberedNames("hall_lamp", 1)).toEqual(["hall_lamp"]);
  });

  it("numbers a series, continuing a trailing number with its width", () => {
    expect(numberedNames("lamp", 3)).toEqual(["lamp_1", "lamp_2", "lamp_3"]);
    expect(numberedNames("door5", 2)).toEqual(["door5", "door6"]);
    expect(numberedNames("cam_08", 3)).toEqual(["cam_08", "cam_09", "cam_10"]);
  });

  it("cleans names for Source I/O", () => {
    expect(cleanName(" main door ")).toBe("main_door");
    expect(cleanName('a"b')).toBe("ab");
  });

  it("maps old names to new ones only when unambiguous", () => {
    const { map, ambiguous } = renameMap(
      [
        { old: "door", next: "door_main" },
        { old: "lamp", next: "lamp_1" },
        { old: "lamp", next: "lamp_2" },
        { old: "btn", next: "button" },
        { old: null, next: "x" },
      ],
      new Set(["btn"]),
    );
    expect([...map]).toEqual([["door", "door_main"]]);
    expect(ambiguous.sort()).toEqual(["btn", "lamp"]);
  });

  it("retargets connections and name keys", () => {
    const renames = new Map([["door", "door_main"]]);
    const conns = [
      { output: "OnPressed", target: "door", input: "Open" },
      { output: "OnPressed", target: "!activator", input: "Kill" },
    ];
    expect(retargetConnections(conns, renames)?.[0].target).toBe("door_main");
    expect(retargetConnections([conns[1]], renames)).toBeNull();
    expect(
      retargetKeys(
        [
          ["parentname", "door"],
          ["targetname", "door"],
        ],
        renames,
      ),
    ).toEqual([["parentname", "door_main"]]);
  });

  it("numbers saved copies of a map", () => {
    expect(nextIncrementPath("C:/maps/room.vmf")).toBe("C:/maps/room_2.vmf");
    expect(nextIncrementPath("C:/maps/room_2.vmf")).toBe("C:/maps/room_3.vmf");
    expect(nextIncrementPath("C:\\maps\\gm_city_v09.vmf")).toBe("C:\\maps\\gm_city_v10.vmf");
    expect(nextIncrementPath("C:/maps/de_dust2.vmf")).toBe("C:/maps/de_dust2_2.vmf");
  });
});

describe("references", () => {
  const names = new Set(["door_main", "lamp_1"]);
  it("matches names without case and with a trailing star", () => {
    expect(nameHits("Door_Main", names)).toBe(true);
    expect(nameHits("lamp_*", names)).toBe(true);
    expect(nameHits("lamp", names)).toBe(false);
    expect(nameHits("", names)).toBe(false);
  });
  it("finds outputs and name keys pointing at the names", () => {
    expect(refersTo({ keyvalues: [], connections: [{ target: "door_main" }] }, names)).toBe(true);
    expect(refersTo({ keyvalues: [["parentname", "lamp_1"]], connections: [] }, names)).toBe(true);
    expect(refersTo({ keyvalues: [["targetname", "door_main"]], connections: [] }, names)).toBe(false);
  });
});

describe("names the I/O cannot reach", () => {
  it("cleans spaces, commas and quotes, never merging into a name already used", () => {
    expect(cleanName("door,1")).toBe("door_1");
    expect(badNames(["main door", "main door", "main_door", "lamp", null, 'say "hi"'])).toEqual([
      { old: "main door", next: "main_door_2" },
      { old: 'say "hi"', next: "say_hi" },
    ]);
  });
});

describe("fresh names for a copied group", () => {
  it("steps the series and skips names already taken", () => {
    expect(nextInSeries("door9")).toBe("door10");
    expect(nextInSeries("lamp_01")).toBe("lamp_02");
    expect(nextInSeries("button")).toBe("button_2");
    const got = freshNames(["door1", "btn", "door1"], new Set(["door1", "door2", "btn"]));
    expect([...got]).toEqual([
      ["door1", "door3"],
      ["btn", "btn_2"],
    ]);
  });
});
