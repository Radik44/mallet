// The editor window: menu bar, toolbar, tool rail, views, dock and status bar.
// Moved out of App.tsx whole; the editor comes in as one object.

import { EntityLabels } from "../ui/EntityLabels";
import { NotePins } from "../ui/NotePins";
import { AxisWidget } from "../ui/AxisWidget";
import { ExprField } from "../ui/ExprField";
import { pairText, selectionMix, sizeText } from "./measure";
import { objectIndexOf } from "../map/loader";
import { useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SATELLITE, SATELLITE_PANEL, SAT_ANY } from "../ui/satellite";
import { fakeContent, api, inTauri, thumbnailUrl } from "../tauri";
import { CommandPalette } from "../ui/CommandPalette";
import { MenuBar } from "../ui/MenuBar";
import { ToolRail, TOOL_ICON_PATHS } from "../ui/ToolRail";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { ContextMenu } from "../ui/ContextMenu";
import { Select } from "../ui/Select";
import { ASSET_TITLES } from "../ui/assetDrag";
import { Icon } from "../ui/Icon";
import { CommunityLinks, SupportMenu } from "../ui/Community";
import { ClassPicker } from "../ui/ClassPicker";
import { Toolbar, type ToolbarItem } from "../ui/Toolbar";
import { TooltipLayer } from "../ui/Tooltip";
import { Dock, visiblePanels } from "../ui/Dock";
import { FirstSteps } from "../ui/FirstSteps";
import { Tour } from "../ui/Tour";
import { Onboarding } from "../ui/Onboarding";
import { KEYMAP_PRESETS } from "../ui/hotkeys";
import { CLIP_KEEP_NAMES, type ClipKeep } from "../viewport/clipper";
import { type ViewKind } from "../viewport/camera2d";
import { VIEW_KINDS } from "./constants";
import { ALL_VIEWS, VIEW_NAMES, cellStyle, dockView, floatView, gridStyle, gridViews, toggleMax } from "../ui/viewsLayout";
import { type HandleMode } from "../viewport/handles";
import { Panel, TAB_PANELS, PANEL_TITLES, PANEL_ABOUT, PANEL_GROUPS, TOOL_HINTS, TOOL_NAMES, VIEW_MODE_NAMES, SHAPE_NAMES, type ViewMode, type Shape } from "./constants";
import type { EditorApi } from "./editorApi";
import { LANDSCAPE_MODES } from "../ui/LandscapePanel";
import { addScatterModel } from "./scatter";
import { DockPanel } from "./Panels";
import { SoundSetup } from "../ui/SoundSetup";
import { soundUrl } from "../tauri";
import { t as tr } from "../i18n";

