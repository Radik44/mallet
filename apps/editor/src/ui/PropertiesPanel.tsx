// Entity properties: Hammer's Object Properties dialog as a docked panel.
// SmartEdit shows the FGD keys with typed editors (choices, flags, colours),
// raw mode shows the bare key-values; the Outputs tab edits connections.
// Every change is applied to the document at once and is one undo step.

import { connectionWarnings } from "../app/ioCheck";
import { useEffect, useState } from "react";
import type { ClassDef, ClassEntry, IoDef, KeyDef } from "../tauri";
import { Select } from "./Select";
import { ColorField } from "./ColorField";
import { AngleField } from "./AngleField";
import { ruClassDescription, ruKeyHelp, ruKeyName } from "./ru";
import { Empty, PanelFrame, Row, Segmented } from "./kit";
import { t as tr } from "../i18n";

export interface Connection {
  output: string;
  target: string;
  input: string;
  parameter: string;
  delay: number;
  times_to_fire: number;
}

export interface EntityDetails {
  id: number;
  classname: string;
  keyvalues: [string, string][];
  connections: Connection[];
  brush: boolean;
}

interface Props {
  details: EntityDetails | null;
  classDef: ClassDef | null;
  classList: ClassEntry[];
  targetnames: string[];
  /** Inputs of the class the target name refers to, for suggestions. */
  inputsFor(target: string): Promise<IoDef[]>;
  onSetKeys(changes: [string, string | null][]): void;
  onSetConnections(connections: Connection[]): void;
  /** Eyedropper for target keys: the next click on an entity fills `key`. */
  onPickTarget?(key: string): void;
  /** Opens the model browser; its next pick fills `key`. */
  onPickModel?(key: string): void;
  /** Inside the inspector: no frame of its own, the tabs sit at the top of the body. */
  embedded?: boolean;
  /** The panel's own title and subtitle, for the map's worldspawn. */
  title?: string;
  subtitle?: string;
  /** No outputs tab: worldspawn has none. */
  noOutputs?: boolean;
  /** Fires the output's input in the running game (ent_fire through the bridge); absent while no game is connected. */
  onTestOutput?(c: Connection): void;
}

/** Text input that commits on blur or Enter, and follows the value it is given. */
function TextField({
  value,
  placeholder,
  title,
  list,
  disabled,
  onCommit,
  className,
}: {
  value: string;
  placeholder?: string;
  title?: string;
  list?: string;
  disabled?: boolean;
  className?: string;
  onCommit(v: string): void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      className={className}
      value={draft}
      placeholder={placeholder}
      title={title}
      list={list}
      disabled={disabled}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(value);
      }}
    />
  );
}

