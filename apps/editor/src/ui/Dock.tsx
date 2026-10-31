// Docking layout, the way Unity and Blender arrange panels: three zones
// (left, right, bottom) with tabs, draggable splitters between zones and
// the views, tabs that can be dragged to another zone or onto the views
// (a floating window), and floating windows inside the editor for panels
// someone wants apart. Tab dragging uses plain mouse events rather than
// HTML5 drag and drop, which the Windows webview reserves for file drops.
// The layout is plain data so the app can remember it.

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { zoomed } from "../viewport/dpi";
import { t as tr, lazy } from "../i18n";

export type Zone = "left" | "right" | "bottom";
export const ZONES: Zone[] = ["left", "right", "bottom"];
export const ZONE_TITLES: Record<Zone, string> = lazy(() => ({ left: tr("слева"), right: tr("справа"), bottom: tr("снизу") }));

export interface ZoneState {
  tabs: string[];
  active: string | null;
  /** Width of a side zone or height of the bottom zone, in CSS pixels. */
  size: number;
  /** Folded to its tab strip. */
  collapsed?: boolean;
}

export interface FloatState {
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DockLayout {
  zones: Record<Zone, ZoneState>;
  floating: FloatState[];
}

export function defaultLayout(tabs: string[], active: string | null = null): DockLayout {
  return {
    zones: {
      left: { tabs: [], active: null, size: 300 },
      right: { tabs: [...tabs], active, size: 340 },
      bottom: { tabs: [], active: null, size: 240 },
    },
    floating: [],
  };
}

/** A layout with the listed panels in each zone (first one open); the rest become tabs on the right. */
function layoutWith(known: string[], zones: Partial<Record<Zone, string[]>>, sizes: Partial<Record<Zone, number>> = {}): DockLayout {
  const out = defaultLayout([]);
  const used = new Set<string>();
  for (const z of ZONES) {
    const tabs = (zones[z] ?? []).filter((t) => known.includes(t) && !used.has(t));
    tabs.forEach((t) => used.add(t));
    out.zones[z] = { tabs, active: tabs[0] ?? null, size: sizes[z] ?? out.zones[z].size };
  }
  for (const k of known) if (!used.has(k)) out.zones.right.tabs.push(k);
  if (!out.zones.right.active) out.zones.right.active = out.zones.right.tabs[0] ?? null;
  return out;
}

export interface LayoutPreset {
  id: string;
  title: string;
  hint: string;
  build(known: string[]): DockLayout;
}

/** Ready-made arrangements; `known` is the list of panels that can be tabs, in default order. */
export const LAYOUT_PRESETS: LayoutPreset[] = lazy(() => [
  {
    id: "engine",
    title: tr("Как в движке"),
    hint: tr("Инспектор, карта, сборка и ассистент вкладками справа; браузер текстур, моделей и префабов снизу, как в Unity и Unreal"),
    build: (k) =>
      layoutWith(
        k,
        {
          right: ["inspector", "properties", "visgroups", "entities", "world", "problems", "resources", "history", "compile", "gameview", "workshop", "assistant"],
          bottom: ["textures", "paint", "models", "sounds", "prefabs"],
        },
        { right: 380, bottom: 300 },
      ),
  },
  { id: "default", title: tr("По умолчанию"), hint: tr("Все панели вкладками справа, открыт инспектор"), build: (k) => layoutWith(k, { right: k }) },
  {
    id: "hammer",
    title: "Hammer",
    hint: tr("Текстуры, модели, visgroups и энтити справа, как object bar в Hammer; сборка, проблемы и история снизу"),
    build: (k) =>
      layoutWith(
        k,
        { right: ["textures", "paint", "models", "sounds", "assistant", "visgroups", "entities", "prefabs", "world"], bottom: ["compile", "gameview", "problems", "history"] },
        { right: 360, bottom: 220 },
      ),
  },
  {
    id: "modeling",
    title: tr("Моделирование"),
    hint: tr("Текстуры, модели и префабы слева; инспектор, свойства, visgroups и энтити справа; проблемы и сборка снизу"),
    build: (k) =>
      layoutWith(
        k,
        {
          left: ["textures", "paint", "models", "sounds", "assistant", "prefabs"],
          right: ["inspector", "properties", "visgroups", "entities", "world"],
          bottom: ["problems", "compile", "gameview", "history"],
        },
        { left: 320, right: 340, bottom: 200 },
      ),
  },
  {
    id: "compile",
    title: tr("Сборка"),
    hint: tr("Сборка и проблемы во всю ширину снизу, остальное вкладками справа"),
    build: (k) => layoutWith(k, { bottom: ["compile", "problems"], right: k }, { bottom: 300 }),
  },
]);

/** A layout the user saved under a name. */
export interface SavedLayout {
  name: string;
  layout: DockLayout;
}

export function loadSavedLayouts(known: string[]): SavedLayout[] {
  try {
    const raw = localStorage.getItem("gme.layouts");
    const arr: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is { name: unknown; layout: unknown } => !!x && typeof x === "object" && typeof (x as { name?: unknown }).name === "string")
      .map((x) => ({ name: String(x.name), layout: normalizeLayout(x.layout, known) }));
  } catch {
    return [];
  }
}