export function Shell({ e }: { e: EditorApi }) {
  /** The name tag that follows the cursor over an entity, moved straight in the DOM to keep the shell from re-rendering on every mouse move. */
  const hoverTagRef = useRef<HTMLDivElement | null>(null);
  /** The status bar's cursor readout (Hammer shows the 2D cursor's coordinates there); written straight to the DOM on every move. */
  const cursorRef = useRef<HTMLSpanElement | null>(null);
  const hoverTagPos = useRef("translate(-9999px, 0)");
  const {
    showAll,
    canvasRef,
    canvas2dRefs,
    overlayRefs,
    currentPath,
    handleModeUi,
    setHandleMode,
    gpu,
    gpuOk,
    content,
    mapName,
    mapInfo,
    render,
    busy,
    error,
    lockedViews,
    toggleViewLock,
    views,
    viewsRef,
    viewsEl,
    viewsSize,
    setViews,
    viewDrag,
    startViewDrag,
    startViewFloat,
    startViewSplit,
    selectedCount,
    hist,
    gridSize,
    tool,
    railWide,
    setRailWide,
    paintClick,
    setPaintClick,
    textureLock,
    snapMoves,
    statusText,
    cordonState,
    clipKeep,
    currentMaterial,
    currentModel,
    showColumn,
    setShowColumn,
    layout,
    layoutRef,
    applyLayout,
    pruneTransient,
    panel,
    setPanelState,
    panelRef,
    setPanel,
    setPaletteOpen,
    paletteOpen,
    setKeymap,
    landscape,
    setLandscape,
    shape,
    prim,
    tieClass,
    solidClasses,
    autosaveNote,
    cheatOpen,
    setCheatOpen,
    setRestoreOffer,
    restoreOffer,
    contextMenu,
    setContextMenu,
    leftHeld,
    dialog,
    answerDialog,
    firstSteps,
    showFirstSteps,
    soundSetup,
    setSoundSetup,
    setEntityKeys,
    selectObject,
    setShowFirstSteps,
    setTourIndex,
    tourIndex,
    onboardingOpen,
    theme,
    setTheme,
    showHints,
    bridge,
    recent,
    entityClass,
    viewMode,
    setViewMode,
    pathChain,
    setPathChain,
    scatter,
    setScatter,
    pickingTarget,
    pickingModel,
    classList,
    loadClassList,
    setEntityClass,
    setShape,
    setPrim,
    setTieClass,
    setClipKeep,
    setTool,
    setQuickCut,
    quickCut,
    quickCutSelection,
    setCordonActive,
    removeCordon,
    setHollowThickness,
    hollowThickness,
    hollowSelection,
    mirrorSelection,
    symmetry,
    setSymmetry,
    selectionBoundsRef,
    objectBounds,
    session,
    setStatusText,
    current,
    selection,
    tieSelection,
    openPanelWindow,
    openSatellite,
    assetDrag,
    modelThumbs,
    hintShown,
    openPath,
    restoreAutosave,
    openPanel,
    goToPoint,
    projectMeta,
    paletteExtra,
    commands,
    tourSteps,
    startTour,
    finishOnboarding,
    keymapPreset,
    byId,
    contextItems,
    menus,
    openDialog,
    onDoubleClick3D,
    onMouseMove,
    onMouseLeave,
    onMouseDown,
    onMouseUp,
    contentText,
    hover,
    hoverText,
  } = e;
  // The axis widget reads the 3D camera every frame; a stable getter keeps its effect from restarting.
  const axisCamera = useRef(() => session.current?.camera ?? null).current;
  const notesRef = useRef(projectMeta.pins);
  notesRef.current = projectMeta.pins;
  const notesList = useRef(() => notesRef.current).current;
  const labelCanvas = useRef(() => canvasRef.current).current;
  // Labels stand at a point entity's origin and in the middle of a brush entity's brushes (a door's
  // origin is its hinge, or nothing). Worked out once per rebuilt mesh, not every frame.
  const labelCache = useRef(new WeakMap<object, { id: number; targetname: string | null; origin: [number, number, number] | null }[]>());
  const labelEntities = useRef(() => {
    const map = current.current;
    if (!map) return [];
    const key = map.mesh.solidBounds;
    const cached = labelCache.current.get(key);
    if (cached && cached.length === map.entities.length) return cached;
    const index = new Map<number, number>();
    map.mesh.solidIds.forEach((id, i) => index.set(id, i));
    const b = map.mesh.solidBounds;
    const list = map.entities.map((e) => {
      if (!e.brush) return { id: e.id, targetname: e.targetname, origin: e.origin };
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (const sid of map.doc.entity_solids(e.id) as Uint32Array) {
        const i = index.get(sid);
        if (i === undefined) continue;
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], b[i * 6 + k]);
          hi[k] = Math.max(hi[k], b[i * 6 + 3 + k]);
        }
      }
      const origin = Number.isFinite(lo[0]) ? ([0, 1, 2].map((k) => (lo[k] + hi[k]) / 2) as [number, number, number]) : e.origin;
      return { id: e.id, targetname: e.targetname, origin };
    });
    labelCache.current.set(key, list);
    return list;
  }).current;
  const mapInfoShort = mapInfo
    ? mapInfo
        .split(", ")
        .filter((p) => /брашей|энтити|невалидных|предупреждений/.test(p))
        .join(" · ")
    : "";
  const renderPanel = (slot: Panel) => <DockPanel slot={slot} e={e} />;
  return (
    <div className={SATELLITE ? "shell satellite" : SATELLITE_PANEL ? "shell satpanel" : "shell"}>
      <TooltipLayer />
      {!SAT_ANY && (
        <MenuBar
          menus={menus}
          right={
            <>
              {mapName && (
                <span className="menubar-map" title={currentPath.current ?? ""}>
                  {mapName}
                  {hist?.dirty ? " *" : ""}
                </span>
              )}
              {busy && <span className="muted">{busy}</span>}
              <CommunityLinks compact />
              <SupportMenu />
            </>
          }
        />
      )}
      {!SAT_ANY && (
        <div className="topbar">
          {mapName && (
            <Toolbar
              byId={byId}
              items={
                [
                  { id: "new", icon: "file" },
                  { id: "open", icon: "folder" },
                  { id: "save", icon: "save" },
                  "sep",
                  { id: "undo", icon: "undo" },
                  { id: "redo", icon: "redo" },
                  "sep",
                  { id: "delete", icon: "trash" },
                  { id: "group", icon: "group" },
                  { id: "ungroup", icon: "ungroup" },
                  "sep",
                  { id: "hide", icon: "eyeOff" },
                  { id: "showall", icon: "eye" },
                  { id: "focus", icon: "focus" },
                  "sep",
                  { id: "grid-down", icon: "gridSmall" },
                  { id: "grid-up", icon: "gridBig" },
                  { id: "snap", icon: "snap", active: snapMoves },
                  { id: "lock", icon: "texlock", active: textureLock },
                ] as ToolbarItem[]
              }
            />
          )}
          <ToolRail
            variant="hammer"
            wide={railWide}
            onToggleWide={setRailWide}
            tool={tool}
            onTool={setTool}
            hotkeys={{
              select: commands.find((c) => c.id === "t-select")?.hotkey,
              block: commands.find((c) => c.id === "t-block")?.hotkey,
              texture: commands.find((c) => c.id === "t-tex")?.hotkey,
              entity: commands.find((c) => c.id === "t-ent")?.hotkey,
              clip: commands.find((c) => c.id === "t-clip")?.hotkey,
              vertex: commands.find((c) => c.id === "t-vertex")?.hotkey,
              cordon: commands.find((c) => c.id === "t-cordon")?.hotkey,
              landscape: commands.find((c) => c.id === "t-landscape")?.hotkey,
              measure: commands.find((c) => c.id === "t-measure")?.hotkey,
            }}
          >
            <button
              className={`rail-btn${panel === "settings" ? " active" : ""}`}
              onClick={() => setPanel((p) => (p === "settings" ? "none" : "settings"))}
              title={tr("Настройки: раскладка, тема, клавиши")}
            >
              <Icon name="settings" size={18} />
            </button>
            <button
              className={`rail-btn${showColumn ? "" : " active"}`}
              onClick={() => setShowColumn(!showColumn)}
              title={showColumn ? tr("Скрыть панели (Ctrl+Shift+P)") : tr("Показать панели (Ctrl+Shift+P)")}
            >
              {showColumn ? "▸" : "◂"}
            </button>
            <button className="rail-btn" data-tour="palette" onClick={() => setPaletteOpen(true)} title={tr("Палитра команд: все действия по названию (Ctrl+P, F1)")}>
              <Icon name="search" size={18} />
            </button>
          </ToolRail>
          {mapName && (
            <div className="topbar-right">
              {(["compile", "game", "game-debug"] as const).map((id) => {
                const c = byId.get(id);
                if (!c) return null;
                const tone = id === "compile" ? "build" : id === "game" ? "play" : "debug";
                return (
                  <button key={id} data-cmd={id} className={`topbar-btn tb-${tone}`} disabled={c.disabled} onClick={() => c.run()} title={`${c.title}${c.hotkey ? ` (${c.hotkey})` : ""}`}>
                    <Icon name={tone === "build" ? "build" : tone === "play" ? "play" : "bug"} size={16} />
                    {tone === "build" ? tr("Собрать") : tone === "play" ? tr("Играть") : tr("Отладка")}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {!SAT_ANY && (
        <div
          className={`context-bar${mapName ? "" : " idle"}`}
          onWheel={(e) => {
            // A narrow window: the row scrolls sideways under the wheel instead of wrapping.
            const el = e.currentTarget;
            if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
          }}
        >
          <div className="ctx-group ctx-tool">
            <span className="context-tool" data-tool={tool} title={TOOL_HINTS[tool]}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
                <path d={TOOL_ICON_PATHS[tool]} />
              </svg>
              {TOOL_NAMES[tool]}
            </span>
            {tool === "block" && (
              <>
                <span className="seg">
                  {(Object.keys(SHAPE_NAMES) as Shape[]).map((k) => (
                    <button key={k} className={`seg-btn${shape === k ? " active" : ""}`} onClick={() => setShape(k)} title={tr("{0}: форма нового браша", [SHAPE_NAMES[k]])}>
                      <Icon name={k === "block" ? "hollow" : k === "wedge" ? "wedge" : k === "cylinder" ? "cylinder" : k === "sphere" ? "sphere" : k === "stairs" ? "stairs" : "arch"} size={15} />
                    </button>
                  ))}
                </span>
                {shape === "stairs" && (
                  <span className="seg" title={tr("Высота одной ступени в юнитах: 8 - пологая, 16 - обычная, 18 - предел шага игрока в Source")}>
                    <span className="seg-label">{tr("ступень")}</span>
                    <ExprField className="seg-input" value={prim.step} onCommit={(v) => setPrim({ step: Math.max(1, Math.min(256, v || 16)) })} />
                    <button
                      className={`seg-btn${prim.reverse ? " active" : ""}`}
                      onClick={() => setPrim({ reverse: !prim.reverse })}
                      title={prim.reverse ? tr("Подъём к ближнему краю рамки. Нажмите, чтобы развернуть") : tr("Подъём к дальнему краю рамки. Нажмите, чтобы развернуть")}
                    >
                      ↔
                    </button>
                  </span>
                )}
                {shape !== "block" && shape !== "wedge" && shape !== "stairs" && (
                  <span className="seg" title={tr("Число боковых граней")}>
                    <span className="seg-label">
                      <Icon name="sides" size={13} /> {tr("сторон")}
                    </span>
                    <ExprField className="seg-input" value={prim.sides} onCommit={(v) => setPrim({ sides: Math.max(3, Math.min(128, v || 8)) })} />
                  </span>
                )}
                {shape === "arch" && (
                  <>
                    <span className="seg" title={tr("Толщина стенки арки в юнитах")}>
                      <span className="seg-label">{tr("стенка")}</span>
                      <ExprField className="seg-input" value={prim.wall} onCommit={(v) => setPrim({ wall: v || 0 })} />
                    </span>
                    <span className="seg" title={tr("Дуга арки в градусах: 180 - половина кольца, 360 - кольцо целиком")}>
                      <span className="seg-label">{tr("дуга°")}</span>
                      <ExprField className="seg-input" value={prim.arc} onCommit={(v) => setPrim({ arc: v || 0 })} />
                    </span>
                  </>
                )}
              </>
            )}
            {tool === "clip" && (
              <>
                <span className="seg" title={tr("Какая часть остаётся после разреза")}>
                  <span className="seg-label">{tr("остаётся")}</span>
                  {([0, 1, 2] as ClipKeep[]).map((k) => (
                    <button
                      key={k}
                      className={`seg-btn${clipKeep === k ? " active" : ""}`}
                      onClick={() => setClipKeep(k)}
                      title={tr("После разреза остаётся: {0}. Заштрихованная часть удаляется; клавиша 5 переключает режим", [CLIP_KEEP_NAMES[k]])}
                    >
                      <Icon name={k === 0 ? "keepBoth" : k === 1 ? "keepBack" : "keepFront"} size={15} />
                    </button>
                  ))}
                </span>
                <span className="seg" title={tr("Быстрый разрез выделения на равные части вдоль оси, без рисования линии")}>
                  <span className="seg-label">{tr("на")}</span>
                  <ExprField className="seg-input" value={quickCut.parts} onCommit={(v) => setQuickCut({ ...quickCut, parts: Math.max(2, Math.min(64, v || 2)) })} />
                  {(["x", "y", "z"] as const).map((ax) => (
                    <button
                      key={ax}
                      className={`seg-btn${quickCut.axis === ax ? " active" : ""}`}
                      onClick={() => setQuickCut({ ...quickCut, axis: ax })}
                      title={tr("Резать вдоль оси {0}", [ax.toUpperCase()])}
                    >
                      {ax.toUpperCase()}
                    </button>
                  ))}
                  <button
                    className="seg-btn"
                    disabled={!selectedCount}
                    onClick={() => void quickCutSelection()}
                    title={tr("Разрезать выделение на {0} равных частей вдоль {1}", [quickCut.parts, quickCut.axis.toUpperCase()])}
                  >
                    <Icon name="scissors" size={15} />
                  </button>
                </span>
              </>
            )}
            {(tool === "cordon" || cordonState) && cordonState && (
              <>
                <button
                  className={`icon-btn${cordonState.active ? " active" : ""}`}
                  onClick={() => setCordonActive(!cordonState.active)}
                  title={cordonState.active ? tr("Кордон включён: в сборку попадает только содержимое рамки. Нажмите, чтобы выключить") : tr("Кордон выключен. Нажмите, чтобы включить")}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
                    <path d={TOOL_ICON_PATHS.cordon} />
                  </svg>
                </button>
                <button className="icon-btn" onClick={() => void removeCordon()} title={tr("Удалить кордон с карты")}>
                  <Icon name="trash" />
                </button>
              </>
            )}
            {tool === "entity" && (
              <>
                <span className="seg seg-field" title={tr("Класс новой энтити: начните печатать и выберите из списка")}>
                  <span className="seg-label">{tr("класс")}</span>
                  <ClassPicker
                    value={entityClass}
                    onChange={setEntityClass}
                    classes={classList}
                    onFocus={loadClassList}
                    title={tr("Класс новой энтити: начните печатать и выберите из списка")}
                    width={200}
                  />
                </span>
                <button
                  className={`icon-btn${pathChain ? " active" : ""}`}
                  onClick={() => setPathChain(!pathChain)}
                  title={tr("Цепочка: новые энтити получают имена path1, path2… и ссылаются друг на друга (для path_track, path_corner)")}
                >
                  <Icon name="chain" />
                </button>
                {entityClass.trim().startsWith("prop_") && (
                  <button
                    className={`chip${scatter.on ? " on" : ""}`}
                    onClick={() => setScatter({ on: !scatter.on })}
                    title={tr("Кисть пропов: зажмите кнопку мыши и ведите по поверхности - модели из набора расставляются с заданным шагом и случайным поворотом")}
                  >
                    <Icon name="brush" size={13} /> {tr("Кисть пропов")}
                  </button>
                )}
                {entityClass.trim().startsWith("prop_") && scatter.on && (
                  <>
                    <span className="seg" title={tr("Минимальное расстояние между пропами в юнитах")}>
                      <span className="seg-label">{tr("шаг")}</span>
                      <ExprField className="seg-input" step={8} value={scatter.spacing} onCommit={(v) => setScatter({ spacing: Math.max(1, v || 1) })} />
                    </span>
                    <label className="chk" title={tr("Случайный поворот каждого пропа с шагом 5°")}>
                      <input type="checkbox" checked={scatter.randomYaw} onChange={(e) => setScatter({ randomYaw: e.target.checked })} /> {tr("поворот")}
                    </label>
                    <span className="scatter-set" title={tr("Набор моделей кисти. Если набор пуст, используется текущая модель")}>
                      {scatter.models.map((m) => (
                        <span key={m} className="asset-chip" title={m}>
                          {m.replace(/^.*\//, "").replace(/\.mdl$/i, "")}
                          <button className="link" onClick={() => setScatter({ models: scatter.models.filter((x) => x !== m) })} title={tr("Убрать из набора")}>
                            ✕
                          </button>
                        </span>
                      ))}
                      <button
                        className="chip"
                        disabled={!currentModel || scatter.models.includes(currentModel)}
                        onClick={() => setScatter(addScatterModel(scatter, currentModel))}
                        title={tr("Добавить текущую модель из панели «Модели» в набор")}
                      >
                        {tr("+ Модель")}
                      </button>
                    </span>
                  </>
                )}
              </>
            )}
            {tool === "landscape" && (
              <>
                <Select
                  value={landscape.mode}
                  options={LANDSCAPE_MODES.map((m) => ({ value: m.value, label: m.label, hint: m.hint }))}
                  onChange={(v) => setLandscape({ mode: v as typeof landscape.mode })}
                  title={tr("Режим кисти")}
                />
                <span className="seg" title={tr("Радиус кисти в юнитах; колесо над 3D-видом меняет его")}>
                  <span className="seg-label">{tr("радиус")}</span>
                  <ExprField className="seg-input" value={landscape.radius} step={16} onCommit={(v) => setLandscape({ radius: Math.max(16, v || 16) })} />
                </span>
                <span
                  className="seg"
                  title={
                    landscape.mode === "smooth" || landscape.mode === "flatten"
                      ? tr("Сила сглаживания или выравнивания; 32 - полностью за один мазок")
                      : landscape.mode === "alpha"
                        ? tr("Альфа за один мазок (×8)")
                        : tr("Высота подъёма за один мазок в юнитах; Shift+колесо меняет")
                  }
                >
                  <span className="seg-label">{landscape.mode === "alpha" ? tr("альфа") : tr("сила")}</span>
                  <ExprField className="seg-input" value={landscape.amount} step={1} onCommit={(v) => setLandscape({ amount: Math.max(1, v || 1) })} />
                </span>
                {(landscape.mode === "raise" || landscape.mode === "noise") && (
                  <button
                    className={`icon-btn${landscape.axis === 1 ? " active" : ""}`}
                    onClick={() => setLandscape({ axis: landscape.axis === 1 ? 0 : 1 })}
                    title={landscape.axis === 1 ? tr("Вверх по мировой оси Z. Нажмите, чтобы переключить на нормаль грани") : tr("Вдоль нормали грани. Нажмите, чтобы переключить на мировую ось Z")}
                  >
                    <Icon name="up" />
                  </button>
                )}
                {landscape.mode === "noise" && (
                  <span className="seg" title={tr("Размер бугров шума в юнитах")}>
                    <span className="seg-label">{tr("шум")}</span>
                    <ExprField className="seg-input" value={landscape.scale} step={16} onCommit={(v) => setLandscape({ scale: Math.max(16, v || 16) })} />
                    <button className="seg-btn" onClick={() => setLandscape({ seed: landscape.seed + 1 })} title={tr("Новый узор шума")}>
                      <Icon name="refresh" size={14} />
                    </button>
                  </span>
                )}
                <button onClick={() => setPanel("landscape")} title={tr("Создать участок из дисплейсментов для кисти ландшафта")}>
                  {tr("Ландшафт…")}
                </button>
              </>
            )}
            {tool === "texture" && (
              <>
                <button
                  className={`icon-btn${paintClick ? " active" : ""}`}
                  onClick={() => setPaintClick(!paintClick)}
                  title={
                    paintClick
                      ? tr("Нанесение щелчками включено: щелчок назначает материал грани, Shift+щелчок - всему брашу. Нажмите, чтобы вернуться к выбору граней")
                      : tr("Нанесение щелчками: щелчок по грани назначает ей текущий материал")
                  }
                >
                  <Icon name="brush" />
                </button>
                <span className="ctx-material" title={tr("Текущий материал: {0}", [currentMaterial])}>
                  {thumbnailUrl(currentMaterial) && <img src={thumbnailUrl(currentMaterial)} alt="" />}
                  <span className="list-text">{currentMaterial.split("/").pop()}</span>
                </span>
              </>
            )}
          </div>
          {selectedCount > 0 && (tool === "select" || tool === "vertex") && (
            <div className="ctx-group ctx-selection">
              <span className="seg">
                {(["move", "rotate", "scale"] as HandleMode[]).map((m) => (
                  <button
                    key={m}
                    className={`seg-btn${handleModeUi === m ? " active" : ""}`}
                    onClick={() => setHandleMode(m)}
                    title={m === "move" ? tr("Перенос (R переключает режимы по кругу)") : m === "rotate" ? tr("Поворот; Shift - шаг 15°") : tr("Масштаб; Shift - равномерно")}
                  >
                    <Icon name={m} size={15} />
                  </button>
                ))}
              </span>
              <span className="seg seg-field" title={tr("Сделать из выделенных брашей энтити этого класса (Ctrl+T)")}>
                <span className="seg-label">{tr("Энтити")}</span>
                <ClassPicker value={tieClass} onChange={setTieClass} classes={solidClasses} onFocus={loadClassList} title={tr("Класс брашевой энтити")} width={130} />
                <button className="seg-btn chip" onClick={() => void tieSelection()} title={tr("Сделать из выделенных брашей энтити этого класса (Ctrl+T)")}>
                  <Icon name="tieEnt" size={15} /> {tr("Сделать энтити")}
                </button>
              </span>
              <span className="seg" title={tr("Сделать полым: браш превращается в комнату со стенками заданной толщины (Ctrl+H)")}>
                <span className="seg-label">{tr("Стенка")}</span>
                <ExprField
                  className="seg-input"
                  value={hollowThickness}
                  onCommit={(v) => setHollowThickness(v || 0)}
                  title={tr("Толщина стенок в юнитах; отрицательное значение строит стенки наружу")}
                />
                <button className="seg-btn chip" onClick={() => void hollowSelection()} title={tr("Сделать полым: браш становится комнатой со стенками этой толщины (Ctrl+H)")}>
                  <Icon name="hollow" size={15} /> {tr("Сделать полым")}
                </button>
              </span>
              <button className="seg-btn chip" onClick={() => void mirrorSelection()} title={tr("Отразить выделение по другую сторону плоскости симметрии (Ctrl+M)")}>
                {tr("Отразить")}
              </button>
            </div>
          )}
          {tool === "select" && mapName && (
            <div className="ctx-group">
              <button
                className={`chip${symmetry.on ? " on" : ""}`}
                onClick={() => setSymmetry({ on: !symmetry.on })}
                title={tr("Симметрия: новые браши и энтити получают зеркальную копию по другую сторону плоскости")}
              >
                {tr("Симметрия")}
              </button>
              {symmetry.on && (
                <>
                  <span className="seg">
                    {([0, 1, 2] as const).map((ax) => (
                      <button
                        key={ax}
                        className={`seg-btn${symmetry.axis === ax ? " active" : ""}`}
                        onClick={() => setSymmetry({ axis: ax })}
                        title={tr("Плоскость поперёк оси {0}", [["X", "Y", "Z"][ax]])}
                      >
                        {["X", "Y", "Z"][ax]}
                      </button>
                    ))}
                    <ExprField className="seg-input" step={gridSize} value={symmetry.pos} onCommit={(v) => setSymmetry({ pos: v || 0 })} title={tr("Положение плоскости на оси")} />
                  </span>
                  <button
                    className="chip"
                    disabled={!selectedCount}
                    onClick={() => {
                      const b = selectionBoundsRef.current();
                      if (b) setSymmetry({ pos: (b[0][symmetry.axis] + b[1][symmetry.axis]) / 2 });
                    }}
                    title={tr("Поставить плоскость через центр выделения")}
                  >
                    {tr("по выделению")}
                  </button>
                </>
              )}
            </div>
          )}
          <span className="grow" />
          {restoreOffer && (
            <span className="restore-offer">
              {tr("Найдено автосохранение новее файла (")}
              {restoreOffer.when}).
              <button onClick={() => void restoreAutosave()} title={restoreOffer.path}>
                {tr("Восстановить")}
              </button>
              <button onClick={() => setRestoreOffer(null)} title={tr("Оставить открытый файл; копия в папке autosave останется до следующего сохранения")}>
                {tr("Не восстанавливать")}
              </button>
            </span>
          )}
          {error && (
            <span className="bad list-text" title={error}>
              {error}
            </span>
          )}
          {statusText && (
            <span className="ok list-text" title={statusText}>
              {statusText}
            </span>
          )}
          {bridge && (bridge.connected || bridge.running) && (
            <span
              className={`bridge-status${bridge.connected ? " on" : ""}`}
              title={bridge.connected ? tr("Игра подключена через garrysmod/data/gme_bridge") : tr("Игра запущена, аддон моста ещё не подключился")}
            >
              <span className={`bridge-dot${bridge.connected ? " on" : " wait"}`} />
              {bridge.connected
                ? tr("игра: {0}{1}", [
                    bridge.map ?? "?",
                    bridge.pos
                      ? ` · ${bridge.pos
                          .slice(0, 3)
                          .map((v) => Math.round(v))
                          .join(" ")}`
                      : "",
                  ])
                : tr("игра запускается…")}
            </span>
          )}
        </div>
      )}
      {soundSetup && !SAT_ANY && (
        <SoundSetup
          id={soundSetup.id}
          name={soundSetup.name}
          keys={soundSetup.keys}
          soundUrl={soundUrl(soundSetup.name)}
          onKeys={(ch) => void setEntityKeys(soundSetup.id, ch)}
          onSelect={() => {
            selectObject(soundSetup.id);
            setPanel("inspector");
            setSoundSetup(null);
          }}
          onClose={() => setSoundSetup(null)}
        />
      )}
      {tourIndex !== null && !SAT_ANY && <Tour steps={tourSteps} index={tourIndex} onIndex={(i) => setTourIndex(Math.max(0, Math.min(tourSteps.length - 1, i)))} onClose={() => setTourIndex(null)} />}
      <div className="main">
        <Dock
          groups={PANEL_GROUPS}
          layout={layout}
          onChange={(next) => {
            const before = visiblePanels(layoutRef.current);
            const pruned = pruneTransient(next);
            applyLayout(pruned);
            const after = visiblePanels(pruned);
            const added = after.find((k) => !before.includes(k));
            if (added) openPanel(added as Panel);
            else if (!after.includes(panelRef.current)) {
              panelRef.current = "none";
              setPanelState("none");
            }
          }}
          titles={PANEL_TITLES}
          allKinds={[...TAB_PANELS, "world", "problems", "history", "resources", "settings"]}
          about={PANEL_ABOUT}
          detachable={inTauri ? ["textures", "models", "prefabs"] : []}
          onDetach={(kind) => openPanelWindow(kind as Panel)}
          render={(kind) => renderPanel(kind as Panel)}
          disabled={(kind) => !inTauri && !fakeContent && (kind === "models" || kind === "compile" || kind === "prefabs" || kind === "history")}
          showZones={showColumn && !SAT_ANY}
        >
          <div
            ref={viewsEl}
            className="views"
            data-tool={tool}
            style={gridStyle(gridViews(views).length, views)}
            onMouseMove={(ev) => {
              const box = viewsEl.current?.getBoundingClientRect();
              if (!box) return;
              hoverTagPos.current = `translate(${ev.clientX - box.left + 14}px, ${ev.clientY - box.top + 16}px)`;
              if (hoverTagRef.current) hoverTagRef.current.style.transform = hoverTagPos.current;
              if (cursorRef.current) {
                const kind = VIEW_KINDS.find((k) => canvas2dRefs.current[k] === ev.target);
                const v = kind && session.current?.views[kind];
                if (v) {
                  const w = v.camera.eventToWorld(ev.nativeEvent);
                  const [ax, ay] = v.camera.axes;
                  cursorRef.current.textContent = `${"XYZ"[ax]} ${Math.round(w[0])} · ${"XYZ"[ay]} ${Math.round(w[1])}`;
                } else cursorRef.current.textContent = "";
              }
            }}
            onMouseLeave={() => {
              if (cursorRef.current) cursorRef.current.textContent = "";
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              const midDrag = leftHeld.current || (e.buttons & 1) !== 0;
              if (midDrag || !mapName) return;
              setContextMenu({ x: e.clientX, y: e.clientY });
            }}
          >
            {SATELLITE && !mapName && (
              <div className="start-screen">
                <div className="muted">{tr("Ожидание карты из главного окна…")}</div>
              </div>
            )}
            {SATELLITE && (
              <div className="sat-bar">
                <span className="view-title">{VIEW_NAMES[SATELLITE]}</span>
                {SATELLITE !== "3d" && (
                  <button
                    className={`icon-btn${lockedViews.includes(SATELLITE) ? " active" : ""}`}
                    onClick={() => toggleViewLock(SATELLITE as ViewKind)}
                    title={
                      lockedViews.includes(SATELLITE)
                        ? tr("Масштаб закреплён: окно не повторяет масштаб главного окна. Нажмите, чтобы снова синхронизировать")
                        : tr("Закрепить масштаб окна: он перестанет синхронизироваться с главным и другими окнами")
                    }
                  >
                    <Icon name={lockedViews.includes(SATELLITE) ? "lock" : "unlock"} />
                  </button>
                )}
                <button
                  className="icon-btn"
                  onClick={() => {
                    void (async () => {
                      try {
                        const w = getCurrentWindow();
                        await w.setFullscreen(!(await w.isFullscreen()));
                      } catch (e) {
                        void api.log(`fullscreen: ${String(e)}`);
                      }
                    })();
                  }}
                  title={tr("Полноэкранный режим")}
                >
                  <Icon name="fullscreen" />
                </button>
              </div>
            )}
            {!mapName && gpuOk && !SAT_ANY && (
              <div className="start-screen">
                <div className="start-card">
                  <div className="start-head">
                    <span className="start-logo" aria-hidden>
                      <img src="/brand/mallet-256.png" alt="" width="40" height="40" />
                    </span>
                    <h1>Mallet</h1>
                  </div>
                  <p className="muted">{tr("Редактор карт для Garry's Mod. Начните с новой карты или откройте VMF.")}</p>
                  <div className="start-actions">
                    <button className="primary" data-tour="new-map" onClick={() => setPanel("newmap")} disabled={!!busy}>
                      {tr("Новая карта…")}
                    </button>
                    <button onClick={() => void openDialog()} disabled={!inTauri || !!busy}>
                      {tr("Открыть VMF или .map…")}
                    </button>
                  </div>
                  <CommunityLinks />
                  {recent.length > 0 && (
                    <div className="start-recent">
                      <div className="muted">{tr("Недавние")}</div>
                      {recent.map((p) => (
                        <button key={p} className="link" onClick={() => void openPath(p)} title={p}>
                          {p.split(/[\\/]/).pop()}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="muted start-tips">{tr("Справка по мыши и клавишам - кнопка «?» в строке состояния.")}</div>
                </div>
              </div>
            )}
            {showHints && !SAT_ANY && (hintShown || pickingTarget || pickingModel || (tool === "texture" && paintClick)) && (
              <div className="view-hint">
                {pickingModel
                  ? tr("Выбор модели для «{0}»: щёлкните по модели в браузере, Esc отменяет", [pickingModel])
                  : pickingTarget
                    ? tr("Пипетка для «{0}»: щёлкните по энтити, Esc отменяет", [pickingTarget])
                    : tool === "texture" && paintClick
                      ? tr("Нанесение щелчками: щелчок по грани назначает материал {0}, Shift+щелчок - всему брашу. Выключить - кнопка кисти или Esc", [currentMaterial])
                      : TOOL_HINTS[tool]}
              </div>
            )}
            {ALL_VIEWS.map((id) => {
              const grid = gridViews(views);
              const idx = grid.indexOf(id);
              const fl = views.floating[id];
              const style: React.CSSProperties = fl
                ? {
                    position: "absolute",
                    left: viewsSize.w ? Math.max(0, Math.min(fl.x, viewsSize.w - 120)) : fl.x,
                    top: viewsSize.h ? Math.max(0, Math.min(fl.y, viewsSize.h - 40)) : fl.y,
                    width: fl.w,
                    height: fl.h,
                    zIndex: 30,
                  }
                : idx >= 0
                  ? cellStyle(idx, grid.length)
                  : { display: "none" };
              const filled = views.max === id;
              return (
                <div
                  key={id}
                  data-view={id}
                  className={`view${fl ? " floating" : ""}${(viewDrag?.target === id && viewDrag.id !== id) || (assetDrag?.over === id && (assetDrag.kind !== "material" || id === "3d")) ? " drop-target" : ""}`}
                  style={style}
                >
                  {fl ? (
                    <div className="float-head view-float-head" onMouseDown={(e) => startViewFloat(id, "move", e)}>
                      <strong className="grow">{VIEW_NAMES[id]}</strong>
                      <button onMouseDown={(e) => e.stopPropagation()} onClick={() => setViews(dockView(viewsRef.current, id))} title={tr("Вернуть вид в сетку")}>
                        <Icon name="collapse" size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="view-head">
                      <span
                        className="view-title"
                        onMouseDown={(e) => startViewDrag(id, e)}
                        onDoubleClick={() => setViews(toggleMax(viewsRef.current, id))}
                        title={tr("Перетащите, чтобы поменять виды местами; двойной щелчок разворачивает вид")}
                      >
                        {VIEW_NAMES[id]}
                      </span>
                      {id === "3d" && (
                        <Select
                          className="view-mode"
                          value={viewMode}
                          options={(Object.keys(VIEW_MODE_NAMES) as ViewMode[]).map((m) => ({ value: m, label: VIEW_MODE_NAMES[m] }))}
                          onChange={(v) => setViewMode(v as ViewMode)}
                          title={tr("Режим 3D-вида: текстуры, один цвет с тенями, каркас, сетка лайтмапа или свет")}
                        />
                      )}
                      <span className="view-btns">
                        {id !== "3d" && (
                          <button
                            className={lockedViews.includes(id) ? "on" : ""}
                            onClick={() => toggleViewLock(id)}
                            title={
                              lockedViews.includes(id)
                                ? tr("Масштаб вида закреплён: колесо в других видах на него не влияет. Нажмите, чтобы снова синхронизировать")
                                : tr("Закрепить масштаб вида. Обычно колесо масштабирует все 2D-виды одновременно; закреплённый вид не меняется")
                            }
                          >
                            <Icon name={lockedViews.includes(id) ? "lock" : "unlock"} size={12} />
                          </button>
                        )}
                        <button onClick={() => setViews(toggleMax(viewsRef.current, id))} title={filled ? tr("Вернуть все виды") : tr("Развернуть на всю область")}>
                          <Icon name={filled ? "collapse" : "fullscreen"} size={12} />
                        </button>
                        <button
                          onClick={() => {
                            if (inTauri) {
                              void openSatellite(id);
                              return;
                            }
                            const b = viewsEl.current?.getBoundingClientRect();
                            const w = Math.min(520, Math.max(240, (b?.width ?? 800) * 0.45));
                            const h = Math.min(400, Math.max(180, (b?.height ?? 600) * 0.45));
                            setViews(floatView(viewsRef.current, id, { x: 40 + idx * 24, y: 40 + idx * 24, w, h }));
                          }}
                          title={tr("Открыть в отдельном окне, например на другом мониторе")}
                        >
                          <Icon name="external" size={12} />
                        </button>
                      </span>
                    </div>
                  )}
                  {id === "3d" ? (
                    <>
                      <canvas
                        ref={canvasRef}
                        className="viewport"
                        tabIndex={0}
                        onMouseMove={onMouseMove}
                        onMouseLeave={onMouseLeave}
                        onMouseDown={onMouseDown}
                        onMouseUp={onMouseUp}
                        onDoubleClick={onDoubleClick3D}
                      />
                      {mapName && <EntityLabels camera={axisCamera} canvas={labelCanvas} entities={labelEntities} />}
                      {mapName && (
                        <NotePins
                          camera={axisCamera}
                          canvas={labelCanvas}
                          notes={notesList}
                          onPick={(n) => {
                            goToPoint(n.pos);
                            openPanel("notes");
                          }}
                        />
                      )}
                      {mapName && <AxisWidget camera={axisCamera} selectionBounds={() => selectionBoundsRef.current()} onTurned={setStatusText} />}
                    </>
                  ) : (
                    <>
                      <canvas
                        ref={(el) => {
                          canvas2dRefs.current[id] = el;
                        }}
                        className="viewport"
                      />
                      <canvas
                        ref={(el) => {
                          overlayRefs.current[id] = el;
                        }}
                        className="overlay2d"
                      />
                    </>
                  )}
                  {fl && <div className="float-resize" onMouseDown={(e) => startViewFloat(id, "resize", e)} title={tr("Потяните, чтобы изменить размер окна")} />}
                </div>
              );
            })}
            {gridViews(views).length >= 2 && <div className="view-split v" style={{ left: `${views.col * 100}%` }} onMouseDown={(e) => startViewSplit("col", e)} title={tr("Ширина колонок видов")} />}
            {gridViews(views).length >= 3 && <div className="view-split h" style={{ top: `${views.row * 100}%` }} onMouseDown={(e) => startViewSplit("row", e)} title={tr("Высота рядов видов")} />}
            {gridViews(views).length >= 4 && (
              <div
                className="view-split c"
                style={{ left: `${views.col * 100}%`, top: `${views.row * 100}%` }}
                onMouseDown={(e) => startViewSplit("both", e)}
                title={tr("Перекрестье: меняет ширину и высоту одновременно")}
              />
            )}
            {viewDrag && (
              <div className="drag-ghost" style={{ left: viewDrag.x + 12, top: viewDrag.y + 12 }}>
                {VIEW_NAMES[viewDrag.id]}
              </div>
            )}
            {assetDrag && (
              <div className="drag-ghost asset" style={{ left: assetDrag.x + 14, top: assetDrag.y + 14 }}>
                {(() => {
                  const src = assetDrag.kind === "material" ? thumbnailUrl(assetDrag.name) : assetDrag.kind === "model" ? modelThumbs.get(assetDrag.name) : null;
                  return src ? <img className="drag-thumb" src={src} alt="" draggable={false} /> : null;
                })()}
                <span className="drag-text">
                  <span>
                    <span className="muted">{ASSET_TITLES[assetDrag.kind]}:</span> {assetDrag.name.split("/").pop()}
                  </span>
                  <span className="drag-hint">
                    {assetDrag.over === "3d"
                      ? assetDrag.kind === "material"
                        ? tr("на грань · Shift: браш · Ctrl: группа")
                        : assetDrag.kind === "model"
                          ? tr("на поверхность · колесо поворачивает{0}", [assetDrag.yaw ? ` (${assetDrag.yaw}°)` : ""])
                          : tr("на поверхность")
                      : assetDrag.over
                        ? assetDrag.kind === "material"
                          ? tr("текстуры только в 3D")
                          : assetDrag.kind === "model"
                            ? tr("на сетку · колесо поворачивает{0}", [assetDrag.yaw ? ` (${assetDrag.yaw}°)` : ""])
                            : tr("на сетку")
                        : tr("перетащите в вид")}
                  </span>
                </span>
              </div>
            )}
            {hoverText && hover?.kind !== "face" && !assetDrag && (
              <div
                className="hover-tag"
                ref={(el) => {
                  hoverTagRef.current = el;
                  if (el) el.style.transform = hoverTagPos.current;
                }}
              >
                {hoverText.split(" · ")[0]}
              </div>
            )}
            {showFirstSteps && mapName && !SAT_ANY && <FirstSteps state={firstSteps} onClose={() => setShowFirstSteps(false)} onTour={() => startTour("quick")} />}
          </div>
        </Dock>
        {SATELLITE_PANEL && <div className="sat-panel">{renderPanel(SATELLITE_PANEL as Panel)}</div>}
        {dialog && <ConfirmDialog spec={dialog} onAnswer={answerDialog} />}
        {onboardingOpen && !SAT_ANY && (
          <Onboarding
            theme={theme}
            onTheme={setTheme}
            keymapPreset={keymapPreset}
            onKeymapPreset={(id) => {
              const p = KEYMAP_PRESETS.find((x) => x.id === id);
              if (p) setKeymap({ ...p.map });
            }}
            content={content}
            inTauri={inTauri}
            onDone={finishOnboarding}
          />
        )}
        {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextItems} onClose={() => setContextMenu(null)} />}
        {paletteOpen && <CommandPalette commands={commands} extra={paletteExtra} onClose={() => setPaletteOpen(false)} />}
      </div>
      <footer className="bar statusbar">
        <span
          className={`status-chip ${gpuOk === null ? "muted" : gpuOk ? "ok" : "bad"}`}
          title={`${gpu}\n${contentText}${render && render.drawCalls > 0 ? tr("\n{0} draw · {1}{2} мс", [render.drawCalls, render.props ? tr("{0} пропов · ", [render.props]) : "", render.frameMs.toFixed(1)]) : ""}`}
        >
          <i />
          {gpuOk === false ? tr("нет WebGPU") : !content || content.state === "loading" ? tr("загрузка контента…") : content.state === "ready" ? tr("готово") : tr("ошибка контента")}
        </span>
        {mapInfo && (
          <span className="muted" title={mapInfo}>
            {mapInfoShort}
          </span>
        )}
        {autosaveNote && <span className="muted">{autosaveNote}</span>}
        <span className="muted" title={tr("Шаг сетки; [ и ] меняют")}>
          {tr("сетка")} {gridSize}
        </span>
        {(() => {
          // Hidden things are easy to forget (Hammer's lost-object puzzle): a count, and a click shows them.
          const hidden = current.current ? (current.current.doc.hidden_ids() as Uint32Array).length : 0;
          return hidden ? (
            <button className="link status-hidden" onClick={() => void showAll()} title={tr("Часть карты скрыта (H, I, Alt+T, визгруппы). Нажмите, чтобы показать всё; в наборе клавиш Unity - Alt+H")}>
              {tr("скрыто:")} {hidden}
            </button>
          ) : null;
        })()}
        {selectedCount > 0 && (
          <span className="ok" title={tr("Габариты выделения: ширина по X × глубина по Y × высота по Z")}>
            {tr("выбрано")} {selectedCount}
            {(() => {
              const map = current.current;
              if (!map) return null;
              const ents = new Set(map.entities.map((x) => x.id));
              let n = 0;
              for (const id of selection.current) if (ents.has(id)) n++;
              const mix = selectionMix(selectedCount - n, n);
              return n && n < selectedCount ? <span className="muted">: {mix}</span> : null;
            })()}
            {(() => {
              const t = sizeText(selectionBoundsRef.current());
              return t ? <span className="muted"> · {t}</span> : null;
            })()}
            {(() => {
              const map = current.current;
              if (!map || selectedCount !== 2) return null;
              const boxes = [...selection.current].map((id) => {
                const i = objectIndexOf(map, id);
                return i === null ? null : objectBounds(map, i);
              });
              if (!boxes[0] || !boxes[1]) return null;
              return <span className="muted"> · {pairText(boxes[0], boxes[1])}</span>;
            })()}
          </span>
        )}
        <span ref={cursorRef} className="muted status-cursor" title={tr("Координаты курсора в 2D-виде")} />
        {hoverText && <span className="muted status-hover">{hoverText}</span>}
        <span className="muted right">
          {tool === "block"
            ? `${SHAPE_NAMES[shape]} · ${currentMaterial}`
            : pickingTarget
              ? tr("Пипетка для «{0}»: щёлкните по энтити, Esc отменяет", [pickingTarget])
              : tool === "texture"
                ? currentMaterial
                : tool === "landscape"
                  ? tr("{0} · радиус {1} · сила {2}", [LANDSCAPE_MODES.find((m) => m.value === landscape.mode)?.hint ?? "", landscape.radius, landscape.amount])
                  : ""}
        </span>
        <button className={`icon-btn status-help${cheatOpen ? " active" : ""}`} onClick={() => setCheatOpen((o) => !o)} title={tr("Шпаргалка по управлению: мышь, клавиши и модификаторы")}>
          ?
        </button>
      </footer>
      {cheatOpen && (
        <div className="cheatsheet" onMouseLeave={() => setCheatOpen(false)}>
          <div className="cheat-head">
            <strong>{tr("Управление")}</strong>
            <Select
              prefix={tr("Клавиши")}
              value={keymapPreset}
              options={KEYMAP_PRESETS.map((p) => ({ value: p.id, label: p.title }))}
              onChange={(v) => {
                const p = KEYMAP_PRESETS.find((x) => x.id === v);
                if (p) setKeymap({ ...p.map });
              }}
              title={tr("Набор клавиш: по умолчанию, Hammer, Unity или Blender. Собственные назначения задаются в настройках")}
            />
            <span className="grow" />
            <button className="icon-btn" onClick={() => setCheatOpen(false)} title={tr("Закрыть")}>
              <Icon name="close" />
            </button>
          </div>
          <div className="cheat-grid">
            <section>
              <h4>{tr("3D-вид")}</h4>
              <dl>
                <dt>{tr("СКМ зажать")}</dt>
                <dd>{tr("обзор; WASD - полёт, Space и C - вверх и вниз, Shift - быстрее, колесо - скорость")}</dd>
                <dt>{tr("ЛКМ")}</dt>
                <dd>{tr("выделение (Shift - добавить, Ctrl - исключить); двойной щелчок - перенос объекта из любого инструмента")}</dd>
                <dt>{tr("ПКМ")}</dt>
                <dd>{tr("контекстное меню объекта")}</dd>
                <dt>{tr("Гизмо")}</dt>
                <dd>{tr("стрелки - перенос, кольца - поворот, кубики - масштаб; R переключает режим")}</dd>
              </dl>
            </section>
            <section>
              <h4>{tr("2D-виды")}</h4>
              <dl>
                <dt>{tr("ЛКМ")}</dt>
                <dd>{tr("выделение, рамка, перетаскивание; щелчок по выделенному переключает маркеры")}</dd>
                <dt>{tr("СКМ или Space+ЛКМ")}</dt>
                <dd>{tr("панорамирование; колесо - масштаб (замок в заголовке вида)")}</dd>
                <dt>{tr("Стрелки")}</dt>
                <dd>{tr("сдвиг на шаг сетки; [ и ] меняют шаг")}</dd>
                <dt>{tr("При переносе")}</dt>
                <dd>{tr("V - вершина к вершине другого объекта, Shift - стык с соседом, Ctrl - клон, Alt - без привязки")}</dd>
                <dt>Shift+Space</dt>
                <dd>{tr("развернуть вид под курсором на всю область и обратно")}</dd>
              </dl>
            </section>
            <section>
              <h4>{tr("При переносе")}</h4>
              <dl>
                <dt>Alt</dt>
                <dd>{tr("инвертирует привязку: свободно или по сетке")}</dd>
                <dt>Shift</dt>
                <dd>{tr("стыковка с соседним объектом вплотную или по краю")}</dd>
                <dt>Ctrl (2D)</dt>
                <dd>{tr("копия")}</dd>
                <dt>{tr("Колесо (модель из панели)")}</dt>
                <dd>{tr("поворот превью на 15°, с Shift - на 5°")}</dd>
              </dl>
            </section>
            <section>
              <h4>{tr("Клавиши")}</h4>
              <dl>
                <dt>{tr("F1 или Ctrl+P")}</dt>
                <dd>{tr("палитра команд")}</dd>
                <dt>1 … 9</dt>
                <dd>{tr("инструменты: выбор, блок, текстура, энтити, разрез, вершины, кордон, ландшафт, линейка (в наборе Hammer: Shift+S, B, A, E, X, V, K, D, R)")}</dd>
                <dt>Ctrl+Z / Y</dt>
                <dd>{tr("отмена и повтор; Ctrl+C/V/X, Delete")}</dd>
                <dt>Ctrl+T / Ctrl+Shift+W</dt>
                <dd>{tr("сделать энтити и снять энтити; Ctrl+H - сделать полым, Ctrl+G - сгруппировать")}</dd>
                <dt>H / U</dt>
                <dd>{tr("скрыть выделенное и показать всё; Ctrl+E - навести виды на выделение")}</dd>
                <dt>F9</dt>
                <dd>{tr("собрать карту")}</dd>
              </dl>
            </section>
          </div>
          <div className="cheat-foot muted">
            {tr("Все сочетания клавиш и их настройка:")}{" "}
            <button
              className="link"
              onClick={() => {
                setCheatOpen(false);
                openPanel("settings");
              }}
            >
              {tr("Настройки → Клавиши")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
