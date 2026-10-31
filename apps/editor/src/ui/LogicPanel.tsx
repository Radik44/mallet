// The map's logic as a node graph, the way Unreal's Blueprints and Blender's
// node editors show it: every entity that sends or receives an output is a
// box, every connection a line with its output → input on it. Click a box to
// select the entity, a line to see and delete the connection, drag from the
// port on a box's right edge to another box to add one. Broken links (names
// nothing carries) are red; !activator and friends are grey boxes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClassDef, IoDef } from "../tauri";
import { buildGraph, edgeMid, edgePath, NODE_H, NODE_W, type Graph, type GraphConnection, type GraphEdge, type GraphEntity, type GraphNode } from "../app/ioGraph";
import type { Connection } from "./PropertiesPanel";
import { Icon } from "./Icon";
import { Select } from "./Select";
import { Empty, PanelFrame, Row, Segmented } from "./kit";
import { t as tr } from "../i18n";

interface Props {
  /** Null while no map is open. */
  entities: GraphEntity[] | null;
  /** Every entity's output connections; `index` is the position in that entity's list. */
  connections: GraphConnection[];
  selectedIds: Set<number>;
  onSelect(id: number): void;
  /** Opens the properties panel on the entity (its outputs tab holds the full editor). */
  onOpen(id: number): void;
  /** Replaces one entity's connection list (adds and removals go through it, one undo step each). */
  onSetConnections(id: number, connections: Connection[]): Promise<void>;
  classDefFor(classname: string): Promise<ClassDef>;
  inputsFor(target: string): Promise<IoDef[]>;
}

interface View {
  x: number;
  y: number;
  k: number;
}

interface Pending {
  sourceId: number;
  sourceClass: string;
  targetKey: string;
  targetName: string;
  outputs: IoDef[];
  inputs: IoDef[];
  output: string;
  input: string;
}

const PAD = 24;

