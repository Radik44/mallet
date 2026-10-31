// The docked panels, one per kind: the side column shows one or two of them.
// Moved out of App.tsx whole; the editor comes in as one object.

import { entFireCommand } from "./entFire";
import { SATELLITE_PANEL, type DocMessage } from "../ui/satellite";
import { api, inTauri } from "../tauri";
import { CompilePanel } from "../ui/CompilePanel";
import { ModelsPanel } from "../ui/ModelsPanel";
import { NewMapPanel } from "../ui/NewMapPanel";
import { ResourcesPanel } from "../ui/ResourcesPanel";
import { LAYOUT_PRESETS } from "../ui/Dock";
import { InspectorPanel } from "../ui/InspectorPanel";
import { PropertiesPanel, type Connection, type EntityDetails } from "../ui/PropertiesPanel";
import { LogicPanel } from "../ui/LogicPanel";
import { OutlinerPanel } from "../ui/OutlinerPanel";
import { NotesPanel } from "../ui/NotesPanel";
import { removeNote, updateNote } from "./notes";
import { type InspectorItem, type MultiEdit } from "../ui/InspectorPanel";
import { buildOutline, parentOf, type OutlineEntity } from "./outline";
import { findGenerator } from "./generators";
import { type GraphConnection } from "./ioGraph";
import { useMemo, useState } from "react";
import { TexturePanel } from "../ui/TexturePanel";
import { FaceEditor } from "../ui/FaceEditor";
import { ProblemsPanel } from "../ui/ProblemsPanel";
import { SettingsPanel } from "../ui/SettingsPanel";
import { PrefabsPanel } from "../ui/PrefabsPanel";
import { HistoryPanel } from "../ui/HistoryPanel";
import { ArrayPanel } from "../ui/ArrayPanel";
import { EntityReportPanel, type ReportEntity } from "../ui/EntityReportPanel";
import { VisgroupsPanel } from "../ui/VisgroupsPanel";
import { Panel, TAB_PANELS, HISTORY_KEEP, GRID_SIZES } from "./constants";
import type { EditorApi } from "./editorApi";
import { LandscapePanel } from "../ui/LandscapePanel";
import { SoundPanel } from "../ui/SoundPanel";
import { PaintPanel } from "../ui/PaintPanel";
import { AssistantPanel } from "../ui/AssistantPanel";
import { GameViewPanel } from "../ui/GameViewPanel";
import { WorkshopPanel } from "../ui/WorkshopPanel";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { soundUrl, thumbnailUrl } from "../tauri";
import { SOUND_LOOPS } from "../ui/assetDrag";
import { t as tr, tb } from "../i18n";

