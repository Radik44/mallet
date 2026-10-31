// The map as a tree: Unity's Hierarchy, Unreal's Outliner. The world's
// brushes, the groups, then every entity under its class, children under
// their parent. A row selects (Ctrl adds), double-click opens the properties
// or frames the objects, the eye hides and shows, the lock keeps the objects
// out of selection; dragging an entity row onto another makes it the child
// (its `parentname`), onto the «Энтити» heading detaches it.

import { useEffect, useMemo, useRef, useState } from "react";
import { filterOutline, pathsTo, type OutlineNode } from "../app/outline";
import { Icon, type IconName } from "./Icon";
import { Empty, PanelFrame, Row } from "./kit";
import { t as tr } from "../i18n";

interface Props {
  /** Null while no map is open. */
  nodes: OutlineNode[] | null;
  selectedIds: Set<number>;
  lockedIds: Set<number>;
  hiddenCount: number;
  onSelect(ids: number[], additive: boolean): void;
  /** Double-click on an entity row. */
  onOpen(id: number): void;
  /** Double-click on any other row: select and frame. */
  onFocus(ids: number[]): void;
  onSetHidden(ids: number[], hidden: boolean): void;
  onShowAll(): void;
  onSetLocked(ids: number[], locked: boolean): void;
  /** `parent` null detaches the entity. */
  onReparent(childId: number, parent: string | null): void;
}

const ICONS: Record<OutlineNode["kind"], IconName> = { section: "folder", world: "world", group: "group", class: "entity", entity: "entity" };

