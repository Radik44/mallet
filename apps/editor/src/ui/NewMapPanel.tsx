// New map wizard: a sealed starting room with a spawn and light, so a
// first map compiles and runs right away instead of leaking.

import { useState } from "react";
import { Select } from "./Select";
import { Card, Field, PanelFrame, Row, Segmented } from "./kit";
import { Icon } from "./Icon";
import { t as tr, lazy } from "../i18n";

export interface NewMapOptions {
  /** Inner room size in units. */
  width: number;
  length: number;
  height: number;
  /** Outdoor rooms get a sky ceiling and a light_environment; indoor ones a light. */
  outdoor: boolean;
  skyname: string;
  spawn: boolean;
  light: boolean;
  wall: number;
  /** Game mode the spawn points are laid out for. */
  template: GameTemplate;
  /** What the map is for, in the mapper's words; goes to the project file and the assistant. */
  goal?: string;
}

export const GOAL_PRESETS = lazy(() => [tr("комната или бункер"), tr("арена для боя"), tr("открытая местность с холмами"), tr("RP-улица с домами"), tr("карта для TTT"), tr("паркур или deathrun")]);

export type GameTemplate = "sandbox" | "ttt" | "darkrp" | "deathrun" | "prophunt";

/** What each template places besides the room: spawn classes and how many, in a ring on the floor. */
export const GAME_TEMPLATES: { id: GameTemplate; title: string; hint: string; spawns: { classname: string; count: number }[] }[] = lazy(() => [
  { id: "sandbox", title: "Sandbox", hint: tr("Одна точка info_player_start в центре"), spawns: [{ classname: "info_player_start", count: 1 }] },
  { id: "ttt", title: "Trouble in Terrorist Town", hint: tr("Восемь спавнов info_player_terrorist по кругу (TTT использует только их)"), spawns: [{ classname: "info_player_terrorist", count: 8 }] },
  { id: "darkrp", title: "DarkRP", hint: tr("Восемь info_player_start по кругу: игроки появляются в случайной точке"), spawns: [{ classname: "info_player_start", count: 8 }] },
  {
    id: "deathrun",
    title: "Deathrun",
    hint: tr("Шесть спавнов бегунов info_player_terrorist и два info_player_counterterrorist для «Смерти»"),
    spawns: [
      { classname: "info_player_terrorist", count: 6 },
      { classname: "info_player_counterterrorist", count: 2 },
    ],
  },
  {
    id: "prophunt",
    title: "Prop Hunt",
    hint: tr("Четыре спавна охотников info_player_counterterrorist и четыре спавна пропов info_player_terrorist"),
    spawns: [
      { classname: "info_player_counterterrorist", count: 4 },
      { classname: "info_player_terrorist", count: 4 },
    ],
  },
]);

export const DEFAULT_NEW_MAP: NewMapOptions = { width: 1024, length: 1024, height: 256, outdoor: true, skyname: "sky_day01_01", spawn: true, light: true, wall: 16, template: "sandbox" };

interface Props {
  busy: boolean;
  onCreate(options: NewMapOptions): void;
  onClose(): void;
}

const SKIES = ["sky_day01_01", "sky_day01_04", "sky_day02_01", "sky_day03_01", "sky_night_01", "sky_wasteland02", "sky_borealis01", "painted"];

/** Room sizes a beginner can pick without thinking in units. */
const SIZES: { id: string; label: string; w: number; l: number; h: number }[] = lazy(() => [
  { id: "small", label: tr("Маленькая"), w: 512, l: 512, h: 192 },
  { id: "medium", label: tr("Средняя"), w: 1024, l: 1024, h: 256 },
  { id: "large", label: tr("Большая"), w: 2048, l: 2048, h: 512 },
]);