/** Every entity's details (keys and outputs), re-read after each edit; shared by the logic graph, the outliner and the inspector. */
function useEntityDetails(e: EditorApi, enabled = true): Map<number, EntityDetails> {
  const { current, hist } = e;
  const map = current.current;
  const entities = map?.entities ?? null;
  return useMemo(() => {
    const out = new Map<number, EntityDetails>();
    if (!enabled || !map || !entities) return out;
    for (const en of entities) {
      const d = map.doc.entity_details(en.id) as EntityDetails | undefined;
      if (d) out.set(en.id, d);
    }
    return out;
    // `hist` changes with every edit; the entity list alone is replaced only by some.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, map, entities, hist]);
}

/** Hammer's multi-entity properties: the keys every selected entity has, with the value when they agree. */
function multiEditOf(items: InspectorItem[], details: Map<number, EntityDetails>): MultiEdit | null {
  const ids = [...new Set(items.map((i) => (i.kind === "entity" ? i.id : i.owner)).filter((id) => id > 0))];
  if (ids.length < 2) return null;
  const ds = ids.map((id) => details.get(id)).filter((d): d is EntityDetails => !!d);
  if (ds.length < 2) return null;
  const classes = [...new Set(ds.map((d) => d.classname))];
  const first = new Map(ds[0].keyvalues.filter(([k]) => k.toLowerCase() !== "id"));
  const keys: MultiEdit["keys"] = [];
  for (const [k, v] of first) {
    if (!ds.every((d) => d.keyvalues.some(([kk]) => kk.toLowerCase() === k.toLowerCase()))) continue;
    const same = ds.every((d) => d.keyvalues.find(([kk]) => kk.toLowerCase() === k.toLowerCase())?.[1] === v);
    keys.push({ key: k, value: same ? v : null });
  }
  keys.sort((a, b) => (a.key === "classname" ? -1 : b.key === "classname" ? 1 : a.key.localeCompare(b.key)));
  return { ids: ds.map((d) => d.id), classes, keys };
}

/** The logic graph: every entity's outputs, re-read after each edit. */
function LogicSlot({ e }: { e: EditorApi }) {
  const { current, selection, selectObject, openProperties, setEntityConnections, classDefFor, inputsFor } = e;
  const map = current.current;
  const entities = map?.entities ?? null;
  const details = useEntityDetails(e);
  const connections = useMemo(() => {
    const out: GraphConnection[] = [];
    for (const [id, d] of details)
      d.connections.forEach((c, index) => out.push({ source: id, index, output: c.output, target: c.target, input: c.input, parameter: c.parameter, delay: c.delay, times: c.times_to_fire }));
    return out;
  }, [details]);
  return (
    <LogicPanel
      entities={entities}
      connections={connections}
      selectedIds={selection.current}
      onSelect={selectObject}
      onOpen={(id) => {
        selectObject(id);
        openProperties();
      }}
      onSetConnections={setEntityConnections}
      classDefFor={classDefFor}
      inputsFor={inputsFor}
    />
  );
}

/** The outliner: world, groups and entities as a tree with hide, lock and parent links. */
function OutlinerSlot({ e }: { e: EditorApi }) {
  const { current, hist, selection, selectIds, selectObject, openProperties, focusSelection, runEdit, showAll, setEntityKeys, lockedRef } = e;
  const map = current.current;
  const details = useEntityDetails(e);
  const [lockTick, setLockTick] = useState(0);
  const nodes = useMemo(() => {
    if (!map) return null;
    const doc = map.doc;
    const hiddenIds = new Set<number>(Array.from(doc.hidden_ids() as Uint32Array));
    const entities: OutlineEntity[] = map.entities.map((en) => ({
      id: en.id,
      classname: en.classname,
      targetname: en.targetname,
      brush: en.brush,
      hidden: en.hidden,
      parentname: parentOf(details.get(en.id)?.keyvalues.find(([k]) => k.toLowerCase() === "parentname")?.[1]),
      instance_file: en.instance_file,
    }));
    const worldSolids = Array.from(doc.solid_ids() as Uint32Array).filter((id) => doc.entity_of_solid(id) === 0);
    const groups = new Map<number, number[]>();
    for (const id of [...worldSolids, ...entities.map((x) => x.id)]) {
      const g = doc.group_of(id);
      if (!g) continue;
      const list = groups.get(g) ?? [];
      list.push(id);
      groups.set(g, list);
    }
    return buildOutline({ entities, worldSolids, hiddenIds, groups: [...groups].map(([id, members]) => ({ id, members })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, details, hist]);
  const hiddenCount = map ? (map.doc.hidden_ids() as Uint32Array).length : 0;
  const withSolids = (ids: number[]) =>
    map ? ids.flatMap((id) => (map.doc.kind_of(id) === "entity" && map.doc.entity_solids(id).length ? Array.from(map.doc.entity_solids(id) as Uint32Array) : [id])) : ids;
  // Brush entities are selected through their brushes; the tree marks the entity row too.
  const selectedWithOwners = new Set(selection.current);
  if (map)
    for (const id of selection.current) {
      const owner = map.doc.entity_of_solid(id);
      if (owner) selectedWithOwners.add(owner);
    }
  return (
    <OutlinerPanel
      nodes={nodes}
      selectedIds={selectedWithOwners}
      lockedIds={new Set(lockedRef.current)}
      hiddenCount={hiddenCount}
      onSelect={(ids, additive) => selectIds(additive ? [...selection.current, ...withSolids(ids)] : withSolids(ids))}
      onOpen={(id) => {
        selectObject(id);
        openProperties();
      }}
      onFocus={(ids) => {
        selectIds(withSolids(ids));
        window.setTimeout(focusSelection, 50);
      }}
      onSetHidden={(ids, hidden) => void runEdit(() => map?.doc.set_hidden(Uint32Array.from(ids), hidden, false))}
      onShowAll={() => void showAll()}
      onSetLocked={(ids, locked) => {
        for (const id of [...ids, ...withSolids(ids)]) {
          if (locked) lockedRef.current.add(id);
          else lockedRef.current.delete(id);
        }
        if (locked) selectIds([...selection.current].filter((id) => !lockedRef.current.has(id)));
        setLockTick(lockTick + 1);
      }}
      onReparent={(childId, parent) => void setEntityKeys(childId, [["parentname", parent]])}
    />
  );
}

/** One docked panel by kind. */
export function DockPanel({ slot, e }: { slot: Panel; e: EditorApi }) {
  const inspectorDetails = useEntityDetails(e, slot === "inspector");
  const {
    current,
    currentPath,
    satChannelRef,
    selection,
    toolRef,
    faceSel,
    content,
    mapName,
    busy,
    setError,
    selectedCount,
    gridSize,
    setPaintClick,
    snapMoves,
    setStatusText,
    autoFix,
    setAutoFix,
    autoAsk,
    setAutoAsk,
    autoReport,
    lastBsp,
    projectMeta,
    updateMeta,
    regenerateGenerator,
    detachGenerator,
    setKeysOnEntities,
    addNoteHere,
    setNotes,
    goToPoint,
    journey,
    editorScreenshot,
    currentMaterial,
    layoutRef,
    savedLayouts,
    storeSavedLayouts,
    setPanel,
    keymap,
    setKeymap,
    faceInfo,
    faceCount,
    paint,
    problems,
    worldDetails,
    worldDef,
    currentModel,
    modelPreview,
    modelPreviewInfo,
    theme,
    uiScale,
    setTheme,
    setUiScale,
    autoInspector,
    setAutoInspector,
    showHints,
    setShowHints,
    compileOptions,
    setCompileOptions,
    compileState,
    setCompileState,
    bridge,
    bridgeFollow,
    bridgeLive,
    setBridgeLive,
    setBridgeFollow,
    portalCount,
    portalsShown,
    leafCount,
    leavesShown,
    showLeaves,
    loadLeaves,
    leakPoints,
    pack,
    packBusy,
    packAfterCompile,
    setPackAfterCompile,
    prefabs,
    historyEntries,
    prefabDir,
    canPack,
    visgroups,
    pickTargetRef,
    setPickingTarget,
    pickModelRef,
    setPickingModel,
    classList,
    entityDetails,
    classDef,
    targetnames,
    openProperties,
    setCurrentMaterial,
    setCurrentModel,
    placeModelRef,
    selectAssetUsers,
    clearFaces,
    selectIds,
    selectionBoundsRef,
    setTool,
    setSnapMoves,
    rotatePreview,
    pickModel,
    runEdit,
    hideSelection,
    showAll,
    deleteSelection,
    tieSelection,
    moveToWorld,
    collapseInstances,
    refreshPrefabs,
    savePrefab,
    insertPrefab,
    arraySelection,
    setPaint,
    createDisplacement,
    sewDisplacements,
    removeDisplacement,
    displacementOp,
    editFaces,
    setWorldKeys,
    replaceTextures,
    replaceEntityKeys,
    focusSelection,
    selectObject,
    goToRef,
    showLeak,
    showPortals,
    runGame,
    bridgeTeleport,
    bridgeCameraToGame,
    bridgeGameToCamera,
    bridgeCubemaps,
    bridgeSyncEntities,
    bridgeReload,
    gameKill,
    analyzePack,
    packCustom,
    importTexturesDialog,
    checkProblems,
    fixProblems,
    applyMaterial,
    applyMaterialToSelection,
    setEntityKeys,
    setEntityConnections,
    inputsFor,
    compileCurrent,
    inspectorItems,
    moveSelectionCentre,
    resizeSelection,
    startAssetDrag,
    resources,
    modelThumbs,
    requestThumb,
    refreshHistory,
    jumpHistory,
    hist,
    historyDiff,
    compareHistoryEntry,
    closeHistoryDiff,
    goToDiffRow,
    revertDiffRow,
    openHistoryEntry,
    newMap,
    createLandscape,
    suggestLandscapeOrigin,
    placeSound,
    soundExported,
    applyPaintedTexture,
    setAssistantKey,
    compileIssues,
    applyCompileFix,
    askAboutCompile,
    askAboutProblems,
    gameShot,
    gameLive,
    setGameLive,
    gameBusy,
    takeGameShot,
    testCycle,
    bridgeNoclip,
    bridgeHud,
    askAboutShot,
    getEditorCamera,
    setSoundExported,
    applyWholeLayout,
    baseCommands,
    setGrid,
  } = e;
  /** ▶ on an output: fire it in the running game now, the console's answer goes to the status bar. */
  const testOutput = async (c: Connection) => {
    const built = entFireCommand(c, entityDetails?.keyvalues.find(([k]) => k.toLowerCase() === "targetname")?.[1] ?? null);
    if ("reason" in built) {
      setStatusText(tr("проверка выхода: {0}", [built.reason]));
      return;
    }
    try {
      const lines = await api.bridgeConsole(built.command);
      setStatusText(tr("в игре: {0}{1}", [built.command, lines.length ? ` → ${lines.slice(-1)[0]}` : ""]));
    } catch (err) {
      setStatusText(tr("не удалось отправить в игру: {0}", [String(err)]));
    }
  };
  return (
    <>
      {slot === "textures" && (
        <TexturePanel
          current={currentMaterial}
          mapMaterials={current.current?.mesh.materials}
          onPick={(name) => {
            setCurrentMaterial(name);
            if (SATELLITE_PANEL) satChannelRef.current?.postMessage({ type: "cmd", cmd: "material", name } satisfies DocMessage);
            else if (toolRef.current !== "texture") setTool("texture");
          }}
          onApplyMode={(name) => {
            setCurrentMaterial(name);
            if (SATELLITE_PANEL) {
              satChannelRef.current?.postMessage({ type: "cmd", cmd: "paintMode", name } satisfies DocMessage);
              return;
            }
            setTool("texture");
            setPaintClick(true);
          }}
          onDragAsset={SATELLITE_PANEL ? undefined : startAssetDrag}
          onApplyToSelection={() => (SATELLITE_PANEL ? satChannelRef.current?.postMessage({ type: "cmd", cmd: "applyMaterial" } satisfies DocMessage) : void applyMaterialToSelection())}
          selectedCount={SATELLITE_PANEL ? 1 : selectedCount}
          contentReady={content?.state === "ready"}
          onReplace={(f, r, scope, sub) =>
            SATELLITE_PANEL
              ? satChannelRef.current?.postMessage({ type: "cmd", cmd: "replace", find: f, replace: r, scope, substring: sub } satisfies DocMessage)
              : void replaceTextures(f, r, scope, sub)
          }
          onImport={inTauri && !SATELLITE_PANEL ? () => void importTexturesDialog() : undefined}
        >
          <FaceEditor
            face={faceInfo}
            count={faceCount}
            currentMaterial={currentMaterial}
            onEdit={(edit) => void editFaces(edit)}
            onApplyMaterial={() => void applyMaterial(Array.from(faceSel.current.values()).flat())}
            onClear={clearFaces}
            paint={paint}
            onPaint={setPaint}
            onCreateDisp={(power) => void createDisplacement(power)}
            onRemoveDisp={() => void removeDisplacement()}
            onInvertDisp={() => void displacementOp("invert")}
            onSubdivideDisp={() => void displacementOp("subdivide")}
            onSew={() => void sewDisplacements()}
          />
        </TexturePanel>
      )}
      {slot === "problems" && (
        <ProblemsPanel
          problems={problems}
          hiddenCount={current.current ? (current.current.doc.hidden_ids() as Uint32Array).length : 0}
          onShowHidden={async () => {
            await showAll();
            await checkProblems();
          }}
          onRefresh={() => void checkProblems()}
          onSelect={(p) => selectObject(p.object)}
          onFix={(p) => void fixProblems([p])}
          onFixAll={() => void fixProblems(problems ?? [])}
          onAsk={askAboutProblems}
          onNote={(p, text) => {
            // The note sits at the object (selecting it also frames it); findings without one go in front of the camera.
            if (p.object > 0 && current.current?.doc.kind_of(p.object)) selectObject(p.object);
            addNoteHere(text);
          }}
          onSelectAll={(ids) => {
            const map = current.current;
            if (!map) return;
            // Brush entities are selected through their brushes.
            selectIds(ids.flatMap((id) => (map.doc.kind_of(id) === "entity" && map.doc.entity_solids(id).length ? Array.from(map.doc.entity_solids(id) as Uint32Array) : [id])));
            setStatusText(tr("выделены объекты находок: {0}", [ids.length]));
          }}
        />
      )}
      {slot === "prefabs" && (
        <PrefabsPanel
          prefabs={prefabs}
          dir={prefabDir}
          selectedCount={SATELLITE_PANEL ? 1 : selectedCount}
          onRefresh={() => void refreshPrefabs()}
          onSave={(name) => (SATELLITE_PANEL ? satChannelRef.current?.postMessage({ type: "cmd", cmd: "savePrefab", name } satisfies DocMessage) : void savePrefab(name))}
          onInsert={(p) => (SATELLITE_PANEL ? satChannelRef.current?.postMessage({ type: "cmd", cmd: "prefab", name: p.name } satisfies DocMessage) : void insertPrefab(p))}
          onDragAsset={SATELLITE_PANEL ? undefined : startAssetDrag}
          onDelete={(p) => void api.deletePrefab(p.name).then(refreshPrefabs, (e) => setError(tb(String(e))))}
        />
      )}
      {slot === "resources" && <ResourcesPanel snapshot={resources} mapName={mapName} />}
      {slot === "history" && (
        <HistoryPanel
          entries={historyEntries}
          mapName={mapName}
          keep={HISTORY_KEEP}
          onRefresh={() => void refreshHistory()}
          onOpen={(e) => void openHistoryEntry(e)}
          onClear={() => {
            const path = currentPath.current;
            if (path) void api.clearHistory(path).then(refreshHistory, (e) => setError(tb(String(e))));
          }}
          undoLabels={hist?.undo_labels ?? []}
          redoLabels={hist?.redo_labels ?? []}
          onJump={(delta) => void jumpHistory(delta)}
          diff={historyDiff}
          onCompare={(e) => void compareHistoryEntry(e)}
          onCloseDiff={closeHistoryDiff}
          onGoTo={goToDiffRow}
          onRevert={(r) => void revertDiffRow(r)}
        />
      )}
      {slot === "array" && (
        <ArrayPanel
          selectedCount={selectedCount}
          size={(() => {
            const b = selectionBoundsRef.current();
            return b ? [b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]] : null;
          })()}
          busy={!!busy}
          onApply={(o) => void arraySelection(o)}
          onClose={() => setPanel("none")}
        />
      )}
      {slot === "settings" && (
        <SettingsPanel
          commands={baseCommands}
          keymap={keymap}
          onChangeKeymap={setKeymap}
          hints={showHints}
          onChangeHints={setShowHints}
          autoInspector={autoInspector}
          onChangeAutoInspector={setAutoInspector}
          snap={snapMoves}
          onChangeSnap={setSnapMoves}
          gridSize={gridSize}
          gridSizes={GRID_SIZES}
          onChangeGrid={setGrid}
          theme={theme}
          onChangeTheme={setTheme}
          uiScale={uiScale}
          onChangeScale={setUiScale}
          presets={LAYOUT_PRESETS}
          onApplyPreset={(id) => {
            const p = LAYOUT_PRESETS.find((x) => x.id === id);
            if (p) applyWholeLayout(p.build(TAB_PANELS));
          }}
          savedLayouts={savedLayouts.map((l) => l.name)}
          onSaveLayout={(name) => storeSavedLayouts([...savedLayouts.filter((l) => l.name !== name), { name, layout: layoutRef.current }])}
          onApplySaved={(name) => {
            const l = savedLayouts.find((x) => x.name === name);
            if (l) applyWholeLayout(l.layout);
          }}
          onDeleteSaved={(name) => storeSavedLayouts(savedLayouts.filter((l) => l.name !== name))}
        />
      )}
      {slot === "inspector" && (
        <InspectorPanel
          generator={(() => {
            const map = current.current;
            const first = [...selection.current][0];
            return map && first !== undefined ? (findGenerator(projectMeta.generators, map.doc.group_of(first)) ?? null) : null;
          })()}
          onGenerate={(rec, patch) => void regenerateGenerator(rec, patch)}
          onDetachGenerator={detachGenerator}
          multi={multiEditOf(inspectorItems(), inspectorDetails)}
          onSetMultiKey={(ids, key, value) => void setKeysOnEntities(ids, [[key, value]])}
          items={inspectorItems()}
          details={entityDetails}
          classDef={entityDetails && classDef?.classname.toLowerCase() === entityDetails.classname.toLowerCase() ? classDef : null}
          classList={classList}
          targetnames={targetnames}
          inputsFor={inputsFor}
          onSetKeys={(changes) => entityDetails && void setEntityKeys(entityDetails.id, changes)}
          onSetConnections={(conns) => entityDetails && void setEntityConnections(entityDetails.id, conns)}
          onTestOutput={bridge?.connected && entityDetails ? (c) => void testOutput(c) : undefined}
          onPickModel={(key) => {
            if (!entityDetails) return;
            pickModelRef.current = { entity: entityDetails.id, key };
            setPickingModel(key);
            setPanel("models");
            setStatusText(tr("выберите модель для {0} ({1}) в браузере моделей · Esc - отмена", [entityDetails.classname, key]));
          }}
          onPickTarget={(key) => {
            if (!entityDetails) return;
            pickTargetRef.current = { entity: entityDetails.id, key };
            setPickingTarget(key);
          }}
          onMoveCentre={(c) => void moveSelectionCentre(c)}
          onResize={(size) => void resizeSelection(size)}
          onApplyMaterial={() => void applyMaterialToSelection()}
          onPickMaterial={setCurrentMaterial}
          onTie={() => void tieSelection()}
          onMoveToWorld={() => void moveToWorld()}
          onHide={() => void hideSelection()}
          onDelete={() => void deleteSelection()}
          onFocus={focusSelection}
          onCollapse={() => void collapseInstances()}
          faceCount={faceCount}
          faceMaterial={faceInfo?.material ?? null}
          onFaceEditor={() => setPanel("textures")}
          currentMaterial={currentMaterial}
        />
      )}
      {slot === "world" && (
        <PropertiesPanel
          details={worldDetails}
          classDef={worldDef}
          title={tr("Карта")}
          subtitle={tr("свойства карты: небо, детали, версия")}
          noOutputs
          classList={[]}
          targetnames={targetnames}
          inputsFor={inputsFor}
          onSetKeys={(changes) => void setWorldKeys(changes)}
          onSetConnections={() => {}}
        />
      )}
      {slot === "models" && (
        <ModelsPanel
          current={currentModel}
          mapModels={(current.current?.entities ?? []).map((e) => e.model).filter((m): m is string => !!m && m.toLowerCase().endsWith(".mdl"))}
          contentReady={content?.state === "ready"}
          preview={modelPreview}
          previewInfo={modelPreviewInfo}
          onPick={(m) => {
            const pending = pickModelRef.current;
            if (pending && !SATELLITE_PANEL) {
              // The browser was opened from an entity's model key: fill it and stay on the entity.
              pickModelRef.current = null;
              setPickingModel(null);
              void setEntityKeys(pending.entity, [[pending.key, m]]);
              setCurrentModel(m);
              setPanel("inspector");
              setStatusText(`${pending.key} = ${m}`);
              return;
            }
            void pickModel(m);
            if (SATELLITE_PANEL) satChannelRef.current?.postMessage({ type: "cmd", cmd: "model", name: m } satisfies DocMessage);
          }}
          onDragAsset={SATELLITE_PANEL ? undefined : startAssetDrag}
          onRotate={(dy, dp) => void rotatePreview(dy, dp)}
          thumbs={modelThumbs}
          onNeedThumb={requestThumb}
          onPlace={(m) => (SATELLITE_PANEL ? satChannelRef.current?.postMessage({ type: "cmd", cmd: "placeModel", name: m } satisfies DocMessage) : void placeModelRef.current(m))}
          onSelectUsers={SATELLITE_PANEL ? undefined : () => selectAssetUsers("model")}
        />
      )}
      {slot === "compile" && (
        <CompilePanel
          options={compileOptions}
          state={compileState}
          mapName={mapName}
          canCompile={!!current.current && inTauri}
          leakPoints={leakPoints}
          issues={compileIssues}
          onFixIssue={(i) => void applyCompileFix(i)}
          onAskAssistant={askAboutCompile}
          pack={pack}
          packBusy={packBusy}
          packAfterCompile={packAfterCompile}
          autoFix={autoFix}
          onAutoFix={setAutoFix}
          autoAsk={autoAsk}
          onAutoAsk={setAutoAsk}
          autoReport={autoReport}
          canPack={canPack}
          onAnalyze={() => void analyzePack()}
          onPack={() => void packCustom()}
          onPackAfterCompile={setPackAfterCompile}
          onChange={setCompileOptions}
          onRun={() => void compileCurrent()}
          onClear={() => setCompileState((st) => ({ ...st, lines: [], result: "", ok: null }))}
          onGoTo={goToRef}
          onHideLeak={() => showLeak(null)}
          onRunGame={() => void runGame()}
          onRunGameDebug={() => void runGame(true)}
          bridge={bridge}
          bridgeFollow={bridgeFollow}
          onBridgeFollow={setBridgeFollow}
          bridgeLive={bridgeLive}
          onBridgeLive={setBridgeLive}
          onTeleport={() => void bridgeTeleport()}
          onCameraToGame={() => void bridgeCameraToGame()}
          onGameToCamera={() => void bridgeGameToCamera()}
          onCubemaps={() => void bridgeCubemaps()}
          onSyncEntities={() => void bridgeSyncEntities()}
          onReloadGame={() => void bridgeReload()}
          onGameView={() => setPanel("gameview")}
          onKillGame={() => void gameKill()}
          portalCount={portalCount}
          portalsShown={portalsShown}
          onTogglePortals={() => showPortals(!portalsShown)}
          leafCount={leafCount}
          leavesShown={leavesShown}
          onToggleLeaves={() => {
            if (leavesShown) showLeaves(false);
            else if (leafCount) showLeaves(true);
            else void loadLeaves().then((n) => n && showLeaves(true));
          }}
        />
      )}
      {slot === "entities" && (
        <EntityReportPanel
          entities={(current.current?.entities ?? []) as ReportEntity[]}
          selectedIds={selection.current}
          onSelect={(e) => selectObject(e.id)}
          onOpen={(e) => {
            selectObject(e.id);
            openProperties();
          }}
          onReplace={(ids, key, f, r) => void replaceEntityKeys(ids, key, f, r)}
        />
      )}
      {slot === "logic" && <LogicSlot e={e} />}
      {slot === "outliner" && <OutlinerSlot e={e} />}
      {slot === "notes" && (
        <NotesPanel
          notes={current.current ? projectMeta.pins : null}
          onAdd={() => addNoteHere()}
          onToggle={(id, done) => setNotes(updateNote(projectMeta.pins, id, { done }))}
          onText={(id, text) => setNotes(updateNote(projectMeta.pins, id, { text }))}
          onRemove={(id) => setNotes(removeNote(projectMeta.pins, id))}
          onGo={(n) => goToPoint(n.pos)}
        />
      )}
      {slot === "visgroups" && (
        <VisgroupsPanel
          user={visgroups.user}
          auto={visgroups.auto}
          hiddenCount={visgroups.hidden}
          selectedCount={selectedCount}
          onToggleUser={(id, visible) => void runEdit(() => current.current?.doc.set_hidden(current.current.doc.visgroup_members(id), !visible, false))}
          onToggleAuto={(i, visible) => void runEdit(() => current.current?.doc.set_hidden(new Uint32Array(visgroups.auto[i].ids), !visible, true))}
          onCreate={(name) => void runEdit(() => current.current?.doc.create_visgroup(name, new Uint8Array([40, 200, 90]), new Uint32Array(selection.current)))}
          onDelete={(id) => void runEdit(() => current.current?.doc.delete_visgroup(id))}
          onRename={(id, name) => void runEdit(() => current.current?.doc.rename_visgroup(id, name))}
          onAddSelection={(id) => void runEdit(() => current.current?.doc.set_visgroup_membership(new Uint32Array(selection.current), id, true))}
          onRemoveSelection={(id) => void runEdit(() => current.current?.doc.set_visgroup_membership(new Uint32Array(selection.current), id, false))}
          onSelectMembers={(id) => current.current && selectIds(Array.from(current.current.doc.visgroup_members(id)))}
          onHideSelected={() => void hideSelection()}
          onShowAll={() => void showAll()}
        />
      )}
      {slot === "properties" && (
        <PropertiesPanel
          details={entityDetails}
          classDef={entityDetails && classDef?.classname.toLowerCase() === entityDetails.classname.toLowerCase() ? classDef : null}
          classList={classList}
          targetnames={targetnames}
          inputsFor={inputsFor}
          onSetKeys={(changes) => entityDetails && void setEntityKeys(entityDetails.id, changes)}
          onSetConnections={(conns) => entityDetails && void setEntityConnections(entityDetails.id, conns)}
          onTestOutput={bridge?.connected && entityDetails ? (c) => void testOutput(c) : undefined}
          onPickTarget={(key) => {
            if (!entityDetails) return;
            pickTargetRef.current = { entity: entityDetails.id, key };
            setPickingTarget(key);
          }}
        />
      )}
      {slot === "newmap" && <NewMapPanel busy={!!busy} onCreate={(o) => void newMap(o)} onClose={() => setPanel("none")} />}
      {slot === "sounds" && (
        <SoundPanel
          contentReady={content?.state === "ready"}
          mapPath={currentPath.current || null}
          list={(f, n) => api.listSounds(f, n)}
          soundUrl={soundUrl}
          pickFile={async () => {
            const picked = await openDialog({ multiple: false, filters: [{ name: tr("Звук"), extensions: ["wav", "mp3", "ogg"] }] });
            return typeof picked === "string" ? picked : null;
          }}
          readFileBytes={(path) => api.readFileBytes(path)}
          writeSound={async (name, bytes) => {
            const res = await api.writeSound(currentPath.current, name, bytes);
            setStatusText(tr("звук записан: {0} ({1} байт)", [res.path, res.bytes]));
            return res;
          }}
          onPlace={(name, loop) => void placeSound(name, loop)}
          onDragAsset={SATELLITE_PANEL ? undefined : startAssetDrag}
          exported={soundExported}
          onExported={(e) => {
            if (e) SOUND_LOOPS.set(e.name, e.loop);
            setSoundExported(e);
          }}
        />
      )}
      {slot === "paint" && (
        <PaintPanel
          mapPath={currentPath.current || null}
          contentReady={content?.state === "ready"}
          currentMaterial={currentMaterial}
          faceMaterial={faceInfo?.material ?? null}
          selectedFaces={faceSel.current.size}
          selectedCount={selectedCount}
          thumbUrl={thumbnailUrl}
          pickFile={async () => {
            const picked = await openDialog({ multiple: false, filters: [{ name: tr("Изображение"), extensions: ["png", "jpg", "jpeg", "webp", "bmp", "gif"] }] });
            return typeof picked === "string" ? picked : null;
          }}
          readFileBytes={(path) => api.readFileBytes(path)}
          writeTexture={async (name, dir, shader, png) => {
            const t = await api.writeTexture(currentPath.current, name, dir, shader, png);
            setStatusText(tr("текстура записана: {0} {1}×{2} → {3}", [t.material, t.width, t.height, t.vtf]));
            return t;
          }}
          onExported={(material, apply) => void applyPaintedTexture(material, apply)}
          onDragAsset={SATELLITE_PANEL ? undefined : startAssetDrag}
        />
      )}
      {slot === "assistant" && <AssistantPanel onSetKey={(k) => setAssistantKey(k)} onClearKey={() => setAssistantKey(null)} />}
      {slot === "gameview" && (
        <GameViewPanel
          inApp={inTauri}
          bridge={bridge}
          shot={gameShot}
          live={gameLive}
          busy={gameBusy}
          canCompile={!!current.current && inTauri && !!currentPath.current}
          onShot={() => void takeGameShot(80).catch((e) => setStatusText(tb(String(e))))}
          onLive={setGameLive}
          onTestCycle={() => void testCycle().then((r) => setStatusText(r.text.split("\n").slice(-1)[0]))}
          onRunGame={() => void runGame()}
          onKillGame={() => void gameKill()}
          onCameraToGame={() => void bridgeCameraToGame()}
          onGameToCamera={() => void bridgeGameToCamera()}
          onTeleport={() => void bridgeTeleport()}
          onNoclip={(on) => void bridgeNoclip(on)}
          onHud={(on) => void bridgeHud(on)}
          onAsk={askAboutShot}
          onShotFromCamera={() => {
            const c = getEditorCamera();
            void takeGameShot(80, c ? [c.pos[0], c.pos[1], c.pos[2], c.pitch, c.yaw, 0] : null).catch((e) => setStatusText(tb(String(e))));
          }}
          onConsole={(cmd) => api.bridgeConsole(cmd)}
          onRunClean={() => void runGame(false, true)}
        />
      )}
      {slot === "workshop" && (
        <WorkshopPanel
          inApp={inTauri}
          mapName={mapName}
          projectDir={currentPath.current ? currentPath.current.replace(/[\\/][^\\/]*$/, "") : null}
          bsp={lastBsp.current}
          meta={projectMeta}
          onMeta={updateMeta}
          journey={journey}
          screenshot={() => editorScreenshot("3d")}
          onStatus={setStatusText}
          onOpen={(url) => void api.openUrl(url).catch((e) => setStatusText(tb(String(e))))}
        />
      )}
      {slot === "landscape" && (
        <LandscapePanel busy={!!busy} currentMaterial={currentMaterial} suggest={suggestLandscapeOrigin} onCreate={(o) => void createLandscape(o)} onClose={() => setPanel("none")} />
      )}
    </>
  );
}
