// Version history: every save keeps a dated copy of the map in
// `<dir>/history/`, so a bad session can be rolled back days later, the
// way Unity's or Google Docs' history works. A version opens in place of
// the current map and stays unsaved until Ctrl+S, or is compared with the
// open map object by object: what was added, removed or changed since,
// with a way back for any single object.

import { useState } from "react";
import { Icon } from "./Icon";
import type { HistoryEntry } from "../tauri";
import type { DiffKind, DiffRow } from "../app/mapDiff";
import { Card, Empty, PanelFrame, Row, Segmented } from "./kit";
import { currentLocale, t, tb } from "../i18n";
import { splitUndoLabel } from "../app/undoLabel";

export interface HistoryDiff {
  entry: HistoryEntry;
  rows: DiffRow[];
}

interface Props {
  entries: HistoryEntry[] | null;
  mapName: string;
  keep: number;
  onRefresh(): void;
  onOpen(e: HistoryEntry): void;
  onClear(): void;
  /** The undo steps (oldest first) and redo steps (next first) of the open map. */
  undoLabels: string[];
  redoLabels: string[];
  /** Jumps back (negative) or forward (positive) by that many steps. */
  onJump(delta: number): void;
  /** The comparison of the open map with one version, while it is shown. */
  diff: HistoryDiff | null;
  onCompare(e: HistoryEntry): void;
  onCloseDiff(): void;
  /** Selects and frames the object of a row that exists in the open map. */
  onGoTo(row: DiffRow): void;
  /** Puts the version's object back (removed, changed) or removes an added one. */
  onRevert(row: DiffRow): void;
}

const fmtBytes = (n: number) => (n >= 1 << 20 ? t("{0} МБ", [(n / (1 << 20)).toFixed(1)]) : n >= 1024 ? t("{0} КБ", [Math.round(n / 1024)]) : t("{0} Б", [n]));

/** "сегодня 14:05", "вчера 09:12" or the date, so a list of saves reads at a glance. */
export function fmtWhen(iso: number): string {
  const d = new Date(iso);
  const now = new Date();
  const loc = currentLocale();
  const time = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return t("сегодня {0}", [time]);
  if (diff === 1) return t("вчера {0}", [time]);
  return `${d.toLocaleDateString(loc, { day: "numeric", month: "short" })} ${time}`;
}

type Filter = "all" | DiffKind;

