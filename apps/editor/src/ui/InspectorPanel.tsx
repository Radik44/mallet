// Inspector: everything about the selection in one place, the way Unity's
// inspector shows a game object. One brush shows its size, position and
// materials; one entity shows its properties sheet; several objects show
// counts and the actions that apply to all of them.

import { ExprField } from "./ExprField";
import { Icon, type IconName } from "./Icon";
import { Fragment, useEffect, useState } from "react";
import { instanceReplacements, replacementChanges, type InstanceParm } from "../map/instances";
import type { ClassDef, ClassEntry, IoDef } from "../tauri";
import { PropertiesPanel, type Connection, type EntityDetails } from "./PropertiesPanel";
import { AngleField } from "./AngleField";
import { LightCard, isLightClass } from "./LightCard";
import { t } from "../i18n";
import { generatorFields, type GeneratorRecord } from "../app/generators";
import { SHAPE_NAMES } from "../app/constants";

export interface InspectorItem {
  id: number;
  kind: "solid" | "entity";
  /** Axis-aligned bounds, when known. */
  bounds: [[number, number, number], [number, number, number]] | null;
  classname: string;
  targetname: string | null;
  /** Owning brush entity of a solid, 0 for world brushes. */
  owner: number;
  /** Materials of a brush with face counts. */
  materials: [string, number][];
  group: number;
  model: string | null;
  /** `file` of a func_instance, or null. */
  instanceFile: string | null;
  /** Parameters the instance file declares (func_instance_parms). */
  parms: InstanceParm[];
}