export function PropertiesPanel({
  details,
  classDef,
  classList,
  targetnames,
  inputsFor,
  onSetKeys,
  onSetConnections,
  onPickTarget,
  onPickModel,
  embedded,
  title,
  subtitle,
  noOutputs,
  onTestOutput,
}: Props) {
  const [tab, setTab] = useState<"keys" | "outputs">("keys");
  const [smart, setSmart] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [inputLists, setInputLists] = useState<Record<string, IoDef[]>>({});

  // Resolve input suggestions for every distinct target once.
  useEffect(() => {
    if (!details) return;
    for (const c of details.connections) {
      const t = c.target;
      if (!t || t in inputLists) continue;
      setInputLists((m) => ({ ...m, [t]: [] }));
      void inputsFor(t).then((list) => setInputLists((m) => ({ ...m, [t]: list })));
    }
  }, [details, inputLists, inputsFor]);

  if (!details) {
    return (
      <PanelFrame title={title ?? tr("Свойства")}>
        <Empty
          icon="entity"
          title={title ? tr("Карта не открыта") : tr("Ничего не выбрано")}
          text={title ? tr("Свойства карты доступны после её открытия.") : tr("Выделите энтити в любом виде, чтобы увидеть её ключи и выходы.")}
        />
      </PanelFrame>
    );
  }

  const kv = new Map(details.keyvalues.map(([k, v]) => [k.toLowerCase(), v]));
  const valueOf = (k: string) => kv.get(k.toLowerCase());
  const defined = new Set((classDef?.keys ?? []).map((k) => k.name.toLowerCase()));
  const extra = details.keyvalues.filter(([k]) => !defined.has(k.toLowerCase()));

  const renderKey = (k: KeyDef) => {
    const raw = valueOf(k.name);
    const value = raw ?? k.default ?? "";
    const label = ruKeyName(k.name, k.display);
    const help = ruKeyHelp(k.name, k.help);
    const title = `${label}\n${k.name} (${k.ty})${help ? `. ${help}` : ""}`;
    const set = (v: string) => onSetKeys([[k.name, v]]);
    let editor: React.ReactNode;
    if (k.ty === "choices") {
      const known = k.choices.some(([v]) => v === value);
      editor = (
        <Select
          value={value}
          title={title}
          disabled={k.readonly}
          options={[...(known ? [] : [{ value, label: value || tr("(пусто)") }]), ...k.choices.map(([v, d]) => ({ value: v, label: d, hint: v }))]}
          onChange={set}
        />
      );
    } else if (k.ty === "flags") {
      const bits = Number.parseInt(value, 10) || 0;
      editor = (
        <div className="flags" title={title}>
          {k.flags.map(([bit, display]) => (
            <label key={bit}>
              <input type="checkbox" checked={(bits & bit) !== 0} onChange={(e) => set(String(e.target.checked ? bits | bit : bits & ~bit))} />
              {display}
            </label>
          ))}
        </div>
      );
    } else if (k.ty === "color255" || k.ty === "color1") {
      // Light keys carry brightness as the fourth number; the picker shows it as a slider.
      const withBrightness = /^_light|^_ambient|^_lighthdr|^_ambienthdr/i.test(k.name) || (k.default ?? "").trim().split(/\s+/).length >= 4;
      editor = <ColorField value={raw ?? ""} placeholder={k.default ?? ""} title={title} disabled={k.readonly} scale={k.ty === "color1" ? 1 : 255} brightness={withBrightness} onCommit={set} />;
    } else if (k.ty === "angle") {
      editor = <AngleField value={raw ?? ""} placeholder={k.default ?? "0 0 0"} title={tr("{0}\nтангаж, рыскание, крен", [title])} disabled={k.readonly} onCommit={set} />;
    } else if (k.ty === "studio" && onPickModel && !k.readonly) {
      editor = (
        <div className="with-swatch">
          <TextField className="grow" value={raw ?? ""} placeholder={k.default ?? ""} title={title} onCommit={set} />
          <button className="model-pick-btn" onClick={() => onPickModel(k.name)} title={tr("Открыть браузер моделей: выбранная модель будет записана в этот ключ (Esc - отмена)")}>
            {tr("Выбрать…")}
          </button>
        </div>
      );
    } else {
      const list = k.ty.startsWith("target_") ? "gme-targetnames" : undefined;
      editor =
        list && onPickTarget && !k.readonly ? (
          <div className="with-swatch">
            <TextField className="grow" value={raw ?? ""} placeholder={k.default ?? ""} title={title} list={list} disabled={k.readonly} onCommit={set} />
            <button onClick={() => onPickTarget(k.name)} title={tr("Пипетка: щёлкните по энтити в любом виде, чтобы подставить её имя (Esc - отмена)")}>
              ⌖
            </button>
          </div>
        ) : (
          <TextField value={raw ?? ""} placeholder={k.default ?? ""} title={title} list={list} disabled={k.readonly} onCommit={set} />
        );
    }
    return (
      <div className={raw === undefined ? "props-row muted" : "props-row"} key={k.name}>
        <span className="key-label" title={title}>
          {label}
          {help && (
            <span className="help-mark" title={`${label}\n${help}`}>
              ?
            </span>
          )}
        </span>
        {editor}
      </div>
    );
  };

  const conns = details.connections;
  const updateConn = (i: number, patch: Partial<Connection>) => {
    const next = conns.map((c, j) => (j === i ? { ...c, ...patch } : c));
    onSetConnections(next);
  };

  const keys = (
    <>
      <div className="props-row">
        <span>{tr("Класс")}</span>
        <TextField value={details.classname} list="gme-classes-props" onCommit={(v) => onSetKeys([["classname", v]])} />
      </div>
      {classDef && !classDef.found && classList.length > 0 && (
        <div className="muted pad small" title={tr("Класс отсутствует в FGD: проверьте имя или оставьте как есть, если класс из аддона")}>
          {tr("Класс не описан в FGD")}
        </div>
      )}
      {classDef?.description && <div className="muted pad small">{ruClassDescription(details.classname, classDef.description)}</div>}
      <div className="props-list">
        {smart && classDef?.keys.map(renderKey)}
        {smart && extra.length > 0 && <div className="muted pad small">{tr("Другие ключи")}</div>}
        {(smart ? extra : details.keyvalues).map(([k, v]) => (
          <div className="props-row" key={k}>
            <span title={k}>{k}</span>
            <div className="with-swatch">
              <TextField className="grow" value={v} onCommit={(nv) => onSetKeys([[k, nv]])} />
              <button className="icon-btn" title={tr("Удалить ключ")} onClick={() => onSetKeys([[k, null]])}>
                ✕
              </button>
            </div>
          </div>
        ))}
        <div className="props-row props-mode">
          <span />
          <button
            className="link"
            onClick={() => setSmart(!smart)}
            title={smart ? tr("Показать все ключи как есть, без описаний из FGD (SmartEdit выключен)") : tr("Показать ключи с названиями и подсказками из FGD (SmartEdit)")}
          >
            {smart ? tr("Исходные ключи") : tr("Ключи по FGD")}
          </button>
        </div>
        <div className="props-row">
          <input placeholder={tr("Ключ")} value={newKey} spellCheck={false} onChange={(e) => setNewKey(e.target.value)} />
          <div className="with-swatch">
            <input className="grow" placeholder={tr("Значение")} value={newValue} spellCheck={false} onChange={(e) => setNewValue(e.target.value)} />
            <button
              disabled={!newKey.trim()}
              onClick={() => {
                onSetKeys([[newKey.trim(), newValue]]);
                setNewKey("");
                setNewValue("");
              }}
            >
              +
            </button>
          </div>
        </div>
      </div>
    </>
  );
  const addConn = () => onSetConnections([...conns, { output: classDef?.outputs[0]?.name ?? "OnUser1", target: "", input: "", parameter: "", delay: 0, times_to_fire: -1 }]);
  const outputsTab = (
    <div className="props-list io-list">
      {!conns.length && (
        <Empty
          icon="link"
          title={tr("Нет выходов")}
          text={tr("Выход связывает событие этой энтити (нажатие кнопки, вход в триггер) с действием другой энтити: открыть дверь, включить свет.")}
          action={
            <button className="primary" onClick={addConn}>
              {tr("Добавить выход")}
            </button>
          }
        />
      )}
      {conns.map((c, i) => {
        const outputs = classDef?.outputs ?? [];
        const inputs = inputLists[c.target] ?? [];
        const warnings = connectionWarnings(
          c,
          outputs.map((o) => o.name),
          inputs.map((x) => x.name),
          // Source also reaches entities by classname.
          [...targetnames, ...classList.map((x) => x.classname)],
        );
        return (
          <div className={warnings.length ? "io-card io-bad" : "io-card"} key={i}>
            <div className="io-line">
              <span className="muted io-word">{tr("Выход")}</span>
              <Select
                className="grow"
                value={c.output}
                options={[...(outputs.some((o) => o.name === c.output) ? [] : [{ value: c.output, label: c.output }]), ...outputs.map((o) => ({ value: o.name, label: o.name, hint: o.help }))]}
                onChange={(v) => updateConn(i, { output: v })}
                title={outputs.find((o) => o.name === c.output)?.help}
              />
              {onTestOutput && (
                <button className="icon-btn" title={tr("Проверить в игре: ent_fire {0} {1}{2}", [c.target, c.input, c.parameter ? ` ${c.parameter}` : ""])} onClick={() => onTestOutput(c)}>
                  ▶
                </button>
              )}
              <button className="icon-btn" title={tr("Удалить выход")} onClick={() => onSetConnections(conns.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
            <div className="io-line">
              <span className="muted io-word">{tr("Цель")}</span>
              <TextField className="grow" value={c.target} placeholder={tr("имя энтити")} list="gme-targetnames" onCommit={(v) => updateConn(i, { target: v })} />
            </div>
            <div className="io-line">
              <span className="muted io-word">{tr("Вход")}</span>
              <TextField className="grow" value={c.input} placeholder={tr("вход")} list={`gme-inputs-${i}`} onCommit={(v) => updateConn(i, { input: v })} />
              <datalist id={`gme-inputs-${i}`}>
                {inputs.map((inp) => (
                  <option key={inp.name} value={inp.name}>
                    {inp.help}
                  </option>
                ))}
              </datalist>
              <TextField className="io-param" value={c.parameter} placeholder={tr("параметр")} onCommit={(v) => updateConn(i, { parameter: v })} />
            </div>
            {warnings.map((w) => (
              <div className="io-warn" key={w}>
                ⚠ {w} {tr("- в игре эта связь не сработает")}
              </div>
            ))}
            <div className="io-line">
              <span className="muted io-word">{tr("Через")}</span>
              <TextField className="io-delay" value={String(c.delay)} onCommit={(v) => updateConn(i, { delay: Number(v) || 0 })} />
              <span className="muted">{tr("с")}</span>
              <span className="grow" />
              <label className="chk" title={tr("Срабатывать только один раз")}>
                <input type="checkbox" checked={c.times_to_fire === 1} onChange={(e) => updateConn(i, { times_to_fire: e.target.checked ? 1 : -1 })} /> {tr("Один раз")}
              </label>
            </div>
          </div>
        );
      })}
      {conns.length > 0 && (
        <Row>
          <button onClick={addConn}>{tr("Добавить выход")}</button>
        </Row>
      )}
    </div>
  );
  const tabs = noOutputs ? null : (
    <Segmented<"keys" | "outputs">
      small
      value={tab}
      onChange={setTab}
      options={[
        { value: "keys", label: tr("Ключи") },
        { value: "outputs", label: tr("Выходы"), count: conns.length || undefined },
      ]}
    />
  );
  const body = (
    <>
      <datalist id="gme-targetnames">
        {targetnames.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {tab === "keys" || noOutputs ? keys : outputsTab}
      <datalist id="gme-classes-props">
        {classList.map((c) => (
          <option key={c.classname} value={c.classname}>
            {c.description}
          </option>
        ))}
      </datalist>
    </>
  );
  if (embedded) {
    return (
      <div className="props-embedded">
        <div className="props-tabs">{tabs}</div>
        {body}
      </div>
    );
  }
  return (
    <PanelFrame title={title ?? tr("Свойства")} subtitle={subtitle ?? `${details.classname} · id ${details.id}`} actions={tabs} className="browser">
      {body}
    </PanelFrame>
  );
}