export function NewMapPanel({ busy, onCreate, onClose }: Props) {
  const [o, setO] = useState<NewMapOptions>(DEFAULT_NEW_MAP);
  const [custom, setCustom] = useState(false);
  const sizeId = SIZES.find((s) => s.w === o.width && s.l === o.length && s.h === o.height)?.id ?? "custom";
  const num = (key: "width" | "length" | "height" | "wall", min: number) => (
    <input type="number" className="num" step={64} value={o[key]} onChange={(e) => setO({ ...o, [key]: Math.max(min, Number(e.target.value) || min) })} />
  );
  const tpl = GAME_TEMPLATES.find((t) => t.id === o.template);
  return (
    <PanelFrame
      title={tr("Новая карта")}
      subtitle={tr("стартовая комната, готовая к сборке и запуску")}
      actions={
        <button className="icon-btn" onClick={onClose} title={tr("Закрыть")}>
          <Icon name="close" />
        </button>
      }
      footer={
        <Row>
          <span className="muted list-text">
            {o.width}×{o.length}×{o.height}, {o.outdoor ? tr("улица") : tr("помещение")}, {tpl?.title}
          </span>
          <span className="grow" />
          <button className="primary" onClick={() => onCreate(o)} disabled={busy}>
            <Icon name="plus" /> {tr("Создать")}
          </button>
        </Row>
      }
    >
      <Card title={tr("Тип карты")} icon="world">
        <Segmented
          value={o.outdoor ? "outdoor" : "indoor"}
          options={[
            { value: "outdoor", label: tr("Улица"), title: tr("Небо вместо потолка и солнце") },
            { value: "indoor", label: tr("Помещение"), title: tr("Потолок и лампа") },
          ]}
          onChange={(v) => setO({ ...o, outdoor: v === "outdoor" })}
        />
        <Field label={tr("Геймод")} hint={tpl?.hint}>
          <Select
            value={o.template}
            options={GAME_TEMPLATES.map((t) => ({ value: t.id, label: t.title, hint: t.hint }))}
            onChange={(v) => setO({ ...o, template: v as GameTemplate })}
            className="grow"
          />
        </Field>
        <Field label={tr("Назначение")} hint={tr("Сохраняется в файле проекта и передаётся ассистенту")}>
          <input className="grow" list="gme-goals" value={o.goal ?? ""} onChange={(e) => setO({ ...o, goal: e.target.value })} placeholder={tr("арена, RP-улица, бункер…")} spellCheck={false} />
          <datalist id="gme-goals">
            {GOAL_PRESETS.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
      </Card>
      <Card title={tr("Размер")} icon="scale" hint={tr("внутри, в юнитах")}>
        <Segmented
          value={custom ? "custom" : sizeId}
          options={[...SIZES.map((s) => ({ value: s.id, label: s.label, title: `${s.w}×${s.l}×${s.h}` })), { value: "custom", label: tr("Свой") }]}
          onChange={(v) => {
            const s = SIZES.find((x) => x.id === v);
            if (s) {
              setCustom(false);
              setO({ ...o, width: s.w, length: s.l, height: s.h });
            } else setCustom(true);
          }}
        />
        {(custom || sizeId === "custom") && (
          <Row>
            <span className="muted">X</span>
            {num("width", 64)}
            <span className="muted">Y</span>
            {num("length", 64)}
            <span className="muted">Z</span>
            {num("height", 64)}
          </Row>
        )}
      </Card>
      <Card title={tr("Дополнительно")} icon="settings" collapsible defaultOpen={false} id="newmap-more">
        {o.outdoor && (
          <Field label={tr("Небо")} hint={tr("Имя скайбокса из игры")}>
            <input className="grow" list="gme-skies" value={o.skyname} onChange={(e) => setO({ ...o, skyname: e.target.value })} spellCheck={false} />
            <datalist id="gme-skies">
              {SKIES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
        )}
        <Field label={tr("Стены")} hint={tr("Толщина стен в юнитах")}>
          {num("wall", 1)}
        </Field>
        <Row wrap>
          <label className="chk" title={tpl?.hint}>
            <input type="checkbox" checked={o.spawn} onChange={(e) => setO({ ...o, spawn: e.target.checked })} /> {tr("Точки появления")}
          </label>
          <label className="chk" title={tr("light_environment для улицы, light для помещения")}>
            <input type="checkbox" checked={o.light} onChange={(e) => setO({ ...o, light: e.target.checked })} /> {tr("Свет")}
          </label>
        </Row>
      </Card>
      <div className="muted small">{tr("Будет создана герметичная комната из шести брашей с точкой появления и светом. Затем добавляйте стены инструментом «Блок» и пропы из «Библиотеки».")}</div>
    </PanelFrame>
  );
}
