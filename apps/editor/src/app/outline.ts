// The map as a tree, the way Unity's Hierarchy and Unreal's Outliner show a
// scene: the world's brushes, the groups, then the entities by class, with
// children attached to their parent (the `parentname` key) instead of the
// class list. Each node knows the ids it stands for, so a row can select,
// hide or focus them.

import { t } from "../i18n";

export interface OutlineEntity {
  id: number;
  classname: string;
  targetname: string | null;
  brush: boolean;
  hidden: boolean;
  /** The `parentname` key without the attachment suffix (`name,attach` → `name`). */
  parentname: string | null;
  instance_file: string | null;
}

export interface OutlineGroup {
  id: number;
  members: number[];
}

export interface OutlineInput {
  entities: OutlineEntity[];
  /** Ids of the world's brushes (not part of a brush entity). */
  worldSolids: number[];
  hiddenIds: Set<number>;
  groups: OutlineGroup[];
}

export type OutlineKind = "section" | "world" | "group" | "class" | "entity";

export interface OutlineNode {
  key: string;
  kind: OutlineKind;
  title: string;
  subtitle: string;
  /** What a click selects; for a brush entity the entity id (the editor maps it to its brushes). */
  ids: number[];
  /** Objects under the node, for the badge. */
  count: number;
  hidden: "all" | "some" | "none";
  children: OutlineNode[];
  /** The entity's id for entity rows. */
  id?: number;
  classname?: string;
  targetname?: string | null;
  brush?: boolean;
}

function hiddenState(ids: number[], hidden: (id: number) => boolean): "all" | "some" | "none" {
  if (!ids.length) return "none";
  let n = 0;
  for (const id of ids) if (hidden(id)) n++;
  return n === 0 ? "none" : n === ids.length ? "all" : "some";
}

/** The parent an entity names, without the attachment point. */
export function parentOf(parentname: string | null | undefined): string | null {
  if (!parentname) return null;
  const name = parentname.split(",")[0].trim();
  return name || null;
}

