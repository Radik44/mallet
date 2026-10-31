// Vertical tool rail on the left, as in Unity and Blender: one icon per
// tool with its name and hotkey in the tooltip. The rail never changes,
// so the tools are always in the same place.

import { t as tr, lazy } from "../i18n";

export type RailTool = "select" | "block" | "texture" | "entity" | "clip" | "vertex" | "cordon" | "landscape" | "measure";

interface Props {
  tool: RailTool;
  onTool(tool: RailTool): void;
  /** Hotkey text per tool, from the command list. */
  hotkeys: Partial<Record<RailTool, string>>;
  /** Extra buttons under the tools (the palette, say). */
  children?: React.ReactNode;
  /** Icon set: the editor's own or the Hammer-like one. */
  variant?: "default" | "hammer";
  /** Wide rail: icon with the tool's name beside it. */
  wide?: boolean;
  onToggleWide?(wide: boolean): void;
}

export const TOOL_ICON_PATHS: Record<RailTool, string> = {
  select: "M5 3 L5 18 L9 14 L12 20 L15 19 L12 13 L17 13 Z",
  block: "M4 8 L12 4 L20 8 L20 16 L12 20 L4 16 Z M4 8 L12 12 L20 8 M12 12 L12 20",
  texture: "M4 4 H20 V20 H4 Z M4 12 H20 M12 4 V20",
  entity: "M12 3 A5.5 5.5 0 0 1 15 13 L15 16 H9 L9 13 A5.5 5.5 0 0 1 12 3 Z M9.5 19 H14.5",
  clip: "M4 20 L20 4 M4 14 L10 20 M12 6 L18 12",
  vertex: "M4 8 L12 4 L20 8 L20 16 L12 20 L4 16 Z M4 8 L12 12 L20 8 M12 12 V20",
  cordon: "M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15",
  landscape: "M3 18 L8 9 L11 13 L14 7 L21 18 Z M3 18 H21",
  measure: "M3 17 L17 3 L21 7 L7 21 Z M7 13 L9 15 M10 10 L12 12 M13 7 L15 9",
};

const ICONS: Record<RailTool, { title: string; path: string }> = lazy(() => ({
  select: { title: tr("Выбор"), path: "M4 3 L4 17 L8 13 L11 19 L13 18 L10 12 L15 12 Z" },
  block: { title: tr("Блок"), path: "M4 8 L12 4 L20 8 L20 16 L12 20 L4 16 Z M4 8 L12 12 L20 8 M12 12 L12 20" },
  texture: { title: tr("Текстура"), path: "M4 4 H20 V20 H4 Z M4 12 H20 M12 4 V20" },
  entity: { title: tr("Энтити"), path: "M12 3 L21 12 L12 21 L3 12 Z M12 8 V16 M8 12 H16" },
  clip: { title: tr("Разрез"), path: "M4 4 L20 20 M6 15 A3 3 0 1 0 6 21 A3 3 0 1 0 6 15 M15 6 A3 3 0 1 0 21 6 A3 3 0 1 0 15 6" },
  vertex: { title: tr("Вершины"), path: "M5 19 L12 5 L19 19 Z M5 19 L5 15 M12 5 L12 9 M19 19 L19 15" },
  cordon: { title: tr("Кордон"), path: "M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15 M9 9 H15 V15 H9 Z" },
  landscape: { title: tr("Ландшафт"), path: "M3 18 L8 9 L11 13 L14 7 L21 18 Z M3 18 H21" },
  measure: { title: tr("Линейка"), path: "M3 17 L17 3 L21 7 L7 21 Z M7 13 L9 15 M10 10 L12 12 M13 7 L15 9" },
}));