export function OutlinerPanel({ nodes, selectedIds, lockedIds, hiddenCount, onSelect, onOpen, onFocus, onSetHidden, onShowAll, onSetLocked, onReparent }: Props) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["section:entities", "section:groups"]));
  const [dropKey, setDropKey] = useState<string | null>(null);
  const dragId = useRef<number | null>(null);
  const shown = useMemo(() => (nodes ? filterOutline(nodes, filter) : []), [nodes, filter]);
  const filtering = filter.trim().length > 0;

  // The rows on the way to the selection unfold by themselves.
  const selectionKey = [...selectedIds].sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (!nodes || !selectedIds.size) return;
    const path = pathsTo(nodes, selectedIds);
    if (!path.size) return;
    setExpanded((s) => {
      const next = new Set(s);
      for (const k of path) next.add(k);
      return next.size === s.size ? s : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, selectionKey]);

  const toggle = (key: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const isSelected = (n: OutlineNode) => (n.kind === "entity" ? selectedIds.has(n.id!) : n.ids.length > 0 && n.ids.every((id) => selectedIds.has(id)));
  const isLocked = (n: OutlineNode) => n.ids.length > 0 && n.ids.every((id) => lockedIds.has(id));

  const rows: { node: OutlineNode; depth: number }[] = [];
  const walk = (list: OutlineNode[], depth: number) => {
    for (const n of list) {
      rows.push({ node: n, depth });
      if (n.children.length && (filtering || expanded.has(n.key))) walk(n.children, depth + 1);
    }
  };
  walk(shown, 0);

  const total = nodes ? nodes[2].count : 0;
  const subtitle = !nodes ? tr("карта не открыта") : tr("{0} брашей · {1} энтити", [nodes[0].count, total]) + (hiddenCount ? tr(" · скрыто: {0}", [hiddenCount]) : "");

  return (
    <PanelFrame
      title={tr("Структура")}
      subtitle={subtitle}
      className="browser outliner"
      actions={
        <button className="icon-btn" onClick={onShowAll} disabled={!hiddenCount} title={tr("Показать всё скрытое (U)")}>
          <Icon name="eye" size={14} />
        </button>
      }
    >
      <Row>
        <input className="grow" placeholder={tr("Имя, класс или id…")} value={filter} onChange={(e) => setFilter(e.target.value)} spellCheck={false} />
        <button className="icon-btn" onClick={onShowAll} disabled={!hiddenCount} title={tr("Показать всё скрытое (U)")}>
          <Icon name="eye" size={14} />
        </button>
        <button className="icon-btn" onClick={() => setExpanded(new Set(["section:entities", "section:groups"]))} title={tr("Свернуть все классы и родителей")}>
          <Icon name="collapse" size={14} />
        </button>
      </Row>
      {!nodes ? (
        <Empty icon="world" title={tr("Карта не открыта")} text={tr("Дерево показывает браши мира, группы и энтити открытой карты.")} />
      ) : !rows.length ? (
        <Empty icon="search" title={tr("Ничего не найдено")} text={tr("Поиск выполняется по имени, классу и id.")} />
      ) : (
        <div
          className="list outline"
          title={tr("Щелчок - выделить (Ctrl - добавить), двойной щелчок - свойства или наведение видов; глаз скрывает, замок блокирует; перетащите энтити на другую, чтобы сделать её дочерней")}
        >
          {rows.map(({ node: n, depth }) => {
            const open = filtering || expanded.has(n.key);
            const selected = isSelected(n);
            const locked = isLocked(n);
            const draggable = n.kind === "entity";
            const dropOk = n.kind === "entity" ? !!n.targetname : n.key === "section:entities";
            return (
              <div
                key={n.key}
                data-key={n.key}
                className={["list-row", "outline-row", n.kind, selected ? "current" : "", n.hidden === "all" ? "is-hidden" : "", dropKey === n.key ? "drop-target" : ""].filter(Boolean).join(" ")}
                style={{ paddingLeft: 6 + depth * 14 }}
                onClick={(ev) => {
                  if ((ev.target as HTMLElement).closest(".outline-ctl")) return;
                  onSelect(n.ids, ev.ctrlKey || ev.metaKey);
                }}
                onDoubleClick={(ev) => {
                  if ((ev.target as HTMLElement).closest(".outline-ctl")) return;
                  if (n.kind === "entity") onOpen(n.id!);
                  else onFocus(n.ids);
                }}
                draggable={draggable}
                onDragStart={(ev) => {
                  if (!draggable) return;
                  dragId.current = n.id!;
                  ev.dataTransfer.setData("text/plain", String(n.id));
                  ev.dataTransfer.effectAllowed = "link";
                }}
                onDragEnd={() => {
                  dragId.current = null;
                  setDropKey(null);
                }}
                onDragOver={(ev) => {
                  if (dragId.current === null || !dropOk || n.id === dragId.current) return;
                  ev.preventDefault();
                  ev.dataTransfer.dropEffect = "link";
                  if (dropKey !== n.key) setDropKey(n.key);
                }}
                onDragLeave={() => {
                  if (dropKey === n.key) setDropKey(null);
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  const child = dragId.current;
                  dragId.current = null;
                  setDropKey(null);
                  if (child === null || !dropOk || n.id === child) return;
                  onReparent(child, n.kind === "entity" ? n.targetname! : null);
                }}
                title={n.kind === "entity" ? `id ${n.id}${n.hidden === "all" ? tr(", скрыта") : ""}` : undefined}
              >
                {n.children.length ? (
                  <button className="outline-ctl outline-chev icon-btn" onClick={() => toggle(n.key)} title={open ? tr("Свернуть") : tr("Развернуть")}>
                    <Icon name={open ? "chevronDown" : "chevronRight"} size={12} />
                  </button>
                ) : (
                  <span className="outline-chev" />
                )}
                <Icon name={ICONS[n.kind]} size={13} />
                <span className="list-text outline-title">{n.title}</span>
                {n.subtitle ? <span className="list-text muted outline-sub">{n.subtitle}</span> : null}
                {n.kind !== "entity" ? <span className="badge muted">{n.count}</span> : n.brush ? <span className="badge muted">{tr("браш")}</span> : null}
                {n.ids.length ? (
                  <>
                    <button
                      className={`outline-ctl icon-btn${locked ? " on" : ""}`}
                      onClick={() => onSetLocked(n.ids, !locked)}
                      title={locked ? tr("Снять блокировку: объекты снова выделяются") : tr("Заблокировать: объекты видны, но не выделяются")}
                    >
                      <Icon name={locked ? "lock" : "unlock"} size={12} />
                    </button>
                    <button
                      className={`outline-ctl icon-btn${n.hidden !== "none" ? " on" : ""}${n.hidden === "some" ? " half" : ""}`}
                      onClick={() => onSetHidden(n.ids, n.hidden === "none")}
                      title={n.hidden === "none" ? tr("Скрыть") : tr("Показать")}
                    >
                      <Icon name={n.hidden === "all" ? "eyeOff" : "eye"} size={12} />
                    </button>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </PanelFrame>
  );
}