export function buildOutline(input: OutlineInput): OutlineNode[] {
  const { entities, worldSolids, hiddenIds, groups } = input;
  const isHidden = (id: number) => hiddenIds.has(id);
  const byId = new Map(entities.map((e) => [e.id, e]));
  const byName = new Map<string, OutlineEntity[]>();
  for (const e of entities) {
    if (!e.targetname) continue;
    const k = e.targetname.toLowerCase();
    const list = byName.get(k) ?? [];
    list.push(e);
    byName.set(k, list);
  }
  // Which entity each one hangs under: the first entity carrying its parentname, never itself
  // or one of its own descendants (a cycle leaves the entity in its class list).
  const parentId = new Map<number, number>();
  for (const e of entities) {
    const name = parentOf(e.parentname);
    const candidates = name ? byName.get(name.toLowerCase()) : undefined;
    const p = candidates?.find((c) => c.id !== e.id);
    if (p) parentId.set(e.id, p.id);
  }
  for (const [id] of [...parentId]) {
    const seen = new Set<number>([id]);
    let cur = parentId.get(id);
    while (cur !== undefined) {
      if (seen.has(cur)) {
        parentId.delete(id);
        break;
      }
      seen.add(cur);
      cur = parentId.get(cur);
    }
  }
  const childrenOf = new Map<number, OutlineEntity[]>();
  for (const [child, parent] of parentId) {
    const list = childrenOf.get(parent) ?? [];
    list.push(byId.get(child)!);
    childrenOf.set(parent, list);
  }
  const byTitle = (a: OutlineEntity, b: OutlineEntity) => (a.targetname ?? "").localeCompare(b.targetname ?? "") || a.classname.localeCompare(b.classname) || a.id - b.id;
  const entityNode = (e: OutlineEntity): OutlineNode => {
    const kids = (childrenOf.get(e.id) ?? []).sort(byTitle).map(entityNode);
    const all = [e.id, ...kids.flatMap((k) => k.ids)];
    return {
      key: `e:${e.id}`,
      kind: "entity",
      title: e.targetname ?? e.classname,
      subtitle: e.targetname ? e.classname : e.instance_file ? e.instance_file : `id ${e.id}`,
      ids: [e.id],
      count: kids.length,
      hidden: hiddenState(all, (id) => byId.get(id)?.hidden ?? isHidden(id)),
      children: kids,
      id: e.id,
      classname: e.classname,
      targetname: e.targetname,
      brush: e.brush,
    };
  };

  const world: OutlineNode = {
    key: "world",
    kind: "world",
    title: t("Мир"),
    subtitle: "",
    ids: worldSolids,
    count: worldSolids.length,
    hidden: hiddenState(worldSolids, isHidden),
    children: [],
  };

  const groupNodes: OutlineNode[] = groups
    .filter((g) => g.members.length)
    .sort((a, b) => a.id - b.id)
    .map((g) => {
      const ents = g.members.filter((id) => byId.has(id)).map((id) => byId.get(id)!);
      const solids = g.members.filter((id) => !byId.has(id));
      return {
        key: `g:${g.id}`,
        kind: "group",
        title: `${g.id}`,
        subtitle: "",
        ids: g.members,
        count: g.members.length,
        hidden: hiddenState(g.members, (id) => byId.get(id)?.hidden ?? isHidden(id)),
        children: ents.sort(byTitle).map(entityNode),
        brush: solids.length > 0,
      };
    });
  const groupsSection: OutlineNode = {
    key: "section:groups",
    kind: "section",
    title: t("Группы"),
    subtitle: "",
    ids: groupNodes.flatMap((g) => g.ids),
    count: groupNodes.length,
    hidden: hiddenState(
      groupNodes.flatMap((g) => g.ids),
      (id) => byId.get(id)?.hidden ?? isHidden(id),
    ),
    children: groupNodes,
  };

  // Classes hold the entities that hang under no parent.
  const roots = entities.filter((e) => !parentId.has(e.id));
  const classes = new Map<string, OutlineEntity[]>();
  for (const e of roots) {
    const list = classes.get(e.classname) ?? [];
    list.push(e);
    classes.set(e.classname, list);
  }
  const classNodes: OutlineNode[] = [...classes.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([classname, list]) => {
      const kids = list.sort(byTitle).map(entityNode);
      const all = kids.flatMap((k) => [k.id!, ...k.children.flatMap(descendantIds)]);
      return {
        key: `c:${classname}`,
        kind: "class",
        title: classname,
        subtitle: "",
        ids: all,
        count: all.length,
        hidden: hiddenState(all, (id) => byId.get(id)?.hidden ?? false),
        children: kids,
        classname,
      };
    });
  const entitiesSection: OutlineNode = {
    key: "section:entities",
    kind: "section",
    title: t("Энтити"),
    subtitle: "",
    ids: entities.map((e) => e.id),
    count: entities.length,
    hidden: hiddenState(
      entities.map((e) => e.id),
      (id) => byId.get(id)?.hidden ?? false,
    ),
    children: classNodes,
  };
  return [world, groupsSection, entitiesSection];
}

function descendantIds(n: OutlineNode): number[] {
  return [n.id!, ...n.children.flatMap(descendantIds)];
}

/** Keys of the nodes on the way to any node whose ids meet `ids` (to expand them). */
export function pathsTo(nodes: OutlineNode[], ids: Set<number>): Set<string> {
  const out = new Set<string>();
  const visit = (n: OutlineNode, trail: string[]): boolean => {
    let hit = n.kind === "entity" && n.id !== undefined && ids.has(n.id);
    for (const c of n.children) if (visit(c, [...trail, n.key])) hit = true;
    if (hit) for (const k of trail) out.add(k);
    return hit;
  };
  for (const n of nodes) visit(n, []);
  return out;
}

/** The nodes whose title, subtitle or id contains every word, with their ancestors (for the filter). */
export function filterOutline(nodes: OutlineNode[], filter: string): OutlineNode[] {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return nodes;
  const matches = (n: OutlineNode) => words.every((w) => n.title.toLowerCase().includes(w) || n.subtitle.toLowerCase().includes(w) || (n.id !== undefined && String(n.id) === w));
  const keep = (n: OutlineNode): OutlineNode | null => {
    const kids = n.children.map(keep).filter((k): k is OutlineNode => !!k);
    if (!kids.length && !matches(n)) return null;
    return { ...n, children: matches(n) ? n.children : kids };
  };
  return nodes.map(keep).filter((n): n is OutlineNode => !!n);
}