/** One instance parameter row: the value lives in a replaceNN key. */
function ParmField({ parm, value, onCommit }: { parm: InstanceParm; value: string; onCommit(v: string): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (parm.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={(draft || parm.def) === "1"}
        onChange={(e) => {
          const v = e.target.checked ? "1" : "0";
          setDraft(v);
          onCommit(v);
        }}
      />
    );
  }
  return (
    <input
      value={draft}
      placeholder={parm.def}
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

/** Keys shared by several selected entities; `value` is null where they differ. */
export interface MultiEdit {
  ids: number[];
  classes: string[];
  keys: { key: string; value: string | null }[];
}

/** A text that commits on blur or Enter, following the value it is given. */
function KeyField({ value, placeholder, onCommit }: { value: string; placeholder?: string; onCommit(v: string): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="grow"
      value={draft}
      placeholder={placeholder}
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

/** Hammer's multi-entity Object Properties as a card: shared keys, differing ones shown empty. */
function MultiCard({ multi, onSet }: { multi: MultiEdit; onSet(ids: number[], key: string, value: string | null): void }) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  return (
    <Card icon="entity" title={t("Общие свойства")} sub={t("{0} энтити · {1}", [multi.ids.length, multi.classes.join(", ")])}>
      {multi.keys.map((k) => (
        <div className="insp-row" key={k.key}>
          <span className="muted list-text" title={k.key}>
            {k.key}
          </span>
          <KeyField value={k.value ?? ""} placeholder={k.value === null ? t("разные значения") : ""} onCommit={(v) => onSet(multi.ids, k.key, v)} />
          {k.key !== "classname" ? (
            <button className="icon-btn" onClick={() => onSet(multi.ids, k.key, null)} title={t("Убрать ключ у всех выделенных энтити")}>
              <Icon name="trash" size={12} />
            </button>
          ) : null}
        </div>
      ))}
      <div className="insp-row">
        <input className="insp-newkey" value={newKey} placeholder={t("Ключ")} spellCheck={false} onChange={(e) => setNewKey(e.target.value)} />
        <input className="grow" value={newValue} placeholder={t("Значение")} spellCheck={false} onChange={(e) => setNewValue(e.target.value)} />
        <button
          className="icon-btn"
          disabled={!newKey.trim()}
          onClick={() => {
            onSet(multi.ids, newKey.trim(), newValue);
            setNewKey("");
            setNewValue("");
          }}
          title={t("Задать ключ всем выделенным энтити")}
        >
          <Icon name="plus" size={12} />
        </button>
      </div>
      <div className="muted small">{t("Изменение применяется ко всем выделенным энтити одним шагом отмены; поле без значения - у энтити разные значения.")}</div>
    </Card>
  );
}

interface Props {
  multi?: MultiEdit | null;
  onSetMultiKey?(ids: number[], key: string, value: string | null): void;
  /** The parametric group the selection belongs to, if it was made by the block tool's cylinder, sphere, arch or stairs. */
  generator?: GeneratorRecord | null;
  onGenerate?(rec: GeneratorRecord, patch: Partial<GeneratorRecord>): void;
  onDetachGenerator?(rec: GeneratorRecord): void;
  items: InspectorItem[];
  /** Properties of the one selected entity (or the owner of the selected brushes), if any. */
  details: EntityDetails | null;
  classDef: ClassDef | null;
  classList: ClassEntry[];
  targetnames: string[];
  inputsFor(target: string): Promise<IoDef[]>;
  onSetKeys(changes: [string, string | null][]): void;
  onSetConnections(connections: Connection[]): void;
  /** Fires an output in the running game; absent while no game is connected. */
  onTestOutput?(c: Connection): void;
  /** Moves the whole selection so its centre lands on `centre`. */
  onMoveCentre(centre: [number, number, number]): void;
  /** Scales the selection about its centre so its box gets this size. */
  onResize(size: [number, number, number]): void;
  onApplyMaterial(): void;
  onPickMaterial(material: string): void;
  onTie(): void;
  onMoveToWorld(): void;
  onHide(): void;
  onDelete(): void;
  onFocus(): void;
  /** Collapse Instance for selected func_instance entities. */
  onCollapse(): void;
  /** Eyedropper for target keys in the properties sheet. */
  onPickTarget?(key: string): void;
  /** Opens the model browser; its next pick fills `key` of the selected entity. */
  onPickModel?(key: string): void;
  currentMaterial: string;
  /** Faces picked with the texture tool, and the material of the first. */
  faceCount?: number;
  faceMaterial?: string | null;
  /** Opens the face editor (the textures panel). */
  onFaceEditor?(): void;
}

function AxisField({ value, onCommit, axis, step }: { value: number; onCommit(v: number): void; axis?: string; step?: number }) {
  return (
    <label className="insp-axis" data-axis={axis}>
      <ExprField value={value} step={step} onCommit={onCommit} />
    </label>
  );
}

/** A Unity-style component card: icon, title, optional subtitle, body. */
function Card({ icon, title, sub, children, right }: { icon: IconName; title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="insp-card">
      <div className="insp-head">
        <Icon name={icon} size={14} />
        <strong>{title}</strong>
        {sub && (
          <span className="muted list-text" title={sub}>
            {sub}
          </span>
        )}
        <span className="grow" />
        {right}
      </div>
      {children}
    </section>
  );
}

const AXES = ["X", "Y", "Z"] as const;

function unionBounds(items: InspectorItem[]): [[number, number, number], [number, number, number]] | null {
  let out: [[number, number, number], [number, number, number]] | null = null;
  for (const it of items) {
    if (!it.bounds) continue;
    if (!out) out = [[...it.bounds[0]], [...it.bounds[1]]];
    else {
      for (let k = 0; k < 3; k++) {
        out[0][k] = Math.min(out[0][k], it.bounds[0][k]);
        out[1][k] = Math.max(out[1][k], it.bounds[1][k]);
      }
    }
  }
  return out;
}

const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 1e-4 ? String(Math.round(v)) : v.toFixed(2));

export function InspectorPanel(p: Props) {
  const { items, generator, onGenerate, onDetachGenerator, multi, onSetMultiKey } = p;
  if (!items.length) {
    return (
      <aside className="panel">
        <div className="panel-head">
          <strong>{t("Инспектор")}</strong>
        </div>
        <div className="kit-empty">
          <div className="kit-empty-title">{t("Ничего не выбрано")}</div>
          <div className="kit-empty-text">{t("Выделите браш или энтити в любом виде, чтобы увидеть размеры, материалы и свойства.")}</div>
        </div>
      </aside>
    );
  }
  const bounds = unionBounds(items);
  const solids = items.filter((i) => i.kind === "solid");
  const entities = items.filter((i) => i.kind === "entity");
  const materials = new Map<string, number>();
  for (const s of solids) for (const [m, n] of s.materials) materials.set(m, (materials.get(m) ?? 0) + n);
  const title =
    items.length === 1
      ? items[0].kind === "solid"
        ? items[0].owner
          ? t("Браш {0} энтити {1}", [items[0].id, items[0].classname])
          : t("Браш {0}", [items[0].id])
        : `${items[0].classname}${items[0].targetname ? ` «${items[0].targetname}»` : ""}`
      : t("{0} объектов: {1} брашей, {2} энтити", [items.length, solids.length, entities.length]);
  const centre: [number, number, number] | null = bounds ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2, (bounds[0][2] + bounds[1][2]) / 2] : null;
  const size = bounds ? bounds[1].map((v, i) => v - bounds[0][i]) : null;

  return (
    <aside className="panel">
      <div className="panel-head">
        <strong>{t("Инспектор")}</strong>
        <span className="muted grow list-text" title={title}>
          {title}
        </span>
        <button onClick={p.onFocus} title={t("Сфокусировать виды на выделении (Ctrl+E)")}>
          <Icon name="focus" />
        </button>
      </div>
      {generator ? (
        <Card
          icon="stairs"
          title={t("Генератор")}
          sub={SHAPE_NAMES[generator.kind]}
          right={
            <button className="icon-btn" onClick={() => onDetachGenerator?.(generator)} title={t("Разобрать: оставить браши как есть и забыть параметры")}>
              <Icon name="ungroup" size={13} />
            </button>
          }
        >
          {generatorFields(generator.kind).map((f) =>
            f === "reverse" ? (
              <div className="insp-row" key={f}>
                <span className="muted">{t("Направление")}</span>
                <label className="chk">
                  <input type="checkbox" checked={generator.reverse} onChange={(e) => onGenerate?.(generator, { reverse: e.target.checked })} /> {t("В обратную сторону")}
                </label>
              </div>
            ) : (
              <div className="insp-row" key={f}>
                <span className="muted">{f === "sides" ? t("Стороны") : f === "wall" ? t("Стенка") : f === "arc" ? t("Дуга") : t("Ступень")}</span>
                <ExprField value={generator[f]} step={f === "arc" ? 15 : 1} onCommit={(v) => onGenerate?.(generator, { [f]: v })} />
              </div>
            ),
          )}
          <div className="muted small">{t("Браши перестраиваются в текущих границах группы; ручные правки вершин при этом теряются.")}</div>
        </Card>
      ) : null}
      {bounds &&
        centre &&
        size &&
        (() => {
          // One entity: its own angles and model scale are editable keys.
          const one = items.length === 1 && items[0].kind === "entity" && p.details ? p.details : null;
          const kv = (key: string) => one?.keyvalues.find(([k]) => k.toLowerCase() === key)?.[1];
          const angles = (kv("angles") ?? "0 0 0").split(/\s+/).map(Number);
          const scale = Number(kv("modelscale") ?? 1) || 1;
          const hasModel = !!(one && items[0].model);
          return (
            <Card icon="move" title={t("Трансформ")} sub={items.length === 1 ? (items[0].kind === "solid" ? t("браш") : items[0].classname) : t("{0} объектов", [items.length])}>
              <div className="insp-grid">
                <span className="muted">{t("Позиция")}</span>
                {([0, 1, 2] as const).map((k) => (
                  <AxisField
                    key={k}
                    axis={AXES[k]}
                    value={Math.round(centre[k] * 100) / 100}
                    onCommit={(v) => {
                      const c: [number, number, number] = [...centre];
                      c[k] = v;
                      p.onMoveCentre(c);
                    }}
                  />
                ))}
                {one && (
                  <>
                    <span className="muted" title={t("Pitch, yaw, roll в градусах (ключ angles)")}>
                      {t("Поворот")}
                    </span>
                    {([0, 1, 2] as const).map((k) => (
                      <AxisField
                        key={k}
                        axis={AXES[k]}
                        step={15}
                        value={Math.round((angles[k] || 0) * 100) / 100}
                        onCommit={(v) => {
                          const a = [...angles];
                          a[k] = v;
                          p.onSetKeys([["angles", a.map((n) => (Number.isFinite(n) ? n : 0)).join(" ")]]);
                        }}
                      />
                    ))}
                    <span className="muted" title={t("Диск поворота по горизонтали и ползунок наклона")}>
                      {t("Направление")}
                    </span>
                    <div className="insp-span3">
                      <AngleField value={kv("angles") ?? ""} placeholder="0 0 0" onCommit={(v) => p.onSetKeys([["angles", v]])} />
                    </div>
                  </>
                )}
                {hasModel && (
                  <>
                    <span className="muted" title={t("Масштаб модели: 1 - исходный, 2 - вдвое больше; при сборке prop_static будет заменён на prop_dynamic")}>
                      {t("Масштаб")}
                    </span>
                    <AxisField axis="×" step={0.1} value={scale} onCommit={(v) => p.onSetKeys([["modelscale", v > 0 ? String(v) : "1"]])} />
                    <span className="muted insp-note">
                      {Math.abs(scale - 1) > 1e-6 && items[0].classname.toLowerCase() === "prop_static" ? t("при сборке станет prop_dynamic") : t("только равномерный")}
                    </span>
                  </>
                )}
                {solids.length > 0 && !one && (
                  <>
                    <span className="muted" title={t("Размер рамки выделения; изменение масштабирует браши относительно центра")}>
                      {t("Размер")}
                    </span>
                    {([0, 1, 2] as const).map((k) => (
                      <AxisField
                        key={k}
                        axis={AXES[k]}
                        value={Math.round(size[k] * 100) / 100}
                        onCommit={(v) => {
                          if (v <= 0) return;
                          const next: [number, number, number] = [size[0], size[1], size[2]];
                          next[k] = v;
                          p.onResize(next);
                        }}
                      />
                    ))}
                  </>
                )}
                {one && !hasModel && (
                  <>
                    <span className="muted">{t("Размер")}</span>
                    <span className="muted">{fmt(size[0])}</span>
                    <span className="muted">{fmt(size[1])}</span>
                    <span className="muted">{fmt(size[2])}</span>
                  </>
                )}
              </div>
            </Card>
          );
        })()}
      {materials.size > 0 && (
        <Card
          icon="grid"
          title={t("Материалы")}
          sub={t("{0} граней", [Array.from(materials.values()).reduce((a, b) => a + b, 0)])}
          right={
            <button onClick={p.onApplyMaterial} title={t("Применить {0} ко всем граням выделенных брашей", [p.currentMaterial])}>
              {t("Применить текущий")}
            </button>
          }
        >
          {Array.from(materials.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([m, n]) => (
              <div key={m} className="list-row" onClick={() => p.onPickMaterial(m)} title={t("Сделать текущим материалом")}>
                <span className="list-text">{m}</span>
                <span className="muted">{n}</span>
              </div>
            ))}
        </Card>
      )}
      {multi && onSetMultiKey ? <MultiCard multi={multi} onSet={onSetMultiKey} /> : null}
      {items.length === 1 && items[0].parms.length > 0 && p.details && (
        <div className="inspector-section">
          <div className="panel-current">
            <strong>{t("Параметры инстанса")}</strong>
            <span className="muted grow list-text" title={items[0].instanceFile ?? ""}>
              {items[0].instanceFile}
            </span>
          </div>
          <div className="face-grid parm-grid">
            {items[0].parms.map((parm) => {
              const set = instanceReplacements(p.details!.keyvalues);
              const value = set.get(parm.name) ?? "";
              return (
                <Fragment key={parm.name}>
                  <span className="list-text" title={t("{0}: {1}, по умолчанию {2}", [parm.name, parm.type, parm.def || t("пусто")])}>
                    {parm.name.slice(1)}
                  </span>
                  <span className="muted">{parm.type}</span>
                  <ParmField
                    parm={parm}
                    value={value}
                    onCommit={(v) => {
                      const changes = replacementChanges(p.details!.keyvalues, parm.name, v);
                      if (changes.length) p.onSetKeys(changes);
                    }}
                  />
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
      {!!p.faceCount && (
        <div className="panel-current">
          <strong>{t("Грани")}</strong>
          <span className="muted grow list-text" title={p.faceMaterial ?? ""}>
            {p.faceCount} {t("выбрано")}
            {p.faceMaterial ? ` · ${p.faceMaterial}` : ""}
          </span>
          {p.onFaceEditor && (
            <button onClick={p.onFaceEditor} title={t("Сдвиг, масштаб, поворот, выравнивание и дисплейсменты выбранных граней")}>
              {t("Редактор граней")}
            </button>
          )}
        </div>
      )}
      {items.length === 1 && items[0].model && (
        <div className="panel-current">
          <span className="muted">{t("Модель")}</span>
          <span className="list-text grow" title={items[0].model}>
            {items[0].model}
          </span>
          {p.onPickModel && p.details && (
            <button className="model-pick-btn" onClick={() => p.onPickModel!("model")} title={t("Открыть браузер моделей: выбранная модель заменит текущую (Esc - отмена)")}>
              {t("Выбрать…")}
            </button>
          )}
        </div>
      )}
      {p.details && isLightClass(p.details.classname) && <LightCard classname={p.details.classname} keyvalues={p.details.keyvalues} onSetKeys={p.onSetKeys} />}
      <div className="face-buttons inspector-actions">
        {solids.length > 0 && (
          <button onClick={p.onTie} title={t("Сделать энтити (Tie to Entity): превратить браши в дверь, триггер, func_detail и т. д. (Ctrl+T)")}>
            {t("Сделать энтити")}
          </button>
        )}
        {solids.some((s) => s.owner) && (
          <button onClick={p.onMoveToWorld} title={t("Снять энтити (Move to World): вернуть браши энтити в мир как обычные браши (Ctrl+Shift+W)")}>
            {t("Снять энтити")}
          </button>
        )}
        {items.some((i) => i.classname.toLowerCase() === "func_instance") && (
          <button onClick={p.onCollapse} title={t("Развернуть инстанс (Collapse): вставить содержимое func_instance в карту и удалить сам инстанс")}>
            {t("Развернуть")}
          </button>
        )}
        <button onClick={p.onHide} title={t("Скрыть (H)")}>
          <Icon name="eyeOff" /> {t("Скрыть")}
        </button>
        <span className="grow" />
        <button onClick={p.onDelete} title={t("Удалить (Delete)")}>
          <Icon name="trash" />
        </button>
      </div>
      {p.details && (
        <div className="inspector-props">
          <div className="insp-head insp-head-props">
            <Icon name={/light/i.test(p.details.classname) ? "bulb" : p.details.brush ? "hollow" : "entity"} size={14} />
            <strong>{isLightClass(p.details.classname) ? t("Все ключи") : /light/i.test(p.details.classname) ? t("Свет") : p.details.brush ? t("Брашевая энтити") : t("Энтити")}</strong>
            <span className="muted list-text">{p.details.classname}</span>
          </div>
          <PropertiesPanel
            details={p.details}
            classDef={p.classDef}
            classList={p.classList}
            targetnames={p.targetnames}
            inputsFor={p.inputsFor}
            onSetKeys={p.onSetKeys}
            onSetConnections={p.onSetConnections}
            onTestOutput={p.onTestOutput}
            onPickTarget={p.onPickTarget}
            onPickModel={p.onPickModel}
            embedded
          />
        </div>
      )}
    </aside>
  );
}