export function HistoryPanel({ entries, mapName, keep, onRefresh, onOpen, onClear, undoLabels, redoLabels, onJump, diff, onCompare, onCloseDiff, onGoTo, onRevert }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = diff
    ? { added: diff.rows.filter((r) => r.kind === "added").length, removed: diff.rows.filter((r) => r.kind === "removed").length, changed: diff.rows.filter((r) => r.kind === "changed").length }
    : null;
  const shown = diff ? diff.rows.filter((r) => filter === "all" || r.kind === filter) : [];
  const kindLabel: Record<DiffKind, string> = { added: t("добавлен"), removed: t("удалён"), changed: t("изменён") };
  const kindTone: Record<DiffKind, string> = { added: "ok", removed: "bad", changed: "warn" };
  return (
    <PanelFrame
      title={t("История")}
      subtitle={mapName ? t("{0} версий, хранятся последние {1}", [entries?.length ?? 0, keep]) : t("карта не сохранена")}
      className="browser"
      actions={
        <>
          <button className="icon-btn" onClick={onRefresh} title={t("Обновить: перечитать папку history")}>
            <Icon name="refresh" />
          </button>
          <button className="icon-btn" onClick={onClear} disabled={!entries?.length} title={t("Удалить все сохранённые версии этой карты")}>
            <Icon name="trash" />
          </button>
        </>
      }
    >
      <Card title={t("Правки")} icon="undo" hint={undoLabels.length ? t("{0} шагов", [undoLabels.length]) : t("правок пока нет")} collapsible id="hist-steps">
        {undoLabels.length || redoLabels.length ? (
          <div className="list steps-list" title={t("Щелчок возвращает карту к этому шагу: выше текущего - отмена, ниже (серым) - повтор")}>
            {undoLabels.slice(-40).map((label, i, arr) => {
              const back = arr.length - 1 - i;
              const step = splitUndoLabel(label);
              return (
                <div key={`u${i}`} className={back === 0 ? "list-row clickable current" : "list-row clickable"} onClick={() => back && onJump(-back)}>
                  {step.assistant ? (
                    <span className="step-mark" title={t("Шаг ассистента")}>
                      ✦
                    </span>
                  ) : (
                    <Icon name="undo" size={12} />
                  )}
                  <span className="list-text grow">{tb(step.text)}</span>
                  {back === 0 ? <span className="badge muted">{t("сейчас")}</span> : null}
                </div>
              );
            })}
            {redoLabels.slice(0, 20).map((label, j) => {
              const step = splitUndoLabel(label);
              return (
                <div key={`r${j}`} className="list-row clickable step-redo" onClick={() => onJump(j + 1)}>
                  {step.assistant ? (
                    <span className="step-mark muted" title={t("Шаг ассистента")}>
                      ✦
                    </span>
                  ) : (
                    <Icon name="redo" size={12} />
                  )}
                  <span className="list-text grow muted">{tb(step.text)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="muted small">{t("Каждая правка карты появится здесь; щелчок по шагу возвращает карту к нему.")}</div>
        )}
      </Card>
      {!entries ? (
        <Empty icon="save" title={t("История доступна в приложении")} />
      ) : !entries.length ? (
        <Empty
          icon="save"
          title={t("Нет сохранённых версий")}
          text={t("При каждом сохранении копия карты записывается в папку history рядом с ней. Щелчок по версии открывает её вместо текущей карты.")}
        />
      ) : (
        <div className="list" title={t("Щелчок открывает версию вместо текущей карты; Ctrl+S сохраняет её как текущую; кнопка справа сравнивает версию с открытой картой")}>
          {entries.map((e) => (
            <div key={e.path} className={diff?.entry.path === e.path ? "list-row clickable current" : "list-row clickable"} onClick={() => onOpen(e)} title={e.path}>
              <Icon name="file" size={13} />
              <span className="list-text grow">{fmtWhen(e.when)}</span>
              <span className="muted">{fmtBytes(e.bytes)}</span>
              <button
                className="icon-btn history-compare"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onCompare(e);
                }}
                title={t("Сравнить с открытой картой: что добавлено, удалено и изменено с этой версии")}
              >
                <Icon name="replace" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {diff && counts ? (
        <Card
          title={t("Изменения с версии {0}", [fmtWhen(diff.entry.when)])}
          icon="replace"
          hint={diff.rows.length ? t("{0} объектов", [diff.rows.length]) : t("различий нет")}
          right={
            <button className="icon-btn" onClick={onCloseDiff} title={t("Закрыть сравнение")}>
              <Icon name="close" size={13} />
            </button>
          }
          className="history-diff"
        >
          {diff.rows.length ? (
            <>
              <Segmented<Filter>
                small
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: t("Все"), count: diff.rows.length },
                  { value: "changed", label: t("Изменены"), count: counts.changed },
                  { value: "added", label: t("Добавлены"), count: counts.added, title: t("Есть в открытой карте, нет в версии") },
                  { value: "removed", label: t("Удалены"), count: counts.removed, title: t("Есть в версии, нет в открытой карте") },
                ]}
              />
              <div className="list diff-list" title={t("Щелчок выделяет объект в карте; «Вернуть» ставит объект из версии на место, «Удалить» убирает добавленный")}>
                {shown.map((r) => (
                  <div key={`${r.object}:${r.id}`} className={r.kind === "removed" ? "list-row diff-row" : "list-row diff-row clickable"} onClick={() => r.kind !== "removed" && onGoTo(r)}>
                    <span className={`badge ${kindTone[r.kind]}`}>{kindLabel[r.kind]}</span>
                    <Icon name={r.object === "entity" ? "entity" : "wedge"} size={12} />
                    <span className="list-text">{r.title}</span>
                    {r.subtitle ? <span className="list-text muted diff-sub">{r.subtitle}</span> : null}
                    {r.detail ? <span className="list-text muted diff-detail">{r.detail}</span> : null}
                    <Row>
                      <button
                        className="icon-btn"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onRevert(r);
                        }}
                        title={r.kind === "added" ? t("Удалить добавленный объект") : r.kind === "removed" ? t("Вернуть объект из версии") : t("Вернуть объект в состояние из версии")}
                      >
                        <Icon name={r.kind === "added" ? "trash" : "undo"} size={13} />
                      </button>
                    </Row>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="muted small">{t("Открытая карта совпадает с этой версией по брашам и энтити.")}</div>
          )}
        </Card>
      ) : null}
    </PanelFrame>
  );
}