/** A stored layout made valid again: every known panel exactly once, sizes sane. */
export function normalizeLayout(raw: unknown, known: string[]): DockLayout {
  const base = defaultLayout(known);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<DockLayout>;
  const seen = new Set<string>();
  const out = defaultLayout([]);
  for (const z of ZONES) {
    const zone = r.zones?.[z];
    // One pass that records as it goes, so a tab listed twice in a zone is kept once.
    const tabs: string[] = [];
    if (Array.isArray(zone?.tabs)) {
      for (const t of zone!.tabs) {
        if (typeof t === "string" && known.includes(t) && !seen.has(t)) {
          seen.add(t);
          tabs.push(t);
        }
      }
    }
    const size = Number(zone?.size);
    out.zones[z] = {
      tabs,
      active: typeof zone?.active === "string" && tabs.includes(zone.active) ? zone.active : null,
      size: Number.isFinite(size) && size >= 240 && size <= 1200 ? size : base.zones[z].size,
      collapsed: zone?.collapsed === true,
    };
  }
  out.floating = Array.isArray(r.floating)
    ? r.floating
        .filter((f) => f && typeof f.kind === "string" && known.includes(f.kind) && !seen.has(f.kind))
        .map((f) => {
          seen.add(f.kind);
          return { kind: f.kind, x: Number(f.x) || 80, y: Number(f.y) || 80, w: Math.max(240, Number(f.w) || 360), h: Math.max(160, Number(f.h) || 420) };
        })
    : [];
  // Panels the stored layout does not know go to the right zone.
  for (const k of known) if (!seen.has(k)) out.zones.right.tabs.push(k);
  return out;
}

/** The zone's tabs as groups, in the groups' order; panels outside any group stand alone. */
type TabGroup = { id: string; title: string; panels: string[]; icon?: string };

function groupsOf(tabs: string[], groups?: TabGroup[]): TabGroup[] {
  if (!groups) return tabs.map((t) => ({ id: t, title: t, panels: [t] }));
  const out: TabGroup[] = [];
  const taken = new Set<string>();
  for (const g of groups) {
    const here = g.panels.filter((k) => tabs.includes(k));
    if (!here.length) continue;
    out.push({ id: g.id, title: g.title, panels: here, icon: g.icon });
    for (const k of here) taken.add(k);
  }
  // A standalone tab gets its own id namespace, so it never collides with a group of the same name.
  for (const t of tabs) if (!taken.has(t)) out.push({ id: `tab:${t}`, title: t, panels: [t] });
  // Standalone panels keep their own titles through `titles` at render time.
  return out;
}

/** Panels on screen: the active tab of each zone and every floating window. */
export function visiblePanels(layout: DockLayout): string[] {
  const out: string[] = [];
  for (const z of ZONES) if (layout.zones[z].active) out.push(layout.zones[z].active!);
  for (const f of layout.floating) out.push(f.kind);
  return out;
}

