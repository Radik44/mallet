// The map's journey: the stages from a new file to a published map, each
// with a state worked out from the map, the last compile and the last game
// run, plus a checklist with things to show and requests for the assistant.
// Pure functions, so the rules are testable; the shell feeds them state.
//
// A saved file is identified by a stamp (a hash of its text). The project
// file remembers which stamp was compiled, tested and published, so the bar
// knows "not compiled since the last edit" across sessions.

import { t, lazy } from "../i18n";

export type StageId = "new" | "geometry" | "entities" | "check" | "compile" | "test" | "publish";
export type StageStatus = "done" | "current" | "todo" | "blocked";

export interface JourneyCheck {
  id: string;
  label: string;
  /** true: met; false: not met; null: unknown yet. */
  ok: boolean | null;
  /** A failed check that does not block the stage. */
  soft?: boolean;
  /** An action the shell knows: `save`, `panel:problems`, `select:<id>`, `compile`, `game`. */
  show?: string;
  showLabel?: string;
}

export interface JourneyStage {
  id: StageId;
  title: string;
  status: StageStatus;
  /** Why it is not done, in the user's words. */
  reasons: string[];
  checks: JourneyCheck[];
  /** What to ask the assistant to get this stage done. */
  ask?: string;
  /** The panel that belongs to the stage. */
  panel?: string;
}

/** What the project file keeps between sessions (`<map>.mallet.json`). */
import type { GeneratorRecord } from "./generators";
import type { MapNote } from "./notes";

export interface ProjectMeta {
  /** Parametric brushes (cylinders, arches, stairs) the inspector can rebuild, by VMF group. */
  generators: GeneratorRecord[];
  /** Notes pinned to places in the map. */
  pins: MapNote[];
  title: string;
  description: string;
  tags: string[];
  /** What the map is for, from the new-map wizard; goes into the assistant's summary. */
  goal: string;
  workshopId: string | null;
  compiledStamp: string | null;
  compiledOk: boolean | null;
  leak: boolean;
  testedStamp: string | null;
  gameErrors: number;
  publishedStamp: string | null;
  notes: string;
}

export const EMPTY_META: ProjectMeta = {
  title: "",
  description: "",
  tags: [],
  goal: "",
  workshopId: null,
  compiledStamp: null,
  compiledOk: null,
  leak: false,
  testedStamp: null,
  gameErrors: 0,
  publishedStamp: null,
  notes: "",
  generators: [],
  pins: [],
};

export interface JourneyInput {
  mapOpen: boolean;
  /** The VMF path, empty for an unsaved map. */
  path: string;
  /** Stamp of the saved file, or null while there are unsaved edits. */
  stamp: string | null;
  solids: number;
  /** Lower-case class names of every entity in the map. */
  classes: string[];
  /** Findings of the last problem check, null when it never ran. */
  problems: number | null;
  compiling: boolean;
  meta: ProjectMeta;
  gameRunning: boolean;
}

export const START_CLASSES = [
  "info_player_start",
  "info_player_terrorist",
  "info_player_counterterrorist",
  "info_player_deathmatch",
  "info_player_teamspawn",
  "info_player_rebel",
  "info_player_combine",
];
export const LIGHT_CLASSES = ["light", "light_spot", "light_environment", "light_dynamic"];

