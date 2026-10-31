// Types and constants shared by App.tsx and the modules split out of it:
// tools, panels, view modes, defaults and the small helpers they need.

import type { FlyCamera } from "../viewport/camera";
import type { ViewKind } from "../viewport/camera2d";
import type { Renderer, View2D } from "../viewport/renderer";
import type { Box3, Vec3 } from "../viewport/transform";
import type { Handle, HandleMode } from "../viewport/handles";
import type { VertexHandle } from "../viewport/vertices";
import type { OverlayFrame } from "../viewport/overlays";
import type { CompileOptions } from "../tauri";
import { pointerCss } from "../viewport/dpi";
import { t, lazy } from "../i18n";

export interface Session {
  renderer: Renderer;
  camera: FlyCamera;
  views: Record<ViewKind, View2D>;
}

export type Tool = "select" | "block" | "texture" | "entity" | "cordon" | "clip" | "vertex" | "landscape" | "measure";
export type ViewMode = "textured" | "flat" | "wireframe" | "lightmap" | "lighting";
export const VIEW_MODE_NAMES: Record<ViewMode, string> = lazy(() => ({ textured: t("Текстуры"), flat: t("Цвет"), wireframe: t("Каркас"), lightmap: t("Лайтмап"), lighting: t("Свет") }));
export type Panel =
  | "none"
  | "textures"
  | "properties"
  | "visgroups"
  | "problems"
  | "entities"
  | "logic"
  | "outliner"
  | "notes"
  | "compile"
  | "models"
  | "world"
  | "newmap"
  | "inspector"
  | "settings"
  | "prefabs"
  | "history"
  | "array"
  | "resources"
  | "landscape"
  | "sounds"
  | "paint"
  | "assistant"
  | "gameview"
  | "workshop";
/** Panels safe to reopen at start without loading anything first. */
export const RESTORABLE_PANELS: Panel[] = ["textures", "inspector", "settings", "models", "sounds", "paint", "assistant", "compile", "gameview", "workshop", "entities", "logic", "outliner", "notes", "prefabs", "history"];
/** One-line reminders shown over the views for people new to Hammer. */
export const TOOL_HINTS: Record<Tool, string> = lazy(() => ({
  select: t("Щелчок выделяет, перетаскивание перемещает, повторный щелчок включает маркеры размера и поворота"),
  block: t("Протяните рамку в 2D-виде, Enter создаёт браш, Esc отменяет"),
  texture: t("Щелчок выбирает грань, протяжка применяет материал, Alt+щелчок берёт материал с грани"),
  entity: t("Щелчок по поверхности в 3D или по сетке в 2D ставит объект"),
  clip: t("Проведите линию через браши в 2D, 5 меняет сторону, Enter режет"),
  vertex: t("Перетаскивайте белые вершины и жёлтые рёбра; грани остаются плоскими"),
  cordon: t("Обведите область в 2D: всё за её пределами скрывается и исключается из сборки"),
  landscape: t("Кисть по рельефу в 3D: ЛКМ поднимает, Ctrl опускает, колесо меняет радиус"),
  measure: t("Протяните в 2D или щёлкните две точки в 3D: длина в юнитах и метрах, Esc сбрасывает"),
}));
/** Tool names for the context bar. */
export const TOOL_NAMES: Record<Tool, string> = lazy(() => ({
  select: t("Выбор"),
  block: t("Блок"),
  texture: t("Текстура"),
  entity: t("Энтити"),
  clip: t("Разрез"),
  vertex: t("Вершины"),
  cordon: t("Кордон"),
  landscape: t("Ландшафт"),
  measure: t("Линейка"),
}));
/** Panels listed as tabs of the side column, in order. */
export const TAB_PANELS: Panel[] = ["inspector", "properties", "textures", "paint", "models", "sounds", "assistant", "prefabs", "visgroups", "outliner", "entities", "logic", "notes", "compile", "gameview", "workshop"];
/** One line per panel: what it is for. */
export const PANEL_ABOUT: Record<Panel, string> = lazy(() => ({
  none: "",
  textures: t("Материалы для граней: выбрать, перетащить на грань, заменить"),
  properties: t("Ключи и выходы выделенной энтити"),
  visgroups: t("Визгруппы: скрытие и отображение частей карты"),
  problems: t("Проверка карты и автоматические исправления"),
  entities: t("Список всех энтити карты, поиск и замена ключей"),
  logic: t("Граф связей: выходы и входы энтити в виде схемы, добавление и удаление связей"),
  outliner: t("Структура карты деревом: браши мира, группы, энтити по классам и родителям; скрытие, блокировка, выделение"),
  notes: t("Заметки на карте: метки с текстом в 3D-виде и список дел с переходом к месту"),
  compile: t("Сборка карты и запуск игры"),
  models: t("Пропы: выбор, предпросмотр, размещение"),
  world: t("Свойства карты: скайбокс, worldspawn"),
  newmap: t("Мастер новой карты"),
  inspector: t("Размеры, положение и материалы выделения"),
  settings: t("Раскладка, тема, масштаб, клавиши"),
  prefabs: t("Префабы: сохранение выделения и вставка в карту"),
  history: t("Сохранённые версии карты"),
  array: t("Копирование выделения рядами"),
  resources: t("Память, нагрузка и лимиты Source"),
  landscape: t("Площадка из дисплейсментов для кисти ландшафта"),
  sounds: t("Звуки игры: прослушивание и редактор - обрезка, зацикливание, запись, добавление WAV в карту"),
  paint: t("Рисование текстур: слои, кисти, бесшовный режим, экспорт VTF в карту и на грани"),
  assistant: t("Ассистент Claude: редактирует карту и пишет Lua по запросу"),
  gameview: t("Взгляд из игры: снимки глазами игрока, живой просмотр и цикл пересборки"),
  workshop: t("Публикация в Steam Workshop: описание, иконка, сборка аддона и отправка"),
}));
/** Tabs the dock shows: a few groups, each a segmented row of panels inside. */
export interface PanelGroup {
  id: string;
  title: string;
  panels: Panel[];
  /** The glyph before the group's name on its dock tab (an `Icon` name). */
  icon?: string;
}
export const PANEL_GROUPS: PanelGroup[] = lazy(() => [
  { id: "inspect", title: t("Инспектор"), panels: ["inspector", "properties"], icon: "focus" },
  { id: "library", title: t("Библиотека"), panels: ["textures", "models", "sounds", "prefabs", "paint"], icon: "folder" },
  { id: "map", title: t("Карта"), panels: ["outliner", "entities", "logic", "visgroups", "world", "problems", "resources", "history", "notes"], icon: "world" },
  { id: "build", title: t("Сборка"), panels: ["compile", "gameview", "workshop"], icon: "build" },
  { id: "assistant", title: t("Ассистент"), panels: ["assistant"], icon: "bulb" },
]);
/** Short names for the second-panel bar. */
export const PANEL_TITLES: Record<Panel, string> = lazy(() => ({
  none: "",
  textures: t("Текстуры"),
  properties: t("Свойства"),
  visgroups: t("Визгруппы"),
  problems: t("Проблемы"),
  entities: t("Энтити"),
  logic: t("Логика"),
  outliner: t("Структура"),
  notes: t("Заметки"),
  compile: t("Сборка"),
  models: t("Модели"),
  world: t("Карта"),
  newmap: t("Новая карта"),
  inspector: t("Инспектор"),
  settings: t("Настройки"),
  prefabs: t("Префабы"),
  history: t("История"),
  resources: t("Ресурсы"),
  array: t("Размножить"),
  landscape: t("Ландшафт"),
  sounds: t("Звуки"),
  paint: t("Рисование"),
  assistant: t("Ассистент"),
  gameview: t("Игра"),
  workshop: t("Публикация"),
}));
/** How many dated copies the version history keeps per map. */
export const HISTORY_KEEP = 20;
export const DEFAULT_COMPILE: CompileOptions = {
  vbsp: true,
  vvis: true,
  vrad: true,
  fast: false,
  hdr: false,
  install: true,
  runGame: false,
  vbspArgs: "",
  vvisArgs: "",
  vradArgs: "",
  extraCommands: "",
};
/** Block-tool shapes, as Hammer's primitive list. */
export type Shape = "block" | "wedge" | "cylinder" | "sphere" | "arch" | "stairs";
export const SHAPE_NAMES: Record<Shape, string> = lazy(() => ({ block: t("Блок"), wedge: t("Клин"), cylinder: t("Цилиндр"), sphere: t("Сфера"), arch: t("Арка"), stairs: t("Лестница") }));
export const DEFAULT_TIE_CLASS = "func_detail";

