// Pure layout helpers of the docking system: zones, tabs, floating windows.

import { describe, expect, it } from "vitest";
import { activatePanel, defaultLayout, hidePanel, locate, movePanel, normalizeLayout, removePanel, visiblePanels } from "./Dock";

const KNOWN = ["inspector", "properties", "textures", "models"];

describe("defaultLayout", () => {
  it("puts every tab on the right with the given one open", () => {
    const l = defaultLayout(KNOWN, "textures");
    expect(l.zones.right.tabs).toEqual(KNOWN);
    expect(l.zones.right.active).toBe("textures");
    expect(l.zones.left.tabs).toEqual([]);
    expect(visiblePanels(l)).toEqual(["textures"]);
  });
});

describe("activatePanel", () => {
  it("brings a tab to the front of its zone", () => {
    const l = activatePanel(defaultLayout(KNOWN, "textures"), "models");
    expect(l.zones.right.active).toBe("models");
    expect(l.zones.right.tabs).toEqual(KNOWN);
  });

  it("adds an unknown panel to the right zone", () => {
    const l = activatePanel(defaultLayout(KNOWN), "problems");
    expect(locate(l, "problems")).toBe("right");
    expect(l.zones.right.active).toBe("problems");
  });

  it("raises a floating window to the top", () => {
    let l = movePanel(defaultLayout(KNOWN), "textures", "float");
    l = movePanel(l, "models", "float");
    expect(l.floating.map((f) => f.kind)).toEqual(["textures", "models"]);
    l = activatePanel(l, "textures");
    expect(l.floating.map((f) => f.kind)).toEqual(["models", "textures"]);
  });
});

describe("removePanel", () => {
  it("closing the open tab shows its right neighbour, then the left one", () => {
    let l = defaultLayout(KNOWN, "properties");
    l = removePanel(l, "properties");
    expect(l.zones.right.tabs).toEqual(["inspector", "textures", "models"]);
    expect(l.zones.right.active).toBe("textures");
    l = activatePanel(l, "models");
    l = removePanel(l, "models");
    expect(l.zones.right.active).toBe("textures");
  });

  it("leaves the zone empty when the last tab goes", () => {
    const l = removePanel(defaultLayout(["inspector"], "inspector"), "inspector");
    expect(l.zones.right.tabs).toEqual([]);
    expect(l.zones.right.active).toBeNull();
  });
});

describe("movePanel and hidePanel", () => {
  it("moves a tab between zones and keeps the source zone sensible", () => {
    const l = movePanel(defaultLayout(KNOWN, "textures"), "textures", "left");
    expect(locate(l, "textures")).toBe("left");
    expect(l.zones.left.active).toBe("textures");
    expect(l.zones.right.tabs).toEqual(["inspector", "properties", "models"]);
    expect(l.zones.right.active).toBe("models");
  });

  it("floats a panel and docks it back on hide", () => {
    let l = movePanel(defaultLayout(KNOWN, "textures"), "textures", "float");
    expect(locate(l, "textures")).toBe("float");
    expect(visiblePanels(l)).toContain("textures");
    l = hidePanel(l, "textures");
    expect(locate(l, "textures")).toBe("right");
    expect(l.zones.right.active).not.toBe("textures");
  });

  it("hiding the active tab empties the zone, hiding another tab changes nothing", () => {
    const base = defaultLayout(KNOWN, "textures");
    expect(hidePanel(base, "textures").zones.right.active).toBeNull();
    expect(hidePanel(base, "models")).toBe(base);
  });
});

describe("normalizeLayout", () => {
  it("drops unknown panels, duplicates and silly sizes, and keeps every known panel once", () => {
    const raw = {
      zones: {
        left: { tabs: ["textures", "ghost", "textures"], active: "textures", size: 20 },
        right: { tabs: ["inspector"], active: "nope", size: 400 },
        bottom: { tabs: [], active: null, size: 5000 },
      },
      floating: [{ kind: "models", x: "7", y: 0, w: 10, h: 10 }, { kind: "inspector" }],
    };
    const l = normalizeLayout(raw, KNOWN);
    expect(l.zones.left.tabs).toEqual(["textures"]);
    expect(l.zones.left.size).toBe(300);
    expect(l.zones.right.active).toBeNull();
    expect(l.zones.right.size).toBe(400);
    expect(l.zones.bottom.size).toBe(240);
    expect(l.floating).toEqual([{ kind: "models", x: 7, y: 80, w: 240, h: 160 }]);
    // properties was nowhere: it lands on the right.
    expect(l.zones.right.tabs).toEqual(["inspector", "properties"]);
    const all = [...l.zones.left.tabs, ...l.zones.right.tabs, ...l.zones.bottom.tabs, ...l.floating.map((f) => f.kind)].sort();
    expect(all).toEqual([...KNOWN].sort());
  });

  it("falls back to the default layout for garbage", () => {
    expect(normalizeLayout(null, KNOWN)).toEqual(defaultLayout(KNOWN));
    expect(normalizeLayout("x", KNOWN)).toEqual(defaultLayout(KNOWN));
  });
});