/** Takes a panel out of the layout altogether (for panels that are not tabs, like the new-map form). */
export function removePanel(layout: DockLayout, kind: string): DockLayout {
  const zones = { ...layout.zones };
  for (const z of ZONES) {
    const zs = zones[z];
    if (!zs.tabs.includes(kind)) continue;
    const at = zs.tabs.indexOf(kind);
    const tabs = zs.tabs.filter((t) => t !== kind);
    // Closing the open tab shows its neighbour, as a browser does.
    zones[z] = { ...zs, tabs, active: zs.active === kind ? (tabs[at] ?? tabs[at - 1] ?? null) : zs.active };
  }
  return { zones, floating: layout.floating.filter((f) => f.kind !== kind) };
}

/** Where a panel lives. */
export function locate(layout: DockLayout, kind: string): Zone | "float" | null {
  for (const z of ZONES) if (layout.zones[z].tabs.includes(kind)) return z;
  if (layout.floating.some((f) => f.kind === kind)) return "float";
  return null;
}

/** Brings a panel to the front where it lives (the right zone when it lives nowhere). */
export function activatePanel(layout: DockLayout, kind: string): DockLayout {
  const where = locate(layout, kind);
  if (where === "float") {
    // Raise the window: last in the list is on top.
    const f = layout.floating.find((x) => x.kind === kind)!;
    return { ...layout, floating: [...layout.floating.filter((x) => x.kind !== kind), f] };
  }
  const zone = where ?? "right";
  const zs = layout.zones[zone];
  return {
    ...layout,
    zones: { ...layout.zones, [zone]: { ...zs, tabs: zs.tabs.includes(kind) ? zs.tabs : [...zs.tabs, kind], active: kind } },
  };
}

/** Hides a panel: its zone shows nothing, or its window closes and it returns to the right zone's tabs. */
export function hidePanel(layout: DockLayout, kind: string): DockLayout {
  const where = locate(layout, kind);
  if (where === "float") return movePanel(layout, kind, "right", false);
  if (!where) return layout;
  const zs = layout.zones[where];
  return zs.active === kind ? { ...layout, zones: { ...layout.zones, [where]: { ...zs, active: null } } } : layout;
}

/** Moves a panel to a zone (front) or into a floating window. */
export function movePanel(layout: DockLayout, kind: string, target: Zone | "float", activate = true): DockLayout {
  const zones = { ...layout.zones };
  for (const z of ZONES) {
    const zs = zones[z];
    if (zs.tabs.includes(kind)) {
      const tabs = zs.tabs.filter((t) => t !== kind);
      zones[z] = { ...zs, tabs, active: zs.active === kind ? (tabs[tabs.length - 1] ?? null) : zs.active };
    }
  }
  const old = layout.floating.find((f) => f.kind === kind);
  let floating = layout.floating.filter((f) => f.kind !== kind);
  if (target === "float") {
    floating = [...floating, old ?? { kind, x: 120 + floating.length * 24, y: 90 + floating.length * 24, w: 380, h: 460 }];
  } else {
    const zs = zones[target];
    zones[target] = { ...zs, tabs: [...zs.tabs, kind], active: activate ? kind : (zs.active ?? kind) };
  }
  return { zones, floating };
}

interface Props {
  layout: DockLayout;
  onChange(next: DockLayout): void;
  titles: Record<string, string>;
  render(kind: string): React.ReactNode;
  /** Panels a zone's "+" can add. */
  allKinds: string[];
  /** One line per panel for the tab tooltip. */
  about?: Record<string, string>;
  /** Panels that can open in their own window of the program, and the opener. */
  detachable?: string[];
  onDetach?(kind: string): void;
  disabled?(kind: string): boolean;
  /** Side zones hidden (the "hide panels" toggle); floating windows stay. */
  showZones: boolean;
  /** The views. */
  children: React.ReactNode;
  /** Panels shown as one tab each; the active group's panels become a row under the tabs. */
  groups?: TabGroup[];
}

