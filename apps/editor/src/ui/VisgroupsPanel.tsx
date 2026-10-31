// Visgroups: Hammer's auto visgroups computed from the map plus the user
// visgroups stored in the VMF. Checkboxes hide and show members; user
// groups can be created from the selection, renamed, filled and deleted.

import { Icon } from "./Icon";
import { useState } from "react";
import { Card, Empty, PanelFrame, Row } from "./kit";
import { t, tb } from "../i18n";

export interface VisGroupInfo {
  id: number;
  name: string;
  color: [number, number, number];
  children: VisGroupInfo[];
  members: number;
  visible: number;
}

export interface AutoVisGroup {
  name: string;
  ids: number[];
  visible: number;
}

interface Props {
  user: VisGroupInfo[];
  auto: AutoVisGroup[];
  hiddenCount: number;
  selectedCount: number;
  onToggleUser(id: number, visible: boolean): void;
  onToggleAuto(index: number, visible: boolean): void;
  onCreate(name: string): void;
  onDelete(id: number): void;
  onRename(id: number, name: string): void;
  onAddSelection(id: number): void;
  onRemoveSelection(id: number): void;
  onSelectMembers(id: number): void;
  onHideSelected(): void;
  onShowAll(): void;
}

function TriCheckbox({ members, visible, onChange }: { members: number; visible: number; onChange(v: boolean): void }) {
  return (
    <input
      type="checkbox"
      checked={members > 0 && visible === members}
      ref={(el) => {
        if (el) el.indeterminate = visible > 0 && visible < members;
      }}
      disabled={members === 0}
      onChange={(e) => onChange(e.target.checked)}
      title={t("{0} из {1} видимы", [visible, members])}
    />
  );
}

function findGroup(groups: VisGroupInfo[], id: number): VisGroupInfo | null {
  for (const g of groups) {
    if (g.id === id) return g;
    const c = findGroup(g.children, id);
    if (c) return c;
  }
  return null;
}

export function VisgroupsPanel(p: Props) {
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const cur = current !== null ? findGroup(p.user, current) : null;
  const create = () => {
    if (!newName.trim()) return;
    p.onCreate(newName.trim());
    setNewName("");
  };

  const renderUser = (groups: VisGroupInfo[], depth: number) =>
    groups.map((g) => (
      <div key={g.id}>
        <div className={current === g.id ? "vg-row current" : "vg-row"} style={{ paddingLeft: 4 + depth * 14 }} onClick={() => setCurrent(g.id)}>
          <TriCheckbox members={g.members} visible={g.visible} onChange={(v) => p.onToggleUser(g.id, v)} />
          <span className="swatch" style={{ background: `rgb(${g.color.join(",")})` }} />
          {renaming?.id === g.id ? (
            <input
              autoFocus
              className="grow"
              value={renaming.name}
              onChange={(e) => setRenaming({ id: g.id, name: e.target.value })}
              onBlur={() => {
                if (renaming.name.trim() && renaming.name !== g.name) p.onRename(g.id, renaming.name.trim());
                setRenaming(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setRenaming(null);
              }}
            />
          ) : (
            <span className="grow vg-name" onDoubleClick={() => setRenaming({ id: g.id, name: g.name })} title={t("Двойной щелчок - переименовать")}>
              {tb(g.name)}
            </span>
          )}
          <span className="badge muted" title={t("Объектов в группе")}>
            {g.members}
          </span>
        </div>
        {renderUser(g.children, depth + 1)}
      </div>
    ));

  return (
    <PanelFrame
      title={t("Группы видимости")}
      subtitle={p.hiddenCount ? t("скрыто {0}", [p.hiddenCount]) : t("скрытых объектов нет")}
      actions={
        <>
          <button className="icon-btn" onClick={p.onHideSelected} disabled={!p.selectedCount} title={t("Скрыть выделенное (H)")}>
            <Icon name="eyeOff" />
          </button>
          <button className="icon-btn" onClick={p.onShowAll} disabled={!p.hiddenCount} title={t("Показать всё скрытое (U)")}>
            <Icon name="eye" />
          </button>
        </>
      }
    >
      <Card title={t("Автоматические")} icon="group" hint={t("по типу объектов")} collapsible id="vg-auto">
        <div className="vg-list">
          {p.auto.map((g, i) => (
            <div className="vg-row" key={g.name}>
              <TriCheckbox members={g.ids.length} visible={g.visible} onChange={(v) => p.onToggleAuto(i, v)} />
              <span className="grow vg-name">{g.name}</span>
              <span className="badge muted">{g.ids.length}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card
        title={t("Мои группы")}
        icon="eye"
        hint={p.user.length ? `${p.user.length}` : t("флажок скрывает группу")}
        right={
          cur ? (
            <>
              <button className="icon-btn" disabled={!p.selectedCount} onClick={() => p.onAddSelection(cur.id)} title={t("Добавить выделение в «{0}»", [cur.name])}>
                <Icon name="plus" />
              </button>
              <button className="icon-btn" disabled={!p.selectedCount} onClick={() => p.onRemoveSelection(cur.id)} title={t("Исключить выделение из «{0}»", [cur.name])}>
                <Icon name="minus" />
              </button>
              <button className="icon-btn" onClick={() => p.onSelectMembers(cur.id)} title={t("Выделить объекты группы «{0}»", [cur.name])}>
                <Icon name="focus" />
              </button>
              <button
                className="icon-btn"
                onClick={() => {
                  p.onDelete(cur.id);
                  setCurrent(null);
                }}
                title={t("Удалить группу «{0}» (объекты остаются)", [cur.name])}
              >
                <Icon name="trash" />
              </button>
            </>
          ) : null
        }
      >
        {p.user.length === 0 ? (
          <Empty
            icon="group"
            title={t("Нет пользовательских групп")}
            text={t("Выделите объекты, введите имя группы и нажмите «Создать». Группу можно скрывать флажком, пополнять и выделять целиком.")}
          />
        ) : (
          <div className="vg-list">{renderUser(p.user, 0)}</div>
        )}
        <Row>
          <input
            className="grow"
            placeholder={p.selectedCount ? t("имя группы для {0} выделенных", [p.selectedCount]) : t("имя новой группы")}
            value={newName}
            spellCheck={false}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
          />
          <button className="primary" disabled={!newName.trim()} onClick={create} title={t("Создать группу из выделения")}>
            {t("Создать")}
          </button>
        </Row>
      </Card>
    </PanelFrame>
  );
}