export function LogicPanel({ entities, connections, selectedIds, onSelect, onOpen, onSetConnections, classDefFor, inputsFor }: Props) {
  const [filter, setFilter] = useState("");
  // "linked": only entities that take part in a connection; "all": every named entity, to drag new links from.
  const [scope, setScope] = useState<"linked" | "all">(() => {
    try {
      return localStorage.getItem("gme.logicScope") === "all" ? "all" : "linked";
    } catch {
      return "linked";
    }
  });
  const changeScope = (v: "linked" | "all") => {
    setScope(v);
    try {
      localStorage.setItem("gme.logicScope", v);
    } catch {
      /* storage unavailable */
    }
  };
  const [view, setView] = useState<View>({ x: PAD, y: PAD, k: 1 });
  const [moved, setMoved] = useState<Map<string, [number, number]>>(new Map());
  const [activeEdge, setActiveEdge] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [dragLine, setDragLine] = useState<{ from: GraphNode; x: number; y: number } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const press = useRef<{ kind: "pan" | "node" | "port"; key?: string; sx: number; sy: number; ox: number; oy: number; movedFar: boolean } | null>(null);

  const graph: Graph | null = useMemo(() => (entities ? buildGraph(entities, connections, scope === "all") : null), [entities, connections, scope]);
  // Positions, with the boxes the user dragged where they left them.
  const nodes = useMemo(() => (graph ? graph.nodes.map((n) => (moved.has(n.key) ? { ...n, x: moved.get(n.key)![0], y: moved.get(n.key)![1] } : n)) : []), [graph, moved]);
  const byKey = useMemo(() => new Map(nodes.map((n) => [n.key, n])), [nodes]);
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (n: GraphNode) => !words.length || words.every((w) => n.title.toLowerCase().includes(w) || n.subtitle.toLowerCase().includes(w));
  const selectedKeys = useMemo(() => new Set([...selectedIds].map((id) => `e:${id}`)), [selectedIds]);
  const edgeTouchesSelection = (e: GraphEdge) => selectedKeys.has(e.from) || selectedKeys.has(e.to);

  // A new map or a changed graph forgets manual positions that no longer apply.
  useEffect(() => {
    setMoved((m) => {
      if (!graph) return new Map();
      const keep = new Map([...m].filter(([k]) => graph.nodes.some((n) => n.key === k)));
      return keep.size === m.size ? m : keep;
    });
    setActiveEdge((k) => (graph?.edges.some((e) => e.key === k) ? k : null));
  }, [graph]);

  const fit = useCallback(() => {
    const el = canvas.current;
    if (!el || !graph || !graph.nodes.length) return;
    const w = Math.max(...nodes.map((n) => n.x)) + NODE_W - Math.min(...nodes.map((n) => n.x));
    const h = Math.max(...nodes.map((n) => n.y)) + NODE_H - Math.min(...nodes.map((n) => n.y));
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const k = Math.min(1.25, Math.max(0.25, Math.min((el.clientWidth - PAD * 2) / Math.max(1, w), (el.clientHeight - PAD * 2) / Math.max(1, h))));
    setView({ k, x: (el.clientWidth - w * k) / 2 - minX * k, y: (el.clientHeight - h * k) / 2 - minY * k });
  }, [graph, nodes]);
  const fitOnce = useRef(false);
  useEffect(() => {
    if (graph?.nodes.length && !fitOnce.current) {
      fitOnce.current = true;
      fit();
    }
    if (!graph?.nodes.length) fitOnce.current = false;
  }, [graph, fit]);

  const toWorld = (clientX: number, clientY: number): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [(clientX - r.left - view.x) / view.k, (clientY - r.top - view.y) / view.k];
  };

  const onWheel = (ev: React.WheelEvent) => {
    ev.preventDefault();
    const r = canvas.current!.getBoundingClientRect();
    const px = ev.clientX - r.left;
    const py = ev.clientY - r.top;
    const k = Math.min(2.5, Math.max(0.2, view.k * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
    setView({ k, x: px - ((px - view.x) / view.k) * k, y: py - ((py - view.y) / view.k) * k });
  };
  const onMouseDown = (ev: React.MouseEvent) => {
    if (ev.button !== 0 && ev.button !== 1) return;
    const target = ev.target as HTMLElement;
    const port = target.closest<HTMLElement>(".logic-port");
    const node = target.closest<HTMLElement>(".logic-node");
    if (port && node && ev.button === 0) {
      const n = byKey.get(node.dataset.key!)!;
      const [x, y] = toWorld(ev.clientX, ev.clientY);
      press.current = { kind: "port", key: n.key, sx: ev.clientX, sy: ev.clientY, ox: 0, oy: 0, movedFar: false };
      setDragLine({ from: n, x, y });
    } else if (node && ev.button === 0) {
      const n = byKey.get(node.dataset.key!)!;
      press.current = { kind: "node", key: n.key, sx: ev.clientX, sy: ev.clientY, ox: n.x, oy: n.y, movedFar: false };
    } else {
      press.current = { kind: "pan", sx: ev.clientX, sy: ev.clientY, ox: view.x, oy: view.y, movedFar: false };
    }
    ev.preventDefault();
  };
  const onMouseMove = (ev: React.MouseEvent) => {
    const p = press.current;
    if (!p) return;
    const dx = ev.clientX - p.sx;
    const dy = ev.clientY - p.sy;
    if (Math.hypot(dx, dy) > 3) p.movedFar = true;
    if (p.kind === "pan") setView((v) => ({ ...v, x: p.ox + dx, y: p.oy + dy }));
    else if (p.kind === "node" && p.movedFar) setMoved((m) => new Map(m).set(p.key!, [p.ox + dx / view.k, p.oy + dy / view.k]));
    else if (p.kind === "port") {
      const [x, y] = toWorld(ev.clientX, ev.clientY);
      setDragLine((d) => (d ? { ...d, x, y } : d));
    }
  };
  const finishConnect = async (fromKey: string, toKey: string) => {
    const from = byKey.get(fromKey);
    const to = byKey.get(toKey);
    if (!from || !to || from.id === null || !entities) return;
    const src = entities.find((e) => e.id === from.id)!;
    const targetName = to.kind === "entity" ? (entities.find((e) => e.id === to.id)?.targetname ?? "") : to.title;
    const [def, inputs] = await Promise.all([classDefFor(src.classname), targetName && !targetName.startsWith("!") ? inputsFor(targetName) : Promise.resolve([] as IoDef[])]);
    setPending({ sourceId: from.id, sourceClass: src.classname, targetKey: toKey, targetName, outputs: def.outputs, inputs, output: def.outputs[0]?.name ?? "", input: inputs[0]?.name ?? "" });
  };
  const onMouseUp = (ev: React.MouseEvent) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.kind === "port") {
      setDragLine(null);
      const node = (ev.target as HTMLElement).closest<HTMLElement>(".logic-node");
      if (node && node.dataset.key && node.dataset.key !== p.key) void finishConnect(p.key!, node.dataset.key);
      return;
    }
    if (p.kind === "node" && !p.movedFar) {
      const n = byKey.get(p.key!);
      if (n?.id !== null && n?.id !== undefined) onSelect(n.id);
      setActiveEdge(null);
    }
    if (p.kind === "pan" && !p.movedFar) setActiveEdge(null);
  };

  const addPending = async () => {
    if (!pending) return;
    const own = connections.filter((c) => c.source === pending.sourceId).sort((a, b) => a.index - b.index);
    const list: Connection[] = own.map((c) => ({ output: c.output, target: c.target, input: c.input, parameter: c.parameter, delay: c.delay, times_to_fire: c.times }));
    list.push({ output: pending.output, target: pending.targetName, input: pending.input, parameter: "", delay: 0, times_to_fire: -1 });
    setPending(null);
    await onSetConnections(pending.sourceId, list);
  };
  const removeConnection = async (c: GraphConnection) => {
    const own = connections.filter((x) => x.source === c.source && x.index !== c.index).sort((a, b) => a.index - b.index);
    await onSetConnections(
      c.source,
      own.map((x) => ({ output: x.output, target: x.target, input: x.input, parameter: x.parameter, delay: x.delay, times_to_fire: x.times })),
    );
  };

  const connLabel = (c: GraphConnection) => `${c.output} → ${c.input}${c.delay ? ` · ${c.delay} ${tr("с")}` : ""}${c.times === 1 ? " · ×1" : ""}${c.parameter ? ` · ${c.parameter}` : ""}`;
  const edgeLabel = (e: GraphEdge) => (e.conns.length === 1 ? connLabel(e.conns[0]) : tr("{0} связей", [e.conns.length]));
  const active = activeEdge && graph ? graph.edges.find((e) => e.key === activeEdge) : null;
  const sourceOf = (c: GraphConnection) => entities?.find((e) => e.id === c.source);

  const subtitle = !graph
    ? tr("карта не открыта")
    : graph.nodes.length
      ? tr("{0} узлов · {1} связей", [graph.nodes.length, graph.edges.reduce((s, e) => s + e.conns.length, 0)]) + (graph.lonely ? tr(" · без связей: {0}", [graph.lonely]) : "")
      : tr("связей нет");

  return (
    <PanelFrame
      title={tr("Логика")}
      subtitle={subtitle}
      className="browser logic"
      actions={
        <button className="icon-btn" onClick={fit} disabled={!graph?.nodes.length} title={tr("Вписать граф в окно")}>
          <Icon name="fullscreen" size={14} />
        </button>
      }
    >
      <Row>
        <input className="grow" placeholder={tr("Имя или класс…")} value={filter} onChange={(e) => setFilter(e.target.value)} spellCheck={false} />
        <Segmented<"linked" | "all">
          small
          value={scope}
          onChange={changeScope}
          options={[
            { value: "linked", label: tr("Связанные"), title: tr("Только энтити, участвующие в связях") },
            { value: "all", label: tr("Все с именами"), title: tr("Также энтити с именем без связей: от них можно тянуть новые"), count: graph?.lonely || undefined },
          ]}
        />
        <button className="icon-btn" onClick={fit} disabled={!graph?.nodes.length} title={tr("Вписать граф в окно")}>
          <Icon name="fullscreen" size={14} />
        </button>
        <button
          className="icon-btn"
          onClick={() => {
            setMoved(new Map());
            fitOnce.current = false;
          }}
          disabled={!moved.size}
          title={tr("Вернуть автоматическую расстановку")}
        >
          <Icon name="refresh" size={14} />
        </button>
      </Row>
      {!graph ? (
        <Empty icon="chain" title={tr("Карта не открыта")} text={tr("Граф показывает выходы и входы энтити открытой карты.")} />
      ) : !graph.nodes.length ? (
        <Empty icon="chain" title={tr("Связей пока нет")} text={tr("Выходы задаются во вкладке «Выходы» свойств энтити: кнопка → дверь, триггер → свет. Здесь вся цепочка видна сразу.")} />
      ) : (
        <div className="browser-split">
          <div
            ref={canvas}
            className={`logic-canvas${press.current?.kind === "pan" ? " panning" : ""}`}
            onWheel={onWheel}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onDoubleClick={(ev) => {
              const node = (ev.target as HTMLElement).closest<HTMLElement>(".logic-node");
              const n = node && byKey.get(node.dataset.key!);
              if (n && n.id !== null) onOpen(n.id);
            }}
            title={tr("Колесо - масштаб, перетаскивание фона - сдвиг; щелчок по узлу выделяет энтити, двойной щелчок открывает свойства; тяните из порта справа на другой узел, чтобы добавить связь")}
          >
            <div className="logic-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
              <svg className="logic-edges" width={Math.max(graph.width, 1) + 400} height={Math.max(graph.height, 1) + 400} style={{ overflow: "visible" }}>
                {graph.edges.map((e) => {
                  const from = byKey.get(e.from)!;
                  const to = byKey.get(e.to)!;
                  const dim = words.length && !matches(from) && !matches(to);
                  const cls = ["logic-edge", e.broken ? "broken" : "", activeEdge === e.key ? "active" : "", edgeTouchesSelection(e) ? "lit" : "", dim ? "dim" : ""].filter(Boolean).join(" ");
                  const [mx, my] = edgeMid(from, to);
                  return (
                    <g key={e.key} className={cls} onClick={() => setActiveEdge(e.key)}>
                      <title>{e.conns.map(connLabel).join("\n")}</title>
                      <path className="logic-edge-hit" d={edgePath(from, to)} />
                      <path className="logic-edge-line" d={edgePath(from, to)} />
                      <text className="logic-edge-label" x={mx} y={my - 5} textAnchor="middle">
                        {edgeLabel(e)}
                      </text>
                    </g>
                  );
                })}
                {dragLine ? <path className="logic-edge-line drag" d={`M ${dragLine.from.x + NODE_W} ${dragLine.from.y + NODE_H / 2} L ${dragLine.x} ${dragLine.y}`} /> : null}
              </svg>
              {nodes.map((n) => {
                const cls = ["logic-node", n.kind, selectedKeys.has(n.key) ? "selected" : "", words.length && !matches(n) ? "dim" : ""].filter(Boolean).join(" ");
                return (
                  <div
                    key={n.key}
                    className={cls}
                    data-key={n.key}
                    style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                    title={n.kind === "missing" ? tr("Ни одна энтити не носит это имя") : n.kind === "special" ? tr("Особая цель: подставляется игрой") : undefined}
                  >
                    <div className="logic-node-title list-text">{n.title}</div>
                    {n.subtitle ? <div className="logic-node-sub list-text muted">{n.subtitle}</div> : null}
                    {n.kind === "entity" ? <span className="logic-port" title={tr("Тяните на другой узел, чтобы добавить связь")} /> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {active ? (
        <div className="logic-detail">
          {active.conns.map((c) => (
            <div key={`${c.source}:${c.index}`} className="logic-detail-row">
              <span className="list-text grow" title={connLabel(c)}>
                <strong>{sourceOf(c)?.targetname ?? sourceOf(c)?.classname ?? c.source}</strong> · {c.output} → {c.target} · {c.input}
                {c.delay ? ` · ${c.delay} ${tr("с")}` : ""}
                {c.parameter ? ` · ${c.parameter}` : ""}
              </span>
              <button className="icon-btn" onClick={() => onOpen(c.source)} title={tr("Открыть свойства энтити-источника")}>
                <Icon name="edit" size={13} />
              </button>
              <button className="icon-btn" onClick={() => void removeConnection(c)} title={tr("Удалить связь")}>
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {pending ? (
        <div className="logic-detail logic-pending">
          <Row>
            <span className="list-text grow">
              {tr("Новая связь")}: <strong>{entities?.find((e) => e.id === pending.sourceId)?.targetname ?? pending.sourceClass}</strong> → <strong>{pending.targetName || "?"}</strong>
            </span>
          </Row>
          {!pending.targetName ? (
            <div className="muted small">{tr("У цели нет имени (targetname): задайте его в свойствах, чтобы на неё можно было ссылаться.")}</div>
          ) : (
            <Row>
              {pending.outputs.length ? (
                <Select
                  value={pending.output}
                  options={pending.outputs.map((o) => ({ value: o.name, label: o.name, hint: o.help }))}
                  onChange={(v) => setPending({ ...pending, output: v })}
                  placeholder={tr("Выход")}
                  title={tr("Выход источника")}
                />
              ) : (
                <input
                  className="grow"
                  value={pending.output}
                  onChange={(e) => setPending({ ...pending, output: e.target.value })}
                  placeholder={tr("Выход")}
                  title={tr("Выход источника")}
                  spellCheck={false}
                />
              )}
              <span className="muted">→</span>
              {pending.inputs.length ? (
                <Select
                  value={pending.input}
                  options={pending.inputs.map((i) => ({ value: i.name, label: i.name, hint: i.help }))}
                  onChange={(v) => setPending({ ...pending, input: v })}
                  placeholder={tr("Вход")}
                  title={tr("Вход цели")}
                />
              ) : (
                <input className="grow" value={pending.input} onChange={(e) => setPending({ ...pending, input: e.target.value })} placeholder={tr("Вход")} spellCheck={false} />
              )}
              <button className="primary" disabled={!pending.output || !pending.input} onClick={() => void addPending()}>
                {tr("Добавить")}
              </button>
              <button onClick={() => setPending(null)}>{tr("Отмена")}</button>
            </Row>
          )}
        </div>
      ) : null}
    </PanelFrame>
  );
}
