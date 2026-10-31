// Prefab library: pieces of map (a doorway, a lamp with its light, a
// stair) saved as VMF snippets in the editor's data folder and dropped
// into any map in front of the camera or dragged into a view.

import { useState } from "react";
import type { PrefabInfo } from "../tauri";
import type { DragAsset } from "./assetDrag";
import { Icon } from "./Icon";
import { Card, Empty, PanelFrame, Row } from "./kit";
import { t } from "../i18n";

interface Props {
  prefabs: PrefabInfo[] | null;
  /** Where the files live, for the hint text. */
  dir: string;
  selectedCount: number;
  onRefresh(): void;
  onSave(name: string): void;
  onInsert(p: PrefabInfo): void;
  onDelete(p: PrefabInfo): void;
  onDragAsset?: DragAsset;
}

const fmtBytes = (n: number) => (n >= 1024 ? t("{0} КБ", [Math.round(n / 1024)]) : t("{0} Б", [n]));

export function PrefabsPanel({ prefabs, dir, selectedCount, onRefresh, onSave, onInsert, onDelete, onDragAsset }: Props) {
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const clean = name.trim().replace(/[\\/:*?"<>|]+/g, "_");
  const save = () => {
    if (!clean || !selectedCount) return;
    onSave(clean);
    setName("");
  };
  const shown = (prefabs ?? []).filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <PanelFrame
      title={t("Префабы")}
      subtitle={prefabs ? t("{0} в библиотеке", [prefabs.length]) : t("библиотека")}
      actions={
        <button className="icon-btn" onClick={onRefresh} title={t("Перечитать папку {0}", [dir])}>
          <Icon name="refresh" />
        </button>
      }
    >
      <Card title={t("Сохранить выделение")} icon="save" hint={selectedCount ? t("{0} объектов", [selectedCount]) : t("ничего не выделено")}>
        <Row>
          <input
            className="grow"
            placeholder={selectedCount ? t("имя префаба, например дверь_с_рамой") : t("выделите объекты в видах")}
            value={name}
            disabled={!selectedCount}
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
          <button className="primary" onClick={save} disabled={!clean || !selectedCount} title={t("Сохранить выделенные браши и энтити как префаб")}>
            {t("Сохранить")}
          </button>
        </Row>
      </Card>
      {prefabs && prefabs.length > 6 ? (
        <Row>
          <input className="grow" placeholder={t("Поиск по имени")} value={filter} onChange={(e) => setFilter(e.target.value)} spellCheck={false} />
        </Row>
      ) : null}
      {!prefabs ? (
        <Empty icon="folder" title={t("Библиотека доступна в приложении")} />
      ) : !prefabs.length ? (
        <Empty icon="folder" title={t("Нет префабов")} text={t("Выделите часть карты, введите имя и нажмите «Сохранить». Префаб можно вставить в любую карту или перетащить в вид.")} />
      ) : (
        <div className="prefab-grid">
          {shown.map((p) => (
            <div
              key={p.name}
              className="prefab-tile"
              onDoubleClick={() => onInsert(p)}
              onMouseDown={(e) => onDragAsset?.("prefab", p.name, e)}
              title={t("{0}\nДвойной щелчок - вставить перед камерой; можно перетащить в любой вид", [p.name])}
            >
              <div className="prefab-icon">
                <Icon name="hollow" size={18} />
              </div>
              <div className="prefab-text">
                <span className="list-text">{p.name}</span>
                <span className="muted">{fmtBytes(p.bytes)}</span>
              </div>
              <div className="prefab-actions" onMouseDown={(e) => e.stopPropagation()}>
                <button className="icon-btn" onClick={() => onInsert(p)} title={t("Вставить перед камерой и выделить")}>
                  <Icon name="plus" />
                </button>
                <button className="icon-btn" onClick={() => onDelete(p)} title={t("Удалить файл префаба")}>
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          ))}
          {!shown.length ? <div className="muted">{t("Нет префабов с таким именем")}</div> : null}
        </div>
      )}
    </PanelFrame>
  );
}
