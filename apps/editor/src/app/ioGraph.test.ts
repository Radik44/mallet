import { describe, expect, it } from "vitest";
import { buildGraph, edgePath, GAP_X, NODE_W, type GraphConnection, type GraphEntity } from "./ioGraph";

const ents: GraphEntity[] = [
  { id: 1, classname: "func_button", targetname: "btn", brush: true },
  { id: 2, classname: "logic_relay", targetname: "relay", brush: false },
  { id: 3, classname: "func_door", targetname: "door", brush: true },
  { id: 4, classname: "func_door", targetname: "door", brush: true },
  { id: 5, classname: "light", targetname: "lamp", brush: false },
  { id: 6, classname: "prop_static", targetname: null, brush: false },
];
const conn = (source: number, index: number, output: string, target: string, input: string, extra: Partial<GraphConnection> = {}): GraphConnection => ({
  source,
  index,
  output,
  target,
  input,
  parameter: "",
  delay: 0,
  times: -1,
  ...extra,
});

describe("ioGraph", () => {
  it("links entities by targetname, one node per entity, one edge per pair", () => {
    const g = buildGraph(ents, [conn(1, 0, "OnPressed", "relay", "Trigger"), conn(2, 0, "OnTrigger", "door", "Open"), conn(2, 1, "OnTrigger", "door", "Close", { delay: 2 })]);
    expect(g.nodes.map((n) => n.key).sort()).toEqual(["e:1", "e:2", "e:3", "e:4"]);
    const toDoors = g.edges.filter((e) => e.from === "e:2");
    expect(toDoors).toHaveLength(2);
    expect(toDoors[0].conns).toHaveLength(2);
    expect(g.lonely).toBe(1); // the lamp has a name but no link
    const rank = Object.fromEntries(g.nodes.map((n) => [n.key, n.rank]));
    expect(rank).toEqual({ "e:1": 0, "e:2": 1, "e:3": 2, "e:4": 2 });
    expect(g.nodes.find((n) => n.key === "e:2")!.x).toBe(NODE_W + GAP_X);
  });

  it("draws unknown names as broken and !activator as a special node", () => {
    const g = buildGraph(ents, [conn(1, 0, "OnPressed", "ghost", "Kill"), conn(1, 1, "OnPressed", "!activator", "Ignite")]);
    const broken = g.edges.find((e) => e.to === "n:ghost")!;
    expect(broken.broken).toBe(true);
    expect(g.nodes.find((n) => n.key === "n:ghost")!.kind).toBe("missing");
    expect(g.edges.find((e) => e.to === "s:!activator")!.broken).toBe(false);
  });

  it("survives cycles and self-loops", () => {
    const g = buildGraph(ents, [conn(1, 0, "OnPressed", "relay", "Trigger"), conn(2, 0, "OnTrigger", "btn", "Unlock"), conn(2, 1, "OnTrigger", "relay", "Disable")]);
    const r = Object.fromEntries(g.nodes.map((n) => [n.key, n.rank]));
    expect(Math.abs(r["e:1"] - r["e:2"])).toBe(1);
    expect(g.edges.some((e) => e.from === "e:2" && e.to === "e:2")).toBe(true);
    const n = g.nodes.find((x) => x.key === "e:2")!;
    expect(edgePath(n, n)).toMatch(/^M /);
  });
});
