// Notes pinned to the map: a to-do list that knows where each item is.
// Add one at the selection (or at the camera), click to fly there, tick it
// off when done, edit the text in place. Stored in the project's sidecar.

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { sortNotes, type MapNote } from "../app/notes";
import { Empty, PanelFrame, Row, Segmented } from "./kit";
import { currentLocale, t } from "../i18n";

interface Props {
  /** Null while no map is open. */
  notes: MapNote[] | null;
  onAdd(): void;
  onToggle(id: number, done: boolean): void;
  onText(id: number, text: string): void;
  onRemove(id: number): void;
  onGo(note: MapNote): void;
}

type Filter = "open" | "all" | "done";

function NoteText({ value, onCommit }: { value: string; onCommit(v: string): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="grow note-text"
      value={draft}
      placeholder={t("Текст заметки")}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

export function NotesPanel({ notes, onAdd, onToggle, onText, onRemove, onGo }: Props) {
  const [filter, setFilter] = useState<Filter>("open");
  const all = notes ? sortNotes(notes) : [];
  const open = all.filter((n) => !n.done).length;
  const shown = all.filter((n) => (filter === "all" ? true : filter === "done" ? n.done : !n.done));
  const when = (ms: number) => new Date(ms).toLocaleDateString(currentLocale(), { day: "numeric", month: "short" });
  return (
    <PanelFrame
      title={t("Заметки")}
      subtitle={!notes ? t("карта не открыта") : notes.length ? t("{0} открытых из {1}", [open, notes.length]) : t("заметок нет")}
      className="browser"
      actions={
        <button className="icon-btn" onClick={onAdd} disabled={!notes} title={t("Добавить заметку у выделения или у камеры (Ctrl+Shift+N)")}>
          <Icon name="plus" size={14} />
        </button>
      }
    >
      <Row wrap>
        <Segmented<Filter>
          small
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: t("Открытые"), count: open },
            { value: "done", label: t("Сделанные"), count: all.length - open },
            { value: "all", label: t("Все"), count: all.length },
          ]}
        />
        <span className="grow" />
        <button className="primary" onClick={onAdd} disabled={!notes} title={t("Добавить заметку у выделения или у камеры (Ctrl+Shift+N)")}>
          {t("Добавить")}
        </button>
      </Row>
      {!notes ? (
        <Empty icon="text" title={t("Карта не открыта")} text={t("Заметки привязаны к месту на карте и хранятся в файле проекта рядом с ней.")} />
      ) : !shown.length ? (
        <Empty
          icon="text"
          title={all.length ? t("В этом списке пусто") : t("Заметок пока нет")}
          text={t("Заметка - метка на карте с текстом: «тут утечка», «сюда проп». Она видна в 3D-виде и в этом списке; щелчок по строке наводит виды.")}
        />
      ) : (
        <div className="list notes-list">
          {shown.map((n) => (
            <div key={n.id} className={n.done ? "list-row note-row done" : "list-row note-row"}>
              <input type="checkbox" checked={n.done} onChange={(e) => onToggle(n.id, e.target.checked)} title={n.done ? t("Снова открыть") : t("Сделано")} />
              <NoteText value={n.text} onCommit={(v) => onText(n.id, v)} />
              <span className="muted note-when" title={`${n.pos.join(" ")} · ${new Date(n.when).toLocaleString(currentLocale())}`}>
                {when(n.when)}
              </span>
              <button className="icon-btn" onClick={() => onGo(n)} title={t("Навести виды на место заметки")}>
                <Icon name="focus" size={13} />
              </button>
              <button className="icon-btn" onClick={() => onRemove(n.id)} title={t("Удалить заметку")}>
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </PanelFrame>
  );
}
