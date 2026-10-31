// Entity report: every entity in the map, filtered by class or targetname,
// as Hammer's Entity Report. A row selects the entity and frames it; a
// double click opens its properties.

import { useMemo, useState } from "react";
import { LIST, useListZoom } from "./lists";
import { Card, Empty, Field, PanelFrame, Row, Segmented } from "./kit";
import { t } from "../i18n";

export interface ReportEntity {
  id: number;
  classname: string;
  targetname: string | null;
  brush: boolean;
  hidden: boolean;
}

interface Props {
  entities: ReportEntity[];
  selectedIds: Set<number>;
  onSelect(e: ReportEntity): void;
  onOpen(e: ReportEntity): void;
  /** Find and replace a key's value on the listed entities (ids given). */
  onReplace(ids: number[], key: string, find: string, replace: string): void;
}

type Kind = "all" | "point" | "brush";

export function EntityReportPanel({ entities, selectedIds, onSelect, onOpen, onReplace }: Props) {
  const [filter, setFilter] = useState("");
  const [key, setKey] = useState("targetname");
  const [find, setFind] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const counts = useMemo(() => ({ point: entities.filter((e) => !e.brush).length, brush: entities.filter((e) => e.brush).length }), [entities]);
  const rows = useMemo(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    return entities
      .filter((e) => (kind === "all" ? true : kind === "brush" ? e.brush : !e.brush))
      .filter((e) => words.every((w) => e.classname.toLowerCase().includes(w) || (e.targetname ?? "").toLowerCase().includes(w) || String(e.id) === w))
      .sort((a, b) => a.classname.localeCompare(b.classname) || (a.targetname ?? "").localeCompare(b.targetname ?? "") || a.id - b.id);
  }, [entities, filter, kind]);
  const zoom = useListZoom(LIST.key, LIST.fallback, LIST.min, LIST.max, LIST.step);
  return (
    <PanelFrame title={t("Энтити")} subtitle={entities.length ? t("{0} из {1}", [rows.length, entities.length]) : t("в карте нет энтити")} className="browser">
      <Row>
        <input className="grow" placeholder={t("Класс, имя или id…")} value={filter} onChange={(e) => setFilter(e.target.value)} spellCheck={false} />
      </Row>
      <Segmented<Kind>
        small
        value={kind}
        onChange={setKind}
        options={[
          { value: "all", label: t("Все"), count: entities.length },
          { value: "point", label: t("Точечные"), count: counts.point, title: t("Свет, пропы, точки старта: энтити без брашей") },
          { value: "brush", label: t("Брашевые"), count: counts.brush, title: t("Триггеры, двери, вода: энтити из брашей") },
        ]}
      />
      {!entities.length ? (
        <Empty icon="entity" title={t("Нет энтити")} text={t("Инструмент «Энтити» размещает свет, пропы и точки старта; выделенные браши можно привязать к энтити через контекстное меню.")} />
      ) : !rows.length ? (
        <Empty icon="search" title={t("Ничего не найдено")} text={t("Поиск выполняется по классу, имени (targetname) и id.")} />
      ) : (
        <div className="list" ref={zoom.ref} style={{ fontSize: zoom.value }} title={t("Щелчок - выделить, двойной щелчок - открыть свойства")}>
          {rows.map((e) => (
            <div
              key={e.id}
              className={selectedIds.has(e.id) ? "list-row current" : "list-row"}
              onClick={() => onSelect(e)}
              onDoubleClick={() => onOpen(e)}
              title={`id ${e.id}${e.hidden ? t(", скрыта") : ""}`}
            >
              <span className="list-kind">{e.classname}</span>
              <span className={e.hidden ? "list-text muted" : "list-text"}>{e.targetname ?? ""}</span>
              {e.brush ? <span className="badge muted">{t("браш")}</span> : null}
            </div>
          ))}
        </div>
      )}
      <Card title={t("Заменить значение ключа")} icon="replace" collapsible defaultOpen={false} id="ent-replace" hint={t("для {0} в списке", [rows.length])}>
        <Field label={t("Ключ")}>
          <input className="grow" value={key} onChange={(e) => setKey(e.target.value)} spellCheck={false} placeholder="targetname" />
        </Field>
        <Field label={t("Найти")}>
          <input className="grow" value={find} onChange={(e) => setFind(e.target.value)} placeholder={t("Подстрока значения")} spellCheck={false} />
        </Field>
        <Field label={t("Заменить на")}>
          <input className="grow" value={replaceWith} onChange={(e) => setReplaceWith(e.target.value)} spellCheck={false} />
        </Field>
        <Row>
          <span className="grow" />
          <button
            className="primary"
            onClick={() =>
              onReplace(
                rows.map((r) => r.id),
                key.trim(),
                find,
                replaceWith,
              )
            }
            disabled={!key.trim() || !find || !rows.length}
            title={t("Заменить подстроку в значении этого ключа у всех энтити в списке")}
          >
            {t("Заменить")}
          </button>
        </Row>
      </Card>
    </PanelFrame>
  );
}
