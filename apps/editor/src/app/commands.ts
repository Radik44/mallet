// Commands, menus and the context menu: the command list the palette, the
// menu bar, the toolbar and the hotkeys all work from, plus the tour steps
// that hang off it. A hook, so the memoized pieces keep their deps.

import { LABELS_KEY, readLabelsOn } from "../ui/EntityLabels";
import { findMaterials, findObjects, matchesKey, parseKeyQuery } from "./findObjects";
import { useCallback, useEffect, useRef } from "react";
import { inTauri } from "../tauri";
import { type Command } from "../ui/CommandPalette";
import { type Menu, type MenuItem } from "../ui/MenuBar";
import { LAYOUT_PRESETS, visiblePanels } from "../ui/Dock";
import { tourScript, type TourKind } from "../ui/tutorial";
import { type Experience } from "../ui/Onboarding";
import { effectiveHotkey, KEYMAP_PRESETS } from "../ui/hotkeys";
import { parseCoords } from "../map/compilelog";
import { ALL_VIEWS, VIEW_NAMES, toggleMax, type ViewId } from "../ui/viewsLayout";
import { nextMode } from "../viewport/handles";
import { TAB_PANELS, type Panel } from "./constants";
import type { EditorApi } from "./editorApi";
import { t as tr, tb } from "../i18n";
import { splitUndoLabel } from "./undoLabel";