/** Width of the strip along an edge that counts as "drop into that zone" while the zone is empty. */
const DROP_STRIP = 110;

/** Fixed position for a menu of `rows` lines that stays inside the window, under CSS zoom too. */
function menuAt(x: number, y: number, rows: number): React.CSSProperties {
  const w = 260;
  const h = rows * 26 + 12;
  return {
    left: Math.max(4, Math.min(zoomed(x), zoomed(window.innerWidth) - w - 8)),
    top: Math.max(4, Math.min(zoomed(y), zoomed(window.innerHeight) - h - 8)),
  };
}

export function Dock({ layout, onChange, titles, render, allKinds, about, detachable, onDetach, disabled, showZones, children, groups }: Props) {
  /** The panel last shown in each group per zone, so a group tab returns where the user was. */
  const lastInGroup = useRef<Map<string, string>>(new Map());
  const root = useRef<HTMLDivElement>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [tabMenu, setTabMenu] = useState<{ kind: string; x: number; y: number } | null>(null);
  const [plusMenu, setPlusMenu] = useState<{ zone: Zone; x: number; y: number } | null>(null);
  /** A tab being dragged: where the cursor is and what it would drop into. */
  const [drag, setDrag] = useState<{ kind: string; x: number; y: number; target: Zone | "float" | null } | null>(null);
  /** Set when a mouseup ended a drag, so the click that follows does not toggle the tab. */
  const dragged = useRef(false);
  /** Size of the dock, so zones can never squeeze the views below a usable width. */
  const [rootSize, setRootSize] = useState({ w: 0, h: 0 });
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRootSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const VIEWS_MIN = 320;
  /** The widest a side zone may be (height for the bottom one) with the other zones as they are. */
  const maxSize = useCallback(
    (zone: Zone, l: DockLayout): number => {
      if (!rootSize.w) return 1200;
      if (zone === "bottom") return Math.max(160, rootSize.h - 240);
      const other = zone === "left" ? "right" : "left";
      const otherW = showZones && l.zones[other].tabs.length ? l.zones[other].size : 0;
      return Math.max(160, rootSize.w - otherW - VIEWS_MIN);
    },
    [rootSize, showZones],
  );

  useEffect(() => {
    if (!tabMenu && !plusMenu) return;
    const close = () => {
      setTabMenu(null);
      setPlusMenu(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [tabMenu, plusMenu]);
  const setCollapsed = (zone: Zone, collapsed: boolean) => {
    const l = layoutRef.current;
    onChange({ ...l, zones: { ...l.zones, [zone]: { ...l.zones[zone], collapsed } } });
  };

  /** Splitter drag: `axis` x for side zones, y for the bottom one. */
  const startResize = useCallback(
    (zone: Zone, e: React.MouseEvent) => {
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY, size: layoutRef.current.zones[zone].size };
      setResizing(true);
      const move = (ev: MouseEvent) => {
        let delta = 0;
        if (zone === "left") delta = ev.clientX - start.x;
        else if (zone === "right") delta = start.x - ev.clientX;
        else delta = start.y - ev.clientY;
        const l = layoutRef.current;
        const size = Math.max(zone === "bottom" ? 160 : 240, Math.min(maxSize(zone, l), start.size + delta));
        onChange({ ...l, zones: { ...l.zones, [zone]: { ...l.zones[zone], size } } });
      };
      const up = () => {
        setResizing(false);
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [maxSize, onChange],
  );

  const startFloatDrag = useCallback(
    (kind: string, mode: "move" | "resize", e: React.MouseEvent) => {
      e.preventDefault();
      const f = layoutRef.current.floating.find((x) => x.kind === kind);
      const bounds = root.current?.getBoundingClientRect();
      if (!f || !bounds) return;
      const start = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y, fw: f.w, fh: f.h };
      const move = (ev: MouseEvent) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        const l = layoutRef.current;
        const next =
          mode === "move"
            ? { x: Math.max(0, Math.min(bounds.width - 80, start.fx + dx)), y: Math.max(0, Math.min(bounds.height - 40, start.fy + dy)) }
            : { w: Math.max(240, start.fw + dx), h: Math.max(160, start.fh + dy) };
        onChange({ ...l, floating: l.floating.map((x) => (x.kind === kind ? { ...x, ...next } : x)) });
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [onChange],
  );

  /** What a tab dropped at (x, y) lands in: a zone under the cursor, an edge strip, or a window over the views. */
  const dropTargetAt = useCallback((x: number, y: number): Zone | "float" | null => {
    const b = root.current?.getBoundingClientRect();
    if (!b || x < b.left || x > b.right || y < b.top || y > b.bottom) return null;
    const zone = (document.elementFromPoint(x, y)?.closest(".dock-zone") as HTMLElement | null)?.dataset.zone as Zone | undefined;
    if (zone) return zone;
    if (x - b.left < DROP_STRIP) return "left";
    if (b.right - x < DROP_STRIP) return "right";
    if (b.bottom - y < DROP_STRIP) return "bottom";
    return "float";
  }, []);

  const startTabDrag = useCallback(
    (kind: string, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let started = false;
      const move = (ev: MouseEvent) => {
        if (!started) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          started = true;
        }
        ev.preventDefault();
        setDrag({ kind, x: ev.clientX, y: ev.clientY, target: dropTargetAt(ev.clientX, ev.clientY) });
      };
      const up = (ev: MouseEvent) => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        if (!started) return;
        // The click that follows a drop on the same tab must not toggle it; a drop elsewhere sends no click.
        dragged.current = true;
        setTimeout(() => (dragged.current = false), 0);
        setDrag(null);
        const target = dropTargetAt(ev.clientX, ev.clientY);
        if (!target || (target !== "float" && target === locate(layoutRef.current, kind))) return;
        let next = movePanel(layoutRef.current, kind, target);
        if (target === "float") {
          // The window opens where the tab was dropped.
          const b = root.current?.getBoundingClientRect();
          const x = Math.max(0, ev.clientX - (b?.left ?? 0) - 40);
          const y = Math.max(0, ev.clientY - (b?.top ?? 0) - 12);
          next = { ...next, floating: next.floating.map((f) => (f.kind === kind ? { ...f, x, y } : f)) };
        }
        onChange(next);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [dropTargetAt, onChange],
  );

  const zoneView = (zone: Zone) => {
    const zs = layout.zones[zone];
    if (!zs.tabs.length) return null;
    const folded = !!zs.collapsed || !zs.active;
    const size = Math.min(zs.size, maxSize(zone, layout));
    const side = zone !== "bottom";
    const style = folded ? (side ? { width: 28 } : { height: "auto" }) : side ? { width: size } : { height: size };
    const addable = allKinds.filter((k) => !zs.tabs.includes(k));
    return (
      <div className={`dock-zone dock-${zone}${folded ? " folded" : ""}${drag?.target === zone ? " drop-target" : ""}`} style={style} data-zone={zone}>
        <div className="panel-tabs">
          {groupsOf(zs.tabs, groups).map((g) => {
            const activeHere = zs.active && g.panels.includes(zs.active) ? zs.active : null;
            const kind = activeHere ?? lastInGroup.current.get(`${zone}:${g.id}`) ?? g.panels[0];
            const on = !!activeHere && !zs.collapsed;
            return (
              <button
                key={g.id}
                data-tab={kind}
                className={`panel-tab${on ? " active" : ""}${drag?.kind === kind ? " dragging" : ""}`}
                disabled={disabled?.(kind)}
                onMouseDown={(e) => {
                  if (e.button === 1) e.preventDefault();
                  startTabDrag(kind, e);
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    let l = layout;
                    for (const k of g.panels) l = removePanel(l, k);
                    onChange(l);
                  }
                }}
                onClick={() => {
                  if (dragged.current) {
                    dragged.current = false;
                    return;
                  }
                  if (zs.collapsed) {
                    const l = activatePanel(layout, kind);
                    onChange({ ...l, zones: { ...l.zones, [zone]: { ...l.zones[zone], collapsed: false } } });
                  } else onChange(on ? hidePanel(layout, kind) : activatePanel(layout, kind));
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setTabMenu({ kind, x: e.clientX, y: e.clientY });
                }}
                title={`${g.title}${g.panels.length > 1 ? `: ${g.panels.map((k) => titles[k] ?? k).join(", ")}` : ""}\n${about?.[kind] ?? ""}`}
              >
                {g.icon ? <Icon name={g.icon} size={13} className="tab-icon" /> : null}
                {g.panels.length === 1 && g.id === g.panels[0] ? (titles[g.id] ?? g.title) : g.title}
              </button>
            );
          })}
          <span className="grow" />
          {addable.length > 0 && (
            <button
              className="tab-tool"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setPlusMenu({ zone, x: r.left, y: r.bottom + 2 });
              }}
              title={tr("Добавить панель в эту зону")}
            >
              <Icon name="plus" size={12} />
            </button>
          )}
          {zs.active && (
            <button
              className="tab-tool"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setCollapsed(zone, !zs.collapsed)}
              title={zs.collapsed ? tr("Развернуть зону") : tr("Свернуть зону до вкладок")}
            >
              <Icon
                name={
                  zs.collapsed
                    ? zone === "bottom"
                      ? "chevronUp"
                      : zone === "left"
                        ? "chevronRight"
                        : "chevronLeft"
                    : zone === "bottom"
                      ? "chevronDown"
                      : zone === "left"
                        ? "chevronLeft"
                        : "chevronRight"
                }
                size={12}
              />
            </button>
          )}
        </div>
        {!folded &&
          (() => {
            const g = groupsOf(zs.tabs, groups).find((x) => x.panels.includes(zs.active!));
            if (g) lastInGroup.current.set(`${zone}:${g.id}`, zs.active!);
            return g && g.panels.length > 1 ? (
              <div className="panel-subtabs">
                {g.panels.map((k) => (
                  <button key={k} className={`subtab${zs.active === k ? " on" : ""}`} onClick={() => onChange(activatePanel(layout, k))} title={about?.[k] ?? ""} disabled={disabled?.(k)}>
                    {titles[k] ?? k}
                  </button>
                ))}
              </div>
            ) : null;
          })()}
        {!folded && <div className="dock-body">{render(zs.active!)}</div>}
      </div>
    );
  };

  const bottom = layout.zones.bottom;
  return (
    <div className={`dock${resizing ? " resizing" : ""}`} ref={root}>
      {showZones && zoneView("left")}
      {showZones && layout.zones.left.tabs.length > 0 && !layout.zones.left.collapsed && layout.zones.left.active && (
        <div className="dock-splitter v" onMouseDown={(e) => startResize("left", e)} title={tr("Ширина левой зоны")} />
      )}
      <div className="dock-center">
        <div className="dock-views">
          {children}
          {drag && <div className={`drop-hint float${drag.target === "float" ? " on" : ""}`}>{tr("В отдельное окно")}</div>}
        </div>
        {showZones && bottom.tabs.length > 0 && (
          <>
            {!bottom.collapsed && bottom.active && <div className="dock-splitter h" onMouseDown={(e) => startResize("bottom", e)} title={tr("Высота нижней зоны")} />}
            {zoneView("bottom")}
          </>
        )}
      </div>
      {showZones && layout.zones.right.tabs.length > 0 && !layout.zones.right.collapsed && layout.zones.right.active && (
        <div className="dock-splitter v" onMouseDown={(e) => startResize("right", e)} title={tr("Ширина правой зоны")} />
      )}
      {showZones && zoneView("right")}
      {drag &&
        ZONES.filter((z) => !layout.zones[z].tabs.length || !showZones).map((z) => (
          <div key={z} className={`drop-hint strip ${z}${drag.target === z ? " on" : ""}`}>
            {ZONE_TITLES[z]}
          </div>
        ))}
      {drag && (
        <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }}>
          {titles[drag.kind] ?? drag.kind}
        </div>
      )}
      {layout.floating.map((f) => (
        <div
          key={f.kind}
          className="float-win"
          style={{ left: rootSize.w ? Math.max(0, Math.min(f.x, rootSize.w - 120)) : f.x, top: rootSize.h ? Math.max(0, Math.min(f.y, rootSize.h - 40)) : f.y, width: f.w, height: f.h }}
          onMouseDown={() => onChange(activatePanel(layout, f.kind))}
        >
          <div className="float-head" onMouseDown={(e) => startFloatDrag(f.kind, "move", e)}>
            <strong className="grow">{titles[f.kind] ?? f.kind}</strong>
            {ZONES.map((z) => (
              <button key={z} onMouseDown={(e) => e.stopPropagation()} onClick={() => onChange(movePanel(layout, f.kind, z))} title={tr("Пристыковать {0}", [ZONE_TITLES[z]])}>
                {z === "left" ? "⇤" : z === "right" ? "⇥" : "⤓"}
              </button>
            ))}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onChange(removePanel(layout, f.kind))}
              title={tr("Закрыть окно и панель. Открыть снова можно через меню «Окно» или «+» в зоне")}
            >
              ✕
            </button>
          </div>
          <div className="float-body">{render(f.kind)}</div>
          <div className="float-resize" onMouseDown={(e) => startFloatDrag(f.kind, "resize", e)} title={tr("Потяните, чтобы изменить размер окна")} />
        </div>
      ))}
      {tabMenu && (
        <div className="menu-list context-menu" style={menuAt(tabMenu.x, tabMenu.y, 6)} onMouseDown={(e) => e.stopPropagation()}>
          {ZONES.filter((z) => locate(layout, tabMenu.kind) !== z).map((z) => (
            <button
              key={z}
              className="menu-item"
              onClick={() => {
                onChange(movePanel(layout, tabMenu.kind, z));
                setTabMenu(null);
              }}
            >
              <span className="grow">
                {tr("Пристыковать")} {ZONE_TITLES[z]}
              </span>
            </button>
          ))}
          <button
            className="menu-item"
            onClick={() => {
              onChange(movePanel(layout, tabMenu.kind, "float"));
              setTabMenu(null);
            }}
          >
            <span className="grow">{tr("Открепить в плавающее окно")}</span>
          </button>
          {onDetach && detachable?.includes(tabMenu.kind) && (
            <button
              className="menu-item"
              onClick={() => {
                onDetach(tabMenu.kind);
                setTabMenu(null);
              }}
            >
              <span className="grow">{tr("Открыть в отдельном окне")}</span>
              <span className="muted menu-key">{tr("для другого монитора")}</span>
            </button>
          )}
          <div className="menu-sep" />
          <button
            className="menu-item"
            onClick={() => {
              onChange(removePanel(layout, tabMenu.kind));
              setTabMenu(null);
            }}
          >
            <span className="grow">{tr("Закрыть вкладку")}</span>
            <span className="muted menu-key">{tr("СКМ")}</span>
          </button>
        </div>
      )}
      {plusMenu && (
        <div className="menu-list context-menu" style={menuAt(plusMenu.x, plusMenu.y, allKinds.length)} onMouseDown={(e) => e.stopPropagation()}>
          {allKinds
            .filter((k) => !layout.zones[plusMenu.zone].tabs.includes(k))
            .map((k) => (
              <button
                key={k}
                className="menu-item"
                disabled={disabled?.(k)}
                onClick={() => {
                  const l = movePanel(layout, k, plusMenu.zone);
                  onChange({ ...l, zones: { ...l.zones, [plusMenu.zone]: { ...l.zones[plusMenu.zone], collapsed: false } } });
                  setPlusMenu(null);
                }}
              >
                <span className="grow">{titles[k] ?? k}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