/** Hammer-like set: the shapes Hammer's toolbar used, redrawn as line icons; the skin colours them. */
const ICONS_HAMMER: Record<RailTool, { title: string; path: string }> = lazy(() => ({
  select: { title: tr("Выбор"), path: "M5 3 L5 18 L9 14 L12 20 L15 19 L12 13 L17 13 Z" },
  block: { title: tr("Блок"), path: "M4 8 L12 4 L20 8 L20 16 L12 20 L4 16 Z M4 8 L12 12 L20 8 M12 12 L12 20 M8 10 L8 18" },
  texture: { title: tr("Текстура"), path: "M4 4 H20 V20 H4 Z M4 9.3 H20 M4 14.6 H20 M9.3 4 V20 M14.6 4 V20 M9.3 9.3 H14.6 V14.6 H9.3 Z" },
  entity: { title: tr("Энтити"), path: "M12 3 A5.5 5.5 0 0 1 15 13 L15 16 H9 L9 13 A5.5 5.5 0 0 1 12 3 Z M9.5 19 H14.5 M10.5 21 H13.5" },
  clip: { title: tr("Разрез"), path: "M4 20 L20 4 M4 14 L10 20 M12 6 L18 12 M6 4 V10 H12" },
  vertex: {
    title: tr("Вершины"),
    path: "M4 8 L12 4 L20 8 L20 16 L12 20 L4 16 Z M4 8 L12 12 L20 8 M12 12 V20 M4 8 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0 M20 8 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0 M12 4 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0 M12 20 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0",
  },
  cordon: { title: tr("Кордон"), path: "M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15 M7 7 H17 V17 H7 Z" },
  landscape: { title: tr("Ландшафт"), path: "M3 18 L8 9 L11 13 L14 7 L21 18 Z M3 18 H21 M6 15 H18" },
  measure: { title: tr("Линейка"), path: "M3 17 L17 3 L21 7 L7 21 Z M7 13 L9 15 M10 10 L12 12 M13 7 L15 9" },
}));

/** What each tool is for, in one line, for the wide rail and the tooltips. */
const ABOUT: Record<RailTool, string> = lazy(() => ({
  select: tr("Выделение, перенос, масштаб и поворот объектов"),
  block: tr("Создание брашей: стены, полы, ящики"),
  texture: tr("Назначение материалов граням и настройка текстур"),
  entity: tr("Размещение энтити: свет, пропы, точки появления, триггеры"),
  clip: tr("Разрезание брашей по линии"),
  vertex: tr("Редактирование вершин и рёбер брашей"),
  cordon: tr("Ограничение области сборки"),
  landscape: tr("Скульптинг рельефа дисплейсментов кистью"),
  measure: tr("Измерение расстояний в юнитах и метрах"),
}));

export function ToolRail({ tool, onTool, hotkeys, children, variant = "default", wide = false, onToggleWide }: Props) {
  const icons = variant === "hammer" ? ICONS_HAMMER : ICONS;
  const startEdgeDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const sx = e.clientX;
    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - sx;
      if (dx > 40 && !wide) onToggleWide?.(true);
      if (dx < -40 && wide) onToggleWide?.(false);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return (
    <nav className={`tool-rail${variant === "hammer" ? " rail-hammer" : ""}${wide ? " wide" : ""}`}>
      {(Object.keys(icons) as RailTool[]).map((t) => (
        <button key={t} data-tool={t} className={`rail-btn${tool === t ? " active" : ""}`} onClick={() => onTool(t)} title={`${icons[t].title}\n${ABOUT[t]}${hotkeys[t] ? ` (${hotkeys[t]})` : ""}`}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={variant === "hammer" ? 2 : 1.8} strokeLinejoin="round" strokeLinecap="round">
            <path d={icons[t].path} />
          </svg>
          {wide && <span className="rail-label">{icons[t].title}</span>}
        </button>
      ))}
      {onToggleWide && (
        <button
          className="rail-btn rail-wide-toggle"
          onClick={() => onToggleWide(!wide)}
          title={wide ? tr("Свернуть панель инструментов до значков") : tr("Развернуть панель инструментов с названиями")}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
            <path d={wide ? "M15 6 L9 12 L15 18" : "M9 6 L15 12 L9 18"} />
          </svg>
        </button>
      )}
      {onToggleWide && <div className="rail-edge" onMouseDown={startEdgeDrag} title={tr("Потяните вправо, чтобы показать названия инструментов")} />}
      <span className="grow" />
      {children}
    </nav>
  );
}
