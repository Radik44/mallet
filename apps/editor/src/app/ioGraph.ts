// The map's logic as a graph: entities are nodes, output → input connections
// are edges, laid out left to right by depth like a Blueprint. Hammer shows
// outputs one entity at a time; here the whole chain is visible, including
// the links that point at names nothing carries (drawn as broken).

export interface GraphEntity {
  id: number;
  classname: string;
  targetname: string | null;
  brush: boolean;
}

/** One output connection, with the entity it belongs to and its index in that entity's list. */
export interface GraphConnection {
  source: number;
  index: number;
  output: string;
  target: string;
  input: string;
  parameter: string;
  delay: number;
  times: number;
}

export type NodeKind = "entity" | "missing" | "special";

export interface GraphNode {
  /** `e:<id>` for entities, `n:<name>` for names nothing carries, `s:<!name>` for !activator and friends. */
  key: string;
  id: number | null;
  kind: NodeKind;
  title: string;
  subtitle: string;
  rank: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  key: string;
  from: string;
  to: string;
  conns: GraphConnection[];
  /** Aimed at a name no entity carries. */
  broken: boolean;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Named entities that take part in no connection (left out of the picture). */
  lonely: number;
  width: number;
  height: number;
}

export const NODE_W = 176;
export const NODE_H = 42;
export const GAP_X = 80;
export const GAP_Y = 16;

/** Entities a connection may target by name, lower-cased name → ids. */
function byName(entities: GraphEntity[]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (const e of entities) {
    if (!e.targetname) continue;
    const k = e.targetname.toLowerCase();
    const list = m.get(k) ?? [];
    list.push(e.id);
    m.set(k, list);
  }
  return m;
}

/** Builds and lays the graph out; `conns` are every entity's output connections. With `includeLonely`, named entities without a link get a box too (so a link can be dragged from them). */
export function buildGraph(entities: GraphEntity[], conns: GraphConnection[], includeLonely = false): Graph {
  const names = byName(entities);
  const ents = new Map(entities.map((e) => [e.id, e]));
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const entityNode = (e: GraphEntity): GraphNode => {
    const key = `e:${e.id}`;
    let n = nodes.get(key);
    if (!n) {
      n = { key, id: e.id, kind: "entity", title: e.targetname ?? e.classname, subtitle: e.targetname ? e.classname : `id ${e.id}`, rank: 0, x: 0, y: 0 };
      nodes.set(key, n);
    }
    return n;
  };
  const otherNode = (target: string): GraphNode => {
    const special = target.startsWith("!");
    const key = special ? `s:${target.toLowerCase()}` : `n:${target.toLowerCase()}`;
    let n = nodes.get(key);
    if (!n) {
      n = { key, id: null, kind: special ? "special" : "missing", title: target, subtitle: "", rank: 0, x: 0, y: 0 };
      nodes.set(key, n);
    }
    return n;
  };
  for (const c of conns) {
    const src = ents.get(c.source);
    if (!src) continue;
    const from = entityNode(src);
    const targets = c.target ? (names.get(c.target.toLowerCase()) ?? []) : [];
    const tos: { node: GraphNode; broken: boolean }[] = targets.length
      ? targets.map((id) => ({ node: entityNode(ents.get(id)!), broken: false }))
      : [{ node: otherNode(c.target || "?"), broken: !c.target.startsWith("!") }];
    for (const { node, broken } of tos) {
      const key = `${from.key}>${node.key}`;
      let e = edges.get(key);
      if (!e) {
        e = { key, from: from.key, to: node.key, conns: [], broken };
        edges.set(key, e);
      }
      e.conns.push(c);
    }
  }
  const used = new Set([...nodes.values()].filter((n) => n.id !== null).map((n) => n.id!));
  const lonelyOnes = entities.filter((e) => e.targetname && !used.has(e.id));
  const lonely = lonelyOnes.length;
  if (includeLonely) for (const e of lonelyOnes) entityNode(e);
  const list = [...nodes.values()];
  layout(list, [...edges.values()]);
  const width = list.length ? Math.max(...list.map((n) => n.x)) + NODE_W : 0;
  const height = list.length ? Math.max(...list.map((n) => n.y)) + NODE_H : 0;
  return { nodes: list, edges: [...edges.values()], lonely, width, height };
}

/** Ranks by depth from the sources (back edges of cycles ignored), rows by the neighbours' order. */
function layout(nodes: GraphNode[], edges: GraphEdge[]): void {
  const out = new Map<string, string[]>();
  const inn = new Map<string, string[]>();
  for (const n of nodes) {
    out.set(n.key, []);
    inn.set(n.key, []);
  }
  for (const e of edges) {
    if (e.from === e.to) continue;
    out.get(e.from)!.push(e.to);
    inn.get(e.to)!.push(e.from);
  }
  // Back edges by depth-first colouring, so cycles do not loop the ranking.
  const colour = new Map<string, 1 | 2>();
  const back = new Set<string>();
  const visit = (k: string) => {
    colour.set(k, 1);
    for (const to of out.get(k)!) {
      const c = colour.get(to);
      if (c === 1) back.add(`${k}>${to}`);
      else if (!c) visit(to);
    }
    colour.set(k, 2);
  };
  const byTitle = [...nodes].sort((a, b) => a.title.localeCompare(b.title));
  for (const n of byTitle) if (!colour.has(n.key)) visit(n.key);
  const rank = new Map<string, number>();
  const rankOf = (k: string): number => {
    const r = rank.get(k);
    if (r !== undefined) return r;
    rank.set(k, 0);
    let best = 0;
    for (const from of inn.get(k)!) if (!back.has(`${from}>${k}`)) best = Math.max(best, rankOf(from) + 1);
    rank.set(k, best);
    return best;
  };
  for (const n of nodes) n.rank = rankOf(n.key);
  // Rows: nodes of a column follow the average row of what feeds them, then their names.
  const columns = new Map<number, GraphNode[]>();
  for (const n of byTitle) {
    const col = columns.get(n.rank) ?? [];
    col.push(n);
    columns.set(n.rank, col);
  }
  const row = new Map<string, number>();
  const ranks = [...columns.keys()].sort((a, b) => a - b);
  for (const r of ranks) {
    const col = columns.get(r)!;
    const bary = (n: GraphNode) => {
      const preds = inn.get(n.key)!.filter((p) => row.has(p));
      return preds.length ? preds.reduce((s, p) => s + row.get(p)!, 0) / preds.length : Number.POSITIVE_INFINITY;
    };
    col.sort((a, b) => bary(a) - bary(b) || a.title.localeCompare(b.title));
    col.forEach((n, i) => row.set(n.key, i));
  }
  for (const n of nodes) {
    n.x = n.rank * (NODE_W + GAP_X);
    n.y = row.get(n.key)! * (NODE_H + GAP_Y);
  }
}

/** Where an edge's line runs: from the right middle of `from` to the left middle of `to`. */
export function edgePath(from: GraphNode, to: GraphNode): string {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  if (from === to) {
    // A self-loop: out of the right side, around the top, back into the left side.
    return `M ${x1} ${y1} C ${x1 + 40} ${y1 - 50}, ${x2 - 40} ${y2 - 50}, ${x2} ${y2}`;
  }
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/** The midpoint of an edge's line, for its label. */
export function edgeMid(from: GraphNode, to: GraphNode): [number, number] {
  if (from === to) return [from.x + NODE_W / 2, from.y - 36];
  return [(from.x + NODE_W + to.x) / 2, (from.y + to.y) / 2 + NODE_H / 2];
}