export function useCommands(
  e: Pick<
    EditorApi,
    | "savedLayouts"
    | "session"
    | "current"
    | "textureLockRef"
    | "snapRef"
    | "handleMode"
    | "setHandleMode"
    | "content"
    | "mapName"
    | "selectedCount"
    | "hist"
    | "tool"
    | "snapMoves"
    | "setStatusText"
    | "showColumn"
    | "setShowColumn"
    | "showJourney"
    | "setShowJourney"
    | "layout"
    | "setPanel"
    | "setPaletteOpen"
    | "keymap"
    | "firstSteps"
    | "showFirstSteps"
    | "setShowFirstSteps"
    | "setTourIndex"
    | "tourIndex"
    | "setTourKind"
    | "tourKind"
    | "setOnboardingOpen"
    | "theme"
    | "setTheme"
    | "showHints"
    | "setShowHints"
    | "showSkybox"
    | "showSkyboxRef"
    | "setShowSkybox"
    | "bridge"
    | "recent"
    | "selectGroups"
    | "setSelectGroupsState"
    | "selectGroupsRef"
    | "refreshVisgroups"
    | "setViewMode"
    | "pathChainRef"
    | "setPathChain"
    | "loadClassList"
    | "refreshProperties"
    | "openProperties"
    | "setShape"
    | "setTool"
    | "setTextureLock"
    | "setSnapMoves"
    | "refreshEntities"
    | "hideSelection"
    | "showAll"
    | "isolateSelection"
    | "selectSimilar"
    | "selectAllVisible"
    | "lockSelection"
    | "selectWithChildren"
    | "toggleToolBrushes"
    | "saveCameraBookmark"
    | "goCameraBookmark"
    | "dropToFloor"
    | "repeatMoveCopy"
    | "copyEntityKeys"
    | "pasteEntityKeys"
    | "resetTransform"
    | "randomizeRotation"
    | "selectInside"
    | "replaceSelectedModel"
    | "rotateSelection90"
    | "findOverlaps"
    | "copyCoordinates"
    | "renameSelection"
    | "saveIncremental"
    | "wrapInTrigger"
    | "pasteHere"
    | "snapSelectionToGrid"
    | "moveToCamera"
    | "selectReferencing"
    | "selectPathChain"
    | "pilotSelection"
    | "frameAll"
    | "viewsRef"
    | "addNoteHere"
    | "setViews"
    | "selectDetailCandidates"
    | "growSelection"
    | "flipHinge"
    | "nodrawHiddenFaces"
    | "copyTransform"
    | "selectRandom"
    | "mergeBrushes"
    | "selectParent"
    | "originToCentre"
    | "revealAndSelect"
    | "browseToAsset"
    | "selectAssetUsers"
    | "duplicateUnique"
    | "pasteTransform"
    | "convertProps"
    | "groupSelection"
    | "ungroupSelection"
    | "carveSelection"
    | "hollowSelection"
    | "mirrorSelection"
    | "deleteSelection"
    | "tieSelection"
    | "moveToWorld"
    | "collapseInstances"
    | "copySelection"
    | "pasteClipboard"
    | "refreshPrefabs"
    | "cloneSelection"
    | "refreshWorld"
    | "focusSelection"
    | "selectObject"
    | "selectIds"
    | "goToPoint"
    | "runGame"
    | "bridgeTeleport"
    | "bridgeCameraToGame"
    | "bridgeCubemaps"
    | "analyzePack"
    | "importTexturesDialog"
    | "alignSelection"
    | "checkProblems"
    | "undo"
    | "redo"
    | "saveAs"
    | "saveCurrent"
    | "compileCurrent"
    | "openSatellite"
    | "openPath"
    | "refreshHistory"
    | "openPanel"
    | "applyWholeLayout"
    | "openDialog"
    | "stepGrid"
  >,
) {
  const {
    session,
    savedLayouts,
    current,
    textureLockRef,
    snapRef,
    handleMode,
    setHandleMode,
    content,
    mapName,
    selectedCount,
    hist,
    tool,
    snapMoves,
    setStatusText,
    showColumn,
    setShowColumn,
    layout,
    setPanel,
    setPaletteOpen,
    keymap,
    firstSteps,
    showFirstSteps,
    showJourney,
    setShowJourney,
    setShowFirstSteps,
    setTourIndex,
    tourIndex,
    setTourKind,
    tourKind,
    setOnboardingOpen,
    theme,
    setTheme,
    showHints,
    setShowHints,
    showSkybox,
    showSkyboxRef,
    setShowSkybox,
    bridge,
    recent,
    selectGroups,
    setSelectGroupsState,
    selectGroupsRef,
    refreshVisgroups,
    setViewMode,
    pathChainRef,
    setPathChain,
    loadClassList,
    refreshProperties,
    openProperties,
    setShape,
    setTool,
    setTextureLock,
    setSnapMoves,
    refreshEntities,
    hideSelection,
    showAll,
    isolateSelection,
    selectSimilar,
    selectAllVisible,
    lockSelection,
    selectWithChildren,
    toggleToolBrushes,
    saveCameraBookmark,
    goCameraBookmark,
    dropToFloor,
    repeatMoveCopy,
    copyEntityKeys,
    pasteEntityKeys,
    resetTransform,
    randomizeRotation,
    selectInside,
    replaceSelectedModel,
    rotateSelection90,
    findOverlaps,
    copyCoordinates,
    renameSelection,
    saveIncremental,
    wrapInTrigger,
    pasteHere,
    snapSelectionToGrid,
    moveToCamera,
    selectReferencing,
    selectPathChain,
    pilotSelection,
    frameAll,
    viewsRef,
    setViews,
    addNoteHere,
    selectDetailCandidates,
    growSelection,
    flipHinge,
    nodrawHiddenFaces,
    copyTransform,
    selectRandom,
    mergeBrushes,
    selectParent,
    originToCentre,
    revealAndSelect,
    browseToAsset,
    selectAssetUsers,
    duplicateUnique,
    pasteTransform,
    convertProps,
    groupSelection,
    ungroupSelection,
    carveSelection,
    hollowSelection,
    mirrorSelection,
    deleteSelection,
    tieSelection,
    moveToWorld,
    collapseInstances,
    copySelection,
    pasteClipboard,
    refreshPrefabs,
    cloneSelection,
    refreshWorld,
    focusSelection,
    selectObject,
    selectIds,
    goToPoint,
    runGame,
    bridgeTeleport,
    bridgeCameraToGame,
    bridgeCubemaps,
    analyzePack,
    importTexturesDialog,
    alignSelection,
    checkProblems,
    undo,
    redo,
    saveAs,
    saveCurrent,
    compileCurrent,
    openSatellite,
    openPath,
    refreshHistory,
    openPanel,
    applyWholeLayout,
    openDialog,
    stepGrid,
  } = e;
  const baseCommands: Command[] = [
    { id: "new", group: tr("Файл"), title: tr("Новая карта…"), keywords: "new map создать", run: () => setPanel("newmap") },
    { id: "open", group: tr("Файл"), title: tr("Открыть VMF, .map или BSP…"), keywords: "open load decompile декомпилировать bsp", hotkey: "", run: () => void openDialog(), disabled: !inTauri },
    ...recent.map((p, i) => ({ id: `recent-${i}`, group: tr("Недавние"), title: p.split(/[\\/]/).pop() ?? p, keywords: `recent ${p}`, run: () => void openPath(p), disabled: !inTauri })),
    { id: "save", group: tr("Файл"), title: tr("Сохранить"), keywords: "save", hotkey: "Ctrl+S", run: () => void saveCurrent(), disabled: !current.current },
    {
      id: "save-incremental",
      group: tr("Файл"),
      title: tr("Сохранить новую версию: room.vmf → room_2.vmf"),
      keywords: "save incremental version increment сохранить версию номер копию",
      hotkey: "Ctrl+Alt+S",
      run: () => void saveIncremental(),
      disabled: !current.current || !inTauri,
    },
    { id: "saveas", group: tr("Файл"), title: tr("Сохранить как…"), keywords: "save as", hotkey: "Ctrl+Shift+S", run: () => void saveAs(), disabled: !current.current },
    {
      id: "pack-check",
      group: tr("Файл"),
      title: tr("Анализ контента для упаковки"),
      keywords: "pack content bspzip resources упаковка",
      run: () => {
        setPanel("compile");
        void analyzePack();
      },
      disabled: !inTauri || !current.current,
    },
    {
      id: "game-debug",
      group: tr("Файл"),
      title: tr("Запустить игру с отладкой: -console, developer 1, sv_cheats 1"),
      keywords: "run game debug console играть отладка",
      run: () => void runGame(true),
      disabled: !inTauri || !mapName,
    },
    { id: "game", group: tr("Файл"), title: tr("Запустить карту в Garry's Mod"), keywords: "run game play gmod играть", run: () => void runGame(), disabled: !inTauri || !mapName },
    {
      id: "game-teleport",
      group: tr("Файл"),
      title: tr("Телепортировать игрока к выделению"),
      keywords: "teleport телепорт игра мост bridge",
      run: () => void bridgeTeleport(),
      disabled: !bridge?.connected || !selectedCount,
    },
    {
      id: "game-camera",
      group: tr("Файл"),
      title: tr("Переместить игрока в точку камеры редактора"),
      keywords: "camera game камера игра мост",
      run: () => void bridgeCameraToGame(),
      disabled: !bridge?.connected,
    },
    {
      id: "game-cubemaps",
      group: tr("Файл"),
      title: tr("Собрать кубмапы в движке (-buildcubemaps)"),
      keywords: "cubemaps кубмапы buildcubemaps мост",
      run: () => void bridgeCubemaps(),
      disabled: !inTauri || !mapName,
    },
    {
      id: "compile",
      group: tr("Файл"),
      title: tr("Собрать карту (Run Map)"),
      keywords: "compile vbsp vvis vrad run game запустить",
      hotkey: "F9",
      run: () => void compileCurrent(),
      disabled: !inTauri,
    },
    {
      id: "undo",
      group: tr("Правка"),
      title: hist?.undo ? tr("Отменить: {0}", [tb(splitUndoLabel(hist.undo).text)]) : tr("Отменить"),
      menuTitle: hist?.undo ? tr("Отменить: {0}", [tb(splitUndoLabel(hist.undo).text)]) : undefined,
      keywords: "undo",
      hotkey: "Ctrl+Z",
      run: () => void undo(),
      disabled: !hist?.undo,
    },
    {
      id: "redo",
      group: tr("Правка"),
      title: hist?.redo ? tr("Повторить: {0}", [tb(splitUndoLabel(hist.redo).text)]) : tr("Повторить"),
      menuTitle: hist?.redo ? tr("Повторить: {0}", [tb(splitUndoLabel(hist.redo).text)]) : undefined,
      keywords: "redo",
      hotkey: "Ctrl+Y",
      run: () => void redo(),
      disabled: !hist?.redo,
    },
    { id: "copy", group: tr("Правка"), title: tr("Копировать"), keywords: "copy", hotkey: "Ctrl+C", run: copySelection, disabled: !selectedCount },
    { id: "paste", group: tr("Правка"), title: tr("Вставить"), keywords: "paste", hotkey: "Ctrl+V", run: () => void pasteClipboard() },
    ...(["x", "y", "z"] as const).flatMap((ax, i) =>
      (["min", "center", "max", "grid", "distribute"] as const).map((mode) => ({
        id: `align-${ax}-${mode}`,
        group: tr("Выровнять"),
        title:
          mode === "distribute"
            ? tr("Распределить по {0} равномерно", [ax.toUpperCase()])
            : tr("Выровнять по {0} {1}", [ax.toUpperCase(), mode === "min" ? tr("к минимуму") : mode === "max" ? tr("к максимуму") : mode === "center" ? tr("к центру") : tr("к сетке")]),
        keywords: `align ${ax} ${mode} выровнять объекты сетка snap distribute evenly распределить равномерно шаг`,
        run: () => void alignSelection(i as 0 | 1 | 2, mode),
        disabled: selectedCount < (mode === "grid" ? 1 : mode === "distribute" ? 3 : 2),
      })),
    ),
    { id: "import-tex", group: tr("Файл"), title: tr("Импорт текстур PNG/TGA…"), keywords: "import texture png tga vtf", run: () => void importTexturesDialog(), disabled: !inTauri },
    {
      id: "array",
      group: tr("Правка"),
      title: tr("Размножить выделение… (Paste Special)"),
      keywords: "array paste special multiply copies размножить",
      run: () => setPanel("array"),
      disabled: !selectedCount,
    },
    { id: "duplicate", group: tr("Правка"), title: tr("Дублировать на месте"), keywords: "duplicate clone", run: () => void cloneSelection([0, 0, 0]), disabled: !selectedCount },
    {
      id: "duplicate-unique",
      group: tr("Правка"),
      title: tr("Дублировать с новыми именами: связи копий не ведут к оригиналу"),
      keywords: "duplicate unique names paste special prefix дублировать новые имена уникальные копия связи",
      hotkey: "Ctrl+Alt+D",
      run: () => void duplicateUnique(),
      disabled: !selectedCount,
    },
    {
      id: "keys-copy",
      group: tr("Энтити"),
      title: tr("Копировать свойства энтити (без имени и положения)"),
      keywords: "copy properties keys component скопировать свойства ключи",
      hotkey: "Ctrl+Alt+C",
      run: copyEntityKeys,
      disabled: !selectedCount,
    },
    {
      id: "keys-paste",
      group: tr("Энтити"),
      title: tr("Вставить свойства энтити: в выделенные энтити того же класса"),
      keywords: "paste properties keys component вставить свойства ключи",
      hotkey: "Ctrl+Alt+V",
      run: () => void pasteEntityKeys(),
      disabled: !selectedCount,
    },
    {
      id: "reset-transform",
      group: tr("Энтити"),
      title: tr("Сбросить поворот и масштаб: углы 0 0 0, масштаб 1"),
      keywords: "reset rotation scale clear сбросить поворот масштаб углы",
      hotkey: "Alt+R",
      run: () => void resetTransform(),
      disabled: !selectedCount,
    },
    {
      id: "random-rotation",
      group: tr("Энтити"),
      title: tr("Случайный поворот: свой угол и небольшой наклон для каждого пропа"),
      keywords: "random rotation randomize scatter случайный поворот разброс",
      hotkey: "Alt+Shift+R",
      run: () => void randomizeRotation(),
      disabled: !selectedCount,
    },
    {
      id: "merge-brushes",
      group: tr("Правка"),
      title: tr("Объединить браши: прямоугольные браши с общей целой гранью - в один"),
      keywords: "merge join brushes combine blender склеить объединить браши слить",
      run: () => void mergeBrushes(),
      disabled: selectedCount < 2,
    },
    {
      id: "nodraw-hidden",
      group: tr("Текстуры"),
      title: tr("Nodraw на скрытые грани: грани выделенных брашей, закрытые другим брашем"),
      keywords: "nodraw hidden faces optimize lightmap скрытые грани нодро оптимизация невидимые",
      run: () => void nodrawHiddenFaces(),
      disabled: !selectedCount,
    },
    {
      id: "origin-centre",
      group: tr("Энтити"),
      title: tr("Origin в центр брашей: перенести точку вращения брашевой энтити в её центр"),
      keywords: "origin to geometry center centre pivot rotating blender точка вращения центр ось",
      run: () => void originToCentre(),
      disabled: !selectedCount,
    },
    {
      id: "door-hinge",
      group: tr("Энтити"),
      title: tr("Перенести петлю двери на другой край (func_door_rotating)"),
      keywords: "door hinge rotating origin петля дверь другой край",
      run: () => void flipHinge(),
      disabled: !selectedCount,
    },
    {
      id: "props-static",
      group: tr("Энтити"),
      title: tr("Пропы → prop_static: неподвижные, экономичные, освещение от VRAD"),
      keywords: "prop_static static convert class статичный проп сменить класс",
      run: () => void convertProps("prop_static"),
      disabled: !selectedCount,
    },
    {
      id: "props-physics",
      group: tr("Энтити"),
      title: tr("Пропы → prop_physics: с физикой - падают, сдвигаются, разрушаются"),
      keywords: "prop_physics physics convert class физический проп сменить класс",
      run: () => void convertProps("prop_physics"),
      disabled: !selectedCount,
    },
    {
      id: "props-dynamic",
      group: tr("Энтити"),
      title: tr("Пропы → prop_dynamic: анимация и управление через входы, без физики"),
      keywords: "prop_dynamic dynamic convert class анимация проп сменить класс",
      run: () => void convertProps("prop_dynamic"),
      disabled: !selectedCount,
    },
    {
      id: "replace-model",
      group: tr("Энтити"),
      title: tr("Заменить модель: выделенным пропам - модель, выбранную в браузере"),
      keywords: "replace model swap selected actors заменить модель пропы",
      hotkey: "Ctrl+Alt+M",
      run: () => void replaceSelectedModel(),
      disabled: !selectedCount,
    },
    ...([0, 1, 2] as const).flatMap((ax) =>
      ([-90, 90] as const).map((deg) => ({
        id: `rot90-${"xyz"[ax]}-${deg > 0 ? "ccw" : "cw"}`,
        group: tr("Правка"),
        title: tr("Повернуть на {0}90° вокруг {1}", [deg > 0 ? "+" : "−", "XYZ"[ax]]),
        keywords: "rotate 90 quarter turn повернуть четверть угол",
        hotkey: ax === 2 ? (deg < 0 ? "Alt+Z" : "Alt+Shift+Z") : undefined,
        run: () => void rotateSelection90(ax, deg),
        disabled: !selectedCount,
      })),
    ),
    {
      id: "find-overlaps",
      group: tr("Карта"),
      title: tr("Найти пересекающиеся браши: выделить браши, которые перекрывают друг друга"),
      keywords: "overlap intersect z-fighting пересечение пересекающиеся браши",
      run: findOverlaps,
      disabled: !mapName,
    },
    {
      id: "transform-copy",
      group: tr("Правка"),
      title: tr("Копировать трансформ: положение (и углы точечной энтити)"),
      keywords: "copy transform position rotation unity копировать трансформ положение поворот",
      run: copyTransform,
      disabled: !selectedCount,
    },
    {
      id: "transform-paste-pos",
      group: tr("Правка"),
      title: tr("Вставить положение: переместить выделение в скопированную точку"),
      keywords: "paste transform position unity вставить положение место",
      run: () => void pasteTransform("position"),
      disabled: !selectedCount,
    },
    {
      id: "transform-paste-rot",
      group: tr("Правка"),
      title: tr("Вставить поворот: применить скопированные углы к точечным энтити и пропам"),
      keywords: "paste transform rotation angles unity вставить поворот углы",
      run: () => void pasteTransform("rotation"),
      disabled: !selectedCount,
    },
    {
      id: "copy-coords",
      group: tr("Правка"),
      title: tr("Копировать координаты «x y z»: центр выделения или камера"),
      keywords: "copy coordinates position origin координаты скопировать позиция",
      hotkey: "Ctrl+Shift+K",
      run: () => copyCoordinates(false),
      disabled: !mapName,
    },
    {
      id: "copy-coords-lua",
      group: tr("Правка"),
      title: tr("Копировать координаты для Lua: Vector(x, y, z)"),
      keywords: "copy coordinates lua vector координаты скопировать луа",
      hotkey: "Ctrl+Alt+K",
      run: () => copyCoordinates(true),
      disabled: !mapName,
    },
    {
      id: "rename",
      group: tr("Энтити"),
      title: tr("Переименовать (targetname): при нескольких объектах - с порядковыми номерами"),
      keywords: "rename name targetname переименовать имя",
      hotkey: "F2",
      run: () => void renameSelection(),
      disabled: !selectedCount,
    },
    {
      id: "wrap-trigger",
      group: tr("Энтити"),
      title: tr("Обернуть в триггер: trigger_multiple по габаритам выделения"),
      keywords: "trigger wrap volume триггер обернуть объём зона",
      hotkey: "Ctrl+Shift+T",
      run: () => void wrapInTrigger(),
      disabled: !selectedCount,
    },
    {
      id: "paste-here",
      group: tr("Правка"),
      title: tr("Вставить в точку взгляда камеры"),
      keywords: "paste here at view camera вставить сюда перед камерой",
      hotkey: "Ctrl+Shift+V",
      run: () => void pasteHere(),
      disabled: !mapName,
    },
    {
      id: "repeat-copy",
      group: tr("Правка"),
      title: tr("Повторить сдвиг копией: ещё одна копия с тем же смещением"),
      keywords: "repeat duplicate offset copy повторить копия шаг ряд",
      hotkey: "Ctrl+Shift+D",
      run: () => void repeatMoveCopy(),
      disabled: !selectedCount,
    },
    {
      id: "cut",
      group: tr("Правка"),
      title: tr("Вырезать"),
      keywords: "cut",
      hotkey: "Ctrl+X",
      run: () => {
        copySelection();
        void deleteSelection();
      },
      disabled: !selectedCount,
    },
    { id: "delete", group: tr("Правка"), title: tr("Удалить выделение"), keywords: "delete remove", hotkey: "Delete", run: () => void deleteSelection(true), disabled: !selectedCount },
    { id: "t-select", group: tr("Инструмент"), title: tr("Выбор"), keywords: "select tool", hotkey: "1", run: () => setTool("select") },
    { id: "t-block", group: tr("Инструмент"), title: tr("Блок (браш)"), keywords: "block brush tool", hotkey: "2", run: () => setTool("block") },
    {
      id: "t-cyl",
      group: tr("Инструмент"),
      title: tr("Цилиндр"),
      keywords: "cylinder primitive блок примитив",
      run: () => {
        setShape("cylinder");
        setTool("block");
      },
    },
    {
      id: "t-arch",
      group: tr("Инструмент"),
      title: tr("Арка"),
      keywords: "arch primitive блок примитив",
      run: () => {
        setShape("arch");
        setTool("block");
      },
    },
    {
      id: "t-sphere",
      group: tr("Инструмент"),
      title: tr("Сфера"),
      keywords: "sphere primitive блок примитив",
      run: () => {
        setShape("sphere");
        setTool("block");
      },
    },
    {
      id: "t-wedge",
      group: tr("Инструмент"),
      title: tr("Клин"),
      keywords: "wedge primitive блок примитив",
      run: () => {
        setShape("wedge");
        setTool("block");
      },
    },
    { id: "t-tex", group: tr("Инструмент"), title: tr("Текстура и грани"), keywords: "texture face edit apply", hotkey: "3", run: () => setTool("texture") },
    { id: "t-ent", group: tr("Инструмент"), title: tr("Энтити"), keywords: "entity place", hotkey: "4", run: () => setTool("entity") },
    { id: "t-clip", group: tr("Инструмент"), title: tr("Разрез (Clip)"), keywords: "clip cut клиппер", hotkey: "5", run: () => setTool("clip") },
    { id: "t-vertex", group: tr("Инструмент"), title: tr("Вершины"), keywords: "vertex manipulation", hotkey: "6", run: () => setTool("vertex") },
    { id: "t-cordon", group: tr("Инструмент"), title: tr("Кордон"), keywords: "cordon", hotkey: "7", run: () => setTool("cordon") },
    { id: "t-landscape", group: tr("Инструмент"), title: tr("Ландшафт"), keywords: "landscape terrain sculpt рельеф кисть дисплейсмент", hotkey: "8", run: () => setTool("landscape") },
    { id: "t-measure", group: tr("Инструмент"), title: tr("Линейка"), keywords: "measure ruler distance расстояние метры линейка", hotkey: "9", run: () => setTool("measure") },
    {
      id: "landscape-new",
      group: tr("Карта"),
      title: tr("Ландшафт: площадка из дисплейсментов…"),
      keywords: "landscape terrain wizard площадка",
      run: () => setPanel("landscape"),
      disabled: !mapName,
    },
    {
      id: "sel-groups",
      group: tr("Инструмент"),
      title: selectGroups ? tr("Выбор группами включён: щелчок выделяет всю группу объекта") : tr("Выбор группами выключен: щелчок выделяет один объект"),
      keywords: "groups select группы выбор",
      run: () => {
        selectGroupsRef.current = !selectGroups;
        setSelectGroupsState(!selectGroups);
      },
    },
    {
      id: "texture-lock",
      group: tr("Инструмент"),
      title: tr("Замок текстур (Texture Lock): текстуры перемещаются вместе с брашем"),
      keywords: "texture lock замок",
      hotkey: "Shift+L",
      run: () => setTextureLock(!textureLockRef.current),
    },
    {
      id: "snap",
      group: tr("Инструмент"),
      title: snapMoves
        ? tr("Привязка к сетке включена: перенос по шагам сетки. При переносе Alt - свободно, Shift - стыковка с соседним объектом, Ctrl - копия")
        : tr("Привязка к сетке выключена: свободный перенос. При переносе Alt - по шагам сетки, Shift - стыковка с соседним объектом, Ctrl - копия"),
      keywords: "snap grid привязка сетка",
      hotkey: "Shift+W",
      run: () => setSnapMoves(!snapRef.current),
    },
    { id: "grid-up", group: tr("Вид"), title: tr("Сетка крупнее"), keywords: "grid bigger", hotkey: "]", run: () => stepGrid(1) },
    { id: "grid-down", group: tr("Вид"), title: tr("Сетка мельче"), keywords: "grid smaller", hotkey: "[", run: () => stepGrid(-1) },
    {
      id: "carve",
      group: tr("Геометрия"),
      title: tr("Вырезать выделением (Carve): вычесть выделенные браши из пересекающихся с ними"),
      keywords: "carve subtract вырезать",
      hotkey: "Ctrl+Shift+C",
      run: () => void carveSelection(),
      disabled: !selectedCount,
    },
    {
      id: "mirror",
      group: tr("Геометрия"),
      title: tr("Отразить: зеркальная копия выделения относительно плоскости симметрии"),
      keywords: "mirror flip symmetry отразить зеркало симметрия",
      hotkey: "Ctrl+M",
      run: () => void mirrorSelection(),
      disabled: !selectedCount,
    },
    {
      id: "hollow",
      group: tr("Геометрия"),
      title: tr("Сделать полым (Hollow): заменить браш стенками заданной толщины"),
      keywords: "hollow полый стены",
      hotkey: "Ctrl+H",
      run: () => void hollowSelection(),
      disabled: !selectedCount,
    },
    {
      id: "tie",
      group: tr("Энтити"),
      title: tr("Сделать энтити (Tie to Entity): браши станут дверью, триггером, func_detail…"),
      keywords: "tie entity func_detail сделать энтити",
      hotkey: "Ctrl+T",
      run: () => void tieSelection(),
      disabled: !selectedCount,
    },
    {
      id: "world",
      group: tr("Энтити"),
      title: tr("Снять энтити (Move to World): брашевые энтити станут обычными брашами мира"),
      keywords: "move to world снять энтити",
      hotkey: "Ctrl+Shift+W",
      run: () => void moveToWorld(),
      disabled: !selectedCount,
    },
    {
      id: "collapse",
      group: tr("Энтити"),
      title: tr("Развернуть инстанс (Collapse): перенести содержимое func_instance в карту"),
      keywords: "collapse instance func_instance развернуть",
      run: () => void collapseInstances(),
      disabled: !selectedCount,
    },
    {
      id: "group",
      group: tr("Геометрия"),
      title: tr("Сгруппировать: выделять и перемещать как единое целое"),
      keywords: "group сгруппировать",
      hotkey: "Ctrl+G",
      run: () => void groupSelection(),
      disabled: !selectedCount,
    },
    { id: "ungroup", group: tr("Геометрия"), title: tr("Разгруппировать"), keywords: "ungroup", hotkey: "Ctrl+U", run: () => void ungroupSelection(), disabled: !selectedCount },
    {
      id: "handles",
      group: tr("Инструмент"),
      title: tr("Сменить режим гизмо: перенос → поворот → масштаб; также щелчок по выделенному в 2D"),
      keywords: "rotate scale handles поворот масштаб хэндлы",
      hotkey: "R",
      run: () => {
        setHandleMode(nextMode(handleMode.current));
        setStatusText(
          handleMode.current === "rotate"
            ? tr("Поворот: кольцо гизмо в 3D или угловые маркеры в 2D; Shift - шаг 15°")
            : handleMode.current === "scale"
              ? tr("Масштаб: кубик гизмо в 3D (Shift - равномерно) или маркеры рамки в 2D")
              : tr("Перенос: стрелка гизмо в 3D или перетаскивание выделения в 2D"),
        );
      },
      disabled: !selectedCount,
    },
    { id: "hide", group: tr("Вид"), title: tr("Скрыть выделенное"), keywords: "hide", hotkey: "H", run: () => void hideSelection(), disabled: !selectedCount },
    { id: "showall", group: tr("Вид"), title: tr("Показать всё"), keywords: "show unhide", hotkey: "U", run: () => void showAll() },
    {
      id: "showall-select",
      group: tr("Вид"),
      title: tr("Показать скрытое и выделить его"),
      keywords: "reveal unhide select blender alt+h показать скрытое выделить вернуть",
      hotkey: "Shift+U",
      run: () => void revealAndSelect(),
    },
    {
      id: "tool-brushes",
      group: tr("Вид"),
      title: tr("Скрыть или показать инструментальные браши (триггеры, clip, nodraw)"),
      keywords: "tool textures trigger clip nodraw hide toggle инструментальные триггеры скрыть",
      hotkey: "Alt+T",
      run: () => void toggleToolBrushes(),
      disabled: !mapName,
    },
    {
      id: "isolate",
      group: tr("Вид"),
      title: tr("Изолировать выделение: скрыть всё остальное; повторный вызов показывает всё"),
      keywords: "isolate local view solo изолировать одиночный",
      hotkey: "I",
      run: () => void isolateSelection(),
      disabled: !mapName,
    },
    ...[0, 1, 2, 3, 4].flatMap((i) => [
      {
        id: `cam-save-${i + 1}`,
        group: tr("Вид"),
        title: tr("Закладка камеры {0}: запомнить", [i + 1]),
        keywords: "bookmark camera закладка камера запомнить",
        hotkey: `Ctrl+${i + 1}`,
        run: () => saveCameraBookmark(i),
        disabled: !mapName,
      },
      {
        id: `cam-go-${i + 1}`,
        group: tr("Вид"),
        title: tr("Закладка камеры {0}: вернуться", [i + 1]),
        keywords: "bookmark camera закладка камера перейти",
        hotkey: `Shift+${i + 1}`,
        run: () => goCameraBookmark(i),
        disabled: !mapName,
      },
    ]),
    {
      id: "select-detail",
      group: tr("Правка"),
      title: tr("Выбрать мелкие браши мира: кандидаты в func_detail (ускоряет VVIS)"),
      keywords: "func_detail detail optimize vvis vis small brushes оптимизация мелкие браши детали",
      run: selectDetailCandidates,
      disabled: !mapName,
    },
    {
      id: "v-game",
      group: tr("Вид"),
      title: tr("Вид игры: скрыть в 3D рамки энтити, инструментальные браши и линии связей"),
      keywords: "game view preview player вид игры как в игре без служебного",
      hotkey: "G",
      run: () => {
        const r = session.current?.renderer;
        if (!r) return;
        r.gameView = !r.gameView;
        // The name labels go too: they are HTML over the view, not part of the frame.
        document.body.classList.toggle("game-view", r.gameView);
        setStatusText(r.gameView ? tr("вид игры: рамки энтити, инструментальные браши и линии в 3D скрыты · G - выключить") : tr("вид игры выключен"));
      },
      disabled: !mapName,
    },
    {
      id: "v-labels",
      group: tr("Вид"),
      title: tr("Подписи энтити в 3D: имена (targetname) над энтити"),
      keywords: "labels names targetname actor labels подписи имена энтити",
      run: () => {
        const on = !readLabelsOn();
        try {
          localStorage.setItem(LABELS_KEY, on ? "1" : "0");
        } catch {
          /* storage unavailable */
        }
        window.dispatchEvent(new Event("gme-labels"));
        setStatusText(on ? tr("подписи энтити включены: имена ближайших энтити в 3D-виде") : tr("подписи энтити выключены"));
      },
      disabled: !mapName,
    },
    {
      id: "frame-all",
      group: tr("Вид"),
      title: tr("Показать всю карту во всех видах"),
      keywords: "frame all view all home zoom extents вся карта показать всё найти камеру",
      hotkey: "Home",
      run: frameAll,
      disabled: !mapName,
    },
    {
      id: "view-max",
      group: tr("Вид"),
      title: tr("Развернуть вид под курсором: на всю область и обратно"),
      keywords: "maximize view fullscreen viewport toggle развернуть вид на весь экран один вид четыре вида",
      hotkey: "Shift+Space",
      run: () => {
        // The view under the pointer, as Unity's Shift+Space and Blender's Ctrl+Space take it; with the pointer
        // elsewhere the filled view goes back, or the 3D view fills the area.
        const under = document.querySelector<HTMLElement>(".views .view:hover")?.dataset.view as ViewId | undefined;
        const id = under && ALL_VIEWS.includes(under) ? under : (viewsRef.current.max ?? "3d");
        setViews(toggleMax(viewsRef.current, id));
      },
    },
    {
      id: "pilot",
      group: tr("Вид"),
      title: tr("Вид из энтити: навести свет или камеру взглядом; повторный вызов записывает направление"),
      keywords: "pilot actor look through light spot camera aim смотреть глазами навести прожектор",
      hotkey: "Ctrl+Alt+P",
      run: () => void pilotSelection(),
      disabled: !selectedCount,
    },
    {
      id: "select-path",
      group: tr("Энтити"),
      title: tr("Выбрать цепочку пути: все path_track и path_corner маршрута (и поезд)"),
      keywords: "path track corner chain train route select цепочка путь маршрут поезд",
      hotkey: "Ctrl+Alt+T",
      run: selectPathChain,
      disabled: !selectedCount,
    },
    {
      id: "select-refs",
      group: tr("Энтити"),
      title: tr("Кто ссылается: выбрать энтити, чьи выходы и ключи указывают на выделенное"),
      keywords: "references who uses inputs outputs reference viewer ссылки кто ссылается выходы",
      hotkey: "Ctrl+Alt+R",
      run: selectReferencing,
      disabled: !selectedCount,
    },
    {
      id: "to-camera",
      group: tr("Правка"),
      title: tr("Перенести к камере: переместить выделение в точку камеры 3D-вида"),
      keywords: "snap object to view move to camera перенести к камере сюда где стою",
      hotkey: "Ctrl+Alt+F",
      run: () => void moveToCamera(),
      disabled: !selectedCount,
    },
    {
      id: "snap-grid",
      group: tr("Правка"),
      title: tr("Привязать к сетке: угол выделения - на ближайший узел сетки"),
      keywords: "snap grid selected align прижать сетка узел ctrl+b",
      hotkey: "Ctrl+B",
      run: () => void snapSelectionToGrid(false),
      disabled: !selectedCount,
    },
    {
      id: "snap-grid-each",
      group: tr("Правка"),
      title: tr("Привязать к сетке каждый объект отдельно"),
      keywords: "snap grid individually each прижать сетка каждый отдельно",
      hotkey: "Ctrl+Shift+B",
      run: () => void snapSelectionToGrid(true),
      disabled: !selectedCount,
    },
    {
      id: "drop-floor",
      group: tr("Правка"),
      title: tr("Опустить на пол: переместить выделение на ближайшую поверхность под ним"),
      keywords: "drop floor ground snap опустить пол поверхность",
      hotkey: "End",
      run: () => void dropToFloor(),
      disabled: !selectedCount,
    },
    { id: "select-all", group: tr("Правка"), title: tr("Выделить всё видимое"), keywords: "select all выделить всё", hotkey: "Ctrl+A", run: () => selectAllVisible(false), disabled: !mapName },
    {
      id: "select-invert",
      group: tr("Правка"),
      title: tr("Инвертировать выделение: выбрать всё видимое, кроме выделенного"),
      keywords: "invert selection обратить инвертировать выделение",
      hotkey: "Ctrl+Shift+I",
      run: () => selectAllVisible(true),
      disabled: !mapName,
    },
    {
      id: "lock",
      group: tr("Правка"),
      title: tr("Заблокировать объекты: видны, но не выбираются щелчком и рамкой"),
      keywords: "lock freeze pickable unselectable заблокировать заморозить",
      hotkey: "Ctrl+L",
      run: () => lockSelection(true),
      disabled: !selectedCount,
    },
    {
      id: "unlock-all",
      group: tr("Правка"),
      title: tr("Снять блокировку со всех объектов"),
      keywords: "unlock unfreeze разблокировать",
      hotkey: "Ctrl+Shift+L",
      run: () => lockSelection(false),
      disabled: !mapName,
    },
    {
      id: "select-children",
      group: tr("Правка"),
      title: tr("Выбрать с дочерними: добавить энтити, привязанные через parentname"),
      keywords: "select children hierarchy parent выбрать детей иерархия parentname",
      run: selectWithChildren,
      disabled: !selectedCount,
    },
    {
      id: "select-parent",
      group: tr("Правка"),
      title: tr("Выбрать родителя: энтити, к которой привязано выделенное (parentname)"),
      keywords: "select parent hierarchy unity родитель выбрать parentname иерархия",
      run: () => selectParent(false),
      disabled: !selectedCount,
    },
    {
      id: "select-root",
      group: tr("Правка"),
      title: tr("Выбрать корень: верхнюю энтити цепочки parentname"),
      keywords: "select root parent top hierarchy корень верх цепочки parentname",
      run: () => selectParent(true),
      disabled: !selectedCount,
    },
    {
      id: "select-inside",
      group: tr("Правка"),
      title: tr("Выбрать внутри: всё, что целиком лежит в габаритах выделения"),
      keywords: "select inside contents room выбрать внутри содержимое комнаты",
      hotkey: "Ctrl+Shift+A",
      run: selectInside,
      disabled: !selectedCount,
    },
    {
      id: "select-model-users",
      group: tr("Правка"),
      title: tr("Выбрать пропы с текущей моделью библиотеки"),
      keywords: "select actors using this asset unreal model props выбрать пропы модель использующие",
      run: () => selectAssetUsers("model"),
    },
    {
      id: "select-material-users",
      group: tr("Правка"),
      title: tr("Выбрать браши с текущей текстурой"),
      keywords: "select using material texture brushes выбрать браши текстура материал использующие",
      run: () => selectAssetUsers("material"),
    },
    {
      id: "browse-asset",
      group: tr("Правка"),
      title: tr("Найти в библиотеке: модель выделенного пропа или текстуру браша/грани"),
      keywords: "find in content browser browse asset unreal ctrl+b найти в библиотеке модель текстура показать",
      run: browseToAsset,
      disabled: !selectedCount,
    },
    {
      id: "select-random",
      group: tr("Правка"),
      title: tr("Случайная половина выделения (повтор - ещё половина)"),
      keywords: "select random half thin out blender случайные половина проредить",
      run: selectRandom,
      disabled: selectedCount < 2,
    },
    {
      id: "select-grow",
      group: tr("Правка"),
      title: tr("Расширить выделение: добавить касающиеся объекты; повторный вызов - следующий слой"),
      keywords: "select more grow linked touching neighbours расширить соседи касается связанные",
      hotkey: "Ctrl+Shift+G",
      run: growSelection,
      disabled: !selectedCount,
    },
    {
      id: "select-similar",
      group: tr("Правка"),
      title: tr("Выбрать похожие: браши с теми же текстурами и энтити того же класса"),
      keywords: "select similar same texture class выбрать похожие",
      hotkey: "Shift+G",
      run: selectSimilar,
      disabled: !selectedCount,
    },
    { id: "focus", group: tr("Вид"), title: tr("Навести виды на выделение"), keywords: "focus center frame", hotkey: "Ctrl+E", run: focusSelection, disabled: !selectedCount },
    { id: "p-notes", group: tr("Панель"), title: tr("Заметки: метки с текстом на карте"), keywords: "notes todo pins annotations заметки метки дела", run: () => setPanel("notes") },
    {
      id: "note-add",
      group: tr("Карта"),
      title: tr("Добавить заметку у выделения или камеры"),
      keywords: "note add pin annotation заметка добавить",
      hotkey: "Ctrl+Shift+N",
      run: () => addNoteHere(),
    },
    { id: "p-tex", group: tr("Панель"), title: tr("Браузер текстур"), keywords: "textures materials", run: () => setPanel("textures") },
    { id: "p-models", group: tr("Панель"), title: tr("Браузер моделей"), keywords: "models props", run: () => setPanel("models"), disabled: !inTauri },
    { id: "p-sounds", group: tr("Панель"), title: tr("Звуки: браузер и редактор"), keywords: "sound audio звук ambient_generic wav запись", run: () => setPanel("sounds") },
    { id: "p-paint", group: tr("Панель"), title: tr("Рисование текстур"), keywords: "paint draw texture рисовать рисовалка кисть vtf слои", run: () => setPanel("paint") },
    {
      id: "p-logic",
      group: tr("Панель"),
      title: tr("Логика: граф связей энтити"),
      keywords: "logic graph io outputs inputs nodes blueprint связи выходы входы граф схема",
      run: () => setPanel("logic"),
    },
    {
      id: "p-outliner",
      group: tr("Панель"),
      title: tr("Структура карты: дерево брашей, групп и энтити"),
      keywords: "outliner hierarchy tree scene структура иерархия дерево сцена",
      run: () => setPanel("outliner"),
    },
    { id: "p-assistant", group: tr("Панель"), title: tr("Ассистент Claude"), keywords: "assistant claude ai chat помощник ассистент lua", run: () => setPanel("assistant") },
    { id: "p-props", group: tr("Панель"), title: tr("Свойства энтити"), keywords: "properties keys outputs", hotkey: "Alt+Enter", run: openProperties },
    {
      id: "p-inspector",
      group: tr("Панель"),
      title: tr("Инспектор выделения"),
      keywords: "inspector size position materials",
      hotkey: "Alt+I",
      run: () => {
        setPanel("inspector");
        loadClassList();
        refreshProperties();
      },
    },
    {
      id: "p-world",
      group: tr("Панель"),
      title: tr("Свойства карты (worldspawn)"),
      keywords: "map properties sky",
      run: () => {
        refreshWorld();
        setPanel("world");
      },
    },
    {
      id: "p-vis",
      group: tr("Панель"),
      title: tr("Визгруппы (visgroups)"),
      keywords: "visgroups visibility группы видимости визгруппы",
      run: () => {
        refreshVisgroups();
        setPanel("visgroups");
      },
    },
    { id: "p-problems", group: tr("Панель"), title: tr("Проверить карту на ошибки"), keywords: "check problems errors проблемы", hotkey: "Alt+P", run: () => void checkProblems() },
    { id: "p-entities", group: tr("Панель"), title: tr("Отчёт по энтити"), keywords: "entity report find", run: () => setPanel("entities") },
    { id: "v-textured", group: tr("Вид"), title: tr("Текстуры"), keywords: "textured view mode 3d режим", run: () => setViewMode("textured") },
    { id: "v-flat", group: tr("Вид"), title: tr("Один цвет (flat)"), keywords: "flat shaded view mode 3d режим", run: () => setViewMode("flat") },
    { id: "v-wire", group: tr("Вид"), title: tr("Каркас (wireframe)"), keywords: "wireframe view mode 3d режим", run: () => setViewMode("wireframe") },
    {
      id: "v-skybox",
      group: tr("Вид"),
      title: showSkybox ? tr("3D-скайбокс: скрыть") : tr("3D-скайбокс: показать"),
      keywords: "skybox sky_camera 3d",
      run: () => {
        setShowSkybox(!showSkyboxRef.current);
        void refreshEntities();
      },
    },
    { id: "v-lighting", group: tr("Вид"), title: tr("Предпросмотр освещения"), keywords: "light preview lighting view mode свет 3d режим превью", run: () => setViewMode("lighting") },
    {
      id: "v-column",
      group: tr("Вид"),
      title: showColumn ? tr("Скрыть панели") : tr("Показать панели"),
      keywords: "panels column hide show панели",
      hotkey: "Ctrl+Shift+P",
      run: () => setShowColumn(!showColumn),
    },
    { id: "v-journey", group: tr("Вид"), title: showJourney ? tr("Скрыть путь карты") : tr("Показать путь карты"), keywords: "journey путь этапы полоса", run: () => setShowJourney(!showJourney) },
    ...ALL_VIEWS.map((v) => ({
      id: `win-${v}`,
      group: tr("Вид"),
      title: v === "3d" ? tr("Дополнительная камера в отдельном окне") : tr("{0} в отдельном окне", [VIEW_NAMES[v]]),
      keywords: "window monitor окно монитор вид камера satellite",
      run: () => void openSatellite(v),
      disabled: !inTauri,
    })),
    ...LAYOUT_PRESETS.map((p) => ({
      id: `layout-${p.id}`,
      group: tr("Вид"),
      title: tr("Раскладка «{0}»", [p.title]),
      keywords: `layout preset раскладка панели ${p.hint}`,
      run: () => applyWholeLayout(p.build(TAB_PANELS)),
    })),
    ...savedLayouts.map((l) => ({
      id: `layout-saved-${l.name}`,
      group: tr("Вид"),
      title: tr("Раскладка «{0}»", [l.name]),
      keywords: "layout saved раскладка своя панели",
      run: () => applyWholeLayout(l.layout),
    })),
    { id: "v-lightmap", group: tr("Вид"), title: tr("Сетка лайтмапа (lightmap grid)"), keywords: "lightmap grid luxel view mode 3d режим", run: () => setViewMode("lightmap") },
    {
      id: "path",
      group: tr("Энтити"),
      title: tr("Цепочка энтити (path tool)"),
      keywords: "path track corner chain",
      run: () => {
        setPathChain(!pathChainRef.current.on);
        setTool("entity");
      },
    },
    {
      id: "p-resources",
      group: tr("Панель"),
      title: tr("Ресурсы: память, нагрузка и лимиты Source"),
      keywords: "resources memory limits performance ресурсы память лимиты",
      run: () => setPanel("resources"),
    },
    {
      id: "p-history",
      group: tr("Панель"),
      title: tr("История версий карты"),
      keywords: "history versions backup",
      run: () => {
        setPanel("history");
        void refreshHistory();
      },
      disabled: !inTauri,
    },
    {
      id: "p-prefabs",
      group: tr("Панель"),
      title: tr("Префабы: библиотека заготовок"),
      keywords: "prefabs library",
      run: () => {
        setPanel("prefabs");
        void refreshPrefabs();
      },
      disabled: !inTauri,
    },
    {
      id: "p-settings",
      group: tr("Панель"),
      title: tr("Настройки: панели и горячие клавиши"),
      keywords: "settings hotkeys keys options",
      run: () => setPanel((p) => (p === "settings" ? "none" : "settings")),
    },
    { id: "p-compile", group: tr("Панель"), title: tr("Панель сборки"), keywords: "compile panel", run: () => setPanel("compile"), disabled: !inTauri },
    {
      id: "p-gameview",
      group: tr("Панель"),
      title: tr("Взгляд из игры: снимки и тестовый цикл"),
      keywords: "game view screenshot снимок игра тест",
      run: () => setPanel("gameview"),
      disabled: !inTauri,
    },
    {
      id: "p-workshop",
      group: tr("Панель"),
      title: tr("Публикация в Steam Workshop"),
      keywords: "workshop publish steam публикация мастерская gmad gmpublish",
      run: () => setPanel("workshop"),
      disabled: !inTauri,
    },
  ];
  /** Go to Brush / Go to Coordinates: an id or "x y z" typed into the palette. */
  const paletteExtra = useCallback(
    (query: string): Command[] => {
      const q = query.trim();
      if (!current.current || !q) return [];
      const out: Command[] = [];
      const coords = parseCoords(q);
      if (coords) out.push({ id: "goto-point", group: tr("Перейти"), title: tr("Переместить камеру в точку {0}", [coords.join(" ")]), run: () => goToPoint(coords) });
      if (/^\d+$/.test(q)) {
        const id = Number(q);
        const kind = current.current.doc.kind_of(id);
        out.push({
          id: "goto-id",
          group: tr("Перейти"),
          title: kind ? tr("Выбрать {0} id {1}", [kind === "solid" ? tr("браш") : tr("энтити"), id]) : tr("Нет объекта с id {0}", [id]),
          run: () => selectObject(id),
          disabled: !kind,
        });
      }
      const keyQ = parseKeyQuery(q);
      if (keyQ) {
        // Hammer's Find Entities by key and value: one command selects them all, the first few go one by one.
        const map = current.current;
        // classname and targetname live beside the keyvalues; they are searched as keys too.
        const keysOf = (e: (typeof map.entities)[number]): [string, string][] => [
          ["classname", e.classname],
          ["targetname", e.targetname ?? ""],
          ...((map.doc.entity_details(e.id) as { keyvalues: [string, string][] } | undefined)?.keyvalues ?? []),
        ];
        const hits = map.entities.filter((e) => matchesKey(keysOf(e), keyQ));
        const pickIds = (ids: number[]) =>
          ids.flatMap((id) => {
            const solids = Array.from(map.doc.entity_solids(id) as Uint32Array);
            return solids.length ? solids : [id];
          });
        const what =
          keyQ.op === "eq"
            ? `${keyQ.key} = ${keyQ.value || tr("пусто")}`
            : keyQ.op === "not"
              ? keyQ.value
                ? tr("{0} без «{1}»", [keyQ.key, keyQ.value])
                : tr("пустым {0}", [keyQ.key])
              : keyQ.value
                ? `${keyQ.key} = …${keyQ.value}…`
                : tr("заданным {0}", [keyQ.key]);
        out.push({
          id: "find-key-all",
          group: tr("Ключ"),
          title: hits.length ? tr("Выбрать все энтити с {0} ({1})", [what, hits.length]) : tr("Нет энтити с {0}", [what]),
          run: () => {
            selectIds(pickIds(hits.map((e) => e.id)));
            focusSelection();
          },
          disabled: !hits.length,
        });
        for (const e of hits.slice(0, 8)) {
          out.push({
            id: `find-key-${e.id}`,
            group: tr("Ключ"),
            title: `${e.targetname ? `${e.targetname} · ` : ""}${e.classname} (${e.id})`,
            run: () => {
              selectIds(pickIds([e.id]));
              focusSelection();
            },
          });
        }
        return out;
      }
      if (!coords && !/^\d+$/.test(q)) {
        for (const f of findObjects(current.current.entities, q)) {
          out.push({
            id: `find-${f.id}`,
            group: tr("Найти"),
            title: f.title,
            run: () => {
              selectObject(f.id);
              focusSelection();
            },
          });
        }
        // Brushes by texture: Hammer needs the Replace Textures dialog for that.
        const map = current.current;
        for (const mi of findMaterials(map.mesh.materials, q)) {
          const t = map.mesh.faceTable;
          const solids = new Set<number>();
          let faces = 0;
          for (let f = 0; f < t.length / 4; f++) {
            if (t[f * 4 + 3] !== mi) continue;
            solids.add(t[f * 4 + 1]);
            faces++;
          }
          const name = map.mesh.materials[mi];
          out.push({
            id: `find-mat-${mi}`,
            group: tr("Текстура"),
            title: tr("Выбрать браши с {0} ({1} брашей, {2} граней)", [name, solids.size, faces]),
            run: () => {
              selectIds([...solids]);
              focusSelection();
            },
            disabled: !solids.size,
          });
        }
      }
      return out;
    },
    [goToPoint, selectObject, focusSelection, selectIds],
  );

  /** The same commands with the person's hotkeys applied. */
  const commands: Command[] = baseCommands.map((c) => ({ ...c, hotkey: effectiveHotkey(keymap, c.id, c.hotkey) }));
  // The tour's steps with their state: which deed is done decides when the tour moves on.
  const texturesShown = visiblePanels(layout).includes("textures");
  const tourSteps = tourScript(tourKind, {
    hasMap: !!mapName,
    tool,
    texturesShown,
    brush: firstSteps.brush,
    texture: firstSteps.texture,
    entity: firstSteps.entity,
    compile: firstSteps.compile,
    inTauri,
    gameFound: content?.state === "ready",
  });
  // Moves on by itself once the step is done; the last step waits for «Готово».
  useEffect(() => {
    if (tourIndex === null) return;
    const st = tourSteps[tourIndex];
    if (!st || !st.done || tourIndex >= tourSteps.length - 1) return;
    const t = window.setTimeout(() => setTourIndex((i) => (i === tourIndex ? i + 1 : i)), 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourIndex, tourSteps.map((s) => s.done).join()]);
  // A step about a panel opens that panel, so its tab is there to spotlight.
  useEffect(() => {
    const st = tourIndex !== null ? tourSteps[tourIndex] : undefined;
    if (st?.panel) openPanel(st.panel as Panel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourIndex]);
  const startTour = useCallback(
    (kind: TourKind = "quick") => {
      setTourKind(kind);
      if (kind === "quick") {
        // Skip the deeds already done, so the tour starts where the newcomer is.
        const steps = tourScript("quick", {
          hasMap: !!mapName,
          tool,
          texturesShown,
          brush: firstSteps.brush,
          texture: firstSteps.texture,
          entity: firstSteps.entity,
          compile: firstSteps.compile,
          inTauri,
          gameFound: content?.state === "ready",
        });
        const first = steps.findIndex((s) => !s.done);
        setTourIndex(first < 0 ? steps.length - 1 : first);
      } else setTourIndex(0);
      setShowFirstSteps(true);
    },
    [mapName, tool, texturesShown, firstSteps, content?.state, setShowFirstSteps],
  );
  /** The first-run wizard's answer: which lesson to start, if any. */
  const finishOnboarding = useCallback(
    (choice: Experience) => {
      setOnboardingOpen(false);
      try {
        localStorage.setItem("gme.onboarded", "1");
      } catch {
        /* no storage */
      }
      if (choice === "novice") startTour("full");
      else if (choice === "hammer") startTour("hammer");
    },
    [startTour],
  );
  const keymapPreset = KEYMAP_PRESETS.find((p) => Object.keys(p.map).length > 0 && Object.entries(p.map).every(([k, v]) => keymap[k] === v))?.id ?? "default";
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  /** The menu bar, built from the commands so titles, hotkeys and availability stay in one place. */
  const byId = new Map(commands.map((c) => [c.id, c]));
  // Over the views: what one does with the thing under the cursor. The clipboard lives on its hotkeys and in «Правка».
  const contextItems: MenuItem[] = (
    [
      "p-inspector",
      "focus",
      "sep",
      "duplicate",
      "delete",
      "sep",
      "tie",
      "world",
      "sep",
      "group",
      "ungroup",
      "sep",
      "drop-floor",
      "snap-grid",
      "select-similar",
      "select-refs",
      "browse-asset",
      "hide",
      "isolate",
      "showall",
    ] as const
  )
    .map((id) => (id === "sep" ? "sep" : byId.get(id)))
    .filter((x): x is MenuItem => x !== undefined);
  const menus: Menu[] = (() => {
    const pick = (ids: (string | "sep")[]): MenuItem[] => {
      const out: MenuItem[] = [];
      for (const id of ids) {
        if (id === "sep") {
          if (out.length && out[out.length - 1] !== "sep") out.push("sep");
          continue;
        }
        const c = byId.get(id);
        if (c) out.push(c);
      }
      while (out.length && out[out.length - 1] === "sep") out.pop();
      return out;
    };
    const recents = recent.map((_, i) => `recent-${i}`);
    const aligns = (["x", "y", "z"] as const).flatMap((ax) => (["min", "center", "max", "grid"] as const).map((m) => `align-${ax}-${m}`));
    return [
      { title: tr("Файл"), items: pick(["new", "open", ...recents, "sep", "save", "saveas", "save-incremental", "sep", "import-tex", "sep", "p-history"]) },
      {
        title: tr("Правка"),
        items: pick([
          "undo",
          "redo",
          "sep",
          "cut",
          "copy",
          "paste",
          "paste-here",
          "duplicate",
          "duplicate-unique",
          "repeat-copy",
          "array",
          "rot90-z-cw",
          "rot90-z-ccw",
          "sep",
          "rename",
          "copy-coords",
          "copy-coords-lua",
          "transform-copy",
          "transform-paste-pos",
          "transform-paste-rot",
          "keys-copy",
          "keys-paste",
          "reset-transform",
          "random-rotation",
          "replace-model",
          "props-static",
          "props-physics",
          "props-dynamic",
          "door-hinge",
          "origin-centre",
          "nodraw-hidden",
          "merge-brushes",
          "delete",
          "sep",
          "group",
          "ungroup",
          "sep",
          "select-all",
          "select-invert",
          "select-inside",
          "select-children",
          "select-parent",
          "select-root",
          "select-grow",
          "select-random",
          "select-refs",
          "select-path",
          "select-detail",
          "select-similar",
          "drop-floor",
          "snap-grid",
          "snap-grid-each",
          "to-camera",
          "sep",
          "lock",
          "unlock-all",
          "sep",
          "hide",
          "isolate",
          "showall",
          "showall-select",
          "tool-brushes",
          "sep",
          "p-settings",
        ]),
      },
      {
        title: tr("Вид"),
        items: pick(["v-textured", "v-flat", "v-wire", "v-lightmap", "v-lighting", "sep", "v-skybox", "v-game", "v-labels", "focus", "frame-all", "view-max", "pilot", "sep", "grid-up", "grid-down"]),
      },
      {
        title: tr("Инструменты"),
        items: pick(["t-select", "t-block", "t-cyl", "t-arch", "t-sphere", "t-wedge", "t-tex", "t-ent", "path", "t-clip", "t-vertex", "t-cordon", "t-landscape", "t-measure", "sep", "texture-lock"]),
      },
      { title: tr("Карта"), items: pick(["tie", "wrap-trigger", "world", "carve", "hollow", "mirror", "collapse", "sep", ...aligns, "sep", "p-problems", "find-overlaps", "p-world"]) },
      { title: tr("Сборка"), items: pick(["compile", "p-compile", "sep", "game", "p-gameview", "sep", "pack-check", "p-workshop"]) },
      {
        title: tr("Окно"),
        items: pick([
          "p-inspector",
          "p-props",
          "p-tex",
          "p-paint",
          "p-models",
          "p-sounds",
          "p-prefabs",
          "p-entities",
          "p-vis",
          "p-world",
          "p-problems",
          "p-resources",
          "p-assistant",
          "p-workshop",
          "sep",
          "v-column",
          ...ALL_VIEWS.map((v) => `win-${v}`),
          "sep",
          ...LAYOUT_PRESETS.map((p) => `layout-${p.id}`),
          ...savedLayouts.map((l) => `layout-saved-${l.name}`),
        ]),
      },
      {
        title: tr("Справка"),
        items: [
          { id: "help-palette", group: tr("Справка"), title: tr("Палитра команд: поиск действий по названию"), hotkey: "F1", run: () => setPaletteOpen(true) },
          { id: "help-hints", group: tr("Справка"), title: showHints ? tr("Скрыть подсказку над видами") : tr("Показать подсказку над видами"), run: () => setShowHints(!showHints) },
          { id: "help-steps", group: tr("Справка"), title: showFirstSteps ? tr("Скрыть «Первые шаги»") : tr("Показать «Первые шаги»"), run: () => setShowFirstSteps(!showFirstSteps) },
          { id: "help-tour", group: tr("Справка"), title: tr("Быстрый тур: от первого браша до собранной карты"), keywords: "tour тур обучение guide", run: () => startTour("quick") },
          { id: "help-lesson", group: tr("Справка"), title: tr("Полный курс для начинающих"), keywords: "обучение урок lesson tutorial новичок", run: () => startTour("full") },
          { id: "help-hammer", group: tr("Справка"), title: tr("Отличия от Hammer"), keywords: "hammer отличия", run: () => startTour("hammer") },
          { id: "help-onboarding", group: tr("Справка"), title: tr("Первоначальная настройка…"), keywords: "setup onboarding настройка первый запуск", run: () => setOnboardingOpen(true) },
          {
            id: "help-theme",
            group: tr("Справка"),
            title: theme === "light" ? tr("Тёмная тема") : tr("Светлая тема"),
            keywords: "theme dark light тема",
            run: () => setTheme(theme === "light" ? "dark" : "light"),
          },
          "sep",
          { id: "help-settings", group: tr("Справка"), title: tr("Настройки: панели и горячие клавиши"), run: () => openPanel("settings") },
        ],
      },
    ];
  })();
  return { baseCommands, paletteExtra, commands, texturesShown, tourSteps, startTour, finishOnboarding, keymapPreset, commandsRef, byId, contextItems, menus };
}