export const DEFAULT_MATERIAL = "dev/dev_measuregeneric01b";
export const DEFAULT_ENTITY_CLASS = "info_player_start";

/** What a left-button drag in a 2D view is doing. */
export type Drag2D =
  | { kind: "move"; objects: number[]; hitId: number; moved: boolean; wasSelected: boolean; clone: boolean; last?: Vec3; snapCache?: { mine: number[]; others: number[] } }
  | { kind: "marquee"; startCss: [number, number]; view: ViewKind }
  | { kind: "scale"; handle: Handle; bounds: Box3; edges: Float32Array; result: { pivot: Vec3; factors: Vec3; bounds: Box3 } | null }
  | { kind: "rotate"; bounds: Box3; axis: Vec3; startAngle: number; edges: Float32Array; degrees: number }
  | { kind: "vertex"; handle: VertexHandle; edges: Float32Array; delta: Vec3 }
  | { kind: "overlay"; id: number; index: number; frame: OverlayFrame; delta: Vec3 };

export interface GizmoState {
  hover: number | null;
  drag: {
    mode: HandleMode;
    axis: number;
    /** Axis parameter (move, scale) or ring angle in degrees (rotate) where the drag started. */
    t0: number;
    objects: number[];
    delta: Vec3;
    bounds: Box3;
    /** Selection edges at the start, for the rotate and scale wireframe preview. */
    edges: Float32Array;
    degrees: number;
    factors: Vec3;
  } | null;
  /** Last uploaded overlay signature, to skip redundant uploads. */
  key: string;
}

export const VIEW_KINDS: ViewKind[] = ["top", "front", "side"];
export const GRID_SIZES = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
export const PREVIEW_COLOR: [number, number, number] = [1, 0.9, 0.2];

/** Mouse position in CSS pixels of a canvas, plus its size. */
export function canvasCss(e: React.MouseEvent<HTMLCanvasElement>): { css: [number, number]; w: number; h: number } {
  const el = e.currentTarget;
  return { css: pointerCss(e, el), w: el.clientWidth, h: el.clientHeight };
}