/** FNV-1a over the text, as hex: cheap and stable, enough to tell saves apart. */
export function stampOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, "0")}-${text.length.toString(16)}`;
}

/** `<map>.mallet.json` next to the VMF. */
export function metaPathOf(vmfPath: string): string {
  return vmfPath.replace(/\.vmf$/i, "") + ".mallet.json";
}

export function parseMeta(text: string): ProjectMeta {
  try {
    const j = JSON.parse(text) as Partial<ProjectMeta>;
    return {
      ...EMPTY_META,
      ...j,
      tags: Array.isArray(j.tags) ? j.tags.map(String) : [],
      gameErrors: typeof j.gameErrors === "number" ? j.gameErrors : 0,
      generators: Array.isArray(j.generators) ? (j.generators as GeneratorRecord[]) : [],
      pins: Array.isArray(j.pins) ? (j.pins as MapNote[]) : [],
    };
  } catch {
    return { ...EMPTY_META };
  }
}

export function serializeMeta(m: ProjectMeta): string {
  return JSON.stringify(m, null, 2) + "\n";
}

const STAGE_TITLES: Record<StageId, string> = lazy(() => ({
  new: t("Новая карта"),
  geometry: t("Геометрия"),
  entities: t("Свет и энтити"),
  check: t("Проверка"),
  compile: t("Сборка"),
  test: t("Тест в игре"),
  publish: t("Публикация"),
}));

export const STAGE_IDS: StageId[] = ["new", "geometry", "entities", "check", "compile", "test", "publish"];

/** The stages as the bar shows them. */
export function computeJourney(i: JourneyInput): JourneyStage[] {
  const m = i.meta;
  const classes = i.classes.map((c) => c.toLowerCase());
  const starts = classes.filter((c) => START_CLASSES.includes(c));
  const lights = classes.filter((c) => LIGHT_CLASSES.includes(c));
  const compiledNow = !!i.stamp && m.compiledStamp === i.stamp;
  const compileClean = compiledNow && m.compiledOk === true && !m.leak;
  const stages: JourneyStage[] = [];

  // New map: open, and saved to a file so the project has a folder.
  {
    const saved = !!i.path;
    stages.push({
      id: "new",
      title: STAGE_TITLES.new,
      status: i.mapOpen ? "done" : "current",
      reasons: i.mapOpen ? (saved ? [] : [t("карта ещё не сохранена: у проекта нет папки для текстур, звуков и Lua")]) : [t("создайте или откройте карту")],
      checks: [
        { id: "open", label: t("карта открыта"), ok: i.mapOpen },
        { id: "saved", label: t("сохранена в файл"), ok: i.mapOpen ? saved : null, soft: true, show: saved ? undefined : "save", showLabel: t("сохранить") },
      ],
      panel: "newmap",
    });
  }

  // Geometry: at least a room, closed as far as the last compile can tell.
  {
    const enough = i.solids >= 6;
    const closed: boolean | null = m.compiledStamp ? !m.leak : null;
    const reasons: string[] = [];
    if (!enough) reasons.push(t("в карте {0} {1}: требуется как минимум замкнутая комната из шести брашей", [i.solids, plural(i.solids, t("браш"), t("браша"), t("брашей"))]));
    if (closed === false) reasons.push(t("карта не замкнута: при сборке обнаружена утечка"));
    stages.push({
      id: "geometry",
      title: STAGE_TITLES.geometry,
      status: !i.mapOpen ? "todo" : enough && closed !== false ? "done" : closed === false ? "blocked" : "current",
      reasons,
      checks: [
        { id: "solids", label: t("брашей: {0} (минимум 6)", [i.solids]), ok: enough },
        {
          id: "closed",
          label: closed === null ? t("замкнутость проверяется при сборке") : closed ? t("карта замкнута, утечек нет") : t("утечка: карта не изолирована от пустоты"),
          ok: closed,
          show: closed === false ? "panel:compile" : undefined,
          showLabel: t("лог сборки"),
        },
      ],
      ask: enough
        ? t("Проверь, замкнута ли карта: собери её, прочитай лог, и если есть утечка - найди дыру по leak_info и закрой её брашами.")
        : t("Построй замкнутую комнату 512×512×192 из шести стен толщиной 16 с материалом dev/dev_measurewall01c, пол dev/dev_measuregeneric01b."),
    });
  }

  // Entities: a player start and some light.
  {
    const hasStart = starts.length > 0;
    const hasLight = lights.length > 0;
    const reasons: string[] = [];
    if (!hasStart) reasons.push(t("нет точки появления игрока (info_player_start)"));
    if (!hasLight) reasons.push(t("нет источников света: в игре карта будет тёмной"));
    stages.push({
      id: "entities",
      title: STAGE_TITLES.entities,
      status: !i.mapOpen ? "todo" : hasStart ? "done" : "current",
      reasons,
      checks: [
        { id: "start", label: hasStart ? t("точек появления: {0}", [starts.length]) : t("точек появления нет"), ok: hasStart, show: "panel:entities", showLabel: t("энтити") },
        { id: "light", label: hasLight ? t("источников света: {0}", [lights.length]) : t("источников света нет"), ok: hasLight, soft: true, show: "panel:entities", showLabel: t("энтити") },
      ],
      ask: t('Поставь info_player_start на пол в центре комнаты, если его нет, и лампу light с ключом _light "255 240 220 200" под потолком, если света нет; выдели их.'),
      panel: "entities",
    });
  }

  // Check: the problems panel ran clean.
  {
    const ran = i.problems !== null;
    const clean = i.problems === 0;
    stages.push({
      id: "check",
      title: STAGE_TITLES.check,
      status: !i.mapOpen ? "todo" : clean ? "done" : ran ? "blocked" : "current",
      reasons: !ran
        ? [t("проверка ещё не запускалась")]
        : clean
          ? []
          : [t("{0} {1}: например, некорректные браши, отсутствующие материалы или классы", [i.problems, plural(i.problems ?? 0, t("проблема"), t("проблемы"), t("проблем"))])],
      checks: [
        {
          id: "problems",
          label: !ran ? t("проверка не запускалась") : clean ? t("проблем нет") : t("проблем: {0}", [i.problems]),
          ok: !ran ? null : clean,
          show: "panel:problems",
          showLabel: t("проблемы"),
        },
      ],
      ask: t("Проверь карту инструментом check_problems и исправь все находки (fix_problems, правки брашей и материалов), потом проверь снова."),
      panel: "problems",
    });
  }

  // Compile: the saved file was compiled, without errors or a leak.
  {
    const reasons: string[] = [];
    let status: StageStatus = "todo";
    if (!i.mapOpen) status = "todo";
    else if (i.compiling) {
      status = "current";
      reasons.push(t("идёт сборка"));
    } else if (!m.compiledStamp) {
      status = "current";
      reasons.push(t("карта ещё не собиралась"));
    } else if (!compiledNow) {
      status = "current";
      reasons.push(i.stamp ? t("не пересобрана после последних изменений") : t("есть несохранённые изменения: сохраните и соберите карту"));
    } else if (m.compiledOk === false) {
      status = "blocked";
      reasons.push(t("сборка завершилась с ошибкой, подробности в логе"));
    } else if (m.leak) {
      status = "blocked";
      reasons.push(t("при сборке обнаружена утечка"));
    } else status = "done";
    stages.push({
      id: "compile",
      title: STAGE_TITLES.compile,
      status,
      reasons,
      checks: [
        {
          id: "fresh",
          label: compiledNow ? t("собрана текущая версия") : m.compiledStamp ? t("собрана устаревшая версия") : t("не собиралась"),
          ok: m.compiledStamp ? compiledNow : null,
          show: "compile",
          showLabel: t("собрать"),
        },
        { id: "ok", label: m.compiledOk === null ? t("результат сборки неизвестен") : m.compiledOk ? t("без ошибок") : t("с ошибками"), ok: m.compiledOk, show: "panel:compile", showLabel: t("лог") },
        {
          id: "leak",
          label: m.compiledStamp ? (m.leak ? t("утечка") : t("утечки нет")) : t("утечки проверяются при сборке"),
          ok: m.compiledStamp ? !m.leak : null,
          show: m.leak ? "panel:compile" : undefined,
          showLabel: t("лог"),
        },
      ],
      ask: t("Собери карту, прочитай итог и лог; если есть ошибки или утечка - объясни причину, исправь и пересобери, пока сборка не пройдёт чисто."),
      panel: "compile",
    });
  }

  // Test: the compiled map was loaded by the game, and the console was quiet.
  {
    const tested = compileClean && !!m.testedStamp && m.testedStamp === m.compiledStamp;
    const reasons: string[] = [];
    let status: StageStatus = "todo";
    if (!i.mapOpen) status = "todo";
    else if (!compileClean) {
      status = "todo";
      reasons.push(t("требуется сборка без ошибок и утечек"));
    } else if (i.gameRunning && !tested) {
      status = "current";
      reasons.push(t("игра запущена, ожидание загрузки карты"));
    } else if (!tested) {
      status = "current";
      reasons.push(t("эта сборка ещё не запускалась в игре"));
    } else if (m.gameErrors > 0) {
      status = "done";
      reasons.push(t("в консоли игры {0} {1}, подробности в логе", [m.gameErrors, plural(m.gameErrors, t("ошибка"), t("ошибки"), t("ошибок"))]));
    } else status = "done";
    stages.push({
      id: "test",
      title: STAGE_TITLES.test,
      status,
      reasons,
      checks: [
        {
          id: "loaded",
          label: tested ? t("игра загрузила эту сборку") : t("эта сборка не запускалась"),
          ok: compileClean ? tested : null,
          show: compileClean ? "game" : undefined,
          showLabel: t("запустить"),
        },
        {
          id: "console",
          label: !tested ? t("консоль проверяется при запуске") : m.gameErrors ? t("ошибок в консоли: {0}", [m.gameErrors]) : t("ошибок в консоли нет"),
          ok: !tested ? null : m.gameErrors === 0,
          soft: true,
          show: tested && m.gameErrors ? "panel:compile" : undefined,
          showLabel: t("лог"),
        },
      ],
      ask: t("Запусти игру на собранной карте, дождись связи, прочитай консоль и ошибки Lua; если они есть - исправь и запусти снова; потом перенеси игрока к интересному месту."),
      panel: "compile",
    });
  }

  // Publish: the compiled build is on the Workshop (the panel comes with the next block).
  {
    const published = !!m.workshopId && !!m.publishedStamp && m.publishedStamp === m.compiledStamp && compileClean;
    stages.push({
      id: "publish",
      title: STAGE_TITLES.publish,
      status: !i.mapOpen ? "todo" : published ? "done" : "todo",
      reasons: published ? [] : [m.workshopId ? t("в Workshop опубликована устаревшая версия") : t("ещё не публиковалась в Steam Workshop")],
      checks: [
        { id: "workshop", label: m.workshopId ? `Workshop id ${m.workshopId}` : t("не опубликована в Workshop"), ok: m.workshopId ? true : null },
        { id: "fresh", label: published ? t("опубликована текущая сборка") : t("текущая сборка не опубликована"), ok: published ? true : null, soft: true },
      ],
    });
  }

  // One stage is "current": the first that is not done, unless an earlier one is blocked.
  let marked = false;
  for (const s of stages) {
    if (s.status === "done") continue;
    if (s.status === "blocked") {
      marked = true;
      continue;
    }
    if (!marked) {
      s.status = "current";
      marked = true;
    } else if (s.status === "current") s.status = "todo";
  }
  return stages;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** The journey in one line, for logs and the assistant's summary. */
export function journeyText(stages: JourneyStage[]): string {
  return stages.map((s) => `${s.title}: ${s.status}${s.reasons.length ? ` (${s.reasons.join("; ")})` : ""}`).join(" · ");
}
