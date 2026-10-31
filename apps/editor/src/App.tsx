import { requestBrowse } from "./app/browse";
import { unknownInputs, unknownOutputs } from "./app/ioCheck";
import { classesOf, type PropClass } from "./app/propClass";
import { deltaTo, originAtCentre, pivotOf, type TransformClip } from "./app/transformClip";
import { faceAxis, faceCovered, hidesBehind } from "./app/hiddenFaces";
import { chainIds, PATH_KEYS, routeLength, type PathNode } from "./app/pathChain";
import { edgeHinge } from "./viewport/helpers";
import { touchingIds } from "./app/touching";
import { faceStyleEdit } from "./app/faceStyle";
import { stairBoxes } from "./app/stairs";
import { isGeneratorKind, rebuildBounds, replaceRecord, withPatch, type GeneratorRecord } from "./app/generators";
import { addNote, type MapNote } from "./app/notes";
import { SHAPE_NAMES } from "./app/constants";
import { ringPlan } from "./app/ring";
import { applyMerge, mergePlan, offGridBoxes, overlaySideReport, placementChecks, smallWorldBrushes } from "./app/mapChecks";
import { parentsOf, similarKey, withChildren } from "./app/findObjects";
import { cleanName, freshNames, nameHits, nextIncrementPath, numberedNames, refersTo, renameMap, retargetConnections, retargetKeys } from "./app/rename";
import { anglesText, randomAngles, randomSubset } from "./app/randomize";
import { copyableKeys, mergeConnections, pasteChanges } from "./app/keyClipboard";
import { boxesInside, distributeDeltas, dropDelta, overlappingPairs, type Box, gridSnapDelta } from "./app/drop";
import { entityView, viewAnglesText } from "./app/pilot";
import { bookmarkText, bookmarksKey, parseBookmarks, withBookmark } from "./app/bookmarks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { bootDone } from "./boot";
import { splitUndoLabel } from "./app/undoLabel";
import { WebviewWindow, getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { SATELLITE, SATELLITE_PANEL, SAT_ANY, docChannel, satelliteLabel, type DocMessage } from "./ui/satellite";
import {
  api,
  inTauri,
  modelUrl,
  type AppInfo,
  type ClassDef,
  type ClassEntry,
  type ClassInfo,
  type CompileOptions,
  type ContentStatus,
  type BridgeReport,
  type BridgeStatus,
  type CubemapsDone,
  type DecompileResult,
  type IoDef,
  type MaterialInfo,
  STATIC_PROP_FLAG,
} from "./tauri";
import type { LandscapeHit, LandscapeOptions, LandscapeSettings } from "./ui/LandscapePanel";
import { SOUND_LOOPS } from "./ui/assetDrag";
import { bumpTextureVersion, type AssistantKeyStatus, type GameConsole } from "./tauri";
import { createAssistantTools, type Confirm } from "./app/assistantTools";
import { DEFAULT_SCATTER, type ScatterSettings } from "./app/scatter";
import { DEFAULT_SYMMETRY, mirrorFactors, mirrorPivot, onPlane, symmetryOverlay, type SymmetrySettings } from "./app/symmetry";
import { measureOverlay, measureText, pointText, type Measurement, speedText } from "./app/measure";
import { EMPTY_META, computeJourney, metaPathOf, parseMeta, serializeMeta, stampOf, type JourneyStage, type ProjectMeta, plural } from "./app/journey";
import { assistantBus } from "./app/assistantBus";
import { apiBackend, assistantStore } from "./app/assistantStore";
import { mockBackend } from "./app/assistant";
import { analyzeCompileLog, askAboutLog, autoFixPlan, type CompileIssue } from "./map/compileIssues";
import type { GameShot } from "./ui/GameViewPanel";
import { soundKeys } from "./app/drag/assets";
import { type CompileState } from "./ui/CompilePanel";
import { GAME_TEMPLATES, type NewMapOptions } from "./ui/NewMapPanel";
import { type DialogSpec } from "./ui/ConfirmDialog";
import { type ResourceSnapshot } from "./ui/ResourcesPanel";
import { coreMemoryBytes } from "./map/loader";
import {
  LAYOUT_PRESETS,
  ZONES,
  activatePanel,
  defaultLayout,
  hidePanel,
  loadSavedLayouts,
  locate,
  movePanel,
  normalizeLayout,
  removePanel,
  visiblePanels,
  type DockLayout,
  type SavedLayout,
} from "./ui/Dock";
import { type FirstStepsState } from "./ui/FirstSteps";
import { type TourKind } from "./ui/tutorial";
import { type InspectorItem } from "./ui/InspectorPanel";
import { instanceMatrix, modelFromMesh, modelWorldBounds, parseModel, spriteMatrix, spriteModel, SPRITE_HALF, type ModelData } from "./viewport/models";
import type { ModelInstance } from "./viewport/renderer";
import { type Connection, type EntityDetails } from "./ui/PropertiesPanel";
import { type FaceEdit, type FaceInfo, type PaintSettings } from "./ui/FaceEditor";
import { hitFace, hitMeshNear } from "./viewport/raycast";
import { helperLines } from "./viewport/helpers";
import { canFix, type Problem } from "./ui/ProblemsPanel";
import { type Theme } from "./ui/SettingsPanel";
import { type ArrayOptions } from "./ui/ArrayPanel";
import { loadKeymap, saveKeymap, type Keymap } from "./ui/hotkeys";
import { parseInstanceParms, type InstanceParm } from "./map/instances";
import { decalQuad, keyMap, overlayFrame, overlayKey, overlayMaterial, overlayQuad, type OverlayFrame } from "./viewport/overlays";
import { effectiveDpr } from "./viewport/dpi";
import { skyboxCluster, skyboxMatrix, skyboxModel } from "./viewport/skybox";
import { packLights } from "./viewport/lights";
import type { MeshBuffers } from "./map/loader";
import { parsePointfile, parsePortalfile, type LogRef } from "./map/compilelog";
import type { HistoryEntry, ImportedTexture, PackReport, PackRequest, PrefabInfo } from "./tauri";
import { type AutoVisGroup, type VisGroupInfo } from "./ui/VisgroupsPanel";
import { CLIP_KEEP_NAMES, clipOverlay, clipPlane, type ClipKeep, type ClipLine } from "./viewport/clipper";
import { buildVertexHandles, type VertexHandle } from "./viewport/vertices";
import {
  emptyMapText,
  history,
  importMapText,
  loadMap,
  objectId,
  objectIndexOf,
  pickInfo,
  refreshMap,
  type EditResult,
  type EntityInfo,
  type HistoryState,
  type LoadedMap,
  type PickInfo,
} from "./map/loader";
import { FlyCamera } from "./viewport/camera";
import {
  Session,
  Tool,
  ViewMode,
  Panel,
  GRID_SIZES,
  RESTORABLE_PANELS,
  TAB_PANELS,
  PANEL_TITLES,
  HISTORY_KEEP,
  DEFAULT_COMPILE,
  Shape,
  DEFAULT_TIE_CLASS,
  DEFAULT_MATERIAL,
  DEFAULT_ENTITY_CLASS,
  Drag2D,
  GizmoState,
  VIEW_KINDS,
  PREVIEW_COLOR,
  canvasCss,
} from "./app/constants";
import type { EditorApi } from "./app/editorApi";
import { runAutotest } from "./app/autotest";
import { Shell } from "./app/Shell";
import { startSession } from "./app/session";
import { useView3DTools } from "./app/tools/view3d";
import { installKeyboard } from "./app/tools/keyboard";
import { useCommands } from "./app/commands";
import { useAssetDrag } from "./app/drag/assets";
import { useViewDrag } from "./app/drag/views";
import { OrthoCamera, type ViewKind } from "./viewport/camera2d";
import { VIEW_NAMES, type ViewId } from "./ui/viewsLayout";
import { buildEntityBoxes } from "./viewport/entities";
import { axisParam, GIZMO_AXES, gizmoColors, gizmoLength, gizmoLines, mouseRay, pickGizmoAxis, rayPlane, ringAngle } from "./viewport/gizmo";
import { drawOverlay2D, handlePositions, type Handle, type HandleMode } from "./viewport/handles";
import { boxEdges, type RenderStats } from "./viewport/renderer";
import { boxCenter, boxSize, boxesIntersect, rotationAbout, scalingAbout, type Affine, type Box3, type Vec3 } from "./viewport/transform";
import { currentLocale, t as tr, tb, useLocale } from "./i18n";
import { diffSnapshots, snapshot, type DiffRow, type Snapshot } from "./app/mapDiff";
import { snapVertices } from "./app/vertexSnap";
import { type HistoryDiff } from "./ui/HistoryPanel";
import { type LeafReport } from "./tauri";

/**
 * The selection for objects an edit just made: a new brush entity comes back as the entity, and it
 * is selected through its brushes, as a click selects it, so a move or a delete takes all of it.
 */
function selectableIds(map: LoadedMap, ids: number[]): number[] {
  return ids.flatMap((id) => {
    const solids = map.doc.kind_of(id) === "entity" ? Array.from(map.doc.entity_solids(id) as Uint32Array) : [];
    return solids.length ? solids : [id];
  });
}

export function App() {
  useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas2dRefs = useRef<Record<ViewKind, HTMLCanvasElement | null>>({ top: null, front: null, side: null });
  const overlayRefs = useRef<Record<ViewKind, HTMLCanvasElement | null>>({ top: null, front: null, side: null });
  const session = useRef<Session | null>(null);
  const current = useRef<LoadedMap | null>(null);
  const currentPath = useRef<string>("");
  /** Late-bound: the satellite sync lives further down. */
  const scheduleDocSyncRef = useRef<() => void>(() => {});
  const satChannelRef = useRef<BroadcastChannel | null>(null);
  const applySelectionRef = useRef<() => void>(() => {});
  const materialInfos = useRef<Map<string, MaterialInfo>>(new Map());
  const classInfos = useRef<Map<string, ClassInfo>>(new Map());
  /** Inputs of each FGD class (null for a class the FGD lacks), asked once per class for the I/O check. */
  const classInputs = useRef<Map<string, string[] | null>>(new Map());
  const classOutputs = useRef<Map<string, string[] | null>>(new Map());
  /** Selected objects by VMF id; ids survive structural edits, indices do not. */
  const selection = useRef<Set<number>>(new Set());
  const pressed = useRef<{ x: number; y: number } | null>(null);
  const hoverPending = useRef<{ x: number; y: number } | null>(null);
  const activeView = useRef<OrthoCamera | null>(null);
  const drag = useRef<Drag2D | null>(null);
  const toolRef = useRef<Tool>("select");
  const gridRef = useRef(64);
  const textureLockRef = useRef(true);
  /** Moves in grid steps (true) or smoothly (false); the user's choice, kept in gme.snap. */
  const snapRef = useRef(true);
  /** Which handles the 2D views show for the selection. */
  const handleMode = useRef<HandleMode>("move");
  const [handleModeUi, setHandleModeUi] = useState<HandleMode>("move");
  /** The 2D handles and the 3D gizmo share one mode: move, rotate or scale. */
  const setHandleMode = (m: HandleMode) => {
    handleMode.current = m;
    setHandleModeUi(m);
  };
  /** Hovered handle and the view it belongs to. */
  const handleHover = useRef<{ view: ViewKind; handle: Handle } | null>(null);
  /** Bounds shown instead of the real selection bounds while a drag previews. */
  const liveBounds = useRef<Box3 | null>(null);
  const liveLabel = useRef("");
  /** Current mouse position in the view a marquee is dragged in, in CSS pixels. */
  const pressedCss = useRef<[number, number] | null>(null);
  const gizmo = useRef<GizmoState>({ hover: null, drag: null, key: "" });
  /** Block tool: the box being drawn, in world units. */
  /** Frame timestamps collected while GME_AUTOPERF samples, and how long the last open took. */
  const perfSampler = useRef<{ until: number; stamps: number[] } | null>(null);
  /** Where the last open spent its time, for the "opened" log line. */
  const openTiming = useRef<Record<string, number>>({});
  const lastOpenMs = useRef(0);
  const pendingBox = useRef<Box3 | null>(null);
  const blockStart = useRef<[number, number] | null>(null);
  /** A drag that edits the pending block box: a handle resizes it, the inside moves it. */
  const blockEdit = useRef<{ kind: "resize"; handle: Handle; bounds: Box3 } | { kind: "move"; start: [number, number]; bounds: Box3 } | null>(null);
  /** Axis the view that drew the pending box cannot see: primitives extrude along it. */
  const pendingAxis = useRef(2);
  const shapeRef = useRef<Shape>("block");
  /** Primitive parameters: sides, arch wall thickness and arc. */
  const primRef = useRef({ sides: 8, wall: 32, arc: 180, step: 16, reverse: false });
  const tieClassRef = useRef(DEFAULT_TIE_CLASS);
  /** Texture tool: picked faces as `[solidId, sideId]`, keyed `solid:side`. */
  const faceSel = useRef<Map<string, [number, number]>>(new Map());
  /** Camera orientation when the right button went down, to tell a click from a look. */
  /** Extent used for the axis a 2D view cannot see when drawing a block. */
  const lastBlockExtent = useRef<Vec3>([64, 64, 64]);
  const materialRef = useRef(DEFAULT_MATERIAL);
  const entityClassRef = useRef(DEFAULT_ENTITY_CLASS);
  /** Cordon tool: drag start, and the cordon box the document holds. */
  const cordonStart = useRef<[number, number] | null>(null);
  const cordonRef = useRef<{ box: Box3; active: boolean } | null>(null);
  /** Object indices outside the active cordon: not drawn, not pickable. */
  const culledRef = useRef<Set<number>>(new Set());
  /** Clipper: the line drawn in a 2D view, and which side survives. */
  const clipLineRef = useRef<ClipLine | null>(null);
  const measureRef = useRef<Measurement | null>(null);
  const clipKeepRef = useRef<ClipKeep>(0);
  /** Vertex tool: handles per view (rebuilt when the selection or map changes) and the hovered one. */
  const vertexHandles = useRef<Record<ViewKind, VertexHandle[]>>({ top: [], front: [], side: [] });
  const vertexHandlesVersion = useRef("");
  const vertexHover = useRef<{ view: ViewKind; index: number } | null>(null);

  const [gpu, setGpu] = useState<string>(tr("WebGPU: инициализация…"));
  const [gpuOk, setGpuOk] = useState<boolean | null>(null);
  const [app, setApp] = useState<AppInfo | null>(null);
  const appRef = useRef<AppInfo | null>(null);
  appRef.current = app;
  const [content, setContent] = useState<ContentStatus | null>(null);
  const contentRef = useRef<ContentStatus | null>(null);
  contentRef.current = content;
  const [mapName, setMapName] = useState<string>("");
  const mapNameRef = useRef("");
  mapNameRef.current = mapName;
  const [mapInfo, setMapInfo] = useState<string>("");
  const [render, setRender] = useState<RenderStats | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [error, setErrorRaw] = useState<string>("");
  /** Backend messages arrive formatted in Russian; the dictionary's templates translate them. */
  const setError = useCallback((v: string) => setErrorRaw(tb(v)), []);
  /**
   * The 2D views zoom together: the wheel in one sets the same scale in the
   * others. A locked view is left out of that and zooms only by itself.
   */
  const [lockedViews, setLockedViewsState] = useState<ViewKind[]>(() => {
    if (SAT_ANY) return [];
    try {
      const v = JSON.parse(localStorage.getItem("gme.lockedViews") ?? "[]") as unknown;
      return Array.isArray(v) ? v.filter((k): k is ViewKind => k === "top" || k === "front" || k === "side") : [];
    } catch {
      return [];
    }
  });
  const lockedViewsRef = useRef(lockedViews);
  const toggleViewLock = useCallback((kind: ViewKind) => {
    const next = lockedViewsRef.current.includes(kind) ? lockedViewsRef.current.filter((k) => k !== kind) : [...lockedViewsRef.current, kind];
    lockedViewsRef.current = next;
    setLockedViewsState(next);
    if (SAT_ANY) return;
    try {
      localStorage.setItem("gme.lockedViews", JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, []);
  /** How the four views are arranged: order, splits, floating windows, the one that fills the grid. */
  const { views, viewsRef, viewsEl, viewsSize, setViews, viewDrag, startViewDrag, startViewFloat, startViewSplit } = useViewDrag();
  const [hover, setHover] = useState<PickInfo | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [hist, setHist] = useState<HistoryState | null>(null);
  const [gridSize, setGridSize] = useState(64);
  const [tool, setToolState] = useState<Tool>("select");
  /** Wide tool rail with names beside the icons. */
  const [railWide, setRailWideState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gme.railWide") !== "0";
    } catch {
      return false;
    }
  });
  const setRailWide = useCallback((v: boolean) => {
    setRailWideState(v);
    try {
      localStorage.setItem("gme.railWide", v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, []);
  /** Texture tool: left clicks paint the current material instead of picking faces. */
  const [paintClick, setPaintClickState] = useState(false);
  const paintClickRef = useRef(false);
  const setPaintClick = useCallback((v: boolean) => {
    paintClickRef.current = v;
    setPaintClickState(v);
  }, []);
  const [textureLock, setTextureLockState] = useState(true);
  const [snapMoves, setSnapMovesState] = useState(() => {
    try {
      return localStorage.getItem("gme.snap") !== "0";
    } catch {
      return true;
    }
  });
  snapRef.current = snapMoves;
  const [statusText, setStatusTextRaw] = useState<string>("");
  const setStatusText = useCallback((v: string) => setStatusTextRaw(tb(v)), []);
  const [cordonState, setCordonState] = useState<{ active: boolean } | null>(null);
  const [clipKeep, setClipKeepState] = useState<ClipKeep>(0);
  const [currentMaterial, setCurrentMaterialState] = useState(DEFAULT_MATERIAL);
  /** Side column shown; hidden to give the views the whole window. */
  const [showColumn, setShowColumnState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gme.column") !== "0";
    } catch {
      return true;
    }
  });
  const setShowColumn = useCallback((v: boolean) => {
    setShowColumnState(v);
    try {
      localStorage.setItem("gme.column", v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, []);
  /** Where each panel lives: zones with tabs and sizes plus floating windows, remembered between runs. */
  const [layout, setLayoutState] = useState<DockLayout>(() => {
    if (SAT_ANY) return defaultLayout([]);
    const workshop = () => LAYOUT_PRESETS.find((l) => l.id === "engine")!.build(TAB_PANELS);
    try {
      // Layouts saved before the workshop layout are replaced by it once; later saves win again.
      const fresh = localStorage.getItem("gme.layoutGen") !== "3";
      if (fresh) localStorage.setItem("gme.layoutGen", "3");
      const raw = fresh ? null : localStorage.getItem("gme.layout");
      if (raw) return normalizeLayout(JSON.parse(raw), TAB_PANELS);
      const p = localStorage.getItem("gme.panel") as Panel | null;
      return p && RESTORABLE_PANELS.includes(p) ? activatePanel(workshop(), p) : workshop();
    } catch {
      return workshop();
    }
  });
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const applyLayout = useCallback((next: DockLayout) => {
    layoutRef.current = next;
    setLayoutState(next);
    if (SAT_ANY) return;
    try {
      localStorage.setItem("gme.layout", JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, []);
  // A zone with tabs but nothing active unfolds once a map is open, so the inspector and the content browser are there from the start.
  useEffect(() => {
    if (!mapName || SAT_ANY) return;
    const l = layoutRef.current;
    const zones = { ...l.zones };
    let changed = false;
    for (const z of ZONES) {
      const zs = zones[z];
      if (zs.tabs.length && !zs.active) {
        zones[z] = { ...zs, active: zs.tabs[0], collapsed: false };
        changed = true;
      }
    }
    if (changed) applyLayout({ ...l, zones });
  }, [mapName, applyLayout]);
  /** Layouts the user saved under a name. */
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>(() => loadSavedLayouts(TAB_PANELS));
  const storeSavedLayouts = useCallback((list: SavedLayout[]) => {
    setSavedLayouts(list);
    try {
      localStorage.setItem("gme.layouts", JSON.stringify(list));
    } catch {
      /* storage unavailable */
    }
  }, []);
  /** Panels that are not tabs (new map, array) leave the layout once hidden. */
  const pruneTransient = (l: DockLayout): DockLayout => {
    const visible = visiblePanels(l);
    let out = l;
    for (const z of ZONES) for (const t of l.zones[z].tabs) if (!TAB_PANELS.includes(t as Panel) && !visible.includes(t)) out = removePanel(out, t);
    return out;
  };
  /** The panel brought up last: the one commands, refreshes and "close" refer to. */
  const [panel, setPanelState] = useState<Panel>(() => {
    for (const z of ZONES) {
      const a = layout.zones[z].active;
      if (a) return a as Panel;
    }
    return "none";
  });
  const panelRef = useRef<Panel>(panel);
  panelRef.current = panel;
  /** Shows a panel where it lives (a new tab on the right when nowhere yet); "none" hides the current one. */
  const setPanel = useCallback(
    (v: Panel | ((p: Panel) => Panel)) => {
      const kind = typeof v === "function" ? v(panelRef.current) : v;
      if (kind === "none") {
        const cur = panelRef.current;
        if (cur !== "none") applyLayout(TAB_PANELS.includes(cur) ? hidePanel(layoutRef.current, cur) : removePanel(layoutRef.current, cur));
      } else if ((kind === "settings" || kind === "newmap" || kind === "landscape") && locate(layoutRef.current, kind) === null) {
        // Settings and the new-map wizard come up as a window in the middle, not as one more tab:
        // a newcomer who pressed "New map" must see the form where they looked.
        const l = movePanel(layoutRef.current, kind, "float");
        const w = kind === "newmap" ? 460 : kind === "landscape" ? 440 : 440;
        // The new-map form is 360 px of body plus head and foot: 470 left a scrollbar for the last card.
        const h = Math.min(kind === "newmap" ? 520 : kind === "landscape" ? 460 : 640, window.innerHeight - 120);
        applyLayout({
          ...l,
          floating: l.floating.map((f) => (f.kind === kind ? { ...f, x: Math.max(0, (window.innerWidth - w) / 2 - 60), y: Math.max(40, (window.innerHeight - h) / 2 - 40), w, h } : f)),
        });
      } else {
        applyLayout(activatePanel(layoutRef.current, kind));
        if (locate(layoutRef.current, kind) !== "float") setShowColumn(true);
      }
      panelRef.current = kind;
      setPanelState(kind);
    },
    [applyLayout, setShowColumn],
  );
  useEffect(() => {
    try {
      if (RESTORABLE_PANELS.includes(panel)) localStorage.setItem("gme.panel", panel);
      else if (panel === "none") localStorage.removeItem("gme.panel");
    } catch {
      /* storage unavailable */
    }
  }, [panel]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** Hotkey overrides by command id ("" = unbound). */
  const [keymap, setKeymapState] = useState<Keymap>(() => loadKeymap());
  const keymapRef = useRef(keymap);
  const setKeymap = useCallback((m: Keymap) => {
    keymapRef.current = m;
    setKeymapState(m);
    saveKeymap(m);
  }, []);
  const [shape, setShapeState] = useState<Shape>("block");
  const [prim, setPrimState] = useState({ sides: 8, wall: 32, arc: 180, step: 16, reverse: false });
  const [tieClass, setTieClassState] = useState(DEFAULT_TIE_CLASS);
  const [solidClasses, setSolidClasses] = useState<ClassEntry[]>([]);
  const [faceInfo, setFaceInfo] = useState<FaceInfo | null>(null);
  const [faceCount, setFaceCount] = useState(0);
  const [paint, setPaintState] = useState<PaintSettings>({ on: false, radius: 64, amount: 16, axis: 0, mode: "geometry" });
  const paintRef = useRef<PaintSettings>({ on: false, radius: 64, amount: 16, axis: 0, mode: "geometry" });
  /** A sculpt stroke in progress: the face under the brush and where it last painted. */
  const painting = useRef<{ solid: number; side: number; pickId: number; last: Vec3; lower: boolean } | null>(null);
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [worldDetails, setWorldDetails] = useState<EntityDetails | null>(null);
  const [worldDef, setWorldDef] = useState<ClassDef | null>(null);
  const [autosaveNote, setAutosaveNote] = useState("");
  /** The controls cheat sheet over the status bar. */
  const [cheatOpen, setCheatOpen] = useState(false);
  /** An autosave newer than the opened file, offered for restoring. */
  const [restoreOffer, setRestoreOffer] = useState<{ path: string; when: string } | null>(null);
  const [currentModel, setCurrentModelState] = useState("");
  const currentModelRef = useRef("");
  const [modelPreview, setModelPreview] = useState<string | null>(null);
  const [modelPreviewInfo, setModelPreviewInfo] = useState("");
  /** Parsed models by `name|skin|body` (instances by `inst|file`); null when the shell could not load one. */
  const modelCache = useRef<Map<string, ModelData | null>>(new Map());
  /** Right-click menu position over the views, when open. */
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  /** Set by a right button that looked around or painted: no menu for that click. */
  // True while the left button is down anywhere: a right click in the middle
  // of a drag (moving a brush, box selection, painting) must not open the
  // context menu, which stole the drag's mouse events.
  const leftHeld = useRef(false);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (e.button === 0) leftHeld.current = true;
    };
    const up = (e: MouseEvent) => {
      if (e.button === 0) leftHeld.current = false;
    };
    const clear = () => (leftHeld.current = false);
    window.addEventListener("mousedown", down, true);
    window.addEventListener("mouseup", up, true);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("mouseup", up, true);
      window.removeEventListener("blur", clear);
    };
  }, []);
  /** The modal question on screen, with the resolver of the promise waiting for it. */
  const [dialog, setDialog] = useState<DialogSpec | null>(null);
  const dialogResolve = useRef<((v: string) => void) | null>(null);
  const ask = useCallback((spec: DialogSpec): Promise<string> => {
    return new Promise((resolve) => {
      dialogResolve.current = resolve;
      setDialog(spec);
    });
  }, []);
  const answerDialog = useCallback((v: string) => {
    setDialog(null);
    const r = dialogResolve.current;
    dialogResolve.current = null;
    r?.(v);
  }, []);
  /** First-steps card for newcomers: ticks itself off, hidden for good once closed. */
  const [firstSteps, setFirstSteps] = useState<FirstStepsState>({ brush: false, texture: false, entity: false, compile: false });
  const [showFirstSteps, setShowFirstStepsState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gme.firstSteps") !== "done";
    } catch {
      return true;
    }
  });
  const setShowFirstSteps = useCallback((v: boolean) => {
    setShowFirstStepsState(v);
    try {
      if (v) localStorage.removeItem("gme.firstSteps");
      else localStorage.setItem("gme.firstSteps", "done");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const tickStep = useCallback((key: keyof FirstStepsState) => setFirstSteps((st) => (st[key] ? st : { ...st, [key]: true })), []);
  /** The interactive tour: the index of its step, null while it is off. */
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [tourKind, setTourKind] = useState<TourKind>("quick");
  /** The first-run wizard: shown until it was finished or skipped once. */
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  useEffect(() => {
    if (!app || app.autoexit || SAT_ANY) return;
    try {
      if (localStorage.getItem("gme.onboarded") !== "1") setOnboardingOpen(true);
    } catch {
      /* no storage */
    }
  }, [app]);
  /** Theme and interface scale, applied to the document root and remembered. */
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const v = localStorage.getItem("gme.theme");
      return v === "light" || v === "system" ? v : "dark";
    } catch {
      return "dark";
    }
  });
  const [uiScale, setUiScaleState] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem("gme.uiScale"));
      return v >= 50 && v <= 200 ? v : 100;
    } catch {
      return 100;
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    let fade = 0;
    const apply = () => {
      const light = theme === "light" || (theme === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
      const next = light ? "light" : "dark";
      if (root.dataset.theme && root.dataset.theme !== next) {
        // Cross-fade the surfaces for a moment, then drop the transitions so the UI stays snappy.
        root.classList.add("theme-fade");
        window.clearTimeout(fade);
        fade = window.setTimeout(() => root.classList.remove("theme-fade"), 320);
      }
      root.dataset.theme = next;
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      window.clearTimeout(fade);
    };
  }, [theme]);
  useEffect(() => {
    // CSS zoom scales the whole UI, canvases included; pointer maths uses client rects, so picking stays exact.
    (document.body.style as CSSStyleDeclaration & { zoom?: string }).zoom = uiScale === 100 ? "" : `${uiScale / 100}`;
  }, [uiScale]);
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem("gme.theme", t);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const setUiScale = useCallback((v: number) => {
    setUiScaleState(v);
    try {
      localStorage.setItem("gme.uiScale", String(v));
    } catch {
      /* storage unavailable */
    }
  }, []);
  /** The inspector comes up by itself when something gets selected, as Unity's does. */
  // ---- The map's journey (phase 9): the project file and the stamp of the saved VMF.
  const [projectMeta, setProjectMetaState] = useState<ProjectMeta>({ ...EMPTY_META });
  const projectMetaRef = useRef(projectMeta);
  projectMetaRef.current = projectMeta;
  const [savedStamp, setSavedStamp] = useState<string | null>(null);
  const savedStampRef = useRef<string | null>(null);
  const writeMeta = useCallback((path: string, meta: ProjectMeta) => {
    if (!path || !inTauri) return;
    api.writeTextFile(metaPathOf(path), serializeMeta(meta)).catch((e) => void api.log(`meta: ${String(e)}`));
  }, []);
  /** Merges into the project file and writes it when the map has a path. */
  const updateMeta = useCallback(
    (patch: Partial<ProjectMeta>) => {
      const next = { ...projectMetaRef.current, ...patch };
      projectMetaRef.current = next;
      setProjectMetaState(next);
      writeMeta(currentPath.current, next);
    },
    [writeMeta],
  );
  const loadMeta = useCallback(async (path: string) => {
    let meta = { ...EMPTY_META };
    if (path && inTauri) {
      try {
        meta = parseMeta(await api.readTextFile(metaPathOf(path)));
      } catch {
        meta = { ...EMPTY_META };
      }
    }
    projectMetaRef.current = meta;
    setProjectMetaState(meta);
  }, []);
  const [showJourney, setShowJourneyState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gme.journey") !== "0";
    } catch {
      return true;
    }
  });
  const setShowJourney = useCallback((v: boolean) => {
    setShowJourneyState(v);
    try {
      localStorage.setItem("gme.journey", v ? "1" : "0");
    } catch {
      /* private mode */
    }
  }, []);
  /** The card that tunes a sound just dropped into the map. */
  const [soundSetup, setSoundSetup] = useState<{ id: number; name: string; keys: [string, string][] } | null>(null);
  const openSoundSetup = useCallback((id: number, name: string) => {
    const d = current.current?.doc.entity_details(id) as EntityDetails | undefined;
    setSoundSetup({ id, name, keys: d?.keyvalues ?? [] });
  }, []);
  const autoInspectorRef = useRef(true);
  /** True while the assistant runs a request: its selections must not switch the panel away from the chat. */
  const assistantBusy = useRef(false);
  const [autoInspector, setAutoInspectorState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gme.autoInspector") !== "0";
    } catch {
      return true;
    }
  });
  autoInspectorRef.current = autoInspector;
  const setAutoInspector = useCallback((v: boolean) => {
    setAutoInspectorState(v);
    try {
      localStorage.setItem("gme.autoInspector", v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const openPanelRef = useRef<(kind: Panel) => void>(() => undefined);
  /** Tool reminders over the views; off for people who know Hammer. */
  const [showHints, setShowHintsState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gme.hints") !== "0";
    } catch {
      return true;
    }
  });
  const setShowHints = useCallback((v: boolean) => {
    setShowHintsState(v);
    try {
      localStorage.setItem("gme.hints", v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, []);
  /** Lights found on the map by the last refresh (for logs and hints). */
  const lightCountRef = useRef(0);
  /** 3D skybox preview on/off, remembered. */
  const [showSkybox, setShowSkyboxState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gme.skybox") !== "0";
    } catch {
      return true;
    }
  });
  const showSkyboxRef = useRef(showSkybox);
  const setShowSkybox = useCallback((v: boolean) => {
    showSkyboxRef.current = v;
    setShowSkyboxState(v);
    try {
      localStorage.setItem("gme.skybox", v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, []);
  /** The uploaded skybox copy: its key and the mesh it was built from. */
  const skyModel = useRef<{ key: string; mesh: MeshBuffers; origin: string } | null>(null);
  const skyCounter = useRef(0);
  /** Renderer keys of the overlay and decal quads currently uploaded. */
  const overlayKeys = useRef<Set<string>>(new Set());
  /** Parameters declared by each loaded instance file. */
  const instanceParms = useRef<Map<string, InstanceParm[]>>(new Map());
  /** World-space bounds of entities drawn as models, by entity id. */
  const modelBoundsRef = useRef<Map<number, Box3>>(new Map());
  const [compileOptions, setCompileOptions] = useState<CompileOptions>(DEFAULT_COMPILE);
  const compileOptionsRef = useRef(compileOptions);
  compileOptionsRef.current = compileOptions;
  const [compileState, setCompileState] = useState<CompileState>({ running: false, lines: [], result: "", ok: null });
  /** The bridge to a running game; polled while the app runs, refreshed by its reports. */
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [bridgeFollow, setBridgeFollowState] = useState(false);
  const bridgeRef = useRef<BridgeStatus | null>(null);
  useEffect(() => {
    bridgeRef.current = bridge;
  }, [bridge]);
  /** Live sync: edits of point entities go to the game while it is connected. */
  const [bridgeLive, setBridgeLiveState] = useState(true);
  const bridgeLiveRef = useRef(true);
  const setBridgeLive = useCallback((v: boolean) => {
    bridgeLiveRef.current = v;
    setBridgeLiveState(v);
  }, []);
  /** Point entities as the game last saw them: id -> origin, angles, model, skin. */
  const liveSnapRef = useRef<Map<number, { origin: string; angles: string; model: string | null; skin: number }> | null>(null);
  const liveSnapshot = (list: EntityInfo[]) => new Map(list.map((e) => [e.id, { origin: (e.origin ?? []).join(" "), angles: (e.angles ?? []).join(" "), model: e.model, skin: e.skin }]));
  /**
   * Compares the point entities with the snapshot and sends what moved or changed;
   * the snapshot is retaken either way so a reconnect starts fresh.
   */
  const liveSyncEntities = useCallback((map: LoadedMap) => {
    const b = bridgeRef.current;
    const prev = liveSnapRef.current;
    const next = liveSnapshot(map.pointEntities);
    liveSnapRef.current = next;
    if (!b?.connected || !bridgeLiveRef.current || !prev) return;
    let sent = 0;
    for (const e of map.pointEntities) {
      const was = prev.get(e.id);
      if (!was || !e.origin) continue;
      const now = next.get(e.id)!;
      if (was.origin !== now.origin || was.angles !== now.angles) {
        const a = e.angles ?? [0, 0, 0];
        void api.bridgeSend({ type: "move_entity", id: e.id, x: e.origin[0], y: e.origin[1], z: e.origin[2], pitch: a[0], yaw: a[1], roll: a[2] });
        sent++;
      }
      if (was.model !== now.model && now.model) {
        void api.bridgeSend({ type: "set_keyvalue", id: e.id, key: "model", value: now.model });
        sent++;
      }
      if (was.skin !== now.skin) {
        void api.bridgeSend({ type: "set_keyvalue", id: e.id, key: "skin", value: String(now.skin) });
        sent++;
      }
      if (sent >= 64) break;
    }
    if (sent) void api.log(`live sync: ${sent} commands`);
  }, []);
  const bridgeFollowRef = useRef(false);
  const setBridgeFollow = useCallback((v: boolean) => {
    bridgeFollowRef.current = v;
    setBridgeFollowState(v);
  }, []);
  /** Portal outlines from VVIS's .prt file and whether they are drawn. */
  const portalSegs = useRef<Float32Array | null>(null);
  const [portalCount, setPortalCount] = useState(0);
  const [portalsShown, setPortalsShown] = useState(false);
  /** Recently opened maps, newest first, remembered between runs. */
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("gme.recent") ?? "[]") as unknown;
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 8) : [];
    } catch {
      return [];
    }
  });
  const rememberRecent = useCallback((path: string) => {
    setRecent((list) => {
      const next = [path, ...list.filter((p) => p !== path)].slice(0, 8);
      try {
        localStorage.setItem("gme.recent", JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);
  /** Points of the loaded leak pointfile (0 when none is shown). */
  const [leakPoints, setLeakPoints] = useState(0);
  const [pack, setPack] = useState<PackReport | null>(null);
  const [packBusy, setPackBusy] = useState(false);
  const [packAfterCompile, setPackAfterCompileState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gme.packAfterCompile") === "1";
    } catch {
      return false;
    }
  });
  /** Auto-analysis after a build: known findings get fixed, unknown ones go to the assistant. */
  const [autoFix, setAutoFixState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gme.autoFix") !== "0";
    } catch {
      return true;
    }
  });
  const autoFixRef = useRef(autoFix);
  const setAutoFix = useCallback((v: boolean) => {
    autoFixRef.current = v;
    setAutoFixState(v);
    try {
      localStorage.setItem("gme.autoFix", v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const [autoAsk, setAutoAskState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gme.autoAsk") === "1";
    } catch {
      return false;
    }
  });
  const autoAskRef = useRef(autoAsk);
  const setAutoAsk = useCallback((v: boolean) => {
    autoAskRef.current = v;
    setAutoAskState(v);
    try {
      localStorage.setItem("gme.autoAsk", v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, []);
  /** What the auto-analysis did after the last build, for the panel and the autotests. */
  const [autoReport, setAutoReport] = useState("");
  const autoReportRef = useRef("");
  const autoAfterCompileRef = useRef<(ok: boolean) => Promise<void>>(async () => {});
  const packAfterCompileRef = useRef(packAfterCompile);
  const setPackAfterCompile = useCallback((v: boolean) => {
    packAfterCompileRef.current = v;
    setPackAfterCompileState(v);
    try {
      localStorage.setItem("gme.packAfterCompile", v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const [prefabs, setPrefabs] = useState<PrefabInfo[] | null>(null);
  const prefabsRef = useRef<PrefabInfo[] | null>(null);
  prefabsRef.current = prefabs;
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[] | null>(null);
  /** The open map compared with one saved version (History → «Сравнить»), and that version's document for reverting. */
  const [historyDiff, setHistoryDiff] = useState<HistoryDiff | null>(null);
  const historyOld = useRef<{ map: LoadedMap; snap: Snapshot } | null>(null);
  const [prefabDir, setPrefabDir] = useState("");
  /** BSP written by the last successful compile, and whether it was installed into maps. */
  const lastBsp = useRef<string | null>(null);
  const lastInstalled = useRef(false);
  const [canPack, setCanPack] = useState(false);
  const leakPointsRef = useRef(0);
  leakPointsRef.current = leakPoints;
  const compileLinesRef = useRef<string[]>([]);
  compileLinesRef.current = compileState.lines;
  const compileRun = useRef(0);
  /** How the last compile ended, for the assistant's tools. */
  const compileResultRef = useRef<{ ok: boolean | null; message: string; ms: number }>({ ok: null, message: "", ms: 0 });
  /** The last game console watch, for the assistant's tools. */
  const gameConsoleRef = useRef<GameConsole | null>(null);
  /** Run number of the last `compile-done` event, for autotests. */
  const compileDoneRef = useRef(0);
  const [visgroups, setVisgroups] = useState<{ user: VisGroupInfo[]; auto: AutoVisGroup[]; hidden: number }>({ user: [], auto: [], hidden: 0 });
  /** Hammer's Groups/Objects toggle: picking one object selects its whole group. */
  const [selectGroups, setSelectGroupsState] = useState(true);
  const selectGroupsRef = useRef(true);

  const refreshVisgroups = useCallback(() => {
    const map = current.current;
    if (!map) {
      setVisgroups({ user: [], auto: [], hidden: 0 });
      return;
    }
    setVisgroups({
      user: map.doc.visgroups() as VisGroupInfo[],
      auto: map.doc.auto_visgroups() as AutoVisGroup[],
      hidden: map.doc.hidden_ids().length,
    });
  }, []);

  /** Expands a picked object to its group when group selection is on. */
  const withGroup = useCallback((id: number): number[] => {
    const map = current.current;
    if (!map || !selectGroupsRef.current) return [id];
    const g = map.doc.group_of(id);
    return g ? Array.from(map.doc.group_members(g)) : [id];
  }, []);
  const [entityClass, setEntityClassState] = useState(DEFAULT_ENTITY_CLASS);
  /** 3D view mode (Hammer's textured / flat / wireframe). */
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem("gme.viewMode");
      return v === "flat" || v === "wireframe" || v === "lightmap" || v === "lighting" ? v : "textured";
    } catch {
      return "textured";
    }
  });
  const setViewMode = useCallback((m: ViewMode) => {
    setViewModeState(m);
    session.current?.renderer.setViewMode(m);
    try {
      localStorage.setItem("gme.viewMode", m);
    } catch {
      /* storage unavailable */
    }
  }, []);
  /** Path tool: entities placed in a row get names and `target` links. */
  const [pathChain, setPathChainState] = useState(false);
  const pathChainRef = useRef<{ on: boolean; last: number | null; n: number }>({ on: false, last: null, n: 0 });
  const setPathChain = useCallback((on: boolean) => {
    pathChainRef.current = { on, last: null, n: 0 };
    setPathChainState(on);
  }, []);
  /** Key of the entity being edited that the next clicked entity's name goes into. */
  const pickTargetRef = useRef<{ entity: number; key: string } | null>(null);
  const [pickingTarget, setPickingTarget] = useState<string | null>(null);
  /** "Выбрать…" next to a model key: the next pick in the model browser fills it. */
  const pickModelRef = useRef<{ entity: number; key: string } | null>(null);
  const [pickingModel, setPickingModel] = useState<string | null>(null);
  const [classList, setClassList] = useState<ClassEntry[]>([]);
  const [entityDetails, setEntityDetails] = useState<EntityDetails | null>(null);
  const [classDef, setClassDef] = useState<ClassDef | null>(null);
  const [targetnames, setTargetnames] = useState<string[]>([]);
  const classDefs = useRef<Map<string, ClassDef>>(new Map());
  const refreshPropertiesRef = useRef<() => void>(() => {});

  const loadClassList = useCallback(() => {
    setClassList((list) => {
      if (!list.length)
        void api.entityClassList().then((l) => {
          setClassList(l.filter((c) => c.point));
          setSolidClasses(l.filter((c) => !c.point));
        });
      return list;
    });
  }, []);

  const classDefFor = useCallback(async (classname: string): Promise<ClassDef> => {
    const cached = classDefs.current.get(classname);
    if (cached) return cached;
    const def = await api.entityClassDef(classname);
    classDefs.current.set(classname, def);
    return def;
  }, []);

  /** Re-reads the selected entity for the properties panel. */
  const refreshProperties = useCallback(() => {
    const map = current.current;
    let id = map ? Array.from(selection.current).find((i) => map.pointEntities.some((e) => e.id === i)) : undefined;
    if (map && id === undefined) {
      // A selected brush of a brush entity shows that entity.
      for (const i of selection.current) {
        const owner = map.doc.entity_of_solid(i);
        if (owner) {
          id = owner;
          break;
        }
      }
    }
    if (!map || id === undefined) {
      setEntityDetails(null);
      return;
    }
    const d = map.doc.entity_details(id) as EntityDetails | undefined;
    setEntityDetails(d ?? null);
    setTargetnames(map.doc.targetnames());
    if (d) void classDefFor(d.classname).then((def) => setClassDef(def));
  }, [classDefFor]);
  useEffect(() => {
    refreshPropertiesRef.current = refreshProperties;
  }, [refreshProperties]);

  const openProperties = useCallback(() => {
    setPanel("properties");
    loadClassList();
    refreshProperties();
  }, [loadClassList, refreshProperties]);

  const setCurrentMaterial = useCallback((name: string) => {
    materialRef.current = name;
    setCurrentMaterialState(name);
  }, []);

  const setEntityClass = useCallback((name: string) => {
    entityClassRef.current = name;
    setEntityClassState(name);
  }, []);

  const setCurrentModel = useCallback((name: string) => {
    currentModelRef.current = name;
    setCurrentModelState(name);
  }, []);

  /** Drops a prop_static with `model` where the 3D view looks (the surface under the crosshair, else 256 units ahead). */
  const placeModelRef = useRef<(model: string) => Promise<void>>(async () => {});

  const setShape = useCallback((s: Shape) => {
    shapeRef.current = s;
    setShapeState(s);
    // A box already drawn shows the new shape's preview (the steps of stairs, or none).
    if (pendingBox.current) setPendingBox(pendingBox.current);
  }, []);

  const setPrim = useCallback((p: Partial<{ sides: number; wall: number; arc: number; step: number; reverse: boolean }>) => {
    primRef.current = { ...primRef.current, ...p };
    setPrimState(primRef.current);
    if (pendingBox.current) setPendingBox(pendingBox.current);
  }, []);

  const setTieClass = useCallback((name: string) => {
    tieClassRef.current = name;
    setTieClassState(name);
  }, []);

  /** Re-reads the picked faces: drops vanished ones, updates the sheet and the 3D outline. */
  const refreshFaces = useCallback(() => {
    const map = current.current;
    const s = session.current;
    if (!map) {
      faceSel.current.clear();
    }
    const parts: number[] = [];
    for (const [key, [solid, side]] of Array.from(faceSel.current.entries())) {
      const poly = map ? map.doc.face_polygon(solid, side) : new Float32Array(0);
      if (poly.length < 9) {
        faceSel.current.delete(key);
        continue;
      }
      const n = poly.length / 3;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        parts.push(poly[i * 3], poly[i * 3 + 1], poly[i * 3 + 2], poly[j * 3], poly[j * 3 + 1], poly[j * 3 + 2]);
      }
    }
    const first = faceSel.current.values().next().value as [number, number] | undefined;
    setFaceCount(faceSel.current.size);
    setFaceInfo(first && map ? ((map.doc.face_info(first[0], first[1]) as FaceInfo | undefined) ?? null) : null);
    s?.renderer.setOverlay("faces", parts.length ? new Float32Array(parts) : null, [1, 0.35, 0.35], "3d");
  }, []);

  const clearFaces = useCallback(() => {
    faceSel.current.clear();
    refreshFaces();
  }, [refreshFaces]);

  const updateMapInfo = useCallback((map: LoadedMap) => {
    const st = map.stats;
    setMapInfo(
      tr("{0} брашей, {1} граней ({2} дисп.), {3} треугольников, {4} материалов, {5} энтити", [st.solids, st.faces, st.displacement_faces, st.triangles, st.materials, st.entities]) +
        (st.invalid_solids ? tr(", {0} некорректных", [st.invalid_solids]) : "") +
        (st.warnings.length ? tr(", {0} предупреждений", [st.warnings.length]) : ""),
    );
  }, []);

  /** Pushes the id-based selection to the renderer as object indices. */
  /** Locked objects (Blender's lock, Unity's pickability): seen but never selected, so floors and walls stop getting in the way. Kept for the session. */
  const lockedRef = useRef<Set<number>>(new Set());
  const applySelection = useCallback(() => {
    const map = current.current;
    const indices: number[] = [];
    if (lockedRef.current.size) for (const id of [...selection.current]) if (lockedRef.current.has(id)) selection.current.delete(id);
    if (map) {
      for (const id of selection.current) {
        const i = objectIndexOf(map, id);
        if (i !== null) indices.push(i);
        else selection.current.delete(id);
      }
    }
    session.current?.renderer.setSelection(indices);
    setSelectedCount(selection.current.size);
    // A pick from a list panel (a finding, a row of the entity list) keeps that panel on screen: its hint and buttons stay usable.
    const fromList = panelRef.current === "problems" || panelRef.current === "entities" || panelRef.current === "outliner" || panelRef.current === "logic" || panelRef.current === "history";
    if (selection.current.size && autoInspectorRef.current && toolRef.current === "select" && !SAT_ANY && !assistantBusy.current && !fromList) openPanelRef.current("inspector");
    if (!SAT_ANY) satChannelRef.current?.postMessage({ type: "sel", ids: Array.from(selection.current) } satisfies DocMessage);
    refreshPropertiesRef.current();
    refreshHelpersRef.current();
  }, []);
  applySelectionRef.current = applySelection;

  /** Connection lines and light cones of the selected entities (late-bound: needs the map). */
  const refreshHelpersRef = useRef<() => void>(() => {});
  const refreshHelpers = useCallback(() => {
    const s = session.current;
    const map = current.current;
    if (!s) return;
    if (!map || !selection.current.size) {
      s.renderer.setOverlay("helpers", null, [1, 1, 1]);
      return;
    }
    // Brush entities (buttons, triggers, doors) have no origin and are selected through their brushes:
    // they stand at the centre of their brushes, and a selected brush stands for its entity.
    const boundsOf = (entityId: number): [Vec3, Vec3] | null => {
      let lo: Vec3 | null = null;
      let hi: Vec3 | null = null;
      for (const sid of map.doc.entity_solids(entityId) as Uint32Array) {
        const idx = objectIndexOf(map, sid);
        const b = idx === null ? null : objectBoundsRef.current(map, idx);
        if (!b) continue;
        lo = lo ? [Math.min(lo[0], b[0][0]), Math.min(lo[1], b[0][1]), Math.min(lo[2], b[0][2])] : [b[0][0], b[0][1], b[0][2]];
        hi = hi ? [Math.max(hi[0], b[1][0]), Math.max(hi[1], b[1][1]), Math.max(hi[2], b[1][2])] : [b[1][0], b[1][1], b[1][2]];
      }
      return lo && hi ? [lo, hi] : null;
    };
    // Brush entities carry their box too: a door's arrow and open outline need its size.
    const anchored = map.entities.map((e) => {
      if (!e.brush) return e;
      const b = boundsOf(e.id);
      if (!b) return e;
      return { ...e, origin: e.origin ?? ([(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2] as Vec3), bounds: b };
    });
    const owners = new Set([...selection.current].map((id) => map.doc.entity_of_solid(id) || id));
    const selected: EntityDetails[] = [];
    for (const e of anchored) {
      if (!owners.has(e.id) || !e.origin) continue;
      const d = map.doc.entity_details(e.id) as EntityDetails | undefined;
      if (d) selected.push(d);
    }
    if (!selected.length) {
      s.renderer.setOverlay("helpers", null, [1, 1, 1]);
      return;
    }
    // Targets by name, and sources by "->name" for the inputs of the selection.
    const originsByName = new Map<string, Vec3[]>();
    const push = (key: string, o: Vec3) => {
      const arr = originsByName.get(key);
      if (arr) arr.push(o);
      else originsByName.set(key, [o]);
    };
    const selectedNames = new Set(selected.map((d) => d.keyvalues.find(([k]) => k.toLowerCase() === "targetname")?.[1]?.toLowerCase()).filter(Boolean));
    for (const e of anchored) {
      if (!e.origin) continue;
      if (e.targetname) push(e.targetname.toLowerCase(), e.origin);
    }
    if (selectedNames.size) {
      const map2 = map;
      for (const e of anchored) {
        if (!e.origin || owners.has(e.id)) continue;
        const d = map2.doc.entity_details(e.id) as EntityDetails | undefined;
        if (!d?.connections.length) continue;
        // A target with a trailing * fires at every selected name it covers.
        for (const c of d.connections) for (const n of selectedNames) if (n && nameHits(c.target, new Set([n]))) push(`->${n}`, e.origin);
      }
    }
    const lines = helperLines(anchored, selected, originsByName);
    s.renderer.setOverlay("helpers", lines ? lines.positions : null, lines ? lines.colors : [1, 1, 1]);
  }, []);
  useEffect(() => {
    refreshHelpersRef.current = refreshHelpers;
  }, [refreshHelpers]);

  const selectedIndices = useCallback((): number[] => {
    const map = current.current;
    if (!map) return [];
    return Array.from(selection.current)
      .map((id) => objectIndexOf(map, id))
      .filter((i): i is number => i !== null);
  }, []);

  /** Replaces the selection and resets the handle mode, as a fresh pick does. */
  const selectIds = useCallback(
    (ids: Iterable<number>) => {
      selection.current = new Set(ids);
      setHandleMode("move");
      applySelection();
    },
    [applySelection],
  );

  const setPendingBox = useCallback((box: Box3 | null) => {
    pendingBox.current = box;
    const r = session.current?.renderer;
    r?.setPreviewBox(box);
    // Stairs show their steps inside the box while it is being drawn.
    const steps = box && shapeRef.current === "stairs" ? stairBoxes(box[0] as Vec3, box[1] as Vec3, primRef.current.step, primRef.current.reverse) : [];
    if (steps.length > 1) {
      const parts = steps.map((b) => boxEdges(b));
      const all = new Float32Array(parts.reduce((n, a) => n + a.length, 0));
      let at = 0;
      for (const a of parts) {
        all.set(a, at);
        at += a.length;
      }
      r?.setOverlay("stairs", all, [1, 0.85, 0.35]);
    } else r?.setOverlay("stairs", null, [1, 1, 1]);
    setStatusText(
      box
        ? tr("{0}{1} × {2} × {3} · Enter - создать, Esc - отмена", [
            steps.length ? tr("лестница: {0} ступеней · ", [steps.length]) : tr("блок "),
            box[1][0] - box[0][0],
            box[1][1] - box[0][1],
            box[1][2] - box[0][2],
          ])
        : "",
    );
  }, []);

  /** Shows or hides the clipper's cut overlay for the current line and keep mode. */
  const showClipLine = useCallback(() => {
    const r = session.current?.renderer;
    const line = clipLineRef.current;
    if (!r) return;
    if (!line) {
      r.setOverlay("clip", null, PREVIEW_COLOR);
      setStatusText("");
      return;
    }
    r.setOverlay("clip", clipOverlay(line, clipKeepRef.current, selectionBoundsRef.current()), PREVIEW_COLOR);
    setStatusText(tr("клип: {0} · Enter - разрезать, 5 - сменить сторону, Esc - отмена", [CLIP_KEEP_NAMES[clipKeepRef.current]]));
  }, []);
  /** The ruler: a yellow line with end crosses in every view and the numbers in the status bar. */
  const setMeasure = useCallback((m: Measurement | null) => {
    measureRef.current = m;
    const r = session.current?.renderer;
    if (!r) return;
    if (!m) {
      r.setOverlay("measure", null, [1, 0.85, 0.3]);
      setStatusText("");
      return;
    }
    r.setOverlay("measure", measureOverlay(m), [1, 0.85, 0.3]);
    setStatusText(measureText(m));
  }, []);
  /** Late-bound selection bounds for callbacks declared before it. */
  const selectionBoundsRef = useRef<() => Box3 | null>(() => null);

  const setClipKeep = useCallback(
    (k: ClipKeep) => {
      clipKeepRef.current = k;
      setClipKeepState(k);
      showClipLine();
    },
    [showClipLine],
  );

  const setClipLine = useCallback(
    (line: ClipLine | null) => {
      clipLineRef.current = line;
      showClipLine();
    },
    [showClipLine],
  );

  const refreshCordonRef = useRef<() => void>(() => {});

  const setTool = useCallback(
    (t: Tool) => {
      toolRef.current = t;
      setToolState(t);
      if (t !== "block") setPendingBox(null);
      if (t !== "clip") setClipLine(null);
      if (t !== "measure") setMeasure(null);
      if (t !== "texture") {
        clearFaces();
        paintClickRef.current = false;
        setPaintClickState(false);
      }
      refreshCordonRef.current();
      if (t === "texture") setPanel("textures");
      if (t === "entity") loadClassList();
    },
    [clearFaces, loadClassList, setClipLine, setPendingBox],
  );

  const setTextureLock = useCallback((on: boolean) => {
    textureLockRef.current = on;
    setTextureLockState(on);
  }, []);
  const setSnapMoves = useCallback((on: boolean) => {
    snapRef.current = on;
    setSnapMovesState(on);
    try {
      localStorage.setItem("gme.snap", on ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }, []);
  /**
   * A move distance. Snapping on: grid steps; Alt held: the opposite of the
   * setting (free while snapping, steps while free). Free moves round to a
   * quarter unit so VMF numbers stay tidy.
   */
  const moveStep = (v: number, grid: number, mods?: { altKey: boolean }) => {
    const g = Math.max(1, grid || 1);
    const steps = snapRef.current !== !!mods?.altKey;
    return steps ? Math.round(v / g) * g : Math.round(v * 4) / 4;
  };
  /**
   * Shift while moving: the moved selection docks to the nearest other
   * object, face to face or edge aligned, on the given axes. `bounds` is the
   * selection's box before the move; the returned delta is `delta` nudged so
   * that a side of the moved box meets a side of a neighbour within
   * `threshold` units. Neighbours must overlap the moved box on the other
   * axes (give or take the threshold), so a far wall does not pull.
   */
  const dockToNeighbours = (map: LoadedMap, moving: number[], bounds: Box3, delta: Vec3, axes: number[], threshold: number): Vec3 => {
    const out: Vec3 = [delta[0], delta[1], delta[2]];
    const lo: Vec3 = [bounds[0][0] + delta[0], bounds[0][1] + delta[1], bounds[0][2] + delta[2]];
    const hi: Vec3 = [bounds[1][0] + delta[0], bounds[1][1] + delta[1], bounds[1][2] + delta[2]];
    const skip = new Set(moving);
    const hidden = new Set<number>(Array.from(map.doc.hidden_ids() as Iterable<number>));
    const total = map.mesh.solidIds.length + map.pointEntities.length;
    const best: (number | null)[] = axes.map(() => null);
    for (let i = 0; i < total; i++) {
      if (skip.has(i)) continue;
      const id = objectId(map, i);
      if (id !== null && hidden.has(id)) continue;
      const b = objectBoundsRef.current(map, i);
      if (!b) continue;
      axes.forEach((axis, k) => {
        // Overlap on the other axes, with some slack.
        for (let o = 0; o < 3; o++) {
          if (o === axis) continue;
          if (b[0][o] > hi[o] + threshold || b[1][o] < lo[o] - threshold) return;
        }
        // Face to face first, then edge aligned.
        const pairs = [b[1][axis] - lo[axis], b[0][axis] - hi[axis], b[0][axis] - lo[axis], b[1][axis] - hi[axis]];
        for (const d of pairs) {
          const cur = best[k];
          if (Math.abs(d) <= threshold && (cur === null || Math.abs(d) < Math.abs(cur))) best[k] = d;
        }
      });
    }
    axes.forEach((axis, k) => {
      const d = best[k];
      if (d !== null) out[axis] = Math.round((out[axis] + d) * 100) / 100;
    });
    return out;
  };

  /** Where a vertex snap landed (V while moving in a 2D view), for the marker in that view. */
  const vertexSnapMarker = useRef<{ view: ViewKind; world2: [number, number] } | null>(null);
  /** Vertices of the moving objects and of everything else visible, as flat pairs on the view's axes. */
  const snapVertexLists = (map: LoadedMap, moving: number[], axes: number[]) => {
    const skip = new Set(moving);
    const hidden = new Set<number>(Array.from(map.doc.hidden_ids() as Iterable<number>));
    const n = map.mesh.solidIds.length;
    const total = n + map.pointEntities.length;
    const mine: number[] = [];
    const others: number[] = [];
    for (let i = 0; i < total; i++) {
      const own = skip.has(i);
      const out = own ? mine : others;
      if (i < n) {
        const id = map.mesh.solidIds[i];
        if (!own && hidden.has(id)) continue;
        const v = map.doc.solid_vertices(id) as Float32Array;
        for (let k = 0; k + 2 < v.length; k += 3) out.push(v[k + axes[0]], v[k + axes[1]]);
      } else {
        const ent = map.pointEntities[i - n];
        if (!ent.origin || (!own && hidden.has(ent.id))) continue;
        out.push(ent.origin[axes[0]], ent.origin[axes[1]]);
      }
    }
    return { mine, others };
  };
  /** Unity's V: the selection's vertex nearest the pointer lands on the nearest vertex of another object. */
  const snapToVertex = (map: LoadedMap, moving: number[], delta: Vec3, axes: number[], cursor: [number, number], threshold: number, cache: { mine: number[]; others: number[] } | null) => {
    const lists = cache ?? snapVertexLists(map, moving, axes);
    const s = snapVertices(lists.mine, lists.others, [delta[axes[0]], delta[axes[1]]], cursor, threshold);
    const out: Vec3 = [delta[0], delta[1], delta[2]];
    if (s) {
      out[axes[0]] = s.delta[0];
      out[axes[1]] = s.delta[1];
    }
    return { delta: out, target: s?.target ?? null, lists };
  };

  /**
   * Loads a model from the shell into the cache and the renderer; returns
   * its cache key, or null when the shell has no such model.
   */
  const ensureModel = useCallback(async (name: string, skin: number, body = 0): Promise<string | null> => {
    const key = `${name}|${skin}|${body}`;
    if (!modelCache.current.has(key)) {
      try {
        const res = await fetch(modelUrl(name, skin, body));
        if (!res.ok) throw new Error(`${res.status}`);
        const data = parseModel(new Uint8Array(await res.arrayBuffer()));
        const infos = await api.materialsInfo(Array.from(new Set(data.meshes.map((m) => m.material))));
        for (const i of infos) materialInfos.current.set(i.name, i);
        modelCache.current.set(key, data);
        if (body) void api.log(`model ${name} skin ${skin} body ${body}: ${data.meshes.length} meshes, ${data.meshes.reduce((n, m) => n + m.indices.length / 3, 0)} tris`);
      } catch (err) {
        console.warn(`model ${name}:`, err);
        // A miss while the content is still mounting is not a missing model:
        // leave it uncached so the next request tries again.
        if (contentRef.current?.state === "ready") modelCache.current.set(key, null);
        else modelCache.current.delete(key);
      }
    }
    const data = modelCache.current.get(key);
    const s = session.current;
    if (!data || !s) return null;
    if (!s.renderer.hasModel(key)) {
      const infos = new Map<string, MaterialInfo>();
      for (const m of data.meshes) {
        const info = materialInfos.current.get(m.material);
        if (info) infos.set(m.material, info);
      }
      s.renderer.addModel(key, data, infos);
    }
    return key;
  }, []);
  // The model picked in the panel loads at once, so the ghost and a row start do not wait for the VPKs.
  useEffect(() => {
    if (currentModel) void ensureModel(currentModel, 0);
  }, [currentModel, ensureModel]);
  /** Absolute path of an instance file named relative to the map's folder. */
  const instancePath = useCallback((file: string): string => {
    const base = currentPath.current;
    const sep = base.includes("\\") ? "\\" : "/";
    const dir = base.slice(0, base.lastIndexOf(sep) + 1);
    const rel = file.endsWith(".vmf") ? file : `${file}.vmf`;
    return dir + rel.replace(/\//g, sep);
  }, []);

  /**
   * Loads a func_instance's VMF (relative to the map's folder) as a model
   * under the key `inst|<file>`; null when it cannot be read.
   */
  const ensureInstance = useCallback(
    async (file: string): Promise<string | null> => {
      const key = `inst|${file}`;
      if (!modelCache.current.has(key)) {
        modelCache.current.set(key, null);
        try {
          const text = await api.readTextFile(instancePath(file));
          const parms = parseInstanceParms(text);
          instanceParms.current.set(file, parms);
          const loaded = await loadMap(text);
          const data = modelFromMesh(loaded.mesh, loaded.stats.bounds);
          loaded.doc.free();
          const infos = await api.materialsInfo(Array.from(new Set(data.meshes.map((m) => m.material))));
          for (const i of infos) materialInfos.current.set(i.name, i);
          modelCache.current.set(key, data);
          void api.log(
            `instance ${file}: ${loaded.stats.solids} solids, ${loaded.stats.triangles} tris${parms.length ? `, parms ${parms.map((p) => `${p.name} ${p.type} ${p.def}`).join("; ")}` : ""}`,
          );
        } catch (err) {
          console.warn(`instance ${file}:`, err);
          void api.log(`instance ${file}: ${String(err)}`);
        }
      }
      const data = modelCache.current.get(key);
      const s = session.current;
      if (!data || !s) return null;
      if (!s.renderer.hasModel(key)) {
        const infos = new Map<string, MaterialInfo>();
        for (const m of data.meshes) {
          const info = materialInfos.current.get(m.material);
          if (info) infos.set(m.material, info);
        }
        s.renderer.addModel(key, data, infos);
      }
      return key;
    },
    [instancePath],
  );

  const ensureModelRef = useRef(ensureModel);
  useEffect(() => {
    ensureModelRef.current = ensureModel;
  }, [ensureModel]);

  /** Model browser: picks a model and renders its preview. */
  /** The model preview's camera: dragging the picture turns it. */
  const previewKeyRef = useRef<string | null>(null);
  const previewAngle = useRef({ yaw: 0, pitch: 0 });
  const previewBusy = useRef(false);
  const previewPending = useRef(false);
  const rotatePreview = useCallback(async (dYaw: number, dPitch: number) => {
    const a = previewAngle.current;
    previewAngle.current = { yaw: a.yaw + dYaw, pitch: Math.max(-80, Math.min(80, a.pitch + dPitch)) };
    const s = session.current;
    const key = previewKeyRef.current;
    if (!s || !key) return;
    if (previewBusy.current) {
      previewPending.current = true;
      return;
    }
    previewBusy.current = true;
    try {
      do {
        previewPending.current = false;
        const { yaw, pitch } = previewAngle.current;
        const png = await s.renderer.renderModelPreview(key, 320, yaw, pitch);
        if (png) setModelPreview(png);
      } while (previewPending.current);
    } finally {
      previewBusy.current = false;
    }
  }, []);
  /** The class a model wants (prop_static, prop_physics or prop_dynamic), from its header flags and its .phy. */
  const modelClass = useCallback(async (name: string): Promise<PropClass> => (await classesOf([name])).get(name) ?? "prop_static", []);
  /** Waits for a model's textures to settle (loaded or missing), up to a couple of seconds. */
  const waitModelTextures = useCallback(async (key: string, ms = 2500) => {
    const t0 = performance.now();
    while (session.current && !session.current.renderer.modelTexturesReady(key) && performance.now() - t0 < ms) await new Promise((r) => setTimeout(r, 80));
  }, []);
  const pickModel = useCallback(
    async (name: string) => {
      setCurrentModel(name);
      setModelPreview(null);
      setModelPreviewInfo("");
      // Picking a model means placing it: the entity tool with the class the model wants (Hammer always says prop_static).
      setEntityClass("prop_static");
      void modelClass(name).then((cls) => {
        if (cls === "prop_static" || currentModelRef.current !== name) return;
        setEntityClass(cls);
        setStatusText(tr("модель не предназначена для prop_static - будет создан {0}{1}", [cls, cls === "prop_physics" ? tr(" (у модели есть физика)") : ""]));
      });
      if (toolRef.current !== "entity") setTool("entity");
      if (!inTauri) return;
      const key = await ensureModel(name, 0);
      const s = session.current;
      const data = key ? modelCache.current.get(key) : null;
      if (!key || !data || !s) {
        setModelPreviewInfo(tr("не удалось загрузить модель"));
        return;
      }
      await waitModelTextures(key);
      if (currentModelRef.current !== name) return;
      previewKeyRef.current = key;
      previewAngle.current = { yaw: 0, pitch: 0 };
      const png = await s.renderer.renderModelPreview(key, 320);
      if (currentModelRef.current !== name) return;
      setModelPreview(png);
      const tris = data.meshes.reduce((n, m) => n + m.indices.length / 3, 0);
      const size = data.maxs.map((v, i) => Math.round(v - data.mins[i]));
      setModelPreviewInfo(tr("{0} треугольников · {1} юнитов · {2} материалов", [tris, size.join("×"), data.meshes.length]));
    },
    [ensureModel, modelClass, setCurrentModel, setEntityClass, setTool, waitModelTextures],
  );

  /** Builds and uploads entity boxes for the current map from FGD classes. */
  const refreshEntities = useCallback(async () => {
    const s = session.current;
    const map = current.current;
    if (!s || !map) return;
    const names = Array.from(new Set(map.pointEntities.map((e) => e.classname)));
    const missing = names.filter((n) => !classInfos.current.has(n));
    if (missing.length) {
      const classes = await api.entityClasses(missing);
      if (current.current !== map) return;
      for (const c of classes) classInfos.current.set(c.classname, c);
    }
    // Props: the entity's model key, else the class's studio model.
    const modelOf = (e: EntityInfo): string | null => e.model ?? classInfos.current.get(e.classname)?.model?.toLowerCase() ?? null;
    const keyOf = (e: EntityInfo): string | null => (e.instance_file ? `inst|${e.instance_file}` : null);
    const isOverlayClass = (c: string) => {
      const l = c.toLowerCase();
      return l === "info_overlay" || l === "infodecal";
    };
    // Icon sprites (`iconsprite()` in the FGD) for point entities without a model.
    const iconOf = (e: EntityInfo): string | null => {
      if (!inTauri || e.model || e.instance_file) return null;
      const c = classInfos.current.get(e.classname);
      return c && !c.model && c.icon
        ? c.icon
            .replace(/\\/g, "/")
            .replace(/\.vmt$/i, "")
            .toLowerCase()
        : null;
    };
    const bounds: (Box3 | undefined)[] = [];
    const instances: ModelInstance[] = [];
    const liveOverlays = new Set<string>();
    modelBoundsRef.current = new Map();
    // Instances are plain VMF files, so they load in the browser too;
    // studio models need the shell's content system.
    if (inTauri || map.pointEntities.some((e) => e.instance_file)) {
      // (sprites are keyed `sprite|<material>` in the same cache)
      const wanted = new Map<string, { name: string; skin: number; body: number }>();
      const instanceFiles = new Set<string>();
      for (const e of map.pointEntities) {
        if (e.instance_file && e.origin) {
          instanceFiles.add(e.instance_file);
          continue;
        }
        const name = modelOf(e);
        if (inTauri && name && e.origin) wanted.set(`${name}|${e.skin}|${e.body}`, { name, skin: e.skin, body: e.body });
      }
      const loads: Promise<unknown>[] = [];
      for (const [key, { name, skin, body }] of wanted) {
        if (modelCache.current.has(key)) continue;
        loads.push(ensureModelRef.current(name, skin, body));
      }
      const icons = new Set<string>();
      for (const e of map.pointEntities) {
        const icon = iconOf(e);
        if (icon && e.origin) icons.add(icon);
      }
      // Decals and overlays: their material sizes decide the quads.
      const overlayMats = new Set<string>();
      for (const e of map.pointEntities) {
        if (!isOverlayClass(e.classname)) continue;
        const d = map.doc.entity_details(e.id) as EntityDetails | undefined;
        const m = d ? overlayMaterial(e.classname, keyMap(d)) : null;
        if (m && !materialInfos.current.has(m)) overlayMats.add(m);
      }
      if (overlayMats.size) {
        loads.push(
          api.materialsInfo(Array.from(overlayMats)).then((infos) => {
            for (const i of infos) materialInfos.current.set(i.name, i);
          }),
        );
      }
      for (const icon of icons) {
        const key = `sprite|${icon}`;
        if (modelCache.current.has(key)) continue;
        modelCache.current.set(key, spriteModel(icon));
        loads.push(
          api.materialsInfo([icon]).then((infos) => {
            for (const i of infos) materialInfos.current.set(i.name, i);
          }),
        );
      }
      for (const file of instanceFiles) {
        if (modelCache.current.has(`inst|${file}`)) continue;
        loads.push(ensureInstance(file));
      }
      const tLoads = performance.now();
      if (loads.length) await Promise.all(loads);
      openTiming.current.models = wanted.size;
      openTiming.current.modelLoads = loads.length;
      openTiming.current.modelMs = performance.now() - tLoads;
      if (current.current !== map) return;
      const firstPick = map.mesh.faceTable.length / 4;
      map.pointEntities.forEach((e, i) => {
        if (isOverlayClass(e.classname) && e.origin) {
          const d = map.doc.entity_details(e.id) as EntityDetails | undefined;
          const kv = d ? keyMap(d) : null;
          const material = kv ? overlayMaterial(e.classname, kv) : null;
          const key = kv ? overlayKey(e.id, kv) : null;
          let data: ModelData | null = null;
          if (kv && material && key) {
            if (e.classname.toLowerCase() === "info_overlay") data = overlayQuad(material, kv);
            else {
              // A decal sits on the nearest face around its origin.
              const dirs: Vec3[] = [
                [1, 0, 0],
                [-1, 0, 0],
                [0, 1, 0],
                [0, -1, 0],
                [0, 0, 1],
                [0, 0, -1],
              ];
              let best: { point: Vec3; normal: Vec3; dist: number } | null = null;
              for (const dir of dirs) {
                const h = hitMeshNear(map.mesh, e.origin, dir, 64);
                if (!h) continue;
                const dist = Math.hypot(h.point[0] - e.origin[0], h.point[1] - e.origin[1], h.point[2] - e.origin[2]);
                if (!best || dist < best.dist) best = { point: h.point, normal: h.normal, dist };
              }
              const info = materialInfos.current.get(material);
              const size: [number, number] = [info?.width || 64, info?.height || 64];
              if (best) data = decalQuad(material, best.point, best.normal, size);
            }
          }
          if (data && key) {
            if (!s.renderer.hasModel(key)) {
              const infos = new Map<string, MaterialInfo>();
              const info = materialInfos.current.get(material!);
              if (info) infos.set(material!, info);
              s.renderer.addModel(key, data, infos);
            }
            liveOverlays.add(key);
            instances.push({ model: key, matrix: instanceMatrix([0, 0, 0], [0, 0, 0]), pickId: firstPick + i });
            const b: Box3 = [data.mins, data.maxs];
            bounds.push(b);
            modelBoundsRef.current.set(e.id, b);
            return;
          }
        }
        const name = modelOf(e);
        const instKey = keyOf(e);
        const icon = iconOf(e);
        if ((!name && !instKey && !icon) || !e.origin) {
          bounds.push(undefined);
          return;
        }
        const key = instKey ?? (icon ? `sprite|${icon}` : `${name}|${e.skin}|${e.body}`);
        const data = modelCache.current.get(key);
        if (!data) {
          bounds.push(undefined);
          return;
        }
        if (!s.renderer.hasModel(key)) {
          const infos = new Map<string, MaterialInfo>();
          for (const m of data.meshes) {
            const info = materialInfos.current.get(m.material);
            if (info) infos.set(m.material, info);
          }
          s.renderer.addModel(key, data, infos);
        }
        if (data.sprite) {
          const o = e.origin;
          const h = SPRITE_HALF;
          instances.push({ model: key, matrix: spriteMatrix(o), pickId: firstPick + i });
          const b: Box3 = [
            [o[0] - h, o[1] - h, o[2] - h],
            [o[0] + h, o[1] + h, o[2] + h],
          ];
          bounds.push(b);
          modelBoundsRef.current.set(e.id, b);
          return;
        }
        const angles = e.angles ?? [0, 0, 0];
        instances.push({ model: key, matrix: instanceMatrix(e.origin, angles, e.scale), pickId: firstPick + i });
        const b = modelWorldBounds(data, e.origin, angles, e.scale);
        bounds.push(b);
        modelBoundsRef.current.set(e.id, b);
      });
    }
    // Quads of edited or deleted overlays are dropped from the GPU.
    for (const key of overlayKeys.current) if (!liveOverlays.has(key)) s.renderer.removeModel(key);
    overlayKeys.current = liveOverlays;
    // 3D skybox: the room around sky_camera, scaled up about it.
    const skyIndex = map.pointEntities.findIndex((e) => e.classname.toLowerCase() === "sky_camera" && e.origin);
    const sky = skyIndex >= 0 ? map.pointEntities[skyIndex] : null;
    if (sky && sky.origin && showSkyboxRef.current) {
      const d = map.doc.entity_details(sky.id) as EntityDetails | undefined;
      const scale = Number(d?.keyvalues.find(([k]) => k.toLowerCase() === "scale")?.[1]) || 16;
      const originKey = sky.origin.join(",");
      let entry = skyModel.current;
      if (!entry || entry.mesh !== map.mesh || entry.origin !== originKey) {
        if (entry) s.renderer.removeModel(entry.key);
        entry = null;
        const cluster = skyboxCluster(map.mesh, sky.origin);
        const data = skyboxModel(map.mesh, cluster);
        if (data) {
          const key = `sky|${++skyCounter.current}`;
          const infos = new Map<string, MaterialInfo>();
          for (const m of data.meshes) {
            const info = materialInfos.current.get(m.material);
            if (info) infos.set(m.material, info);
          }
          s.renderer.addModel(key, data, infos);
          entry = { key, mesh: map.mesh, origin: originKey };
          void api.log(`skybox: ${cluster.size} solids around sky_camera ${sky.id}, scale ${scale}`);
        }
        skyModel.current = entry;
      }
      if (entry) instances.push({ model: entry.key, matrix: skyboxMatrix(sky.origin, scale), pickId: map.mesh.faceTable.length / 4 + skyIndex });
    } else if (skyModel.current) {
      s.renderer.removeModel(skyModel.current.key);
      skyModel.current = null;
    }
    // Lighting preview records from the light entities.
    const packed = packLights(map.pointEntities, (id) => map.doc.entity_details(id) as EntityDetails | undefined);
    s.renderer.setLights(packed.data);
    lightCountRef.current = packed.count;
    s.renderer.setModelInstances(instances);
    const boxes = buildEntityBoxes(
      map.pointEntities,
      map.pointEntities.map((e) => classInfos.current.get(e.classname)),
      map.mesh.faceTable.length / 4,
      map.mesh.solidIds.length,
      bounds,
    );
    s.renderer.setEntities(boxes, map.mesh.faceTable);
  }, [ensureInstance]);

  /** Late-bound object bounds for the cordon culling pass (declared below). */
  const objectBoundsRef = useRef<(map: LoadedMap, index: number) => Box3 | null>(() => null);

  /** Reads the cordon from the document, draws it and culls what lies outside. */
  const refreshCordon = useCallback(() => {
    const s = session.current;
    const map = current.current;
    if (!s || !map) return;
    const c = map.doc.cordon() as { active: boolean; mins: Vec3; maxs: Vec3 } | undefined;
    cordonRef.current = c ? { box: [c.mins, c.maxs], active: c.active } : null;
    setCordonState(c ? { active: c.active } : null);
    const culled = new Set<number>();
    if (c && c.active) {
      const total = map.mesh.solidIds.length + map.pointEntities.length;
      for (let i = 0; i < total; i++) {
        const b = objectBoundsRef.current(map, i);
        if (b && !boxesIntersect(b, [c.mins, c.maxs])) culled.add(i);
      }
    }
    culledRef.current = culled;
    s.renderer.setCulled(culled);
    // Like Hammer, an inactive cordon is only shown while the cordon tool is up.
    const show = !!c && (c.active || toolRef.current === "cordon");
    s.renderer.setOverlay("cordon", show ? boxEdges([c.mins, c.maxs]) : null, c?.active ? [1, 0.25, 0.25] : [0.6, 0.3, 0.3]);
  }, []);
  useEffect(() => {
    refreshCordonRef.current = refreshCordon;
  }, [refreshCordon]);

  /** Pushes the current map arrays to the GPU after an edit. */
  const applyEdit = useCallback(async () => {
    const s = session.current;
    const map = current.current;
    if (!s || !map) return;
    scheduleDocSyncRef.current();
    refreshMap(map);
    liveSyncEntities(map);
    if (!s.renderer.updateGeometry(map.mesh)) {
      const infos = await api.materialsInfo(map.mesh.materials);
      materialInfos.current = new Map(infos.map((i) => [i.name, i]));
      s.renderer.setMesh(map.mesh, infos);
    }
    await refreshEntities();
    refreshCordon();
    applySelection();
    refreshFaces();
    setHist(history(map));
    updateMapInfo(map);
    refreshVisgroups();
  }, [applySelection, liveSyncEntities, refreshCordon, refreshEntities, refreshFaces, refreshVisgroups, updateMapInfo]);

  /** The last move of a selection (drag, nudge, Shift-drag copy), for «Повторить сдвиг копией». */
  const lastMoveRef = useRef<Vec3 | null>(null);
  /**
   * Hammer re-projects an overlay when it moves: after a move, turn or mirror, every info_overlay
   * among `ids` gets the faces now under it as its sides, folded into the same undo step. One
   * left over empty air keeps its old faces.
   */
  const restickOverlays = useCallback(
    async (ids: number[]) => {
      const map = current.current;
      if (!map) return;
      const overlays = new Set(ids.filter((id) => map.entities.find((e) => e.id === id)?.classname.toLowerCase() === "info_overlay"));
      if (!overlays.size) return;
      let steps = 0;
      for (const o of overlaySideReport(map, (m, i) => objectBoundsRef.current(m, i) as [[number, number, number], [number, number, number]] | null, overlays)) {
        const same = o.under.length === o.listed.length && o.under.every((s) => o.listed.includes(s));
        if (!o.under.length || same) continue;
        if (map.doc.set_entity_keyvalues(o.id, [["sides", o.under.join(" ")]])) steps++;
      }
      if (!steps) return;
      map.doc.merge_undo(steps + 1, map.doc.history().undo ?? tr("Переместить"));
      await applyEdit();
    },
    [applyEdit],
  );

  const commitTranslate = useCallback(
    async (ids: Iterable<number>, delta: Vec3) => {
      const map = current.current;
      if (!map) return;
      const list = Array.from(ids);
      if (!list.length || (delta[0] === 0 && delta[1] === 0 && delta[2] === 0)) return;
      lastMoveRef.current = [delta[0], delta[1], delta[2]];
      const res = map.doc.translate(new Uint32Array(list), delta[0], delta[1], delta[2], textureLockRef.current);
      if (res) {
        await applyEdit();
        await restickOverlays(list);
      }
    },
    [applyEdit, restickOverlays],
  );

  const commitRotate = useCallback(
    async (ids: Iterable<number>, pivot: Vec3, axis: Vec3, degrees: number) => {
      const map = current.current;
      const list = Array.from(ids);
      if (!map || !list.length || degrees === 0) return;
      const res = map.doc.rotate(new Uint32Array(list), new Float64Array(pivot), new Float64Array(axis), degrees, textureLockRef.current);
      if (res) {
        await applyEdit();
        await restickOverlays(list);
      }
    },
    [applyEdit, restickOverlays],
  );

  const commitScale = useCallback(
    async (ids: Iterable<number>, pivot: Vec3, factors: Vec3) => {
      const map = current.current;
      const list = Array.from(ids);
      if (!map || !list.length || (factors[0] === 1 && factors[1] === 1 && factors[2] === 1)) return;
      const res = map.doc.scale(new Uint32Array(list), new Float64Array(pivot), new Float64Array(factors), textureLockRef.current, false);
      if (res) {
        await applyEdit();
        await restickOverlays(list);
      } else setError(tr("Масштабирование отменено: браш стал бы вырожденным"));
      // Source has no modelscale on prop_static: the editor keeps it and the build makes a prop_dynamic of it.
      const statics = list.filter((id) => /^prop_(static|detail)$/i.test(map.pointEntities.find((p) => p.id === id)?.classname ?? ""));
      if (res && statics.length)
        setStatusText(tr("Масштаб записан в modelscale: при сборке такие prop_static станут prop_dynamic, так как Source не масштабирует статические пропы. Модели масштабируются только равномерно"));
    },
    [applyEdit, restickOverlays],
  );

  /** Runs a document edit and refreshes everything when it changed something. */
  const runEdit = useCallback(
    async (edit: () => unknown) => {
      if (!current.current) return;
      const res = edit() as EditResult | undefined;
      if (res) {
        // The mark on the assistant's steps is for the history list, not for the status texts.
        res.label = splitUndoLabel(res.label).text;
        await applyEdit();
      }
      return res;
    },
    [applyEdit],
  );

  const hideSelection = useCallback(async () => {
    const map = current.current;
    if (!map || !selection.current.size) return;
    const ids = new Uint32Array(selection.current);
    const res = await runEdit(() => map.doc.set_hidden(ids, true, false));
    if (res) selectIds([]);
  }, [runEdit, selectIds]);

  const showAll = useCallback(() => runEdit(() => current.current?.doc.show_all()), [runEdit]);
  /** Blender's Alt+H: shows everything hidden and selects just what came back, to move or delete it right away. */
  const revealAndSelect = useCallback(async () => {
    const map = current.current;
    if (!map) return;
    const hidden = [...(map.doc.hidden_ids() as Uint32Array)];
    if (!hidden.length) {
      setStatusText(tr("скрытых объектов нет"));
      return;
    }
    await showAll();
    // A hidden brush entity comes back as its brushes, the way a click selects it.
    const ids = hidden.flatMap((id) => {
      const solids = Array.from((current.current ?? map).doc.entity_solids(id) as Uint32Array);
      return solids.length ? solids : [id];
    });
    selectIds(ids);
    setStatusText(tr("показано и выделено: {0}", [hidden.length]));
  }, [showAll, selectIds, setStatusText]);

  /** Isolate (Blender's local view, Unity's isolation): hides everything but the selection; again, or with nothing selected, shows all. */
  const isolateSelection = useCallback(async () => {
    const map = current.current;
    if (!map) return;
    const target = (id: number) => map.doc.entity_of_solid(id) || id;
    const keep = new Set([...selection.current].map(target));
    const hidden = new Set<number>(map.doc.hidden_ids() as Uint32Array);
    const all = new Set<number>([...(map.doc.solid_ids() as Uint32Array)].map(target));
    for (const e of map.entities) all.add(e.id);
    const others = [...all].filter((id) => !keep.has(id));
    const isolated = others.length > 0 && others.every((id) => hidden.has(id));
    if (!selection.current.size || isolated) {
      await showAll();
      setStatusText(isolated ? tr("изоляция снята: показано всё") : "");
      return;
    }
    const toHide = others.filter((id) => !hidden.has(id));
    if (!toHide.length) return;
    await runEdit(() => map.doc.set_hidden(new Uint32Array(toHide), true, false));
    setStatusText(tr("изоляция: скрыто {0} · I - показать всё", [toHide.length]));
  }, [runEdit, showAll, setStatusText]);

  /** Camera bookmarks (Ctrl+1…5 remembers, Shift+1…5 returns), kept per map file. */
  const saveCameraBookmark = useCallback(
    (slot: number) => {
      const sess = session.current;
      if (!sess) return;
      const p = sess.camera.position;
      const cam = { pos: [p[0], p[1], p[2]] as [number, number, number], pitch: sess.camera.pitch, yaw: sess.camera.yaw };
      const key = bookmarksKey(currentPath.current);
      let list = parseBookmarks(null);
      try {
        list = parseBookmarks(localStorage.getItem(key));
      } catch {
        /* storage unavailable */
      }
      const next = withBookmark(list, slot, cam);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      setStatusText(tr("{0} сохранена · Shift+{1} - вернуться", [bookmarkText(slot, cam), slot + 1]));
    },
    [setStatusText],
  );
  const goCameraBookmark = useCallback(
    (slot: number) => {
      let list = parseBookmarks(null);
      try {
        list = parseBookmarks(localStorage.getItem(bookmarksKey(currentPath.current)));
      } catch {
        /* storage unavailable */
      }
      const b = list[slot];
      if (!b) {
        setStatusText(tr("закладка {0} не задана: Ctrl+{1} - сохранить текущий вид", [slot + 1, slot + 1]));
        return;
      }
      const sess = session.current;
      if (!sess) return;
      sess.camera.position = new Float32Array(b.pos);
      sess.camera.pitch = Math.max(-89, Math.min(89, b.pitch));
      sess.camera.yaw = b.yaw;
      setStatusText(bookmarkText(slot, b));
    },
    [setStatusText],
  );
  /** Select all visible objects (Ctrl+A) or everything visible that is not selected now (Ctrl+Shift+I). */
  const selectAllVisible = useCallback(
    (invert: boolean) => {
      const map = current.current;
      if (!map) return;
      const hidden = new Set<number>(map.doc.hidden_ids() as Uint32Array);
      const all = [...(map.doc.solid_ids() as Uint32Array), ...map.entities.map((e) => e.id)].filter((id) => !hidden.has(map.doc.entity_of_solid(id) || id));
      const out = invert ? all.filter((id) => !selection.current.has(id)) : all;
      selectIds(out);
      setStatusText(`${invert ? tr("выделение обращено") : tr("выделено всё видимое")}: ${out.length}`);
    },
    [selectIds, setStatusText],
  );
  /** Lock the selection against picking, or unlock everything. */
  const lockSelection = useCallback(
    (lock: boolean) => {
      if (lock) {
        const n = selection.current.size;
        for (const id of selection.current) lockedRef.current.add(id);
        selectIds([]);
        setStatusText(n ? tr("заблокировано от выделения: {0} · всего {1} · Ctrl+Shift+L - снять", [n, lockedRef.current.size]) : tr("выделите объекты, которые нужно заблокировать"));
      } else {
        const n = lockedRef.current.size;
        lockedRef.current.clear();
        setStatusText(n ? tr("блокировка снята: {0}", [n]) : tr("заблокированных объектов нет"));
      }
    },
    [selectIds, setStatusText],
  );
  /** Select with children (Unity's hierarchy): adds every entity parented to the selection through parentname, at any depth. */
  const selectWithChildren = useCallback(() => {
    const map = current.current;
    if (!map || !selection.current.size) return;
    const list = map.entities.map((e) => {
      const d = map.doc.entity_details(e.id) as EntityDetails | undefined;
      const parent = d?.keyvalues.find(([k]) => k.toLowerCase() === "parentname")?.[1] ?? null;
      return { id: e.id, targetname: e.targetname, parent: parent ? parent.split(",")[0].trim() : null };
    });
    const before = selection.current.size;
    // A brush entity is selected through its brushes: its children hang on the entity, and they are selected through theirs.
    const owners = [...selection.current].map((id) => map.doc.entity_of_solid(id) || id);
    const ids = [
      ...new Set([
        ...selection.current,
        ...withChildren(list, owners).flatMap((id) => {
          const solids = Array.from(map.doc.entity_solids(id) as Uint32Array);
          return solids.length ? solids : [id];
        }),
      ]),
    ];
    selectIds(ids);
    setStatusText(ids.length > before ? tr("добавлены дочерние: +{0}", [ids.length - before]) : tr("у выделенных объектов нет дочерних (parentname)"));
  }, [selectIds, setStatusText]);
  /** Unity's select parent: the entities the selection hangs on through parentname; `toRoot` climbs to the top of each chain. */
  const selectParent = useCallback(
    (toRoot: boolean) => {
      const map = current.current;
      if (!map || !selection.current.size) return;
      const list = map.entities.map((e) => {
        const d = map.doc.entity_details(e.id) as EntityDetails | undefined;
        const parent = d?.keyvalues.find(([k]) => k.toLowerCase() === "parentname")?.[1] ?? null;
        return { id: e.id, targetname: e.targetname, parent: parent ? parent.split(",")[0].trim() : null };
      });
      const ids = parentsOf(
        list,
        [...selection.current].map((id) => map.doc.entity_of_solid(id) || id),
        toRoot,
      );
      if (!ids.length) {
        setStatusText(tr("у выделенных объектов нет родителя (parentname пуст или ссылается на несуществующее имя)"));
        return;
      }
      selectIds(
        ids.flatMap((id) => {
          const solids = Array.from(map.doc.entity_solids(id) as Uint32Array);
          return solids.length ? solids : [id];
        }),
      );
      setStatusText(`${toRoot ? tr("корень") : tr("родитель")}: ${ids.map((id) => map.entities.find((e) => e.id === id)?.targetname ?? id).join(", ")}`);
    },
    [selectIds, setStatusText],
  );
  /** Hide or show tool brushes (Hammer++'s tool texture toggle): every brush whose faces are all tools/ materials. */
  const toggleToolBrushes = useCallback(async () => {
    const map = current.current;
    if (!map) return;
    const hidden = new Set<number>(map.doc.hidden_ids() as Uint32Array);
    const tools: number[] = [];
    for (const id of map.doc.solid_ids() as Uint32Array) {
      const sides = map.doc.solid_sides(id) as Uint32Array;
      if (sides.length && [...sides].every((side) => map.doc.face_material(id, side).toLowerCase().startsWith("tools/"))) tools.push(id);
    }
    if (!tools.length) {
      setStatusText(tr("инструментальных брашей нет"));
      return;
    }
    const hide = tools.some((id) => !hidden.has(map.doc.entity_of_solid(id) || id));
    await runEdit(() => map.doc.set_hidden(new Uint32Array(tools), hide, false));
    setStatusText(tr("{0} инструментальных брашей: {1}", [hide ? tr("скрыто") : tr("показано"), tools.length]));
  }, [runEdit, setStatusText]);
  /** Select similar (Blender's Shift+G): brushes sharing a material with the selected ones, entities of the same classes. */
  const selectSimilar = useCallback(() => {
    const map = current.current;
    if (!map || !selection.current.size) return;
    const solidIds = new Set<number>(map.doc.solid_ids() as Uint32Array);
    const hidden = new Set<number>(map.doc.hidden_ids() as Uint32Array);
    const mats = new Set<string>();
    const classes = new Set<string>();
    const labels = new Set<string>();
    for (const id of selection.current) {
      if (solidIds.has(id)) {
        for (const side of map.doc.solid_sides(id) as Uint32Array) mats.add(map.doc.face_material(id, side).toLowerCase());
      } else {
        const e = map.entities.find((x) => x.id === id);
        if (e) {
          classes.add(similarKey(e));
          labels.add(e.model ? (e.model.split("/").pop() ?? e.model).replace(/\.mdl$/i, "") : e.classname);
        }
      }
    }
    const out: number[] = [];
    if (mats.size) {
      for (const id of solidIds) {
        if (hidden.has(map.doc.entity_of_solid(id) || id)) continue;
        for (const side of map.doc.solid_sides(id) as Uint32Array) {
          if (mats.has(map.doc.face_material(id, side).toLowerCase())) {
            out.push(id);
            break;
          }
        }
      }
    }
    if (classes.size) for (const e of map.entities) if (!e.hidden && classes.has(similarKey(e))) out.push(e.id);
    selectIds(out);
    setStatusText(
      tr("похожих: {0}{1}{2}", [
        out.length,
        mats.size
          ? tr(" · текстуры: {0}", [
              [...mats]
                .slice(0, 3)
                .map((m) => m.split("/").pop())
                .join(", "),
            ])
          : "",
        labels.size ? ` · ${[...labels].slice(0, 3).join(", ")}` : "",
      ]),
    );
  }, [selectIds, setStatusText]);

  /** Applies the clipper's line to the selected brushes. */
  const applyClip = useCallback(async () => {
    const map = current.current;
    const line = clipLineRef.current;
    if (!map || !line || !selection.current.size) return;
    const plane = clipPlane(line);
    if (!plane) return;
    const res = await runEdit(() => map.doc.clip(new Uint32Array(selection.current), new Float64Array([...plane.normal, plane.dist]), clipKeepRef.current, materialRef.current));
    if (res) {
      for (const id of res.changed_ids) selection.current.add(id);
      applySelection();
      setClipLine(null);
    }
  }, [applySelection, runEdit, setClipLine]);

  /** Quick cuts: the selection in N equal slices along an axis, through its bounds. */
  const [quickCut, setQuickCut] = useState<{ parts: number; axis: "x" | "y" | "z" }>({ parts: 2, axis: "x" });
  const quickCutSelection = useCallback(async () => {
    const map = current.current;
    const b = selectionBoundsRef.current();
    if (!map || !b || !selection.current.size) return;
    const ax = quickCut.axis === "x" ? 0 : quickCut.axis === "y" ? 1 : 2;
    const size = b[1][ax] - b[0][ax];
    if (size < 2) return;
    const normal: Vec3 = [0, 0, 0];
    normal[ax] = 1;
    for (let k = 1; k < quickCut.parts; k++) {
      const dist = b[0][ax] + (size * k) / quickCut.parts;
      const res = await runEdit(() => map.doc.clip(new Uint32Array(selection.current), new Float64Array([...normal, dist]), 0, materialRef.current));
      if (res) for (const id of res.changed_ids) selection.current.add(id);
    }
    applySelection();
    setStatusText(tr("разрезано на {0} частей по {1}", [quickCut.parts, quickCut.axis.toUpperCase()]));
  }, [applySelection, quickCut, runEdit]);

  const setCordonActive = useCallback(
    (active: boolean) => {
      const c = cordonRef.current;
      if (!c) return;
      void runEdit(() => current.current?.doc.set_cordon(new Float64Array([...c.box[0], ...c.box[1]]), active));
    },
    [runEdit],
  );

  const removeCordon = useCallback(() => runEdit(() => current.current?.doc.set_cordon(new Float64Array(0), false)), [runEdit]);

  const groupSelection = useCallback(() => runEdit(() => current.current?.doc.group_objects(new Uint32Array(selection.current))), [runEdit]);

  const ungroupSelection = useCallback(() => runEdit(() => current.current?.doc.ungroup_objects(new Uint32Array(selection.current))), [runEdit]);

  /** Carves everything the selected brushes overlap; the selection stays. */
  const carveSelection = useCallback(async () => {
    const res = await runEdit(() => current.current?.doc.carve(new Uint32Array(selection.current)));
    if (!res) setError(tr("Нечего вырезать: выделенные браши не пересекают другие браши"));
  }, [runEdit]);

  const [hollowThickness, setHollowThickness] = useState(16);

  /** Turns the selected brushes into walls; all pieces end up selected. */
  const hollowSelection = useCallback(async () => {
    const res = await runEdit(() => current.current?.doc.hollow(new Uint32Array(selection.current), hollowThickness));
    if (res) {
      for (const id of res.changed_ids) selection.current.add(id);
      applySelection();
    } else setError(tr("Не удалось сделать браш полым: стенки толще браша или браш некорректен"));
  }, [applySelection, hollowThickness, runEdit]);

  /** Deletes the selection; from the keyboard or a menu (`confirmBig`) a large or whole-map delete asks first. */
  const deleteSelection = useCallback(
    async (confirmBig = false) => {
      const map = current.current;
      if (!map || !selection.current.size) return;
      const n = selection.current.size;
      const total = map.stats.solids + map.entities.length;
      if (confirmBig && (n >= 50 || (n >= 10 && n >= total * 0.8))) {
        const answer = await ask({
          title: tr("Удалить {0} объектов?", [n]),
          text: n >= total * 0.8 ? tr("Выделена почти вся карта. Действие можно отменить (Ctrl+Z), но проверьте, не выделено ли лишнее.") : tr("Действие можно отменить (Ctrl+Z)."),
          buttons: [
            { label: tr("Удалить"), kind: "danger", value: "yes" },
            { label: tr("Отмена"), value: "no" },
          ],
        });
        if (answer !== "yes") return;
      }
      const res = map.doc.delete_objects(new Uint32Array(selection.current)) as EditResult | undefined;
      if (res) {
        selection.current.clear();
        await applyEdit();
      }
    },
    [applyEdit, ask],
  );

  const createPendingBlockInner = useCallback(async () => {
    const map = current.current;
    const box = pendingBox.current;
    if (!map || !box) return;
    const [lo, hi] = box;
    const shape = shapeRef.current;
    const { sides, wall, arc } = primRef.current;
    const bounds = new Float64Array([...lo, ...hi]);
    const res = (
      shape === "block"
        ? map.doc.create_block(bounds, materialRef.current)
        : map.doc.create_primitive(shape, bounds, pendingAxis.current, new Float64Array([sides, wall, arc, 0, 0]), materialRef.current)
    ) as EditResult | undefined;
    setPendingBox(null);
    if (res) {
      lastBlockExtent.current = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
      selection.current = new Set(res.changed_ids);
      setHandleMode("move");
      await applyEdit();
    } else setError(tr("Примитив не создан: рамка слишком мала или стенка арки толще радиуса"));
  }, [applyEdit, setPendingBox]);

  /** Hammer's Tie to Entity: the selected brushes become (or join) a brush entity. */
  const tieSelection = useCallback(
    async (classname?: string) => {
      const map = current.current;
      if (!map || !selection.current.size) return;
      const cls = (classname ?? tieClassRef.current).trim();
      if (!cls) return;
      const defaults = inTauri ? await api.entityDefaults(cls) : [];
      let info = classInfos.current.get(cls);
      if (!info && inTauri) {
        const [c] = await api.entityClasses([cls]);
        if (c) classInfos.current.set(cls, (info = c));
      }
      // A rotating door gets its hinge at the edge right away (the core puts origin in the middle, where it spins like a turnstile).
      const doorBox = cls.toLowerCase() === "func_door_rotating" ? selectionBoundsRef.current() : null;
      const res = map.doc.tie_to_entity(new Uint32Array(selection.current), cls, defaults, new Uint8Array(info?.color ?? [220, 30, 220])) as EditResult | undefined;
      if (res && doorBox) {
        // The new entity is among the changed ids, either itself or as the owner of its brushes.
        const owner =
          Array.from(res.changed_ids)
            .map((id) => (map.doc.kind_of(id) === "entity" ? id : map.doc.entity_of_solid(id)))
            .find((id) => id) ?? 0;
        const hinge = edgeHinge(doorBox as [Vec3, Vec3])
          .map((v) => Math.round(v))
          .join(" ");
        if (owner && map.doc.set_entity_keyvalues(owner, [["origin", hinge]])) map.doc.merge_undo(2, tr("Сделать энтити: func_door_rotating с петлёй у края"));
      }
      if (res) {
        // The brushes stay selected (the entity itself has no pickable object).
        selection.current = new Set(res.changed_ids);
        setHandleMode("move");
        await applyEdit();
      } else setError(tr("Нечего привязывать: выделите браши мира"));
    },
    [applyEdit],
  );

  /** Hammer's Move to World: selected brush entities dissolve into world brushes. */
  const moveToWorld = useCallback(async () => {
    const map = current.current;
    if (!map || !selection.current.size) return;
    const res = map.doc.move_to_world(new Uint32Array(selection.current)) as EditResult | undefined;
    if (res) {
      selection.current = new Set(res.changed_ids);
      setHandleMode("move");
      await applyEdit();
    } else setError(tr("В выделении нет брашевых энтити"));
  }, [applyEdit]);

  /**
   * Hammer's Collapse Instance on every selected func_instance: its VMF is
   * pasted at its place with Hammer's name fixup and `$parameter` values.
   */
  const collapseInstances = useCallback(async () => {
    const map = current.current;
    if (!map) return;
    let auto = 0;
    let done = 0;
    for (const id of Array.from(selection.current)) {
      const e = map.pointEntities.find((p) => p.id === id);
      if (!e?.instance_file) continue;
      const d = map.doc.entity_details(id) as EntityDetails | undefined;
      if (!d) continue;
      const kv = (k: string) => d.keyvalues.find(([key]) => key.toLowerCase() === k)?.[1] ?? "";
      const style = Number(kv("fixup_style") || 0);
      const name = kv("targetname") || `InstanceAuto${++auto}`;
      const prefix = style === 2 ? "" : `${name}-`;
      const replacements: [string, string][] = [];
      for (let i = 1; i <= 10; i++) {
        const r = kv(`replace${String(i).padStart(2, "0")}`);
        const sp = r.indexOf(" ");
        if (r.startsWith("$") && sp > 0) replacements.push([r.slice(0, sp), r.slice(sp + 1)]);
      }
      try {
        const text = await api.readTextFile(instancePath(e.instance_file));
        const res = map.doc.collapse_instance(id, text, prefix, replacements) as EditResult | undefined;
        if (res) done++;
      } catch (err) {
        setError(tr("Инстанс {0}: {1}", [e.instance_file, String(err)]));
      }
    }
    if (done) {
      selection.current.clear();
      setStatusText(tr("развёрнуто инстансов: {0}", [done]));
      await applyEdit();
    } else setError(tr("В выделении нет func_instance"));
  }, [applyEdit, instancePath]);

  /** In-app clipboard: the last copied VMF snippet (the system clipboard gets it too). */
  const clipboardRef = useRef("");

  /** Ctrl+C: the selection as a VMF snippet, kept in-app and in the system clipboard. */
  const copySelection = useCallback(() => {
    const map = current.current;
    if (!map || !selection.current.size) return;
    const text = map.doc.export_objects(new Uint32Array(selection.current));
    clipboardRef.current = text;
    void navigator.clipboard?.writeText(text).catch(() => {});
    setStatusText(tr("скопировано: {0} объектов", [selection.current.size]));
  }, []);

  /** Ctrl+V: pastes the in-app snippet, or VMF text from the system clipboard, in place. */
  const pasteClipboard = useCallback(async () => {
    const map = current.current;
    if (!map) return;
    let text = clipboardRef.current;
    if (!text) text = (await navigator.clipboard?.readText().catch(() => "")) ?? "";
    if (!text.includes("world")) return;
    const res = map.doc.paste_vmf(text, new Float64Array([0, 0, 0])) as EditResult | undefined;
    if (res) {
      selection.current = new Set(selectableIds(map, res.changed_ids));
      setHandleMode("move");
      await applyEdit();
    } else setError(tr("В буфере нет объектов VMF"));
  }, [applyEdit]);

  /** Re-reads the prefab library folder. */
  const refreshPrefabs = useCallback(async () => {
    if (!inTauri) return;
    try {
      if (!prefabDir) setPrefabDir(await api.prefabDir());
      setPrefabs(await api.listPrefabs());
    } catch (err) {
      setError(String(err));
    }
  }, [prefabDir]);

  /** Saves the selection as `<name>.vmf` in the library. */
  const savePrefab = useCallback(
    async (name: string) => {
      const map = current.current;
      if (!map || !selection.current.size || !inTauri) return;
      try {
        const dir = prefabDir || (await api.prefabDir());
        const sep = dir.includes("\\") ? "\\" : "/";
        await api.writeTextFile(`${dir}${sep}${name}.vmf`, map.doc.export_objects(new Uint32Array(selection.current)));
        setStatusText(tr("префаб «{0}»: {1} объектов", [name, selection.current.size]));
        await refreshPrefabs();
      } catch (err) {
        setError(String(err));
      }
    },
    [prefabDir, refreshPrefabs],
  );

  /**
   * Inserts a prefab in front of the 3D camera (its centre 256 units ahead,
   * on the grid) and selects it, ready to be moved.
   */
  const insertPrefab = useCallback(
    async (p: PrefabInfo, at?: Vec3) => {
      const map = current.current;
      const s = session.current;
      if (!map || !s) return;
      try {
        const text = await api.readTextFile(p.path);
        const snippet = await loadMap(text);
        const b = snippet.stats.bounds;
        snippet.doc.free();
        const f = s.camera.forward();
        const g = gridRef.current || 1;
        const target: Vec3 = (at ?? [0, 1, 2].map((k) => s.camera.position[k] + f[k] * 256)).map((v) => Math.round(v / g) * g) as Vec3;
        const centre: Vec3 = b ? [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2] : [0, 0, 0];
        const delta: Vec3 = [0, 1, 2].map((k) => Math.round((target[k] - centre[k]) / g) * g) as Vec3;
        const res = map.doc.paste_vmf(text, new Float64Array(delta)) as EditResult | undefined;
        if (res) {
          selection.current = new Set(selectableIds(map, res.changed_ids));
          setHandleMode("move");
          setStatusText(tr("префаб «{0}»: {1} объектов", [p.name, res.changed_ids.length]));
          await applyEdit();
        } else setError(tr("В префабе «{0}» нет объектов", [p.name]));
      } catch (err) {
        setError(String(err));
      }
    },
    [applyEdit],
  );

  useEffect(() => {
    if ((panel === "prefabs" || SATELLITE_PANEL === "prefabs") && prefabs === null) void refreshPrefabs();
    // refreshHistory is declared further down; the ref always holds the latest one.
    if (panel === "history" && historyEntries === null) void refreshHistoryRef.current();
  }, [panel, prefabs, refreshPrefabs, historyEntries]);

  /** Duplicates the selection shifted by `delta` and selects the copies. */
  const cloneSelection = useCallback(
    async (delta: Vec3) => {
      const map = current.current;
      if (!map || !selection.current.size) return;
      const res = map.doc.clone_objects(new Uint32Array(selection.current), new Float64Array(delta)) as EditResult | undefined;
      if (res) {
        if (delta[0] !== 0 || delta[1] !== 0 || delta[2] !== 0) lastMoveRef.current = [delta[0], delta[1], delta[2]];
        selection.current = new Set(selectableIds(map, res.changed_ids));
        await applyEdit();
      }
    },
    [applyEdit],
  );

  /**
   * Duplicate with fresh names (Hammer's Paste Special with unique names, without the prefix
   * dialog): the copy's named entities step to the next free name in their series, and outputs and
   * name keys inside the copy follow, so a copied door with its button works on its own. One undo step.
   */
  const duplicateUnique = useCallback(async () => {
    const map = current.current;
    if (!map || !selection.current.size) return;
    const res = map.doc.clone_objects(new Uint32Array(selection.current), new Float64Array([0, 0, 0])) as EditResult | undefined;
    if (!res) return;
    // The new objects straight from the clone: a copied brush entity comes back as itself and its brushes.
    const copies = [...new Set(res.changed_ids.map((id) => map.doc.entity_of_solid(id) || id))].filter((id) => map.doc.kind_of(id) === "entity");
    const named = copies.map((id) => [id, (map.doc.entity_details(id) as EntityDetails | undefined)?.keyvalues.find(([k]) => k.toLowerCase() === "targetname")?.[1] ?? ""] as const);
    const renames = freshNames(named.map(([, n]) => n).filter(Boolean), new Set(map.entities.map((e) => e.targetname ?? "").filter(Boolean)));
    let steps = 0;
    for (const [id, name] of named) {
      const d = map.doc.entity_details(id) as EntityDetails | undefined;
      if (!d) continue;
      const next = name ? renames.get(name) : undefined;
      const keys: [string, string][] = [...(next ? ([["targetname", next]] as [string, string][]) : []), ...retargetKeys(d.keyvalues, renames)];
      if (keys.length && map.doc.set_entity_keyvalues(id, keys)) steps++;
      const conns = retargetConnections(d.connections, renames);
      if (conns && map.doc.set_entity_connections(id, conns)) steps++;
    }
    if (steps) map.doc.merge_undo(steps + 1, tr("Дублировать с новыми именами: {0}", [copies.length]));
    await applyEdit();
    selectIds(res.changed_ids.filter((id) => map.doc.kind_of(id) === "solid" || !(map.doc.entity_solids(id) as Uint32Array).length));
    setStatusText(
      renames.size
        ? tr("копия с новыми именами: {0}{1}", [
            [...renames]
              .map(([a, b]) => `${a} → ${b}`)
              .slice(0, 3)
              .join(", "),
            renames.size > 3 ? "…" : "",
          ])
        : tr("копия создана на месте (без имён)"),
    );
  }, [applyEdit, selectIds, setStatusText]);
  /** Repeat the last move as a copy (Blender's Shift+R): duplicate the selection and shift the copy by the last move. */
  const repeatMoveCopy = useCallback(async () => {
    const d = lastMoveRef.current;
    if (!d) {
      setStatusText(tr("сначала сдвиньте выделение или скопируйте его перетаскиванием с Shift - шаг будет сохранён"));
      return;
    }
    await cloneSelection(d);
    setStatusText(tr("копия со сдвигом {0} · повторить - следующая копия", [d.map((v) => Math.round(v)).join(" ")]));
  }, [cloneSelection, setStatusText]);

  /**
   * Paste Special: `count` copies of the selection, copy i shifted by
   * i·offset and turned by i·yaw about its own centre; the copies end up selected.
   */
  const arraySelection = useCallback(
    async (o: ArrayOptions) => {
      const map = current.current;
      if (!map || !selection.current.size) return;
      const original = Array.from(selection.current);
      const made: number[] = [];
      setBusy(tr("Размножение…"));
      try {
        // A ring: copies in place, each turned about the ring's centre.
        const box = o.ring ? selectionBoundsRef.current() : null;
        if (o.ring && box) {
          const plan = ringPlan([(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2, (box[0][2] + box[1][2]) / 2], o.ring, o.count);
          for (const angle of plan.angles) {
            const res = map.doc.clone_objects(new Uint32Array(original), new Float64Array([0, 0, 0])) as EditResult | undefined;
            if (!res) break;
            const ids = Array.from(res.changed_ids);
            made.push(...ids);
            map.doc.rotate(new Uint32Array(ids), new Float64Array(plan.pivot), new Float64Array([0, 0, 1]), angle, textureLockRef.current);
          }
        }
        for (let i = 1; i <= (o.ring ? 0 : o.count); i++) {
          const delta: Vec3 = [o.offset[0] * i, o.offset[1] * i, o.offset[2] * i];
          const res = map.doc.clone_objects(new Uint32Array(original), new Float64Array(delta)) as EditResult | undefined;
          if (!res) break;
          const ids = Array.from(res.changed_ids);
          made.push(...ids);
          if (o.yaw) {
            selection.current = new Set(ids);
            const b = selectionBoundsRef.current();
            if (b) {
              const pivot: Vec3 = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2];
              map.doc.rotate(new Uint32Array(ids), new Float64Array(pivot), new Float64Array([0, 0, 1]), o.yaw * i, textureLockRef.current);
            }
          }
        }
      } finally {
        setBusy("");
      }
      selection.current = new Set(made.length ? made : original);
      setStatusText(
        o.ring
          ? tr("по кругу радиусом {0}: {1} копий через {2}°", [o.ring, o.count, Math.round((360 / (o.count + 1)) * 10) / 10])
          : tr("создано копий: {0} × {1} объектов", [o.count, original.length]),
      );
      await applyEdit();
    },
    [applyEdit],
  );

  const setPaint = useCallback((p: PaintSettings) => {
    paintRef.current = p;
    setPaintState(p);
  }, []);

  // ---- The landscape brush (phase 8): sculpting displacements across seams.
  const [landscape, setLandscapeState] = useState<LandscapeSettings>({ mode: "raise", radius: 192, amount: 24, axis: 1, scale: 256, seed: 1 });
  const landscapeRef = useRef<LandscapeSettings>({ mode: "raise", radius: 192, amount: 24, axis: 1, scale: 256, seed: 1 });
  // The prop brush of the entity tool.
  // The mirror plane; the overlay in the views follows the settings.
  const [symmetry, setSymmetryState] = useState<SymmetrySettings>(DEFAULT_SYMMETRY);
  const symmetryRef = useRef<SymmetrySettings>(DEFAULT_SYMMETRY);
  const showSymmetry = useCallback(() => {
    const r = session.current?.renderer;
    const sy = symmetryRef.current;
    r?.setOverlay("symmetry", sy.on ? symmetryOverlay(sy) : null, [0.3, 0.85, 1]);
  }, []);
  const setSymmetry = useCallback(
    (patch: Partial<SymmetrySettings>) => {
      const next = { ...symmetryRef.current, ...patch };
      symmetryRef.current = next;
      setSymmetryState(next);
      showSymmetry();
    },
    [showSymmetry],
  );
  const [scatter, setScatterState] = useState<ScatterSettings>(DEFAULT_SCATTER);
  const scatterRef = useRef<ScatterSettings>(DEFAULT_SCATTER);
  const setScatter = useCallback((patch: Partial<ScatterSettings>) => {
    const next = { ...scatterRef.current, ...patch };
    scatterRef.current = next;
    setScatterState(next);
  }, []);
  const setLandscape = useCallback((patch: Partial<LandscapeSettings>) => {
    const next = { ...landscapeRef.current, ...patch };
    landscapeRef.current = next;
    setLandscapeState(next);
  }, []);
  /** A brush stroke in progress: where it last dabbed, whether Ctrl lowers, the height Flatten aims at. */
  const sculpting = useRef<{ last: Vec3; lower: boolean; height: number } | null>(null);
  /** Where the cursor's ray meets the map, with the face it hit and whether that face is a displacement. */
  /** Folds the last `count` edits into one undo step with `label` (a brush stroke, a row). */
  const mergeUndo = useCallback((count: number, label: string) => {
    const map = current.current;
    if (!map || count < 2) return;
    if (map.doc.merge_undo(count, label)) setHist(history(map));
  }, []);
  /**
   * Clones `ids` across the mirror plane and flips the copies; the copies end
   * up selected when `select`. `extraSteps` earlier undo steps (the creation
   * of the originals, say) fold into the same undo step.
   */
  const mirrorIds = useCallback(
    async (ids: number[], label: string, extraSteps = 0, select = true): Promise<number[]> => {
      const map = current.current;
      const sy = symmetryRef.current;
      if (!map || !ids.length) return [];
      const cloned = map.doc.clone_objects(new Uint32Array(ids), new Float64Array([0, 0, 0])) as EditResult | undefined;
      if (!cloned) return [];
      const copies = Array.from(cloned.changed_ids);
      const flipped = map.doc.scale(new Uint32Array(copies), new Float64Array(mirrorPivot(sy)), new Float64Array(mirrorFactors(sy)), textureLockRef.current, false) as EditResult | undefined;
      if (!flipped) {
        map.doc.undo();
        await applyEdit();
        setError(tr("Отражение отменено: браш стал бы вырожденным"));
        return [];
      }
      mergeUndo(2 + extraSteps, label);
      if (select) selection.current = new Set([...ids, ...copies]);
      await applyEdit();
      return copies;
    },
    [applyEdit, mergeUndo],
  );
  /** Отразить: the selection gets its mirror twins across the plane (Ctrl+M). */
  const mirrorSelection = useCallback(async () => {
    const ids = Array.from(selection.current);
    if (!ids.length) return;
    const copies = await mirrorIds(ids, tr("Отразить {0}", [ids.length === 1 ? tr("объект") : tr("{0} объектов", [ids.length])]));
    if (copies.length) setStatusText(tr("отражено: {0}, плоскость {1} = {2}", [copies.length, ["X", "Y", "Z"][symmetryRef.current.axis], symmetryRef.current.pos]));
  }, [mirrorIds]);
  const landscapeHit = useCallback((css: [number, number], w: number, h: number): LandscapeHit | null => {
    const s = session.current;
    const map = current.current;
    if (!s || !map) return null;
    const ray = mouseRay(s.camera.viewProjection(w / h), s.camera.position, css, w, h);
    const hit = hitMeshNear(map.mesh, ray.origin, ray.dir, 1e6);
    if (!hit) return null;
    const info = pickInfo(map, hit.face);
    if (!info || info.kind !== "face") return null;
    const fi = map.doc.face_info(info.solidId, info.sideId) as FaceInfo | undefined;
    return { point: hit.point, normal: hit.normal, solidId: info.solidId, sideId: info.sideId, disp: !!fi && fi.disp_power > 0 };
  }, []);
  /** The brush circle on the surface under the cursor (null hides it). */
  const showBrush = useCallback((point: Vec3 | null, normal: Vec3 = [0, 0, 1]) => {
    const s = session.current;
    if (!s) return;
    if (!point) {
      s.renderer.setOverlay("brush", null, [0, 0, 0]);
      return;
    }
    const r = landscapeRef.current.radius;
    const n = normal;
    // Two tangents of the surface.
    const helper: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u: Vec3 = [n[1] * helper[2] - n[2] * helper[1], n[2] * helper[0] - n[0] * helper[2], n[0] * helper[1] - n[1] * helper[0]];
    const ul = Math.hypot(u[0], u[1], u[2]) || 1;
    u[0] /= ul;
    u[1] /= ul;
    u[2] /= ul;
    const v: Vec3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const segs = 48;
    const out = new Float32Array(segs * 2 * 3);
    const lift = 1.5;
    for (let i = 0; i < segs; i++) {
      for (let k = 0; k < 2; k++) {
        const a = ((i + k) / segs) * Math.PI * 2;
        const c = Math.cos(a) * r;
        const d = Math.sin(a) * r;
        const o = (i * 2 + k) * 3;
        out[o] = point[0] + u[0] * c + v[0] * d + n[0] * lift;
        out[o + 1] = point[1] + u[1] * c + v[1] * d + n[1] * lift;
        out[o + 2] = point[2] + u[2] * c + v[2] * d + n[2] * lift;
      }
    }
    const m = landscapeRef.current.mode;
    s.renderer.setOverlay("brush", out, m === "alpha" ? [1, 0.8, 0.3] : m === "smooth" ? [0.5, 0.8, 1] : [0.45, 1, 0.55], "3d");
  }, []);
  /** One dab of the brush at `at`; `merge` continues the stroke's undo step. */
  const sculptAt = useCallback(
    async (at: Vec3, lower: boolean, merge: boolean, height: number, face: { solidId: number; sideId: number } | null) => {
      const map = current.current;
      if (!map) return;
      const l = landscapeRef.current;
      let res: EditResult | undefined;
      if (l.mode === "alpha") {
        if (!face) return;
        res = map.doc.paint_alpha(face.solidId, face.sideId, new Float64Array(at), l.radius, lower ? 0 : Math.max(0, Math.min(255, l.amount * 8)), merge) as EditResult | undefined;
      } else {
        const amount = l.mode === "raise" || l.mode === "noise" ? (lower ? -l.amount : l.amount) : l.amount;
        res = map.doc.sculpt_displacements(new Float64Array(at), l.radius, amount, l.mode, l.axis, height, l.seed, l.scale, merge) as EditResult | undefined;
      }
      if (res) await applyEdit();
    },
    [applyEdit],
  );
  /** A spot on the ground in front of the 3D camera, on the 64 grid. */
  const suggestLandscapeOrigin = useCallback((): Vec3 => {
    const s = session.current;
    if (!s) return [0, 0, 0];
    const f = s.camera.forward();
    const p = s.camera.position;
    const g = 64;
    return [Math.round((p[0] + f[0] * 768) / g) * g, Math.round((p[1] + f[1] * 768) / g) * g, Math.round((p[2] - 192) / g) * g];
  }, []);
  /** The wizard's result: the grid of floors, selected, with the brush tool ready. */
  const createLandscape = useCallback(
    async (o: LandscapeOptions) => {
      const map = current.current;
      if (!map) return;
      const res = map.doc.create_landscape(new Float64Array(o.origin), new Float64Array([o.width, o.length, o.thickness]), o.nx, o.ny, o.power, o.material) as EditResult | undefined;
      if (!res) {
        setError(tr("Ландшафт не создан: проверьте размеры"));
        return;
      }
      await applyEdit();
      selectIds(res.changed_ids);
      setPanel("none");
      setTool("landscape");
      setStatusText(tr("ландшафт: {0} секций · ЛКМ - поднять, Ctrl+ЛКМ - опустить, колесо - радиус кисти", [res.changed_ids.length]));
    },
    [applyEdit, selectIds, setPanel, setTool],
  );
  // The wheel over the 3D view sizes the brush while the landscape tool is on.
  useEffect(() => {
    const s = session.current;
    if (!s) return;
    s.camera.wheelHook =
      tool === "landscape"
        ? (e) => {
            const l = landscapeRef.current;
            const up = e.deltaY < 0;
            if (e.shiftKey) setLandscape({ amount: Math.max(1, Math.min(512, Math.round(l.amount * (up ? 1.25 : 0.8)))) });
            else setLandscape({ radius: Math.max(16, Math.min(4096, Math.round(l.radius * (up ? 1.2 : 0.8333)))) });
            return true;
          }
        : null;
    if (tool !== "landscape") s.renderer.setOverlay("brush", null, [0, 0, 0]);
  }, [tool, setLandscape]);

  /** Displacement "Create" on the picked faces (quads only). */
  const createDisplacement = useCallback(
    async (power: number) => {
      const map = current.current;
      const list = Array.from(faceSel.current.values());
      if (!map || !list.length) return;
      const res = map.doc.create_displacements(new Uint32Array(list.flat()), power) as EditResult | undefined;
      if (res) await applyEdit();
      else setError(tr("Дисплейсмент не создан: нужна четырёхугольная грань без дисплейсмента"));
    },
    [applyEdit],
  );

  const sewDisplacements = useCallback(async () => {
    const map = current.current;
    if (!map || !selection.current.size) return;
    const res = map.doc.sew_displacements(new Uint32Array(selection.current)) as EditResult | undefined;
    if (res) {
      setStatusText(res.label);
      await applyEdit();
    } else setError(tr("Нечего сшивать: нужны два дисплейсмента с общим ребром среди выделенных брашей"));
  }, [applyEdit]);

  const removeDisplacement = useCallback(async () => {
    const map = current.current;
    const list = Array.from(faceSel.current.values());
    if (!map || !list.length) return;
    const res = map.doc.remove_displacements(new Uint32Array(list.flat())) as EditResult | undefined;
    if (res) await applyEdit();
  }, [applyEdit]);

  /** Invert or subdivide the displacements of the picked faces. */
  const displacementOp = useCallback(
    async (op: "invert" | "subdivide") => {
      const map = current.current;
      const list = Array.from(faceSel.current.values());
      if (!map || !list.length) return;
      const faces = new Uint32Array(list.flat());
      const res = (op === "invert" ? map.doc.invert_displacements(faces) : map.doc.subdivide_displacements(faces)) as EditResult | undefined;
      if (res) {
        await applyEdit();
        refreshFaces();
      } else setStatusText(op === "subdivide" ? tr("уже power 4 или нет дисплейсмента") : tr("дисплейсмент плоский"));
    },
    [applyEdit, refreshFaces],
  );

  /** One dab of the sculpt brush at a 3D hit point; `merge` continues the stroke. */
  const paintAt = useCallback(
    async (solid: number, side: number, at: Vec3, lower: boolean, merge: boolean) => {
      const map = current.current;
      if (!map) return;
      const p = paintRef.current;
      const res = (
        p.mode === "alpha"
          ? map.doc.paint_alpha(solid, side, new Float64Array(at), p.radius, lower ? 0 : Math.max(0, Math.min(255, p.amount)), merge)
          : p.mode === "smooth"
            ? map.doc.paint_displacement(solid, side, new Float64Array(at), p.radius, p.amount, 2, merge)
            : map.doc.paint_displacement(solid, side, new Float64Array(at), p.radius, lower ? -p.amount : p.amount, p.axis, merge)
      ) as EditResult | undefined;
      if (res) await applyEdit();
    },
    [applyEdit],
  );

  /** Where the cursor's ray meets the rendered face `pickId`, or null. */
  const faceHit = useCallback((css: [number, number], w: number, h: number, pickId: number): Vec3 | null => {
    const s = session.current;
    const map = current.current;
    if (!s || !map) return null;
    const ray = mouseRay(s.camera.viewProjection(w / h), s.camera.position, css, w, h);
    return hitFace(map.mesh, pickId, ray.origin, ray.dir);
  }, []);

  /** Face-edit sheet: applies one edit to every picked face. */
  const editFaces = useCallback(
    async (edit: FaceEdit) => {
      const map = current.current;
      const list = Array.from(faceSel.current.values());
      if (!map || !list.length) return;
      const first = map.doc.face_info(list[0][0], list[0][1]) as FaceInfo | undefined;
      const mi = first ? (materialInfos.current.get(first.material) ?? materialInfos.current.get(first.material.toLowerCase())) : undefined;
      const full: FaceEdit = { tex_w: mi?.width || 512, tex_h: mi?.height || 512, ...edit };
      const res = map.doc.edit_faces(new Uint32Array(list.flat()), full) as EditResult | undefined;
      if (res) await applyEdit();
    },
    [applyEdit],
  );

  /** Map Properties: worldspawn keys shown through the entity properties sheet. */
  const refreshWorld = useCallback(() => {
    const map = current.current;
    if (!map) {
      setWorldDetails(null);
      return;
    }
    const kv = map.doc.world_keyvalues() as [string, string][];
    setWorldDetails({ id: 0, classname: "worldspawn", keyvalues: kv.filter(([k]) => k.toLowerCase() !== "classname"), connections: [], brush: true });
    void classDefFor("worldspawn").then(setWorldDef);
  }, [classDefFor]);

  const setWorldKeys = useCallback(
    async (changes: [string, string | null][]) => {
      const map = current.current;
      if (!map) return;
      const res = map.doc.set_world_keyvalues(changes) as EditResult | undefined;
      if (res) {
        await applyEdit();
        refreshWorld();
      }
    },
    [applyEdit, refreshWorld],
  );

  /** Replace Textures over the selection or the whole map. */
  const replaceTextures = useCallback(
    async (find: string, replace: string, scope: "selection" | "map", substring: boolean) => {
      const map = current.current;
      if (!map) return;
      const ids = scope === "selection" ? new Uint32Array(selection.current) : new Uint32Array(0);
      const res = map.doc.replace_material(find, replace, ids, substring) as EditResult | undefined;
      if (res) {
        setStatusText(res.label);
        await applyEdit();
      } else setError(tr("Материал «{0}» не найден", [find]));
    },
    [applyEdit],
  );

  /** Entity report: substring replace in one key over the listed entities, one undo step each. */
  const replaceEntityKeys = useCallback(
    async (ids: number[], key: string, find: string, replace: string) => {
      const map = current.current;
      if (!map || !ids.length) return;
      let changed = 0;
      for (const id of ids) {
        const d = map.doc.entity_details(id) as EntityDetails | undefined;
        if (!d) continue;
        const kv = key.toLowerCase() === "classname" ? ["classname", d.classname] : d.keyvalues.find(([k]) => k.toLowerCase() === key.toLowerCase());
        if (!kv || !kv[1].includes(find)) continue;
        const res = map.doc.set_entity_keyvalues(id, [[kv[0], kv[1].split(find).join(replace)]]) as EditResult | undefined;
        if (res) changed++;
      }
      setStatusText(tr("заменено у {0} энтити", [changed]));
      if (changed) await applyEdit();
    },
    [applyEdit],
  );

  /** Frames the selection in the 3D camera and every 2D view. */
  const focusSelection = useCallback(() => {
    const s = session.current;
    const bounds = selectionBoundsRef.current();
    if (!s || !bounds) return;
    s.camera.frame(bounds[0], bounds[1]);
    for (const kind of VIEW_KINDS) {
      const v = s.views[kind];
      const c = canvas2dRefs.current[kind];
      if (v && c) v.camera.frame(bounds[0], bounds[1], c.clientWidth, c.clientHeight);
    }
  }, []);

  /** Selects an object by VMF id: a brush, a point entity, or a brush entity through its brushes. */
  const selectObject = useCallback(
    (id: number) => {
      const map = current.current;
      if (!map) return;
      const kind = map.doc.kind_of(id);
      const solids = kind === "entity" ? Array.from(map.doc.entity_solids(id)) : [];
      selectIds(solids.length ? solids : [id]);
      focusSelection();
    },
    [focusSelection, selectIds],
  );

  /** Centres every view on a place (Go to Coordinates). */
  const goToPoint = useCallback((p: Vec3) => {
    const s = session.current;
    if (!s) return;
    const lo: Vec3 = [p[0] - 64, p[1] - 64, p[2] - 64];
    const hi: Vec3 = [p[0] + 64, p[1] + 64, p[2] + 64];
    s.camera.frame(lo, hi);
    for (const kind of VIEW_KINDS) {
      const v = s.views[kind];
      const c = canvas2dRefs.current[kind];
      if (v && c) v.camera.frame(lo, hi, c.clientWidth, c.clientHeight);
    }
    setStatusText(tr("камера: {0}", [p.map((v) => Math.round(v)).join(" ")]));
  }, []);

  /** Follows a reference from the compile log: a brush id, an entity index or a place. */
  const goToRef = useCallback(
    (ref: LogRef) => {
      const map = current.current;
      if (!map) return;
      if (ref.kind === "point") goToPoint(ref.pos);
      else if (ref.kind === "brush") {
        if (map.doc.kind_of(ref.id)) selectObject(ref.id);
        else setError(tr("Объекта с id {0} нет на карте", [ref.id]));
      } else {
        // VBSP counts entities from worldspawn (0) in file order.
        const e = map.entities[ref.index - 1];
        if (ref.index > 0 && e) selectObject(e.id);
        else setError(tr("Энтити №{0} нет на карте", [ref.index]));
      }
    },
    [goToPoint, selectObject],
  );

  /** Shows VBSP's pointfile (the leak path) as a red line, or clears it. */
  const showLeak = useCallback((positions: Float32Array | null) => {
    const s = session.current;
    if (!s) return;
    s.renderer.setOverlay("leak", positions && positions.length ? positions : null, [1, 0.1, 0.1]);
    setLeakPoints(positions ? positions.length / 6 + 1 : 0);
  }, []);

  /** Draws or hides the portal outlines. */
  const showPortals = useCallback((on: boolean) => {
    const s = session.current;
    if (!s) return;
    s.renderer.setOverlay("portals", on && portalSegs.current?.length ? portalSegs.current : null, [0.35, 0.85, 1]);
    setPortalsShown(on && !!portalSegs.current?.length);
  }, []);

  /** Reads `<map>.prt` next to the VMF after a VVIS run; returns the portal count. */
  const loadPortalfile = useCallback(async () => {
    const path = currentPath.current;
    if (!path) return 0;
    try {
      const { segments, portals } = parsePortalfile(await api.readTextFile(path.replace(/\.vmf$/i, ".prt")));
      portalSegs.current = portals ? segments : null;
      setPortalCount(portals);
      showPortals(portals > 0 && portalsShownRef.current);
      return portals;
    } catch (err) {
      portalSegs.current = null;
      setPortalCount(0);
      void api.log(`portalfile: ${String(err)}`);
      return 0;
    }
  }, [showPortals]);
  const portalsShownRef = useRef(false);
  /** Visleaves of the compiled BSP, drawn as boxes coloured by how many clusters each one sees (a VVIS cost map). */
  const leafData = useRef<LeafReport | null>(null);
  const [leafCount, setLeafCount] = useState(0);
  const [leavesShown, setLeavesShown] = useState(false);
  const leavesShownRef = useRef(false);
  const showLeaves = useCallback(
    (on: boolean) => {
      const s = session.current;
      const rep = leafData.current;
      leavesShownRef.current = on;
      setLeavesShown(on);
      if (!s) return;
      // Four buckets from quiet to busy: green, yellow, orange, red.
      const colors: [number, number, number][] = [
        [0.3, 0.85, 0.4],
        [0.95, 0.85, 0.3],
        [1, 0.55, 0.2],
        [1, 0.25, 0.25],
      ];
      const buckets: number[][] = [[], [], [], []];
      if (on && rep) {
        const max = Math.max(1, rep.maxVisible);
        for (const l of rep.leaves) {
          const q = Math.min(3, Math.floor((l.visible / max) * 4));
          const seg = boxEdges([l.mins, l.maxs]);
          for (let i = 0; i < seg.length; i++) buckets[q].push(seg[i]);
        }
      }
      colors.forEach((c, i) => s.renderer.setOverlay(`leaves${i}`, on && buckets[i].length ? Float32Array.from(buckets[i]) : null, c));
      if (on && rep) setStatusText(tr("визлифы: {0}, кластеров {1}, самый открытый видит {2}", [rep.leaves.length, rep.clusters, rep.maxVisible]));
    },
    [setStatusText],
  );
  /** Reads `<map>.bsp` next to the VMF; returns the leaf count (0 without a BSP). */
  const loadLeaves = useCallback(async () => {
    const path = currentPath.current;
    if (!path) return 0;
    try {
      const rep = await api.bspLeaves(path.replace(/\.vmf$/i, ".bsp"));
      leafData.current = rep;
      setLeafCount(rep.leaves.length);
      showLeaves(rep.leaves.length > 0 && leavesShownRef.current);
      return rep.leaves.length;
    } catch (err) {
      leafData.current = null;
      setLeafCount(0);
      showLeaves(false);
      void api.log(`visleaves: ${String(err)}`);
      return 0;
    }
  }, [showLeaves]);
  // A map with a BSP next to it has its leaves ready; a map without one keeps the chip hidden.
  useEffect(() => {
    void loadLeaves();
  }, [mapName, loadLeaves]);
  portalsShownRef.current = portalsShown;

  /** Reads `<map>.lin` next to the VMF after a leaking compile. */
  const loadPointfile = useCallback(async () => {
    const path = currentPath.current;
    if (!path) return 0;
    try {
      const text = await api.readTextFile(path.replace(/\.vmf$/i, ".lin"));
      const segs = parsePointfile(text);
      showLeak(segs);
      return segs.length / 6 + 1;
    } catch (err) {
      void api.log(`pointfile: ${String(err)}`);
      return 0;
    }
  }, [showLeak]);

  /** Runs Garry's Mod on the installed BSP of the current map. */
  const runGame = useCallback(async (debug = false, clean = false) => {
    const path = currentPath.current;
    if (!path || !inTauri) return;
    const stem = path.replace(/^.*[\\/]/, "").replace(/\.vmf$/i, "");
    try {
      setStatusText(await api.runGame(stem, debug, path, clean));
    } catch (err) {
      setError(String(err));
    }
  }, []);

  // ---- The bridge to the running game (phase 6): the addon the launcher
  // writes polls the editor for these commands and reports back.

  /** Source angles for the 3D camera: Source's pitch is positive looking down. */
  const cameraAngles = useCallback((): { pitch: number; yaw: number } | null => {
    const s = session.current;
    return s ? { pitch: -s.camera.pitch, yaw: s.camera.yaw } : null;
  }, []);

  /** Puts the player (noclip) where they see the selection from the camera's side. */
  const bridgeTeleport = useCallback(async () => {
    const s = session.current;
    const b = selectionBoundsRef.current();
    if (!s) return;
    if (!b) {
      setStatusText(tr("телепорт: сначала выделите объект"));
      return;
    }
    const c = boxCenter(b);
    const size = Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]);
    const dist = Math.max(96, size * 1.2 + 64);
    const f = s.camera.forward();
    const eye: Vec3 = [c[0] - f[0] * dist, c[1] - f[1] * dist, c[2] - f[2] * dist];
    const yaw = (Math.atan2(c[1] - eye[1], c[0] - eye[0]) * 180) / Math.PI;
    const pitch = (-Math.atan2(c[2] - eye[2], Math.hypot(c[0] - eye[0], c[1] - eye[1])) * 180) / Math.PI;
    // SetPos places the feet; the eyes sit 64 units higher.
    await api.bridgeSend({ type: "teleport", x: eye[0], y: eye[1], z: eye[2] - 64, pitch, yaw });
    setStatusText(tr("телепорт к {0}", [c.map((v) => Math.round(v)).join(" ")]));
  }, []);

  /** Puts the player where the 3D camera is, looking the same way. */
  const bridgeCameraToGame = useCallback(async () => {
    const s = session.current;
    const a = cameraAngles();
    if (!s || !a) return;
    const p = s.camera.position;
    await api.bridgeSend({ type: "teleport", x: p[0], y: p[1], z: p[2] - 64, pitch: a.pitch, yaw: a.yaw });
    setStatusText(tr("игрок перемещён в позицию камеры редактора"));
  }, [cameraAngles]);

  /** Moves the 3D camera to the player's last reported eyes. */
  const applyPlayerPose = useCallback((pos: [number, number, number, number, number]) => {
    const s = session.current;
    if (!s) return;
    s.camera.position = new Float32Array([pos[0], pos[1], pos[2]]);
    s.camera.pitch = Math.max(-89, Math.min(89, -pos[3]));
    s.camera.yaw = pos[4];
  }, []);
  const bridgeGameToCamera = useCallback(async () => {
    const st = await api.bridgeStatus();
    if (!st.pos) {
      setStatusText(tr("игра ещё не передала позицию игрока"));
      return;
    }
    applyPlayerPose(st.pos);
    setStatusText(
      tr("камера перемещена к игроку:{0}", [
        st.pos
          .slice(0, 3)
          .map((v) => Math.round(v))
          .join(" "),
      ]),
    );
  }, [applyPlayerPose]);

  /** The last engine cubemap build, for the autotest to wait on. */
  const cubemapsDoneRef = useRef<CubemapsDone | null>(null);
  /**
   * Cubemaps in the engine: GMod's Lua may not run buildcubemaps, so the game is
   * started on the map with -buildcubemaps, builds them into the BSP and quits;
   * a game that was running is started again afterwards.
   */
  const bridgeCubemaps = useCallback(async (relaunch?: boolean) => {
    const path = currentPath.current;
    if (!path || !inTauri) return;
    const stem = path.replace(/^.*[\\/]/, "").replace(/\.vmf$/i, "");
    cubemapsDoneRef.current = null;
    try {
      const st = await api.bridgeStatus();
      await api.buildCubemaps(stem, relaunch ?? st.running);
      setStatusText(tr("кубмапы: игра запускается с -buildcubemaps, собирает их и закрывается…"));
      setCompileState((s) => ({ ...s, lines: [...s.lines.slice(-2000), tr("[кубмапы] сборка в движке: {0}", [stem])] }));
    } catch (err) {
      setError(String(err));
    }
  }, []);

  /** Moves the selected point entities in the game to where the editor has them. */
  const bridgeSyncEntities = useCallback(async () => {
    const map = current.current;
    if (!map) return;
    let sent = 0;
    for (const e of map.pointEntities) {
      if (!selection.current.has(e.id) || !e.origin) continue;
      await api.bridgeSend({ type: "move_entity", id: e.id, x: e.origin[0], y: e.origin[1], z: e.origin[2] });
      sent++;
    }
    setStatusText(sent ? tr("в игру передано энтити: {0}", [sent]) : tr("выделите точечные энтити: браши нельзя переместить в запущенной игре"));
  }, []);

  const bridgeReload = useCallback(async () => {
    await api.bridgeSend({ type: "reload" });
    setStatusText(tr("игра перезагружает карту…"));
  }, []);

  const gameKill = useCallback(async () => {
    const killed = await api.gameKill();
    setStatusText(killed ? tr("игра закрыта") : tr("игра не была запущена из редактора"));
    setBridge(await api.bridgeStatus());
  }, []);

  /**
   * Everything the map references: face materials, entity models, and the
   * entity keys the FGD types as sound, material, decal, sprite or studio.
   */
  const collectResources = useCallback(async (): Promise<PackRequest> => {
    const map = current.current;
    if (!map) return { materials: [], models: [], sounds: [], skyname: null };
    const materials = new Set(map.mesh.materials);
    const models = new Set<string>();
    const sounds = new Set<string>();
    for (const e of map.entities) {
      if (e.model) models.add(e.model);
      const def = classInfos.current.get(e.classname)?.found ? await classDefFor(e.classname) : null;
      if (!def?.found) continue;
      const typed = def.keys.filter((k) => ["sound", "material", "decal", "sprite", "studio"].includes(k.ty));
      if (!typed.length) continue;
      const d = map.doc.entity_details(e.id) as EntityDetails | undefined;
      if (!d) continue;
      for (const k of typed) {
        const v = d.keyvalues.find(([key]) => key.toLowerCase() === k.name.toLowerCase())?.[1]?.trim();
        if (!v) continue;
        if (k.ty === "sound") sounds.add(v);
        else if (k.ty === "studio") models.add(v.replace(/\\/g, "/").toLowerCase());
        else
          materials.add(
            v
              .replace(/\\/g, "/")
              .replace(/\.vmt$/i, "")
              .toLowerCase(),
          );
      }
    }
    return { materials: Array.from(materials), models: Array.from(models), sounds: Array.from(sounds), skyname: map.stats.skyname ?? null };
  }, [classDefFor]);

  /** Lists the files the map needs and which of them are not part of the game. */
  const analyzePack = useCallback(async (): Promise<PackReport | null> => {
    if (!inTauri || !current.current) return null;
    setPackBusy(true);
    try {
      const report = await api.packAnalyze(await collectResources());
      setPack(report);
      const custom = report.files.filter((f) => f.custom);
      setStatusText(tr("контент: файлов {0}, своих {1}, не найдено {2}", [report.files.length, custom.length, report.missing.length]));
      void api.log(
        `pack analyze: ${report.files.length} files, ${custom.length} custom (${report.customBytes} bytes), missing ${report.missing.length}: ${custom
          .slice(0, 6)
          .map((f) => `${f.path}<${f.source}`)
          .join(" | ")}`,
      );
      return report;
    } catch (err) {
      setError(String(err));
      return null;
    } finally {
      setPackBusy(false);
    }
  }, [collectResources]);

  /** Writes the custom files of `report` (or the last analysis) into the last BSP. */
  const packCustom = useCallback(
    async (report?: PackReport | null) => {
      const r = report ?? pack;
      const bsp = lastBsp.current;
      if (!r || !bsp) return;
      const files = r.files.filter((f) => f.custom).map((f) => f.path);
      if (!files.length) {
        setStatusText(tr("упаковка не требуется: весь контент есть в игре"));
        return;
      }
      setPackBusy(true);
      try {
        const res = await api.packBsp(bsp, files, lastInstalled.current);
        setCompileState((st) => ({
          ...st,
          lines: [
            ...st.lines,
            tr("[pack] упаковано {0} файлов ({1} байт) в {2}{3}", [res.packed, res.bytes, res.output, res.installed ? tr(", скопировано в {0}", [res.installed]) : ""]),
            ...res.log.map((l) => `[pack] ${l}`),
          ],
        }));
        setStatusText(tr("упаковано файлов: {0}", [res.packed]));
        void api.log(`pack: ${res.packed} files, ${res.bytes} bytes -> ${res.output}, installed ${res.installed ?? "none"}`);
      } catch (err) {
        setError(String(err));
        void api.log(`pack failed: ${String(err)}`);
      } finally {
        setPackBusy(false);
      }
    },
    [pack],
  );
  const packAfterRef = useRef<() => Promise<void>>(async () => {});
  packAfterRef.current = async () => {
    const report = await analyzePack();
    if (report) await packCustom(report);
  };

  /** Imports PNG/TGA files as materials of the map's project and makes the first current. */
  const importTextureFiles = useCallback(
    async (paths: string[], dir = "custom"): Promise<ImportedTexture[]> => {
      const path = currentPath.current;
      if (!inTauri || !paths.length) return [];
      if (!path) {
        setError(tr("Сначала сохраните карту: текстуры будут записаны в папку materials рядом с ней"));
        return [];
      }
      setBusy(tr("Импорт текстур…"));
      try {
        const made = await api.importTextures(path, paths, dir);
        if (made.length) {
          setCurrentMaterial(made[0].material);
          setStatusText(tr("импортировано: {0}", [made.map((m) => `${m.material} ${m.width}×${m.height}`).join(", ")]));
          void api.log(`import textures: ${made.map((m) => m.material).join(",")}`);
        }
        return made;
      } catch (err) {
        setError(String(err));
        void api.log(`import failed: ${String(err)}`);
        return [];
      } finally {
        setBusy("");
      }
    },
    [setCurrentMaterial],
  );

  const importTexturesDialog = useCallback(async () => {
    const picked = await open({ multiple: true, filters: [{ name: tr("Изображения"), extensions: ["png", "tga"] }] });
    const list = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
    if (list.length) await importTextureFiles(list.map(String));
  }, [importTextureFiles]);

  /**
   * Hammer's Align Objects and snap: every selected object moves along
   * `axis` so its min / centre / max meets the selection's, or its min
   * corner lands on the grid.
   */
  const alignSelection = useCallback(
    async (axis: 0 | 1 | 2, mode: "min" | "center" | "max" | "grid" | "distribute") => {
      const map = current.current;
      const all = selectionBoundsRef.current();
      if (!map || !all || !selection.current.size) return;
      const ids: number[] = [];
      const deltas: number[] = [];
      const g = gridRef.current || 1;
      if (mode === "distribute") {
        const items: { id: number; c: number }[] = [];
        for (const id of selection.current) {
          const index = objectIndexOf(map, id);
          const b = index === null ? null : objectBoundsRef.current(map, index);
          if (b) items.push({ id, c: (b[0][axis] + b[1][axis]) / 2 });
        }
        const ds = distributeDeltas(items.map((x) => x.c));
        items.forEach((x, i) => {
          const delta = [0, 0, 0];
          delta[axis] = ds[i];
          ids.push(x.id);
          deltas.push(...delta);
        });
        const res = map.doc.translate_each(new Uint32Array(ids), new Float64Array(deltas), textureLockRef.current) as EditResult | undefined;
        if (res) await applyEdit();
        else setStatusText(items.length < 3 ? tr("для равномерного распределения нужно не менее трёх объектов") : tr("уже распределено равномерно"));
        return;
      }
      for (const id of selection.current) {
        const index = objectIndexOf(map, id);
        if (index === null) continue;
        const b = objectBoundsRef.current(map, index);
        if (!b) continue;
        let d = 0;
        if (mode === "min") d = all[0][axis] - b[0][axis];
        else if (mode === "max") d = all[1][axis] - b[1][axis];
        else if (mode === "center") d = (all[0][axis] + all[1][axis]) / 2 - (b[0][axis] + b[1][axis]) / 2;
        else d = Math.round(b[0][axis] / g) * g - b[0][axis];
        const delta = [0, 0, 0];
        delta[axis] = Math.round(d * 1000) / 1000;
        ids.push(id);
        deltas.push(...delta);
      }
      const res = map.doc.translate_each(new Uint32Array(ids), new Float64Array(deltas), textureLockRef.current) as EditResult | undefined;
      if (res) await applyEdit();
      else setStatusText(tr("уже выровнено"));
    },
    [applyEdit],
  );

  /** Hammer's Check for Problems: document findings plus FGD class checks. */
  const checkProblems = useCallback(async (quiet?: boolean) => {
    const map = current.current;
    if (!map) return;
    const list = map.doc.problems() as Problem[];
    if (inTauri) {
      const names = Array.from(new Set(map.entities.map((e) => e.classname)));
      const missing = names.filter((n) => !classInfos.current.has(n));
      if (missing.length) for (const c of await api.entityClasses(missing)) classInfos.current.set(c.classname, c);
      for (const e of map.entities) {
        const c = classInfos.current.get(e.classname);
        if (!c) continue;
        const label = `${e.classname}${e.targetname ? ` «${e.targetname}»` : ""} (${e.id})`;
        if (!c.found) list.push({ kind: "unknown_class", object: e.id, message: tr("{0}: класса нет в FGD", [label]) });
        else if (c.point && e.brush) list.push({ kind: "point_class_with_brushes", object: e.id, message: tr("{0}: точечный класс, но есть браши", [label]) });
        else if (!c.point && !e.brush) list.push({ kind: "solid_class_without_brushes", object: e.id, message: tr("{0}: брашевый класс без брашей", [label]) });
      }
      // Resources the game cannot find: materials by face, models by entity, sky faces.
      const modelOwners = new Map<string, number>();
      for (const e of map.entities) if (e.model && !modelOwners.has(e.model)) modelOwners.set(e.model, e.id);
      let report = { missingMaterials: [] as string[], missingModels: [] as string[], missingSky: [] as string[] };
      try {
        report = await api.checkResources(map.mesh.materials, Array.from(modelOwners.keys()), map.stats.skyname ?? null);
        void api.log(`check_resources: ${report.missingMaterials.length} materials, ${report.missingModels.length} models, ${report.missingSky.length} sky faces missing`);
      } catch (err) {
        void api.log(`check_resources failed: ${String(err)}`);
      }
      const t = map.mesh.faceTable;
      for (const mat of report.missingMaterials) {
        const mi = map.mesh.materials.indexOf(mat);
        let owner = 0;
        let faces = 0;
        for (let f = 0; f < t.length / 4; f++) {
          if (t[f * 4 + 3] !== mi) continue;
          if (!owner) owner = t[f * 4 + 1];
          faces++;
        }
        list.push({ kind: "missing_material", object: owner, message: tr("{0}: материала нет в контенте ({1} граней)", [mat, faces]), detail: mat });
      }
      for (const model of report.missingModels) {
        list.push({ kind: "missing_model", object: modelOwners.get(model) ?? 0, message: tr("{0}: модели нет в контенте", [model]) });
      }
      for (const face of report.missingSky) {
        list.push({ kind: "missing_sky", object: 0, message: tr("{0}: грани скайбокса нет в контенте", [face]) });
      }
      // Outputs aimed at an input their target does not have: the game drops them silently.
      try {
        const conns: { source: number; index: number; target: string; input: string; output: string; classname: string }[] = [];
        for (const e of map.entities) {
          const d = map.doc.entity_details(e.id) as EntityDetails | undefined;
          d?.connections.forEach((c, index) => conns.push({ source: e.id, index, target: c.target, input: c.input, output: c.output, classname: e.classname }));
        }
        // A target name reaches entities by targetname (with * patterns) or, as Source allows, by classname.
        const classesFor = (target: string) =>
          map.entities.filter((e) => (e.targetname && nameHits(target, new Set([e.targetname]))) || e.classname.toLowerCase() === target.toLowerCase()).map((e) => e.classname);
        const wanted = [...new Set(conns.flatMap((c) => [c.classname, ...classesFor(c.target)]))].filter((c) => !classInputs.current.has(c) || !classOutputs.current.has(c));
        for (const cls of wanted) {
          const def = await api.entityClassDef(cls);
          classInputs.current.set(cls, def.found ? def.inputs.map((i) => i.name) : null);
          classOutputs.current.set(cls, def.found ? def.outputs.map((o) => o.name) : null);
        }
        for (const issue of unknownOutputs(conns, (c) => classOutputs.current.get(c) ?? null)) {
          const src = map.entities.find((e) => e.id === issue.source);
          list.push({
            kind: "bad_output",
            object: issue.source,
            message: tr("{0}{1} ({2}): у этого класса нет выхода {3}{4}", [
              issue.classname,
              src?.targetname ? ` «${src.targetname}»` : "",
              issue.source,
              issue.output,
              issue.suggestion ? tr("; возможно, имелся в виду {0}", [issue.suggestion]) : "",
            ]),
            detail: issue.suggestion ? JSON.stringify([issue.index, issue.output, issue.suggestion]) : undefined,
          });
        }
        for (const issue of unknownInputs(conns, classesFor, (c) => classInputs.current.get(c) ?? null)) {
          const src = map.entities.find((e) => e.id === issue.source);
          list.push({
            kind: "bad_input",
            object: issue.source,
            message: tr("{0}{1} → {2}.{3}: у {4} нет такого входа{5}", [
              src?.classname ?? "",
              src?.targetname ? ` «${src.targetname}»` : "",
              issue.target,
              issue.input,
              issue.classes.join(", "),
              issue.suggestion ? tr("; возможно, имелся в виду {0}", [issue.suggestion]) : "",
            ]),
            detail: issue.suggestion ? JSON.stringify([issue.index, issue.input, issue.suggestion]) : undefined,
          });
        }
      } catch (err) {
        void api.log(`input check failed: ${String(err)}`);
      }
      // prop_static needs a model compiled with $staticprop; VBSP deletes the others ("must be used on a dynamic entity").
      const statics = map.entities.filter((e) => e.classname === "prop_static" && e.model && !report.missingModels.includes(e.model));
      const staticModels = Array.from(new Set(statics.map((e) => e.model!)));
      if (staticModels.length) {
        try {
          const flags = await api.modelFlags(staticModels);
          const dynamicOnly = new Set(staticModels.filter((_, i) => flags[i] !== null && !(flags[i]! & STATIC_PROP_FLAG)));
          for (const e of statics) {
            if (!dynamicOnly.has(e.model!)) continue;
            list.push({ kind: "static_not_static", object: e.id, message: tr("prop_static ({0}) {1}: модель не поддерживает prop_static, VBSP удалит проп", [e.id, e.model!.split("/").pop()]) });
          }
        } catch (err) {
          void api.log(`static prop check failed: ${String(err)}`);
        }
      }
      // prop_physics needs the model's collision (.phy); without it the game deletes the prop on spawn.
      const physics = map.entities.filter((e) => e.classname === "prop_physics" && e.model && !report.missingModels.includes(e.model));
      const phyOf = (m: string) => m.replace(/\.mdl$/i, ".phy");
      const phyPaths = Array.from(new Set(physics.map((e) => phyOf(e.model!))));
      if (phyPaths.length) {
        try {
          const noPhy = new Set((await api.checkResources([], phyPaths, null)).missingModels);
          for (const e of physics) {
            if (!noPhy.has(phyOf(e.model!))) continue;
            list.push({ kind: "no_physics", object: e.id, message: tr("prop_physics ({0}) {1}: у модели нет физики, в игре проп не появится", [e.id, e.model!.split("/").pop()]) });
          }
        } catch (err) {
          void api.log(`physics check failed: ${String(err)}`);
        }
      }
    }
    // Placement checks: the sun, entities without outputs, starts and lights in brushes, entities in the void.
    list.push(...placementChecks(map, (m, i) => objectBoundsRef.current(m, i) as [[number, number, number], [number, number, number]] | null));
    setProblems(list);
    // Quiet (after a save, as Unreal's map check): the list is ready, the panel stays as it was.
    if (quiet !== true) setPanel("problems");
    return list;
  }, []);

  /**
   * Applies the automatic fix of each finding (Hammer's "Fix"): document
   * problems through the core, missing materials by replacing them with the
   * current material. One undo step per fix; the list is checked again after.
   */
  const fixProblems = useCallback(
    async (list: Problem[]) => {
      const map = current.current;
      if (!map) return;
      let fixed = 0;
      const seenMaterials = new Set<string>();
      // Duplicate ids first: until they are renumbered, a fix by id may land on the wrong twin.
      const ordered = [...list].sort((a, b) => Number(b.kind === "duplicate_id") - Number(a.kind === "duplicate_id"));
      for (const p of ordered) {
        if (!canFix(p)) continue;
        let res: EditResult | undefined;
        if (p.kind === "no_physics" || p.kind === "static_not_static") {
          // A prop that needs no collision model: same model, place and keys.
          res = map.doc.set_entity_keyvalues(p.object, [["classname", "prop_dynamic"]]) as EditResult | undefined;
        } else if (p.kind === "world_detail") {
          if (!p.detail) continue;
          // Hammer's Tie to Entity for every small world brush at once.
          const ids = p.detail
            .split(",")
            .map(Number)
            .filter((id) => map.doc.kind_of(id) === "solid" && !map.doc.entity_of_solid(id));
          if (!ids.length) continue;
          const keys: [string, string][] = inTauri ? await api.entityDefaults("func_detail") : [];
          res = map.doc.tie_to_entity(new Uint32Array(ids), "func_detail", keys, new Uint8Array(classInfos.current.get("func_detail")?.color ?? [220, 30, 220])) as EditResult | undefined;
        } else if (p.kind === "no_cubemap") {
          if (!p.detail) continue;
          res = map.doc.create_entity("env_cubemap", new Float64Array(p.detail.split(" ").map(Number)), [], new Uint8Array(classInfos.current.get("env_cubemap")?.color ?? [220, 30, 220])) as
            EditResult | undefined;
        } else if (p.kind === "stacked_twins" || p.kind === "stacked_brushes") {
          if (!p.detail) continue;
          res = map.doc.delete_objects(new Uint32Array(p.detail.split(",").map(Number))) as EditResult | undefined;
        } else if (p.kind === "bad_output") {
          if (!p.detail) continue;
          const [index, was, next] = JSON.parse(p.detail) as [number, string, string];
          const d = map.doc.entity_details(p.object) as EntityDetails | undefined;
          if (!d || d.connections[index]?.output !== was) continue;
          res = map.doc.set_entity_connections(
            p.object,
            d.connections.map((c, i) => (i === index ? { ...c, output: next } : c)),
          ) as EditResult | undefined;
        } else if (p.kind === "bad_input") {
          if (!p.detail) continue;
          // The typo becomes the input it was close to, in that one connection.
          const [index, was, next] = JSON.parse(p.detail) as [number, string, string];
          const d = map.doc.entity_details(p.object) as EntityDetails | undefined;
          if (!d || d.connections[index]?.input !== was) continue;
          res = map.doc.set_entity_connections(
            p.object,
            d.connections.map((c, i) => (i === index ? { ...c, input: next } : c)),
          ) as EditResult | undefined;
        } else if (p.kind === "bad_name") {
          if (!p.detail) continue;
          // Every holder takes the clean name, and every output and name key aimed at the old one follows: one undo step.
          const [old, next] = JSON.parse(p.detail) as [string, string];
          const renames = new Map([[old, next]]);
          let steps = 0;
          for (const e of map.entities) {
            if (e.targetname === old && map.doc.set_entity_keyvalues(e.id, [["targetname", next]])) steps++;
            const d = map.doc.entity_details(e.id) as EntityDetails | undefined;
            if (!d) continue;
            const conns = retargetConnections(d.connections, renames);
            if (conns && map.doc.set_entity_connections(e.id, conns)) steps++;
            const keys = retargetKeys(d.keyvalues, renames);
            if (keys.length && map.doc.set_entity_keyvalues(e.id, keys)) steps++;
          }
          if (!steps) continue;
          if (steps > 1) map.doc.merge_undo(steps, tr("Исправить имя: {0} → {1}", [old, next]));
          res = { changed_ids: [p.object] } as unknown as EditResult;
        } else if (p.kind === "overlay_sides") {
          if (!p.detail) continue;
          res = map.doc.set_entity_keyvalues(p.object, [["sides", p.detail]]) as EditResult | undefined;
        } else if (p.kind === "parent_loop") {
          res = map.doc.set_entity_keyvalues(p.object, [["parentname", ""]]) as EditResult | undefined;
        } else if (p.kind === "disp_in_entity") {
          if (!p.detail) continue;
          res = map.doc.move_to_world(new Uint32Array(p.detail.split(",").map(Number))) as EditResult | undefined;
        } else if (p.kind === "mergeable") {
          // Every run found, joined in one undo step; planned again now in case brushes moved since the check.
          const groups = mergePlan(map, (m, i) => objectBoundsRef.current(m, i) as [[number, number, number], [number, number, number]] | null, new Set((p.detail ?? "").split(",").map(Number)));
          const { steps, made } = applyMerge(map, groups);
          if (!steps) continue;
          if (steps > 1) map.doc.merge_undo(steps, tr("Склеить браши: {0} → {1}", [groups.reduce((n, g) => n + g.ids.length, 0), made.length]));
          res = { changed_ids: made } as unknown as EditResult;
        } else if (p.kind === "off_grid") {
          // Every box found, moved by its own fraction, in one step; recomputed now in case it moved since the check.
          const want = new Set((p.detail ?? "").split(",").map(Number));
          const moves = offGridBoxes(map, (m, i) => objectBoundsRef.current(m, i) as [[number, number, number], [number, number, number]] | null).filter((o) => want.has(o.id));
          if (!moves.length) continue;
          res = map.doc.translate_each(new Uint32Array(moves.map((o) => o.id)), new Float64Array(moves.flatMap((o) => o.shift)), textureLockRef.current) as EditResult | undefined;
        } else if (p.kind === "no_sun") {
          if (!p.detail) continue;
          let keys: [string, string][] = inTauri ? await api.entityDefaults("light_environment") : [];
          keys = keys
            .filter(([k]) => !["pitch", "angles"].includes(k.toLowerCase()))
            .concat([
              ["pitch", "-60"],
              ["angles", "0 45 0"],
            ]);
          res = map.doc.create_entity(
            "light_environment",
            new Float64Array(p.detail.split(" ").map(Number)),
            keys,
            new Uint8Array(classInfos.current.get("light_environment")?.color ?? [220, 30, 220]),
          ) as EditResult | undefined;
        } else if (p.kind === "stuck_spawn" || p.kind === "light_in_solid" || p.kind === "prop_in_solid" || p.kind === "pivot_outside" || p.kind === "door_no_hinge") {
          if (!p.detail) continue;
          res = map.doc.set_entity_keyvalues(p.object, [["origin", p.detail]]) as EditResult | undefined;
        } else if (p.kind === "missing_material") {
          if (!p.detail || seenMaterials.has(p.detail)) continue;
          seenMaterials.add(p.detail);
          res = map.doc.replace_material(p.detail, materialRef.current, new Uint32Array(0), false) as EditResult | undefined;
        } else {
          res = map.doc.fix_problem(p.kind, p.object, materialRef.current) as EditResult | undefined;
        }
        if (res) fixed++;
      }
      if (fixed) {
        selection.current.clear();
        setStatusText(tr("исправлено: {0}", [fixed]));
        await applyEdit();
      }
      await checkProblems();
      return fixed;
    },
    [applyEdit, checkProblems],
  );

  /** Applies the current material to `[solidId, sideId, ...]` faces. */
  const applyMaterial = useCallback(
    async (faces: number[]) => {
      const map = current.current;
      if (!map || !faces.length) return;
      const res = map.doc.set_material(new Uint32Array(faces), materialRef.current) as EditResult | undefined;
      if (res) {
        tickStep("texture");
        await applyEdit();
      }
    },
    [applyEdit],
  );

  /** All faces of the selected brushes get the current material. */
  const applyMaterialToSelection = useCallback(async () => {
    const map = current.current;
    if (!map) return;
    const faces: number[] = [];
    for (const id of selection.current) {
      for (const side of map.doc.solid_sides(id)) faces.push(id, side);
    }
    await applyMaterial(faces);
  }, [applyMaterial]);

  /** Creates a point entity of the current class at `origin`, with FGD defaults, and selects it. */
  const createEntityAt = useCallback(
    async (origin: Vec3, extraKeys: [string, string][] = []) => {
      const map = current.current;
      const cls = entityClassRef.current.trim();
      if (!map || !cls) return;
      if (!classInfos.current.has(cls)) {
        const infos = await api.entityClasses([cls]);
        for (const c of infos) classInfos.current.set(c.classname, c);
      }
      const info = classInfos.current.get(cls);
      let defaults = await api.entityDefaults(cls);
      // Props take the model picked in the model browser.
      const model = currentModelRef.current;
      if (model && cls.startsWith("prop_")) {
        defaults = defaults.filter(([k]) => k.toLowerCase() !== "model");
        defaults.push(["model", model]);
      }
      for (const [k, v] of extraKeys) {
        defaults = defaults.filter(([dk]) => dk.toLowerCase() !== k.toLowerCase());
        defaults.push([k, v]);
      }
      const chain = pathChainRef.current;
      let chainName: string | null = null;
      if (chain.on) {
        // Path tool: path1, path2… unique on the map; the previous node targets the new one.
        const taken = new Set(map.entities.map((e) => e.targetname).filter(Boolean));
        let n = chain.n;
        do {
          n += 1;
          chainName = `path${n}`;
        } while (taken.has(chainName));
        chain.n = n;
        defaults = defaults.filter(([k]) => k.toLowerCase() !== "targetname");
        defaults.push(["targetname", chainName]);
      }
      const res = map.doc.create_entity(cls, new Float64Array(origin), defaults, new Uint8Array(info?.color ?? [220, 30, 220])) as EditResult | undefined;
      if (res) {
        const id = res.changed_ids[0];
        if (chain.on && chainName) {
          if (chain.last !== null && map.doc.kind_of(chain.last) === "entity") {
            map.doc.set_entity_keyvalues(chain.last, [["target", chainName]]);
          }
          chain.last = id;
          setStatusText(tr("узел {0}{1}: следующий щелчок продолжит цепочку", [chainName, chain.last !== null ? "" : ""]));
        }
        selection.current = new Set([id]);
        setHandleMode("move");
        tickStep("entity");
        await applyEdit();
        if (symmetryRef.current.on && !onPlane(symmetryRef.current, origin)) await mirrorIds([id], tr("Создать {0} с отражением", [cls]), 1, false);
        return id;
      }
      return undefined;
    },
    [applyEdit, mirrorIds],
  );

  // ---- Painter (phase 8): a material (re)written on disk goes live in the views and onto the selection.
  const applyPaintedTexture = useCallback(
    async (material: string, apply: boolean) => {
      const infos = await api.materialsInfo([material]);
      for (const i of infos) materialInfos.current.set(i.name, i);
      const info = infos[0] ?? null;
      bumpTextureVersion(material);
      if (info?.baseTexture) bumpTextureVersion(info.baseTexture);
      session.current?.renderer.forgetTexture(material, info);
      setCurrentMaterial(material);
      void api.log(`paint: ${material} ${info ? `${info.width}x${info.height} ${info.shader}` : "no info"}, apply ${apply}`);
      if (!apply) return;
      if (faceSel.current.size) await applyMaterial(Array.from(faceSel.current.values()).flat());
      else await applyMaterialToSelection();
    },
    [applyMaterial, applyMaterialToSelection, setCurrentMaterial],
  );

  // ---- Sounds (phase 8): the last export and placing an ambient_generic with it.
  const [soundExported, setSoundExported] = useState<{ name: string; loop: boolean; bytes: number } | null>(null);
  const placeSound = useCallback(
    async (name: string, loop: boolean) => {
      SOUND_LOOPS.set(name, loop);
      const s = session.current;
      if (!s || !current.current) return;
      const f = s.camera.forward();
      const p = s.camera.position;
      const g = 64;
      const origin: Vec3 = [Math.round((p[0] + f[0] * 256) / g) * g, Math.round((p[1] + f[1] * 256) / g) * g, Math.round(p[2] / g) * g];
      setEntityClass("ambient_generic");
      await createEntityAt(origin, soundKeys(name));
      setStatusText(tr("ambient_generic с {0}{1} поставлен перед камерой", [name, loop ? tr(" (петля)") : ""]));
    },
    [createEntityAt, setEntityClass],
  );
  /**
   * Creates a cylinder, sphere, arch or stairs inside `bounds`, groups the brushes and remembers
   * the parameters in the project's sidecar, so the inspector's generator card can rebuild them.
   */
  const createGenerated = useCallback(
    async (spec: Omit<GeneratorRecord, "group" | "extent">): Promise<boolean> => {
      const map = current.current;
      if (!map) return false;
      const [lo, hi] = spec.bounds;
      const made: number[] = [];
      let steps = 0;
      if (spec.kind === "stairs") {
        for (const [a, b] of stairBoxes(lo as Vec3, hi as Vec3, spec.step, spec.reverse)) {
          const r = map.doc.create_block(new Float64Array([...a, ...b]), spec.material) as EditResult | undefined;
          if (r) {
            made.push(...r.changed_ids);
            steps++;
          }
        }
      } else {
        const r = map.doc.create_primitive(spec.kind, new Float64Array([...lo, ...hi]), spec.axis, new Float64Array([spec.sides, spec.wall, spec.arc, 0, 0]), spec.material) as EditResult | undefined;
        if (r) {
          made.push(...r.changed_ids);
          steps++;
        }
      }
      if (!made.length) {
        setError(spec.kind === "stairs" ? tr("Лестница не создана: у рамки нулевая высота") : tr("Примитив не создан: рамка слишком мала или стенка арки толще радиуса"));
        return false;
      }
      const g = map.doc.group_objects(Uint32Array.from(made)) as EditResult | undefined;
      const group = g?.changed_ids[0] ?? 0;
      if (g) steps++;
      lastBlockExtent.current = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
      selection.current = new Set(made);
      setHandleMode("move");
      await applyEdit();
      mergeUndo(steps, spec.kind === "stairs" ? tr("Лестница: {0} ступеней", [made.length]) : tr("{0}: {1} брашей", [SHAPE_NAMES[spec.kind], made.length]));
      if (group) {
        const elo: Vec3 = [Infinity, Infinity, Infinity];
        const ehi: Vec3 = [-Infinity, -Infinity, -Infinity];
        for (const id of made) {
          const v = map.doc.solid_vertices(id) as Float32Array;
          for (let k = 0; k + 2 < v.length; k += 3)
            for (let a = 0; a < 3; a++) {
              elo[a] = Math.min(elo[a], v[k + a]);
              ehi[a] = Math.max(ehi[a], v[k + a]);
            }
        }
        updateMeta({ generators: [...projectMetaRef.current.generators, { ...spec, group, extent: [elo, ehi] }] });
      }
      setStatusText(
        spec.kind === "stairs"
          ? tr("лестница: {0} ступеней по {1} юн.", [made.length, Math.round(((hi[2] - lo[2]) / made.length) * 10) / 10])
          : tr("{0}: {1} брашей · стороны и форму можно менять в инспекторе", [SHAPE_NAMES[spec.kind], made.length]),
      );
      return true;
    },
    [applyEdit, mergeUndo, setError, setStatusText, updateMeta],
  );
  /** Rebuilds a generated group with new parameters inside its current bounds, as one undo step. */
  const regenerateGenerator = useCallback(
    async (rec: GeneratorRecord, patch: Partial<GeneratorRecord>) => {
      const map = current.current;
      if (!map) return;
      const next = withPatch(rec, patch);
      const members = Array.from(map.doc.group_members(rec.group) as Uint32Array);
      if (!members.length) {
        updateMeta({ generators: replaceRecord(projectMetaRef.current.generators, rec.group, null) });
        return;
      }
      const lo: Vec3 = [Infinity, Infinity, Infinity];
      const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
      for (const id of members) {
        const v = map.doc.solid_vertices(id) as Float32Array;
        for (let k = 0; k + 2 < v.length; k += 3)
          for (let a = 0; a < 3; a++) {
            lo[a] = Math.min(lo[a], Math.round(v[k + a] * 16) / 16);
            hi[a] = Math.max(hi[a], Math.round(v[k + a] * 16) / 16);
          }
      }
      if (!Number.isFinite(lo[0]) || !Number.isFinite(hi[0])) return;
      const del = map.doc.delete_objects(Uint32Array.from(members)) as EditResult | undefined;
      updateMeta({ generators: replaceRecord(projectMetaRef.current.generators, rec.group, null) });
      const { extent: _extent, ...rest } = next;
      const ok = await createGenerated({ ...rest, bounds: rebuildBounds(next, [lo, hi]) });
      if (ok && del) mergeUndo(2, tr("Генератор: {0}", [SHAPE_NAMES[next.kind]]));
      if (!ok) await applyEdit();
    },
    [applyEdit, createGenerated, mergeUndo, updateMeta],
  );
  /** A note at the selection's centre, else where the camera stands; opens the notes panel. */
  /** A note at a given place (assistant, problems list); opens the notes panel. */
  const addNoteAt = useCallback(
    (pos: Vec3, text = "", quiet = false) => {
      if (!current.current) return;
      updateMeta({ pins: addNote(projectMetaRef.current.pins, pos, text) });
      if (!quiet) openPanelRef.current("notes");
      setStatusText(tr("заметка добавлена: {0} {1} {2}", [Math.round(pos[0]), Math.round(pos[1]), Math.round(pos[2])]));
    },
    [setStatusText, updateMeta],
  );
  const addNoteHere = useCallback(
    (text = "", quiet = false) => {
      if (!current.current) return;
      const b = selectionBoundsRef.current();
      const cam = session.current?.camera;
      // Without a selection the note goes 256 units ahead of the camera, where it is seen, not into the eye.
      const ahead = cam ? cam.forward() : [0, 0, 0];
      const pos: Vec3 = b ? boxCenter(b) : cam ? [cam.position[0] + ahead[0] * 256, cam.position[1] + ahead[1] * 256, cam.position[2] + ahead[2] * 256] : [0, 0, 0];
      addNoteAt(pos, text, quiet);
    },
    [addNoteAt],
  );
  const setNotes = useCallback((pins: MapNote[]) => updateMeta({ pins }), [updateMeta]);
  /** Forgets a group's parameters; the brushes stay as they are. */
  const detachGenerator = useCallback(
    (rec: GeneratorRecord) => {
      updateMeta({ generators: replaceRecord(projectMetaRef.current.generators, rec.group, null) });
      setStatusText(tr("генератор разобран: браши остались, параметры забыты"));
    },
    [setStatusText, updateMeta],
  );
  /** Block tool's Enter: the pending box becomes a brush (and ticks the first step). */
  const createPendingBlock = useCallback(async () => {
    const before = current.current?.stats.solids ?? 0;
    const map0 = current.current;
    const box0 = pendingBox.current;
    if (map0 && box0 && isGeneratorKind(shapeRef.current)) {
      setPendingBox(null);
      await createGenerated({
        kind: shapeRef.current,
        bounds: box0,
        axis: pendingAxis.current,
        sides: primRef.current.sides,
        wall: primRef.current.wall,
        arc: primRef.current.arc,
        step: primRef.current.step,
        reverse: primRef.current.reverse,
        material: materialRef.current,
      });
    } else await createPendingBlockInner();
    const made = (current.current?.stats.solids ?? 0) > before;
    if (made) tickStep("brush");
    if (made && symmetryRef.current.on) {
      const ids = Array.from(selection.current);
      const b = selectionBoundsRef.current();
      const centre: Vec3 = b ? [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2] : [0, 0, 0];
      if (!onPlane(symmetryRef.current, centre)) await mirrorIds(ids, tr("Создать браш с отражением"), 1);
    }
  }, [createPendingBlockInner, mirrorIds, tickStep, setPendingBox, applyEdit, mergeUndo, setStatusText]);

  const placeModel = useCallback(
    async (model: string) => {
      const s = session.current;
      const map = current.current;
      const canvas = canvasRef.current;
      if (!s || !map || !canvas) return;
      setCurrentModel(model);
      setEntityClass(await modelClass(model));
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      let origin: Vec3 | null = null;
      const id = await s.renderer.pick(s.camera, w / 2, h / 2);
      const info = id === null ? null : pickInfo(map, id);
      if (info?.kind === "face") {
        const plane = map.doc.face_plane(info.solidId, info.sideId);
        if (plane.length === 4) {
          const ray = mouseRay(s.camera.viewProjection(w / h), s.camera.position, [w / 2, h / 2], w, h);
          origin = rayPlane(ray, [plane[0], plane[1], plane[2]], plane[3]);
        }
      }
      if (!origin) {
        const f = s.camera.forward();
        const p = s.camera.position;
        origin = [p[0] + f[0] * 256, p[1] + f[1] * 256, p[2] + f[2] * 256];
      }
      const g = gridRef.current;
      await createEntityAt(origin.map((v) => Math.round(v / g) * g) as Vec3);
    },
    [createEntityAt, modelClass, setCurrentModel, setEntityClass],
  );
  useEffect(() => {
    placeModelRef.current = placeModel;
  }, [placeModel]);

  /** Hammer's multi-entity Object Properties: the same key change on every entity in `ids`, one undo step. */
  const setKeysOnEntities = useCallback(
    async (ids: number[], changes: [string, string | null][]) => {
      const map = current.current;
      if (!map || !ids.length || !changes.length) return;
      let steps = 0;
      for (const id of ids) if (map.doc.set_entity_keyvalues(id, changes)) steps++;
      if (!steps) return;
      await applyEdit();
      mergeUndo(steps, tr("Ключи у {0} энтити", [steps]));
    },
    [applyEdit, mergeUndo],
  );
  const setEntityKeys = useCallback(
    async (id: number, changes: [string, string | null][]) => {
      const map = current.current;
      if (!map) return;
      const res = map.doc.set_entity_keyvalues(id, changes) as EditResult | undefined;
      if (res) await applyEdit();
      // Keys other than the ones the snapshot diff covers go to the game by name.
      if (res && bridgeRef.current?.connected && bridgeLiveRef.current && map.pointEntities.some((e) => e.id === id)) {
        for (const [key, value] of changes) {
          if (["origin", "angles", "model", "skin", "classname", "id"].includes(key.toLowerCase())) continue;
          void api.bridgeSend({ type: "set_keyvalue", id, key, value: value ?? "" });
        }
      }
    },
    [applyEdit],
  );
  /** Entity properties clipboard (Unity's Copy/Paste Component Values): settings without name and place. */
  const keyClipRef = useRef<{ classname: string; keys: [string, string][]; connections: Connection[] } | null>(null);
  /** The face texture and placement taken with Ctrl+Alt+C in the texture tool. */
  const faceStyleRef = useRef<FaceEdit | null>(null);
  const copyEntityKeys = useCallback(() => {
    const map = current.current;
    if (!map) return;
    // In the texture tool with faces picked, Ctrl+Alt+C takes the first face's texture and placement (Hammer's Lift).
    const faces = Array.from(faceSel.current.values());
    if (toolRef.current === "texture" && faces.length) {
      const info = map.doc.face_info(faces[0][0], faces[0][1]) as FaceInfo | undefined;
      if (info) {
        faceStyleRef.current = faceStyleEdit(info);
        setStatusText(
          tr("скопирована текстура грани: {0}, сдвиг {1} {2}, масштаб {3} {4}, поворот {5}° · Ctrl+Alt+V - применить к выбранным граням", [
            info.material,
            info.uaxis[3],
            info.vaxis[3],
            info.uaxis[4],
            info.vaxis[4],
            info.rotation,
          ]),
        );
      }
      return;
    }
    const id = [...selection.current].map((x) => map.doc.entity_of_solid(x) || x).find((x) => map.entities.some((e) => e.id === x));
    const d = id === undefined ? undefined : (map.doc.entity_details(id) as EntityDetails | undefined);
    if (!d) {
      setStatusText(tr("выделите энтити, свойства которой нужно скопировать"));
      return;
    }
    const keys = copyableKeys(d.keyvalues);
    const cls = map.entities.find((e) => e.id === id)?.classname ?? "";
    keyClipRef.current = { classname: cls, keys, connections: d.connections };
    setStatusText(
      tr("скопировано свойств: {0}{1} ({2}) · Ctrl+Alt+V - вставить в выделенные энтити того же класса", [keys.length, d.connections.length ? tr(", выходов: {0}", [d.connections.length]) : "", cls]),
    );
  }, [setStatusText]);
  const pasteEntityKeys = useCallback(async () => {
    // In the texture tool with faces picked, Ctrl+Alt+V lays the copied texture and placement on them (Hammer's Apply values).
    if (toolRef.current === "texture" && faceSel.current.size && faceStyleRef.current) {
      await editFaces(faceStyleRef.current);
      setStatusText(tr("текстура с выравниванием применена к граням: {0}", [faceSel.current.size]));
      return;
    }
    const map = current.current;
    const clip = keyClipRef.current;
    if (!map || !clip) {
      setStatusText(tr("сначала скопируйте свойства энтити: Ctrl+Alt+C"));
      return;
    }
    let steps = 0;
    let skipped = 0;
    let outputs = 0;
    // Brush entities are selected through their brushes: work on each owner once.
    for (const id of new Set([...selection.current].map((x) => map.doc.entity_of_solid(x) || x))) {
      const e = map.entities.find((x) => x.id === id);
      if (!e) continue;
      if (e.classname !== clip.classname) {
        skipped++;
        continue;
      }
      const d = map.doc.entity_details(id) as EntityDetails | undefined;
      const changes = pasteChanges(clip.keys, d?.keyvalues ?? []);
      if (changes.length) {
        await setEntityKeys(id, changes);
        steps++;
      }
      // Outputs travel too: the copied ones join those the entity already has.
      const conns = mergeConnections(d?.connections ?? [], clip.connections);
      if (conns && map.doc.set_entity_connections(id, conns)) {
        steps++;
        outputs++;
      }
    }
    if (outputs) await applyEdit();
    if (steps > 1) mergeUndo(steps, tr("Вставка свойств: {0}", [clip.classname]));
    setStatusText(tr("свойства вставлены{0}{1}", [outputs ? tr(", выходы добавлены в {0}", [outputs]) : "", skipped ? tr(", пропущено других классов: {0}", [skipped]) : ""]));
  }, [setEntityKeys, mergeUndo, setStatusText, editFaces, applyEdit]);
  /** Rename (F2, as in Unity and Blender): one name, or a numbered series for several entities; I/O pointing at old names is not rewritten. */
  const renameSelection = useCallback(async () => {
    const map = current.current;
    if (!map) return;
    const owners = new Set([...selection.current].map((x) => map.doc.entity_of_solid(x) || x));
    const ents = map.entities.filter((e) => owners.has(e.id));
    if (!ents.length) {
      setStatusText(tr("выделите энтити, чтобы задать имя"));
      return;
    }
    const answer = await ask({
      title: ents.length > 1 ? tr("Имена для {0} энтити", [ents.length]) : tr("Имя энтити"),
      text: ents.length > 1 ? tr("Имена назначаются по порядку: lamp → lamp_1, lamp_2…; door5 → door5, door6…") : tr("targetname - имя, по которому энтити ссылаются друг на друга в выходах (I/O)."),
      input: { value: ents[0].targetname ?? ents[0].classname.replace(/^.*_/, ""), placeholder: "hall_lamp" },
      buttons: [
        { label: tr("Переименовать"), kind: "primary", value: "=" },
        { label: tr("Отмена"), value: "cancel" },
      ],
    });
    if (!answer.startsWith("=")) return;
    const base = cleanName(answer.slice(1));
    if (!base) return;
    const names = numberedNames(base, ents.length);
    const chosen = new Set(ents.map((x) => x.id));
    const kept = new Set(map.entities.filter((x) => !chosen.has(x.id) && x.targetname).map((x) => x.targetname!));
    const { map: renames, ambiguous } = renameMap(
      ents.map((x, i) => ({ old: x.targetname, next: names[i] })),
      kept,
    );
    let steps = 0;
    for (let i = 0; i < ents.length; i++) {
      if (ents[i].targetname === names[i]) continue;
      await setEntityKeys(ents[i].id, [["targetname", names[i]]]);
      steps++;
    }
    // Outputs and name keys that pointed at the old names follow them, so the I/O keeps working.
    let fixed = 0;
    if (renames.size) {
      for (const e of map.entities) {
        const d = map.doc.entity_details(e.id) as EntityDetails | undefined;
        if (!d) continue;
        const conns = retargetConnections(d.connections, renames);
        if (conns && map.doc.set_entity_connections(e.id, conns)) {
          steps++;
          fixed++;
        }
        const keys = retargetKeys(d.keyvalues, renames);
        if (keys.length && map.doc.set_entity_keyvalues(e.id, keys)) {
          steps++;
          fixed++;
        }
      }
      if (fixed) await applyEdit();
    }
    if (steps > 1) mergeUndo(steps, tr("Переименование: {0}", [names.length > 1 ? `${names[0]} … ${names[names.length - 1]}` : names[0]]));
    const tail = [fixed ? tr("ссылок обновлено: {0}", [fixed]) : "", ambiguous.length ? tr("ссылки на {0} не тронуты: имя было общим", [ambiguous.slice(0, 2).join(", ")]) : ""]
      .filter(Boolean)
      .join(" · ");
    setStatusText(
      steps ? tr("переименовано: {0}{1}{2}", [ents.length, names.length > 1 ? ` (${names[0]} … ${names[names.length - 1]})` : ` → ${names[0]}`, tail ? ` · ${tail}` : ""]) : tr("имена не изменились"),
    );
  }, [ask, setEntityKeys, applyEdit, mergeUndo, setStatusText]);
  /** Reset rotation and scale (Blender's Alt+R / Alt+S): selected point entities get angles 0 0 0 and modelscale 1. */
  const resetTransform = useCallback(async () => {
    const map = current.current;
    if (!map) return;
    let steps = 0;
    for (const id of [...selection.current]) {
      const e = map.pointEntities.find((x) => x.id === id);
      if (!e) continue;
      const d = map.doc.entity_details(id) as EntityDetails | undefined;
      const keys = new Map((d?.keyvalues ?? []).map(([k, v]) => [k.toLowerCase(), v]));
      const changes: [string, string | null][] = [];
      if (keys.has("angles") && keys.get("angles")?.trim() !== "0 0 0") changes.push(["angles", "0 0 0"]);
      if (keys.has("modelscale") && Number(keys.get("modelscale")) !== 1) changes.push(["modelscale", null]);
      if (!changes.length) continue;
      await setEntityKeys(id, changes);
      steps++;
    }
    if (steps > 1) mergeUndo(steps, tr("Сброс поворота: {0}", [steps]));
    setStatusText(steps ? tr("поворот и масштаб сброшены у {0}", [steps]) : tr("у выделенных энтити поворот и масштаб уже исходные"));
  }, [setEntityKeys, mergeUndo, setStatusText]);
  /** Replace model (Unreal's Replace Selected Actors): every selected prop takes the model picked in the model browser. */
  const replaceSelectedModel = useCallback(async () => {
    const map = current.current;
    const model = currentModelRef.current;
    if (!map) return;
    if (!model) {
      setStatusText(tr("выберите модель в браузере моделей - она будет назначена выделенным пропам"));
      return;
    }
    void ensureModel(model, 0);
    let steps = 0;
    for (const id of [...selection.current]) {
      const e = map.pointEntities.find((x) => x.id === id);
      if (!e || !e.model || e.model === model.toLowerCase()) continue;
      await setEntityKeys(id, [
        ["model", model],
        ["skin", null],
      ]);
      steps++;
    }
    if (steps > 1) mergeUndo(steps, tr("Замена модели: {0} → {1}", [steps, model.split("/").pop()]));
    setStatusText(steps ? tr("модель заменена у {0}: {1}", [steps, model.split("/").pop()]) : tr("среди выделенного нет пропов с другой моделью"));
  }, [ensureModel, setEntityKeys, mergeUndo, setStatusText]);
  /** Randomize rotation (Blender's Randomize Transforms): each selected point entity gets its own yaw and a slight tilt. */
  const randomizeRotation = useCallback(async () => {
    const map = current.current;
    if (!map) return;
    let steps = 0;
    for (const id of [...selection.current]) {
      if (!map.pointEntities.some((x) => x.id === id)) continue;
      await setEntityKeys(id, [["angles", anglesText(randomAngles(Math.random, 3))]]);
      steps++;
    }
    if (steps > 1) mergeUndo(steps, tr("Случайный поворот: {0}", [steps]));
    setStatusText(steps ? tr("случайный поворот у {0} · повторить - новый разброс, Ctrl+Z - отменить", [steps]) : tr("выделите пропы или точечные энтити"));
  }, [setEntityKeys, mergeUndo, setStatusText]);

  /** Frame of the one selected info_overlay, for its corner handles; null otherwise. */
  const selectedOverlay = useCallback((): { id: number; frame: OverlayFrame } | null => {
    const map = current.current;
    if (!map || selection.current.size !== 1 || toolRef.current !== "select") return null;
    const id = selection.current.values().next().value as number;
    const e = map.entities.find((x) => x.id === id);
    if (!e || e.classname.toLowerCase() !== "info_overlay") return null;
    const d = map.doc.entity_details(id) as EntityDetails | undefined;
    return d ? { id, frame: overlayFrame(keyMap(d)) } : null;
  }, []);

  /** The targetname an eyedropper click resolves to: the entity's, or its brush entity's. */
  const targetNameOf = useCallback((id: number): string | null => {
    const map = current.current;
    if (!map) return null;
    const kind = map.doc.kind_of(id);
    const entityId = kind === "entity" ? id : kind === "solid" ? map.doc.entity_of_solid(id) : 0;
    if (!entityId) return null;
    return map.entities.find((e) => e.id === entityId)?.targetname ?? "";
  }, []);

  /** Finishes an eyedropper pick with the clicked object; true when a pick was pending. */
  const finishPickTarget = useCallback(
    (id: number | null): boolean => {
      const pending = pickTargetRef.current;
      if (!pending) return false;
      pickTargetRef.current = null;
      setPickingTarget(null);
      if (id === null) {
        setStatusText(tr("пипетка отменена: щелчок не по энтити"));
        return true;
      }
      const name = targetNameOf(id);
      if (name === null) setError(tr("Цель должна быть энтити с именем"));
      else if (!name) setError(tr("У этой энтити нет targetname: сначала задайте имя"));
      else {
        void setEntityKeys(pending.entity, [[pending.key, name]]);
        setStatusText(`${pending.key} = ${name}`);
      }
      return true;
    },
    [setEntityKeys, targetNameOf],
  );

  const setEntityConnections = useCallback(
    async (id: number, connections: Connection[]) => {
      const map = current.current;
      if (!map) return;
      const res = map.doc.set_entity_connections(id, connections) as EditResult | undefined;
      if (res) await applyEdit();
    },
    [applyEdit],
  );

  /** Inputs of the entity a targetname refers to (empty when unknown). */
  const inputsFor = useCallback(
    async (target: string): Promise<IoDef[]> => {
      const map = current.current;
      if (!map || !target) return [];
      const cls = map.doc.class_of_target(target);
      if (!cls) return [];
      return (await classDefFor(cls)).inputs;
    },
    [classDefFor],
  );

  const undo = useCallback(async () => {
    const map = current.current;
    if (map && map.doc.undo()) await applyEdit();
  }, [applyEdit]);
  /** Several undos (negative) or redos (positive) at once, for the history panel's step list. */
  const jumpHistory = useCallback(
    async (delta: number) => {
      const map = current.current;
      if (!map || !delta) return;
      let n = 0;
      for (let i = 0; i < Math.abs(delta); i++) {
        if (!(delta < 0 ? map.doc.undo() : map.doc.redo())) break;
        n++;
      }
      if (n) await applyEdit();
    },
    [applyEdit],
  );

  const redo = useCallback(async () => {
    const map = current.current;
    if (map && map.doc.redo()) await applyEdit();
  }, [applyEdit]);

  const saveTo = useCallback(
    async (path: string) => {
      const map = current.current;
      if (!map) return;
      setBusy(tr("Сохранение…"));
      try {
        const vmfText = map.doc.to_vmf();
        await api.writeTextFile(path, vmfText);
        map.doc.mark_saved();
        currentPath.current = path;
        savedStampRef.current = stampOf(vmfText);
        setSavedStamp(savedStampRef.current);
        writeMeta(path, projectMetaRef.current);
        setRestoreOffer(null);
        void api.removeFile(autosavePathOf(path)).catch(() => {});
        api
          .saveHistory(path, map.doc.to_vmf(), HISTORY_KEEP)
          .then(() => {
            if (panelRef.current === "history") void refreshHistoryRef.current();
          })
          .catch((e) => void api.log(`history: ${String(e)}`));
        setMapName(path.split(/[\\/]/).pop() ?? path);
        setHist(history(map));
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy("");
      }
    },
    [writeMeta],
  );

  const saveAs = useCallback(async () => {
    const picked = await save({ defaultPath: currentPath.current || undefined, filters: [{ name: "Valve Map Format", extensions: ["vmf"] }] });
    if (typeof picked === "string") await saveTo(picked);
  }, [saveTo]);

  /** Save Incremental (Blender's Ctrl+Alt+S): the map goes to the next free numbered file and keeps working from there. */
  const saveIncremental = useCallback(async () => {
    if (!current.current) return;
    if (!currentPath.current) {
      await saveAs();
      return;
    }
    let path = nextIncrementPath(currentPath.current);
    for (let i = 0; i < 50; i++) {
      const taken = await api.readTextFile(path).then(
        () => true,
        () => false,
      );
      if (!taken) break;
      path = nextIncrementPath(path);
    }
    await saveTo(path);
    setStatusText(tr("сохранено новой версией: {0}", [path.split(/[\\/]/).pop()]));
  }, [saveAs, saveTo, setStatusText]);

  const saveCurrent = useCallback(async () => {
    if (currentPath.current) await saveTo(currentPath.current);
    else await saveAs();
    // Unreal checks the map on save: here quietly, a word in the status bar when something is found.
    if (!currentPath.current || !current.current) return;
    const found = (await checkProblems(true)) ?? [];
    if (found.length) setStatusText(tr("сохранено · проверка нашла проблем: {0} - Alt+P покажет", [found.length]));
  }, [saveAs, saveTo, checkProblems, setStatusText]);

  /**
   * Before anything that replaces the open map: offers to save unsaved
   * changes. Resolves true when it is fine to go on.
   */
  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    const map = current.current;
    if (!map || !history(map).dirty) return true;
    const answer = await ask({
      title: tr("Несохранённые изменения"),
      text: tr("В карте «{0}» есть несохранённые правки. Сохранить их?", [mapNameRef.current || tr("без имени")]),
      buttons: [
        { label: tr("Сохранить"), kind: "primary", value: "save" },
        { label: tr("Не сохранять"), kind: "danger", value: "discard" },
        { label: tr("Отмена"), value: "cancel" },
      ],
    });
    if (answer === "cancel") return false;
    if (answer === "save") {
      await saveCurrent();
      return !history(map).dirty;
    }
    return true;
  }, [ask, saveCurrent]);
  const confirmDiscardRef = useRef(confirmDiscard);
  confirmDiscardRef.current = confirmDiscard;

  // Compile output and completion events from the shell.
  useEffect(() => {
    const unLog = api.onCompileLog((l) => {
      if (l.run !== compileRun.current) return;
      setCompileState((st) => ({ ...st, lines: [...st.lines.slice(-2000), l.step === "editor" ? l.line : `[${l.step}] ${l.line}`] }));
    });
    // The game's console after "Play": error lines land in the build log, the summary in the status bar.
    const unGameLog = api.onGameLog((line) => {
      setCompileState((st) => ({ ...st, lines: [...st.lines.slice(-2000), `[game] ${line}`] }));
    });
    // The bridge addon's reports: hello, cubemaps progress, the player's position.
    const unBridge = api.onBridge((r: BridgeReport) => {
      if (r.event === "pos") {
        if (bridgeFollowRef.current) {
          const n = (k: string) => Number(r[k]) || 0;
          applyPlayerPose([n("x"), n("y"), n("z"), n("pitch"), n("yaw")]);
        }
        return;
      }
      void api.bridgeStatus().then(setBridge);
      if (r.event === "ran") return;
      if (r.event === "hello") {
        if (current.current) liveSnapRef.current = liveSnapshot(current.current.pointEntities);
        setStatusText(tr("игра подключена: {0}", [r.map ?? tr("карта")]));
        setCompileState((st) => ({ ...st, lines: [...st.lines.slice(-2000), tr("[мост] игра подключена, карта{0}", [r.map ?? "?"])] }));
      }
    });
    const unCubemaps = api.onGameCubemaps((d) => {
      cubemapsDoneRef.current = d;
      const text = d.ok
        ? tr("кубмапы собраны и записаны в maps/{0}.bsp за {1} с{2}", [d.map, (d.ms / 1000).toFixed(0), d.relaunched ? tr("; игра запущена снова") : ""])
        : d.timeout
          ? tr("кубмапы: игра не завершилась за 10 минут; соберите их в консоли игры командой buildcubemaps")
          : tr("кубмапы: BSP в maps не изменился; проверьте console.log игры (sv_cheats, права на запись в maps/{0}.bsp)", [d.map]);
      setStatusText(text);
      setCompileState((st) => ({ ...st, lines: [...st.lines.slice(-2000), tr("[кубмапы] {0}", [text])] }));
      void api.bridgeStatus().then(setBridge);
    });
    // The status itself once a second: connection, map, player position.
    const poll = window.setInterval(() => {
      if (!inTauri) return;
      void api
        .bridgeStatus()
        .then((st) =>
          setBridge((old) => (old && old.connected === st.connected && old.running === st.running && old.map === st.map && old.queued === st.queued && String(old.pos) === String(st.pos) ? old : st)),
        )
        .catch(() => {});
    }, 1000);
    const unGameDone = api.onGameDone((c) => {
      gameConsoleRef.current = c;
      if (c.loaded && projectMetaRef.current.compiledStamp) updateMeta({ testedStamp: projectMetaRef.current.compiledStamp, gameErrors: c.errors.length });
      const text =
        c.ended === "nolog"
          ? tr("нет вывода консоли игры: GMod не запущен или не пишет console.log")
          : c.errors.length
            ? tr("консоль игры: {0} ошибок в {1} строках, подробности в логе сборки", [c.errors.length, c.lines])
            : tr("консоль игры без ошибок: {0} строк, карта {1}", [c.lines, c.loaded ? tr("загружена") : tr("не упоминается в логе")]);
      setStatusText(text);
      setCompileState((st) => ({ ...st, lines: [...st.lines.slice(-2000), `[game] ${text}`] }));
      void api.log(`game-console: ${c.lines} lines, ${c.errors.length} errors, loaded ${c.loaded}, ended ${c.ended}`);
    });
    const unDone = api.onCompileDone((d) => {
      compileDoneRef.current = d.run;
      if (d.run !== compileRun.current) return;
      compileResultRef.current = { ok: d.ok, message: d.message, ms: d.ms };
      updateMeta({ compiledStamp: savedStampRef.current, compiledOk: d.ok, leak: compileLinesRef.current.some((l) => /leaked/i.test(l)) });
      setCompileState((st) => {
        const leaked = st.lines.some((l) => /leaked/i.test(l));
        if (leaked) void loadPointfile();
        else showLeak(null);
        return { ...st, running: false, ok: d.ok, result: d.ok ? `${d.message}${d.installed ? ` · ${d.installed}` : ""}` : d.message };
      });
      lastBsp.current = d.ok ? d.bsp : null;
      if (d.ok) tickStep("compile");
      lastInstalled.current = !!d.installed;
      if (d.ok && compileOptionsRef.current.vvis) void loadPortalfile();
      if (d.ok) void loadLeaves();
      setCanPack(!!(d.ok && d.bsp));
      if (d.ok && d.bsp && packAfterCompileRef.current) void packAfterRef.current();
      void autoAfterCompileRef.current(d.ok);
      void api.log(`compile-done: ok ${d.ok} ${d.message} bsp ${d.bsp ?? "none"} installed ${d.installed ?? "none"} ${d.ms} ms`);
    });
    return () => {
      void unLog.then((f) => f());
      void unDone.then((f) => f());
      void unGameLog.then((f) => f());
      void unGameDone.then((f) => f());
      void unBridge.then((f) => f());
      void unCubemaps.then((f) => f());
      window.clearInterval(poll);
    };
  }, [loadLeaves, loadPointfile, loadPortalfile, showLeak]);

  // Ctrl+wheel belongs to the lists (tile size); it must not zoom the page.
  useEffect(() => {
    const stop = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    window.addEventListener("wheel", stop, { passive: false });
    return () => window.removeEventListener("wheel", stop);
  }, []);

  // Closing the window with unsaved changes asks first; the autotests exit through the shell.
  // The main window takes its satellite windows with it.
  useEffect(() => {
    if (!inTauri || SAT_ANY) return;
    let unlisten: (() => void) | null = null;
    let closing = false;
    const closeSatellites = async () => {
      try {
        for (const w of await getAllWebviewWindows()) if (w.label !== "main") await w.close();
      } catch (e) {
        void api.log(`close satellites: ${String(e)}`);
      }
    };
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (closing) return;
        const map = current.current;
        if (!map || !history(map).dirty) {
          void closeSatellites();
          return;
        }
        event.preventDefault();
        if (await confirmDiscardRef.current()) {
          closing = true;
          await closeSatellites();
          await getCurrentWindow().destroy();
        }
      })
      .then((f) => {
        unlisten = f;
      })
      .catch((e) => void api.log(`close guard: ${String(e)}`));
    return () => unlisten?.();
  }, []);

  // Autosave: every two minutes an unsaved map with a path goes to <dir>/autosave/<name>.
  useEffect(() => {
    if (!inTauri) return;
    const timer = setInterval(() => {
      const map = current.current;
      const path = currentPath.current;
      // Autotests (GME_AUTOEXIT) must not leave autosave folders next to fixture maps.
      if (!map || !path || !history(map).dirty || appRef.current?.autoexit) return;
      const sep = path.includes("\\") ? "\\" : "/";
      const at = path.lastIndexOf(sep);
      const target = `${path.slice(0, at + 1)}autosave${sep}${path.slice(at + 1)}`;
      api
        .writeTextFile(target, map.doc.to_vmf())
        .then(() => setAutosaveNote(tr("автосохранение {0}", [new Date().toLocaleTimeString()])))
        .catch((e) => setAutosaveNote(tr("автосохранение не удалось: {0}", [String(e)])));
    }, 120000);
    return () => clearInterval(timer);
  }, []);

  // The renderer is created later than the state: push the remembered mode once it exists.
  useEffect(() => {
    session.current?.renderer.setViewMode(viewMode);
  }, [gpuOk, viewMode]);

  /** Hammer's Run Map (F9): saves, then compiles with the chosen tools. */
  const compileCurrent = useCallback(
    async (options?: CompileOptions, quiet?: boolean) => {
      const map = current.current;
      if (!map || !inTauri) return;
      if (!currentPath.current) {
        await saveAs();
        if (!currentPath.current) return;
      } else if (history(map).dirty) await saveTo(currentPath.current);
      if (!quiet) setPanel("compile");
      setCompileState({ running: true, lines: [], result: tr("запуск…"), ok: null });
      try {
        compileRun.current = await api.compileMap(currentPath.current, options ?? compileOptions);
      } catch (e) {
        compileResultRef.current = { ok: false, message: String(e), ms: 0 };
        setCompileState({ running: false, lines: [], result: String(e), ok: false });
      }
    },
    [compileOptions, saveAs, saveTo],
  );

  /** Axis-aligned bounds of an object index, or null. */
  const objectBounds = useCallback((map: LoadedMap, index: number): Box3 | null => {
    const solidCount = map.mesh.solidIds.length;
    if (index < solidCount) {
      const b = map.mesh.solidBounds;
      return [
        [b[index * 6], b[index * 6 + 1], b[index * 6 + 2]],
        [b[index * 6 + 3], b[index * 6 + 4], b[index * 6 + 5]],
      ];
    }
    const e = map.pointEntities[index - solidCount];
    if (!e || !e.origin) return null;
    const modelled = modelBoundsRef.current.get(e.id);
    if (modelled) return [[...modelled[0]] as Vec3, [...modelled[1]] as Vec3];
    const cls = classInfos.current.get(e.classname);
    const mins = cls?.mins ?? [-8, -8, -8];
    const maxs = cls?.maxs ?? [8, 8, 8];
    return [
      [e.origin[0] + mins[0], e.origin[1] + mins[1], e.origin[2] + mins[2]],
      [e.origin[0] + maxs[0], e.origin[1] + maxs[1], e.origin[2] + maxs[2]],
    ];
  }, []);

  /** What the inspector shows for the selection (built on demand while the panel is open). */
  const inspectorItems = useCallback((): InspectorItem[] => {
    const map = current.current;
    if (!map) return [];
    const items: InspectorItem[] = [];
    for (const id of Array.from(selection.current).slice(0, 200)) {
      const index = objectIndexOf(map, id);
      if (index === null) continue;
      const bounds = objectBounds(map, index);
      const solidCount = map.mesh.solidIds.length;
      if (index < solidCount) {
        const counts = new Map<string, number>();
        for (const side of map.doc.solid_sides(id)) {
          const m = map.doc.face_material(id, side);
          counts.set(m, (counts.get(m) ?? 0) + 1);
        }
        const owner = map.doc.entity_of_solid(id);
        const ownerEntity = owner ? map.entities.find((e) => e.id === owner) : undefined;
        items.push({
          id,
          kind: "solid",
          bounds,
          classname: ownerEntity?.classname ?? "worldspawn",
          targetname: ownerEntity?.targetname ?? null,
          owner,
          materials: Array.from(counts.entries()),
          group: map.doc.group_of(id),
          model: null,
          instanceFile: null,
          parms: [],
        });
      } else {
        const e = map.pointEntities[index - solidCount];
        if (!e) continue;
        items.push({
          id,
          kind: "entity",
          bounds,
          classname: e.classname,
          targetname: e.targetname,
          owner: 0,
          materials: [],
          group: map.doc.group_of(id),
          model: e.model,
          instanceFile: e.instance_file,
          parms: e.instance_file ? (instanceParms.current.get(e.instance_file) ?? []) : [],
        });
      }
    }
    return items;
  }, [objectBounds]);

  /** Moves the selection so its bounds centre lands on `centre`. */
  const moveSelectionCentre = useCallback(
    async (centre: Vec3) => {
      const b = selectionBoundsRef.current();
      if (!b) return;
      const now = boxCenter(b);
      await commitTranslate(selection.current, [centre[0] - now[0], centre[1] - now[1], centre[2] - now[2]]);
    },
    [commitTranslate],
  );

  /** Models only scale uniformly (one modelscale key): a props-only selection previews the strongest axis factor on all three. */
  const propsOnlyFactors = useCallback((factors: Vec3): Vec3 => {
    const map = current.current;
    if (!map) return factors;
    for (const id of selection.current) if (!map.pointEntities.some((e) => e.id === id && e.model)) return factors;
    const f = factors.reduce((best, v) => (Math.abs(v - 1) > Math.abs(best - 1) ? v : best), 1);
    return [f, f, f];
  }, []);
  /** Scales the selection about its centre so its box gets `size` (zero sizes stay). */
  const resizeSelection = useCallback(
    async (size: Vec3) => {
      const b = selectionBoundsRef.current();
      if (!b) return;
      const now = boxSize(b);
      const factors: Vec3 = [0, 1, 2].map((k) => (now[k] > 1e-6 && size[k] > 0 ? size[k] / now[k] : 1)) as Vec3;
      await commitScale(selection.current, boxCenter(b), factors);
    },
    [commitScale],
  );

  /** Bounds of the whole selection, or null. */
  const selectionBounds = useCallback((): Box3 | null => {
    const map = current.current;
    if (!map) return null;
    let out: Box3 | null = null;
    for (const i of selectedIndices()) {
      const b = objectBounds(map, i);
      if (!b) continue;
      if (!out) out = [[...b[0]], [...b[1]]];
      else {
        for (let k = 0; k < 3; k++) {
          out[0][k] = Math.min(out[0][k], b[0][k]);
          out[1][k] = Math.max(out[1][k], b[1][k]);
        }
      }
    }
    return out;
  }, [objectBounds, selectedIndices]);
  /** Drop to floor (Unreal's End): the selection falls along Z onto the highest object under it. */
  const dropToFloor = useCallback(async () => {
    const map = current.current;
    const sel = selectionBounds();
    if (!map || !sel || !selection.current.size) return;
    const chosen = new Set(selectedIndices());
    const others: Box3[] = [];
    const count = map.mesh.solidIds.length + map.pointEntities.length;
    for (let idx = 0; idx < count; idx++) {
      if (chosen.has(idx)) continue;
      const b = objectBounds(map, idx);
      if (b) others.push(b);
    }
    const dz = dropDelta(sel as Box, others as Box[]);
    if (dz === null) {
      setStatusText(tr("под выделением нет поверхности"));
      return;
    }
    if (Math.abs(dz) < 0.01) {
      setStatusText(tr("выделение уже стоит на поверхности"));
      return;
    }
    await commitTranslate(selection.current, [0, 0, dz]);
    setStatusText(tr("опущено на {0} юн.", [Math.round(-dz)]));
  }, [selectionBounds, selectedIndices, objectBounds, commitTranslate, setStatusText]);
  /** Hammer's Snap Selected to Grid: Ctrl+B moves the whole selection so its min corner sits on the grid, Ctrl+Shift+B snaps each object on its own. */
  const snapSelectionToGrid = useCallback(
    async (each: boolean) => {
      const map = current.current;
      const all = selectionBounds();
      if (!map || !all || !selection.current.size) return;
      const g = gridRef.current || 1;
      if (!each) {
        const d = gridSnapDelta(all[0] as Vec3, g);
        if (d.every((v) => v === 0)) {
          setStatusText(tr("выделение уже на сетке {0}", [g]));
          return;
        }
        await commitTranslate(selection.current, d);
        setStatusText(tr("прижато к сетке {0}: сдвиг {1}", [g, d.map((v) => Math.round(v * 100) / 100).join(" ")]));
        return;
      }
      const ids: number[] = [];
      const deltas: number[] = [];
      for (const id of selection.current) {
        const index = objectIndexOf(map, id);
        const b = index === null ? null : objectBounds(map, index);
        if (!b) continue;
        const d = gridSnapDelta(b[0] as Vec3, g);
        if (d.every((v) => v === 0)) continue;
        ids.push(id);
        deltas.push(...d);
      }
      if (!ids.length) {
        setStatusText(tr("все объекты уже на сетке {0}", [g]));
        return;
      }
      const res = map.doc.translate_each(new Uint32Array(ids), new Float64Array(deltas), textureLockRef.current) as EditResult | undefined;
      if (res) await applyEdit();
      setStatusText(tr("прижато к сетке {0}: {1} из {2}", [g, ids.length, selection.current.size]));
    },
    [selectionBounds, objectBounds, commitTranslate, applyEdit, setStatusText],
  );
  /** Quarter turn of the selection about its centre (Blender's R Z 90): Alt+Z clockwise from above, Alt+Shift+Z back. */
  const rotateSelection90 = useCallback(
    async (axis: 0 | 1 | 2, degrees: 90 | -90) => {
      const b = selectionBounds();
      if (!b || !selection.current.size) return;
      const pivot: Vec3 = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2];
      const ax: Vec3 = [0, 0, 0];
      ax[axis] = 1;
      await commitRotate(selection.current, pivot, ax, degrees);
      setStatusText(tr("повёрнуто на {0}{1}° вокруг {2}", [degrees > 0 ? "+" : "", degrees, "XYZ"[axis]]));
    },
    [selectionBounds, commitRotate, setStatusText],
  );
  /** Find brushes that dig into each other (by bounds): a common source of extra faces and of z-fighting in Source. */
  const findOverlaps = useCallback(() => {
    const map = current.current;
    if (!map) return;
    const n = map.mesh.solidIds.length;
    const boxes: Box[] = [];
    for (let i = 0; i < n; i++) {
      const b = objectBounds(map, i);
      boxes.push(
        (b ?? [
          [0, 0, 0],
          [0, 0, 0],
        ]) as Box,
      );
    }
    const pairs = overlappingPairs(boxes);
    const ids = new Set<number>();
    for (const [a, b] of pairs) {
      ids.add(map.mesh.solidIds[a]);
      ids.add(map.mesh.solidIds[b]);
    }
    selectIds([...ids]);
    setStatusText(pairs.length ? tr("пересечений: {0}, брашей выделено: {1} · «Вырезать выделением» (Ctrl+Shift+C) устранит перекрытие", [pairs.length, ids.size]) : tr("пересекающихся брашей нет"));
  }, [objectBounds, selectIds, setStatusText]);
  /** Copy coordinates: the selection's centre, or the 3D camera with nothing selected, as "x y z" or as a Lua Vector. */
  const copyCoordinates = useCallback(
    (lua: boolean) => {
      const b = selection.current.size ? selectionBounds() : null;
      const cam = session.current?.camera.position;
      const p: [number, number, number] | null = b ? [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2] : cam ? [cam[0], cam[1], cam[2]] : null;
      if (!p) return;
      const text = pointText(p, lua);
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      setStatusText(tr("в буфере {0}: {1}", [b ? tr("центр выделения") : tr("позиция камеры"), text]));
    },
    [selectionBounds, setStatusText],
  );
  /** Unity's Copy/Paste Transform: where the selection stands (and a point entity's angles) is kept for pasting onto other objects. */
  const transformClipRef = useRef<TransformClip | null>(null);
  const selectionPivot = useCallback((): { pos: Vec3; single: number | null } | null => {
    const map = current.current;
    const b = selectionBounds();
    if (!map || !b) return null;
    const only = selection.current.size === 1 ? [...selection.current][0] : null;
    const point = only !== null ? map.pointEntities.find((e) => e.id === only) : undefined;
    return { pos: pivotOf((point?.origin as Vec3 | null | undefined) ?? null, b as [Vec3, Vec3]), single: point ? point.id : null };
  }, [selectionBounds]);
  const copyTransform = useCallback(() => {
    const map = current.current;
    const p = selectionPivot();
    if (!map || !p) return;
    const angles = p.single !== null ? (((map.doc.entity_details(p.single) as EntityDetails | undefined)?.keyvalues ?? []).find(([k]) => k.toLowerCase() === "angles")?.[1] ?? "0 0 0") : null;
    transformClipRef.current = { pos: p.pos, angles };
    setStatusText(tr("трансформ скопирован: {0}{1} · вставка: положение или поворот", [p.pos.map((v) => Math.round(v * 100) / 100).join(" "), angles ? tr(", углы {0}", [angles]) : ""]));
  }, [selectionPivot, setStatusText]);
  const pasteTransform = useCallback(
    async (what: "position" | "rotation") => {
      const map = current.current;
      const clip = transformClipRef.current;
      if (!map || !clip) {
        setStatusText(tr("сначала скопируйте трансформ (Правка → Копировать трансформ)"));
        return;
      }
      if (what === "position") {
        const p = selectionPivot();
        if (!p) return;
        await commitTranslate(selection.current, deltaTo(p.pos, clip.pos));
        setStatusText(tr("выделение поставлено в {0}", [clip.pos.map((v) => Math.round(v * 100) / 100).join(" ")]));
        return;
      }
      if (!clip.angles) {
        setStatusText(tr("скопирован трансформ браша: у браша нет углов, вставляется только положение"));
        return;
      }
      let steps = 0;
      for (const id of [...selection.current]) {
        if (!map.pointEntities.some((x) => x.id === id)) continue;
        const had = ((map.doc.entity_details(id) as EntityDetails | undefined)?.keyvalues ?? []).find(([k]) => k.toLowerCase() === "angles")?.[1] ?? "0 0 0";
        if (had === clip.angles) continue;
        await setEntityKeys(id, [["angles", clip.angles]]);
        steps++;
      }
      if (steps > 1) mergeUndo(steps, tr("Вставить поворот: {0}", [steps]));
      setStatusText(steps ? tr("углы {0} у {1}", [clip.angles, steps]) : tr("поворот вставляется в точечные энтити и пропы"));
    },
    [selectionPivot, commitTranslate, setEntityKeys, mergeUndo, setStatusText],
  );
  /** Wrap in a trigger: a tools/toolstrigger brush around the selection, snapped out to the grid and tied to trigger_multiple in one step. */
  const wrapInTrigger = useCallback(async () => {
    const map = current.current;
    const b = selectionBounds();
    if (!map || !b || !selection.current.size) return;
    const g = gridRef.current || 1;
    const lo = b[0].map((v) => Math.floor(v / g) * g);
    const hi = b[1].map((v, k) => Math.max(Math.ceil(v / g) * g, lo[k] + g));
    const res = map.doc.create_block(new Float64Array([...lo, ...hi]), "tools/toolstrigger") as EditResult | undefined;
    if (!res) return;
    selection.current = new Set(res.changed_ids);
    await applyEdit();
    const before = current.current?.entities.length ?? 0;
    await tieSelection("trigger_multiple");
    // Two steps merge only when the tie really made the entity, never with an unrelated earlier step.
    if ((current.current?.entities.length ?? 0) > before) mergeUndo(2, tr("Триггер вокруг выделения"));
    setStatusText(tr("триггер {0} × {1} × {2} создан · выходы настраиваются в свойствах", [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]));
  }, [selectionBounds, applyEdit, tieSelection, mergeUndo, setStatusText]);
  /** Blender's View All (Home) and Unreal's frame all: every view takes in all visible objects, so a lost camera finds the map again. */
  const frameAll = useCallback(() => {
    const s = session.current;
    const map = current.current;
    if (!s || !map) return;
    const hidden = new Set<number>(map.doc.hidden_ids() as Uint32Array);
    const lo: Vec3 = [Infinity, Infinity, Infinity];
    const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
    const count = map.mesh.solidIds.length + map.pointEntities.length;
    for (let idx = 0; idx < count; idx++) {
      const id = idx < map.mesh.solidIds.length ? map.mesh.solidIds[idx] : map.pointEntities[idx - map.mesh.solidIds.length].id;
      if (hidden.has(map.doc.entity_of_solid(id) || id)) continue;
      const b = objectBounds(map, idx);
      if (!b) continue;
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], b[0][k]);
        hi[k] = Math.max(hi[k], b[1][k]);
      }
    }
    if (!Number.isFinite(lo[0])) {
      setStatusText(tr("в карте нет видимых объектов"));
      return;
    }
    s.camera.frame(lo, hi);
    for (const kind of VIEW_KINDS) {
      const v = s.views[kind];
      const c = canvas2dRefs.current[kind];
      if (v && c) v.camera.frame(lo, hi, c.clientWidth, c.clientHeight);
    }
    // The far clip from Settings may cut the map off from where the camera now stands: say so instead of showing half a map.
    const cam = s.camera.position;
    const reach = Math.max(...[0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => Math.hypot((i ? hi[0] : lo[0]) - cam[0], (j ? hi[1] : lo[1]) - cam[1], (k ? hi[2] : lo[2]) - cam[2])))));
    const cut = reach > s.camera.far ? tr(" · дальность прорисовки {0} меньше {1}: дальний край скрыт, увеличьте её в «Настройках»", [s.camera.far, Math.round(reach)]) : "";
    setStatusText(tr("показана вся карта: {0} × {1} × {2}{3}", [Math.round(hi[0] - lo[0]), Math.round(hi[1] - lo[1]), Math.round(hi[2] - lo[2]), cut]));
  }, [objectBounds, setStatusText]);
  /** Unreal's Pilot Actor: the first press puts the 3D camera inside the selected entity looking its way; fly and look around, the second press writes the new place and aim back to the entity and returns the camera. */
  const pilotRef = useRef<{
    id: number;
    pos: [number, number, number];
    pitch: number;
    yaw: number;
    start: [number, number, number];
    startPitch: number;
    startYaw: number;
    roll: number;
    pitchKey: boolean;
  } | null>(null);
  const pilotSelection = useCallback(async () => {
    const s = session.current;
    const map = current.current;
    if (!s || !map) return;
    const was = pilotRef.current;
    if (was) {
      pilotRef.current = null;
      const p = s.camera.position;
      const pos: [number, number, number] = [Math.round(p[0]), Math.round(p[1]), Math.round(p[2])];
      const pitch = -s.camera.pitch;
      const yaw = s.camera.yaw;
      const moved = pos.some((v, k) => Math.abs(v - was.start[k]) >= 1);
      const turned = Math.abs(pitch - was.startPitch) > 0.5 || Math.abs(yaw - was.startYaw) > 0.5;
      if (map.entities.some((e) => e.id === was.id) && (moved || turned)) {
        const changes: [string, string | null][] = [];
        if (moved) changes.push(["origin", pos.join(" ")]);
        if (turned) {
          changes.push(["angles", viewAnglesText(pitch, yaw, was.roll)]);
          if (was.pitchKey) changes.push(["pitch", String(Math.round(pitch * 10) / 10)]);
        }
        await setEntityKeys(was.id, changes);
      }
      s.camera.position = new Float32Array(was.pos);
      s.camera.pitch = was.pitch;
      s.camera.yaw = was.yaw;
      setStatusText(moved || turned ? tr("энтити повёрнута по направлению камеры; камера возвращена") : tr("камера возвращена"));
      return;
    }
    const ent = map.entities.find((e) => selection.current.has(e.id));
    const d = ent ? (map.doc.entity_details(ent.id) as EntityDetails | undefined) : undefined;
    const view = d ? entityView(d.keyvalues) : null;
    if (!ent || !d || !view) {
      setStatusText(tr("выделите точечную энтити (свет, камеру, проектор), чтобы смотреть с её позиции"));
      return;
    }
    const angles = (d.keyvalues.find(([k]) => k.toLowerCase() === "angles")?.[1] ?? "0 0 0").trim().split(/\s+/).map(Number);
    const c = s.camera.position;
    pilotRef.current = {
      id: ent.id,
      pos: [c[0], c[1], c[2]],
      pitch: s.camera.pitch,
      yaw: s.camera.yaw,
      start: view.origin,
      startPitch: -Math.max(-89, Math.min(89, -view.pitch)),
      startYaw: view.yaw,
      roll: Number.isFinite(angles[2]) ? angles[2] : 0,
      pitchKey: d.keyvalues.some(([k]) => k.toLowerCase() === "pitch"),
    };
    s.camera.position = new Float32Array(view.origin);
    s.camera.pitch = Math.max(-89, Math.min(89, -view.pitch));
    s.camera.yaw = view.yaw;
    setStatusText(tr("вид из {0}{1}: перемещайте камеру, Ctrl+Alt+P - записать новое направление", [ent.classname, ent.targetname ? ` «${ent.targetname}»` : ""]));
  }, [setEntityKeys, setStatusText]);
  // The flight speed changed with the wheel shows up in the status bar.
  useEffect(() => {
    const on = (e: Event) => setStatusText(speedText((e as CustomEvent<number>).detail));
    window.addEventListener("gme-fly-speed", on);
    return () => window.removeEventListener("gme-fly-speed", on);
  }, [setStatusText]);
  /** Small world brushes that should be func_detail (trim, steps, pillars): they slow VVIS down; selected so Ctrl+T ties them in one go. */
  const selectDetailCandidates = useCallback(() => {
    const map = current.current;
    if (!map) return;
    const { small: ids, total } = smallWorldBrushes(map, (m, i) => objectBounds(m, i) as [Vec3, Vec3] | null);
    if (!ids.length) {
      setStatusText(tr("мелких брашей мира нет: все мелкие браши уже func_detail"));
      return;
    }
    selectIds(ids);
    setStatusText(tr("мелких брашей мира: {0} из {1} · Ctrl+T - перевести в func_detail (ускорит VVIS)", [ids.length, total]));
  }, [objectBounds, selectIds, setStatusText]);
  /** Unreal's convert actor for props: every selected prop_* becomes `cls`, keeping model, place, skin and keys; one undo step. */
  const convertProps = useCallback(
    async (cls: "prop_static" | "prop_physics" | "prop_dynamic") => {
      const map = current.current;
      if (!map) return;
      const props = map.entities.filter((e) => selection.current.has(e.id) && e.classname.startsWith("prop_") && e.classname !== cls);
      if (!props.length) {
        setStatusText(tr("среди выделенного нет пропов другого класса, чем {0}", [cls]));
        return;
      }
      for (const e of props) await setEntityKeys(e.id, [["classname", cls]]);
      if (props.length > 1) mergeUndo(props.length, tr("Пропы → {0}: {1}", [cls, props.length]));
      let hint = cls === "prop_static" ? tr(" · статичный проп не двигается и не принимает входы") : "";
      if (cls === "prop_physics") {
        // Props whose model has no .phy vanish in the game: say how many, right away.
        const phy = Array.from(new Set(props.filter((e) => e.model).map((e) => e.model!.replace(/\.mdl$/i, ".phy"))));
        let missing = 0;
        if (inTauri && phy.length) {
          try {
            const none = new Set((await api.checkResources([], phy, null)).missingModels);
            missing = props.filter((e) => e.model && none.has(e.model.replace(/\.mdl$/i, ".phy"))).length;
          } catch {
            /* the check is a courtesy */
          }
        }
        hint = missing ? tr(" · у {0} из них модель без физики: в игре они не появятся (Alt+P - показать)", [missing]) : tr(" · у всех моделей есть физика");
      }
      setStatusText(tr("{0} пропов → {1}{2}", [props.length, cls, hint]));
    },
    [setEntityKeys, mergeUndo, setStatusText],
  );
  /** Blender's Select More: everything visible whose box touches a selected object joins the selection; again grows another ring. */
  const growSelection = useCallback(() => {
    const map = current.current;
    if (!map || !selection.current.size) return;
    const hidden = new Set<number>(map.doc.hidden_ids() as Uint32Array);
    const solids = map.mesh.solidIds.length;
    const all: { id: number; box: [Vec3, Vec3] }[] = [];
    const selected: [Vec3, Vec3][] = [];
    for (let idx = 0; idx < solids + map.pointEntities.length; idx++) {
      const id = idx < solids ? map.mesh.solidIds[idx] : map.pointEntities[idx - solids].id;
      if (hidden.has(map.doc.entity_of_solid(id) || id)) continue;
      const b = objectBounds(map, idx) as [Vec3, Vec3] | null;
      if (!b) continue;
      if (selection.current.has(id)) selected.push(b);
      else all.push({ id, box: b });
    }
    const { ids: more, tooBig } = touchingIds(selected, all, selection.current);
    const big = tooBig.length ? tr(" · крупные (пол, стены) пропущены: {0}", [tooBig.length]) : "";
    if (!more.length) {
      setStatusText(tr("с выделением больше ничего не соприкасается{0}", [big]));
      return;
    }
    selectIds([...selection.current, ...more]);
    setStatusText(tr("добавлено соседей: {0}, всего {1}{2} · Ctrl+Shift+G - следующий круг", [more.length, selection.current.size, big]));
  }, [objectBounds, selectIds, setStatusText]);
  /** The hinge of a selected rotating door moves to the other end of the door. */
  const flipHinge = useCallback(async () => {
    const map = current.current;
    if (!map) return;
    const doorId = [...selection.current].map((x) => map.doc.entity_of_solid(x) || x).find((id) => map.entities.find((e) => e.id === id)?.classname.toLowerCase() === "func_door_rotating");
    const b = selectionBounds();
    if (doorId === undefined || !b) {
      setStatusText(tr("выделите вращающуюся дверь (func_door_rotating)"));
      return;
    }
    const door = map.entities.find((e) => e.id === doorId)!;
    const near = edgeHinge(b as [Vec3, Vec3]);
    const at = door.origin;
    const onNear = !!at && Math.hypot(at[0] - near[0], at[1] - near[1]) < 2;
    const next = edgeHinge(b as [Vec3, Vec3], onNear).map((v) => Math.round(v));
    await setEntityKeys(doorId, [["origin", next.join(" ")]]);
    setStatusText(tr("петля двери перенесена: {0}", [next.join(" ")]));
  }, [selectionBounds, setEntityKeys, setStatusText]);
  /** Blender's Origin to Geometry for brush entities: each selected one gets its origin (its turning point) in the middle of its brushes. */
  const originToCentre = useCallback(async () => {
    const map = current.current;
    if (!map) return;
    const owners = [...new Set([...selection.current].map((id) => map.doc.entity_of_solid(id) || id))].filter((id) => (map.doc.entity_solids(id) as Uint32Array).length);
    let steps = 0;
    let last = "";
    for (const id of owners) {
      const solids = new Set<number>(map.doc.entity_solids(id) as Uint32Array);
      const boxes: [Vec3, Vec3][] = [];
      map.mesh.solidIds.forEach((sid, idx) => {
        const b = solids.has(sid) ? (objectBounds(map, idx) as [Vec3, Vec3] | null) : null;
        if (b) boxes.push(b);
      });
      const origin = originAtCentre(boxes);
      if (!origin) continue;
      await setEntityKeys(id, [["origin", origin]]);
      steps++;
      last = origin;
    }
    if (steps > 1) mergeUndo(steps, tr("Origin в центр: {0}", [steps]));
    setStatusText(steps ? (steps > 1 ? tr("origin в центре у {0} энтити", [steps]) : tr("origin в центре: {0}", [last])) : tr("выделите брашевую энтити (func_rotating, func_door_rotating…)"));
  }, [objectBounds, setEntityKeys, mergeUndo, setStatusText]);
  /** Unreal's Snap Object to View: the selection's centre moves to where the 3D camera stands, snapped to the grid (player starts, lights, sounds at the spot you look from). */
  const moveToCamera = useCallback(async () => {
    const s = session.current;
    const b = selectionBounds();
    if (!s || !b || !selection.current.size) return;
    const g = gridRef.current || 1;
    const p = s.camera.position;
    const delta = [0, 1, 2].map((k) => Math.round((p[k] - (b[0][k] + b[1][k]) / 2) / g) * g) as Vec3;
    if (delta.every((v) => v === 0)) {
      setStatusText(tr("выделение уже стоит у камеры"));
      return;
    }
    await commitTranslate(selection.current, delta);
    setStatusText(tr("перенесено к камере: {0}", [delta.map((v) => Math.round(v)).join(" ")]));
  }, [selectionBounds, commitTranslate, setStatusText]);
  /** Who points at this (Unreal's reference viewer): selects every entity whose outputs or name keys (target, parentname…) hit the selected entities' names. */
  const selectReferencing = useCallback(() => {
    const map = current.current;
    if (!map) return;
    // A brush entity is selected through its brushes: count their owner too.
    const owners = new Set<number>([...selection.current].map((id) => map.doc.entity_of_solid(id) || id));
    const names = new Set<string>();
    for (const e of map.entities) if (owners.has(e.id) && e.targetname) names.add(e.targetname.toLowerCase());
    if (!names.size) {
      setStatusText(tr("у выделенного объекта нет имени (targetname): на него невозможно сослаться"));
      return;
    }
    const out: number[] = [];
    for (const e of map.entities) {
      const d = map.doc.entity_details(e.id) as EntityDetails | undefined;
      if (d && refersTo(d, names)) out.push(e.id);
    }
    const label = [...names].slice(0, 2).join(", ");
    if (!out.length) {
      setStatusText(tr("ссылок на «{0}» нет", [label]));
      return;
    }
    selectIds(out);
    setStatusText(tr("ссылаются на «{0}»: {1}", [label, out.length]));
  }, [selectIds, setStatusText]);
  /** The whole path chain of the selected node or train: path_track and path_corner followed through target and altpath, both ways. */
  const selectPathChain = useCallback(() => {
    const map = current.current;
    if (!map) return;
    const nodes: PathNode[] = map.entities.map((e) => {
      const d = map.doc.entity_details(e.id) as EntityDetails | undefined;
      const next = (d?.keyvalues ?? []).filter(([k, v]) => v && PATH_KEYS.includes(k.toLowerCase())).map(([, v]) => v);
      return { id: e.id, name: e.targetname, next };
    });
    const start = [...selection.current].map((id) => map.doc.entity_of_solid(id) || id);
    const ids = chainIds(nodes, start);
    if (ids.length <= start.length) {
      setStatusText(tr("у выделенного объекта нет цепочки: ключ target не ссылается на другие энтити, и на него нет ссылок"));
      return;
    }
    // A train or another brush entity in the chain is selected through its brushes, as a click does.
    selectIds(
      ids.flatMap((id) => {
        const solids = Array.from(map.doc.entity_solids(id) as Uint32Array);
        return solids.length ? solids : [id];
      }),
    );
    // The route itself: path_track / path_corner stops along their target links, with its length.
    const stops = nodes
      .filter((n) => ids.includes(n.id) && /^path_/i.test(map.entities.find((e) => e.id === n.id)?.classname ?? ""))
      .map((n) => ({ ...n, origin: (map.entities.find((e) => e.id === n.id)?.origin ?? null) as [number, number, number] | null }));
    const route = stops.length > 1 ? routeLength(stops) : null;
    setStatusText(
      tr("цепочка пути: {0} энтити{1}", [
        ids.length,
        route
          ? tr(" · маршрут {0} {1} (≈{2} м), {3} {4}{5}", [
              Math.round(route.length),
              plural(Math.round(route.length), tr("юнит"), tr("юнита"), tr("юнитов")),
              (route.length * 0.01905).toFixed(1),
              route.stops,
              plural(route.stops, tr("остановка"), tr("остановки"), tr("остановок")),
              route.loop ? tr(", замкнут") : "",
            ])
          : "",
      ]),
    );
  }, [selectIds, setStatusText]);
  /** Nodraw on the faces of selected box brushes that lie flat against another solid box (world or func_detail): never seen, yet lit and textured. */
  const nodrawHiddenFaces = useCallback(async () => {
    const map = current.current;
    if (!map || !selection.current.size) return;
    const hidden = new Set<number>(map.doc.hidden_ids() as Uint32Array);
    type Side = { side: number; info: FaceInfo; dir: { axis: 0 | 1 | 2; sign: 1 | -1 } | null };
    const sidesOf = (id: number): Side[] =>
      Array.from(map.doc.solid_sides(id) as Uint32Array).map((side) => {
        const info = map.doc.face_info(id, side) as FaceInfo;
        return { side, info, dir: faceAxis(info.normal as Vec3) };
      });
    const isBox = (sides: Side[]) => sides.length === 6 && sides.every((s) => s.dir);
    // Coverers by the direction of their touching face: a face looking +X is hidden by a box whose −X face hides what is behind it.
    const coverers = new Map<string, { id: number; box: [Vec3, Vec3] }[]>();
    map.mesh.solidIds.forEach((id, idx) => {
      const owner = map.doc.entity_of_solid(id);
      if (hidden.has(owner || id)) return;
      if (owner && map.entities.find((e) => e.id === owner)?.classname.toLowerCase() !== "func_detail") return;
      const sides = sidesOf(id);
      const box = objectBounds(map, idx) as [Vec3, Vec3] | null;
      if (!box || !isBox(sides)) return;
      for (const s of sides) {
        if (!hidesBehind(s.info.material)) continue;
        const key = `${s.dir!.axis}${s.dir!.sign}`;
        coverers.set(key, [...(coverers.get(key) ?? []), { id, box }]);
      }
    });
    const pairs: number[] = [];
    let boxes = 0;
    map.mesh.solidIds.forEach((id, idx) => {
      if (!selection.current.has(id)) return;
      const sides = sidesOf(id);
      const box = objectBounds(map, idx) as [Vec3, Vec3] | null;
      if (!box || !isBox(sides)) return;
      boxes++;
      for (const s of sides) {
        const m = s.info.material.toLowerCase();
        if (m.startsWith("tools/") || s.info.disp_power > 0) continue;
        const others = (coverers.get(`${s.dir!.axis}${-s.dir!.sign}`) ?? []).filter((c) => c.id !== id).map((c) => c.box);
        if (faceCovered(box, s.info.normal as Vec3, others)) pairs.push(id, s.side);
      }
    });
    if (!pairs.length) {
      setStatusText(boxes ? tr("скрытых граней не найдено: ни одна грань выделенных брашей не прилегает целиком к другому брашу") : tr("в выделении нет прямоугольных брашей"));
      return;
    }
    const res = map.doc.edit_faces(new Uint32Array(pairs), { material: "tools/toolsnodraw", tex_w: 512, tex_h: 512 } as FaceEdit) as EditResult | undefined;
    if (res) await applyEdit();
    setStatusText(tr("nodraw на скрытых гранях: {0}", [pairs.length / 2]));
  }, [applyEdit, objectBounds, setStatusText]);
  /** Blender's Select Random: half of the selected objects stay selected (a brush entity counts as one); again halves once more. */
  const selectRandom = useCallback(() => {
    const map = current.current;
    if (!map || selection.current.size < 2) return;
    const owners = new Map<number, number[]>();
    for (const id of selection.current) {
      const owner = map.doc.entity_of_solid(id) || id;
      owners.set(owner, [...(owners.get(owner) ?? []), id]);
    }
    const units = [...owners.values()];
    if (units.length < 2) {
      setStatusText(tr("в выделении один объект: выбрать половину невозможно"));
      return;
    }
    const kept = randomSubset(units, 0.5, Math.random);
    selectIds(kept.flat());
    setStatusText(tr("случайная половина: {0} из {1} · повторить - сократить ещё вдвое", [kept.length, units.length]));
  }, [selectIds, setStatusText]);
  /** Blender's Join for box brushes: selected world boxes of one material that share whole faces become one box each run of them. */
  const mergeBrushes = useCallback(async () => {
    const map = current.current;
    if (!map || selection.current.size < 2) return;
    const groups = mergePlan(map, (m, i) => objectBounds(m, i) as [Vec3, Vec3] | null, selection.current);
    const { steps, made } = applyMerge(map, groups);
    if (!steps) {
      setStatusText(tr("нечего склеивать: нужны прямоугольные браши мира с одной текстурой, прилегающие друг к другу целой гранью"));
      return;
    }
    const merged = groups.reduce((n, g) => n + g.ids.length, 0);
    mergeUndo(steps, tr("Склеить браши: {0} → {1}", [merged, made.length]));
    await applyEdit();
    selectIds(made);
    setStatusText(tr("склеено: {0} {1} → {2} · выравнивание текстуры по миру", [merged, plural(merged, tr("браш"), tr("браша"), tr("брашей")), made.length]));
  }, [applyEdit, mergeUndo, objectBounds, selectIds, setStatusText]);
  /** Paste where the camera looks (Unreal's paste at the view): the copy lands on the surface in the middle of the 3D view, its base on the surface, snapped to the grid. */
  const pasteHere = useCallback(async () => {
    const s = session.current;
    const map = current.current;
    const canvas = canvasRef.current;
    if (!s || !map || !canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    let target: Vec3 | null = null;
    const id = await s.renderer.pick(s.camera, w / 2, h / 2);
    const info = id === null ? null : pickInfo(map, id);
    if (info?.kind === "face") {
      const plane = map.doc.face_plane(info.solidId, info.sideId);
      if (plane.length === 4) target = rayPlane(mouseRay(s.camera.viewProjection(w / h), s.camera.position, [w / 2, h / 2], w, h), [plane[0], plane[1], plane[2]], plane[3]);
    }
    if (!target) {
      const f = s.camera.forward();
      const p = s.camera.position;
      target = [p[0] + f[0] * 256, p[1] + f[1] * 256, p[2] + f[2] * 256];
    }
    const before = new Set(selection.current);
    await pasteClipboard();
    // Nothing pasted: the old selection must not move.
    if (!selection.current.size || [...selection.current].every((x) => before.has(x))) return;
    const b = selectionBounds();
    if (!b) return;
    const g = gridRef.current || 1;
    const snap = (v: number) => Math.round(v / g) * g;
    const delta: Vec3 = [snap(target[0] - (b[0][0] + b[1][0]) / 2), snap(target[1] - (b[0][1] + b[1][1]) / 2), snap(target[2]) - b[0][2]];
    if (delta.some((v) => v !== 0)) {
      await commitTranslate(selection.current, delta);
      mergeUndo(2, tr("Вставка перед камерой"));
    }
    setStatusText(tr("вставлено перед камерой"));
  }, [pasteClipboard, selectionBounds, commitTranslate, mergeUndo, setStatusText]);
  /** Select inside: every brush and point entity lying wholly within the selection's bounds (a room box takes its contents). */
  const selectInside = useCallback(() => {
    const map = current.current;
    const sel = selectionBounds();
    if (!map || !sel) return;
    const solidCount = map.mesh.solidIds.length;
    const count = solidCount + map.pointEntities.length;
    const boxes: (Box | null)[] = [];
    for (let idx = 0; idx < count; idx++) boxes.push(objectBounds(map, idx) as Box | null);
    const ids = boxesInside(sel as Box, boxes).map((idx) => (idx < solidCount ? map.mesh.solidIds[idx] : map.pointEntities[idx - solidCount].id));
    selectIds(ids);
    setStatusText(tr("внутри габаритов выделения: {0}", [ids.length]));
  }, [selectionBounds, objectBounds, selectIds, setStatusText]);

  /** Wireframe of the selected objects, for transform previews. */
  /** Rebuilds the vertex-tool handles for every 2D view when the selection or geometry changed. */
  const ensureVertexHandles = useCallback(() => {
    const map = current.current;
    const s = session.current;
    if (!map || !s) return;
    const solidIds = Array.from(selection.current).filter((id) => map.mesh.solidIds.includes(id));
    const version = `${map.doc.history().version}|${solidIds.join(",")}`;
    if (version === vertexHandlesVersion.current) return;
    vertexHandlesVersion.current = version;
    const corners: Vec3[] = [];
    for (const id of solidIds) {
      const v = map.doc.solid_vertices(id);
      for (let i = 0; i + 2 < v.length; i += 3) corners.push([v[i], v[i + 1], v[i + 2]]);
    }
    const edges = selectionEdgesRef.current();
    for (const kind of VIEW_KINDS) {
      const view = s.views[kind];
      vertexHandles.current[kind] = view ? buildVertexHandles(view.camera.axes, corners, edges) : [];
    }
    vertexHover.current = null;
  }, []);
  const selectionEdgesRef = useRef<() => Float32Array>(() => new Float32Array(0));

  /** Nearest vertex handle of a view within a few pixels, or null. */
  const vertexHandleAt = useCallback((view: OrthoCamera, css: [number, number]): number | null => {
    const list = vertexHandles.current[view.kind];
    let best: number | null = null;
    let bestD = 7;
    list.forEach((h, i) => {
      const p = view.worldToCss(h.world2);
      const d = Math.max(Math.abs(p[0] - css[0]), Math.abs(p[1] - css[1]));
      if (d < bestD || (d === bestD && h.kind === "vertex")) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }, []);

  const selectionEdges = useCallback((): Float32Array => {
    const map = current.current;
    if (!map) return new Float32Array(0);
    const solidCount = map.mesh.solidIds.length;
    const indices = selectedIndices();
    const solids = new Set(indices.filter((i) => i < solidCount));
    const parts: Float32Array[] = [];
    if (solids.size) {
      const src = map.mesh.edges;
      const owners = map.mesh.edgeSolids;
      let n = 0;
      for (let v = 0; v < owners.length; v++) if (solids.has(owners[v])) n++;
      const out = new Float32Array(n * 3);
      let o = 0;
      for (let v = 0; v < owners.length; v++) {
        if (!solids.has(owners[v])) continue;
        out[o++] = src[v * 3];
        out[o++] = src[v * 3 + 1];
        out[o++] = src[v * 3 + 2];
      }
      parts.push(out);
    }
    for (const i of indices) {
      if (i < solidCount) continue;
      const b = objectBounds(map, i);
      if (b) parts.push(boxEdges(b));
    }
    const total = parts.reduce((a, p) => a + p.length, 0);
    const out = new Float32Array(total);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }, [objectBounds, selectedIndices]);

  /** Smallest object whose bounds contain the point in a 2D view, like Hammer. */
  const hitTest2D = useCallback(
    (view: OrthoCamera, world: [number, number]): number | null => {
      const map = current.current;
      if (!map) return null;
      const [ax, ay] = view.axes;
      const tol = 2 * view.unitsPerPixel;
      let best: number | null = null;
      let bestArea = Infinity;
      const total = map.mesh.solidIds.length + map.pointEntities.length;
      for (let i = 0; i < total; i++) {
        if (culledRef.current.has(i)) continue;
        const b = objectBounds(map, i);
        if (!b) continue;
        const [lo, hi] = b;
        if (world[0] < lo[ax] - tol || world[0] > hi[ax] + tol || world[1] < lo[ay] - tol || world[1] > hi[ay] + tol) continue;
        const area = (hi[ax] - lo[ax] + tol) * (hi[ay] - lo[ay] + tol);
        if (area < bestArea) {
          bestArea = area;
          best = i;
        }
      }
      return best;
    },
    [objectBounds],
  );

  /** VMF id of an object index. */
  const idOf = useCallback((map: LoadedMap, index: number): number | null => {
    const solidCount = map.mesh.solidIds.length;
    return index < solidCount ? map.mesh.solidIds[index] : (map.pointEntities[index - solidCount]?.id ?? null);
  }, []);

  /** Objects whose bounds touch a world rectangle in the view's axes. */
  const objectsInRect = useCallback(
    (view: OrthoCamera, a: [number, number], b: [number, number]): number[] => {
      const map = current.current;
      if (!map) return [];
      const [ax, ay] = view.axes;
      const rect: Box3 = [
        [-Infinity, -Infinity, -Infinity],
        [Infinity, Infinity, Infinity],
      ];
      rect[0][ax] = Math.min(a[0], b[0]);
      rect[1][ax] = Math.max(a[0], b[0]);
      rect[0][ay] = Math.min(a[1], b[1]);
      rect[1][ay] = Math.max(a[1], b[1]);
      const out: number[] = [];
      const total = map.mesh.solidIds.length + map.pointEntities.length;
      for (let i = 0; i < total; i++) {
        if (culledRef.current.has(i)) continue;
        const bb = objectBounds(map, i);
        if (bb && boxesIntersect(bb, rect)) {
          const id = idOf(map, i);
          if (id !== null) out.push(id);
        }
      }
      return out;
    },
    [idOf, objectBounds],
  );

  useEffect(() => {
    objectBoundsRef.current = objectBounds;
    selectionBoundsRef.current = selectionBounds;
    selectionEdgesRef.current = selectionEdges;
  }, [objectBounds, selectionBounds, selectionEdges]);

  /** Cordon box from a snapped 2D rectangle; the unseen axis keeps the old cordon's extent or spans the map. */
  const cordonFromRect = useCallback((view: OrthoCamera, a: [number, number], b: [number, number]): Box3 | null => {
    const [ax, ay] = view.axes;
    const az = 3 - ax - ay;
    const x0 = view.snap(Math.min(a[0], b[0]));
    const x1 = view.snap(Math.max(a[0], b[0]));
    const y0 = view.snap(Math.min(a[1], b[1]));
    const y1 = view.snap(Math.max(a[1], b[1]));
    if (x1 - x0 < 1 || y1 - y0 < 1) return null;
    const old = cordonRef.current?.box;
    const mapBounds = current.current?.stats.bounds;
    const z0 = old ? old[0][az] : mapBounds ? mapBounds[0][az] - 64 : -1024;
    const z1 = old ? old[1][az] : mapBounds ? mapBounds[1][az] + 64 : 1024;
    const lo: Vec3 = [0, 0, 0];
    const hi: Vec3 = [0, 0, 0];
    lo[ax] = x0;
    hi[ax] = x1;
    lo[ay] = y0;
    hi[ay] = y1;
    lo[az] = z0;
    hi[az] = z1;
    return [lo, hi];
  }, []);

  /** Box for the block tool from a snapped 2D rectangle; the unseen axis comes from the selection or the last block. */
  const boxFromRect = useCallback(
    (view: OrthoCamera, a: [number, number], b: [number, number]): Box3 | null => {
      const [ax, ay] = view.axes;
      const az = 3 - ax - ay;
      const x0 = view.snap(Math.min(a[0], b[0]));
      const x1 = view.snap(Math.max(a[0], b[0]));
      const y0 = view.snap(Math.min(a[1], b[1]));
      const y1 = view.snap(Math.max(a[1], b[1]));
      if (x1 - x0 < 1 || y1 - y0 < 1) return null;
      const sel = selectionBounds();
      let z0: number;
      let z1: number;
      if (sel) {
        z0 = sel[0][az];
        z1 = sel[1][az];
      } else {
        z0 = 0;
        z1 = Math.max(view.gridSize, lastBlockExtent.current[az]);
      }
      const lo: Vec3 = [0, 0, 0];
      const hi: Vec3 = [0, 0, 0];
      lo[ax] = x0;
      hi[ax] = x1;
      lo[ay] = y0;
      hi[ay] = y1;
      lo[az] = z0;
      hi[az] = z1;
      return [lo, hi];
    },
    [selectionBounds],
  );

  /**
   * The pending block box with the edge (or corner) under `handle` dragged to
   * `world` on this view's axes: the box drawn in one 2D view gets its third
   * axis set in another, as in Hammer, instead of being drawn again. The
   * edge that moves is the one nearest the handle; the box keeps at least one
   * grid step of size.
   */
  const resizeBoxByHandle = useCallback((view: OrthoCamera, handle: Handle, bounds: Box3, world: [number, number]): Box3 => {
    const [ax, ay] = view.axes;
    const lo: Vec3 = [...bounds[0]];
    const hi: Vec3 = [...bounds[1]];
    const pos = handlePositions(view, bounds, "scale").find((p) => p.handle.kind === "scale" && handle.kind === "scale" && p.handle.sx === handle.sx && p.handle.sy === handle.sy);
    const at = pos ? view.cssToWorld(pos.css) : null;
    const step = Math.max(1, view.gridSize);
    const move = (axis: number, w: number, hw: number | null) => {
      if (hw === null) return;
      const v = view.snap(w);
      if (Math.abs(hw - lo[axis]) <= Math.abs(hw - hi[axis])) lo[axis] = Math.min(v, hi[axis] - step);
      else hi[axis] = Math.max(v, lo[axis] + step);
    };
    if (handle.kind === "scale" && handle.sx !== 0) move(ax, world[0], at ? at[0] : null);
    if (handle.kind === "scale" && handle.sy !== 0) move(ay, world[1], at ? at[1] : null);
    return [lo, hi];
  }, []);

  /**
   * New bounds, pivot and factors for dragging a scale handle to a world
   * point (view axes). The opposite edge stays put; sizes never drop below one unit.
   */
  const scaleFromHandle = useCallback((view: OrthoCamera, handle: Handle, bounds: Box3, world: [number, number]) => {
    const lo: Vec3 = [...bounds[0]];
    const hi: Vec3 = [...bounds[1]];
    const pivot: Vec3 = [...bounds[0]];
    const factors: Vec3 = [1, 1, 1];
    const apply = (axis: number, side: -1 | 0 | 1, value: number) => {
      if (side === 0) return;
      const v = view.snap(value);
      const size = bounds[1][axis] - bounds[0][axis];
      if (side === 1) {
        hi[axis] = Math.max(v, lo[axis] + 1);
        pivot[axis] = lo[axis];
      } else {
        lo[axis] = Math.min(v, hi[axis] - 1);
        pivot[axis] = hi[axis];
      }
      factors[axis] = size > 0 ? (hi[axis] - lo[axis]) / size : 1;
    };
    apply(view.axes[0], handle.sx, world[0]);
    apply(view.axes[1], handle.sy, world[1]);
    return { pivot, factors, bounds: [lo, hi] as Box3 };
  }, []);

  /** Rotation axis a 2D view turns about: the one pointing at the viewer. */
  const viewAxisVector = useCallback((view: OrthoCamera): Vec3 => {
    const [ax, ay] = view.axes;
    const a: Vec3 = [0, 0, 0];
    const b: Vec3 = [0, 0, 0];
    a[ax] = 1;
    b[ay] = 1;
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }, []);

  /**
   * The selected objects themselves drawn under the transform (the renderer
   * applies the matrix to their vertices). The edge wireframe is no longer
   * drawn: for a turned prop it was the axis-aligned box turned once more.
   */
  const showTransformPreview = useCallback((affine: Affine | null, _edges: Float32Array | null) => {
    const r = session.current?.renderer;
    const map = current.current;
    if (!r) return;
    r.setOverlay("xform", null, PREVIEW_COLOR);
    if (affine && map) {
      const idx: number[] = [];
      for (const id of selection.current) {
        const i = objectIndexOf(map, id);
        if (i !== null) idx.push(i);
      }
      r.setPreviewAffine(idx, affine);
    } else r.setPreview([], [0, 0, 0]);
  }, []);

  /** Draws handles, marquee and labels onto the 2D overlay canvases; runs every frame. */
  const drawOverlays = useCallback(() => {
    const s = session.current;
    if (!s) return;
    const bounds = liveBounds.current ?? (selection.current.size ? selectionBounds() : null);
    const d = drag.current;
    const dpr = effectiveDpr();
    for (const kind of VIEW_KINDS) {
      const canvas = overlayRefs.current[kind];
      const view = s.views[kind];
      if (!canvas || !view) continue;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) continue;
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let marquee: [number, number, number, number] | null = null;
      if (d?.kind === "marquee" && d.view === kind && pressedCss.current) {
        marquee = [d.startCss[0], d.startCss[1], pressedCss.current[0], pressedCss.current[1]];
      }
      const hov = handleHover.current;
      let points: { css: [number, number]; kind: "vertex" | "edge"; hot: boolean }[] | undefined;
      if (toolRef.current === "vertex" && selection.current.size) {
        ensureVertexHandles();
        const vh = vertexHover.current;
        points = vertexHandles.current[kind].map((h, i) => ({
          css: view.camera.worldToCss(h.world2),
          kind: h.kind,
          hot: (vh !== null && vh.view === kind && vh.index === i) || (d?.kind === "vertex" && d.handle === h),
        }));
      }
      const vs = vertexSnapMarker.current;
      if (vs && vs.view === kind) points = [...(points ?? []), { css: view.camera.worldToCss(vs.world2), kind: "vertex" as const, hot: true }];
      const ov = selectedOverlay();
      if (ov) {
        const [ax, ay] = view.camera.axes;
        points = ov.frame.corners.map((c, i) => {
          const moved: Vec3 = d?.kind === "overlay" && d.index === i ? [c[0] + d.delta[0], c[1] + d.delta[1], c[2] + d.delta[2]] : c;
          return { css: view.camera.worldToCss([moved[ax], moved[ay]]), kind: "vertex" as const, hot: d?.kind === "overlay" && d.index === i };
        });
      }
      const blockBox = toolRef.current === "block" ? pendingBox.current : null;
      const pins = projectMetaRef.current.pins;
      const [nx, ny] = view.camera.axes;
      const notes = pins.length ? pins.map((n) => ({ css: view.camera.worldToCss([n.pos[nx], n.pos[ny]]), text: n.text, done: n.done })) : undefined;
      drawOverlay2D(ctx, view.camera, {
        bounds: toolRef.current === "select" ? bounds : blockBox,
        mode: blockBox ? "scale" : d?.kind === "rotate" ? "rotate" : d?.kind === "scale" ? "scale" : handleMode.current,
        hover: hov && hov.view === kind ? hov.handle : null,
        marquee,
        label: liveLabel.current,
        points,
        notes,
      });
    }
  }, [selectedOverlay, selectionBounds]);
  // Notes change outside the render loop (panel, assistant): redraw the 2D markers at once.
  useEffect(() => {
    drawOverlays();
  }, [drawOverlays, projectMeta.pins]);

  /** Keeps the 3D move gizmo at the selection centre, sized for the camera distance. */
  const updateGizmo = useCallback(
    (camera: FlyCamera) => {
      const s = session.current;
      const g = gizmo.current;
      if (!s) return;
      const bounds = selection.current.size && toolRef.current === "select" ? selectionBounds() : null;
      if (!bounds) {
        if (g.key) {
          g.key = "";
          s.renderer.setOverlay("gizmo", null, PREVIEW_COLOR, "3d");
        }
        return;
      }
      const center = boxCenter(bounds);
      if (g.drag) for (let k = 0; k < 3; k++) center[k] += g.drag.delta[k];
      const len = gizmoLength(camera, center, canvasRef.current?.clientHeight ?? 600);
      // Re-upload only when the arrow length changes by about 3 %.
      const quantized = Math.round(Math.log(len) / Math.log(1.03));
      const hoverAxis = g.drag ? g.drag.axis : g.hover;
      const mode = g.drag ? g.drag.mode : handleMode.current;
      const key = `${center.join(",")}|${quantized}|${hoverAxis}|${mode}`;
      if (key === g.key) return;
      g.key = key;
      s.renderer.setOverlay("gizmo", gizmoLines(center, len, mode), gizmoColors(mode, hoverAxis), "3d");
    },
    [selectionBounds],
  );

  // Renderer, cameras and the frame loop.
  useEffect(
    () =>
      startSession({
        canvasRef,
        canvas2dRefs,
        session,
        current,
        satChannelRef,
        selection,
        hoverPending,
        activeView,
        drag,
        toolRef,
        handleMode,
        setHandleMode,
        handleHover,
        liveBounds,
        liveLabel,
        pressedCss,
        perfSampler,
        pendingBox,
        blockStart,
        blockEdit,
        pendingAxis,
        cordonStart,
        clipLineRef,
        measureRef,
        vertexHandles,
        vertexHover,
        setGpu,
        setGpuOk,
        setRender,
        setError,
        lockedViewsRef,
        views,
        setHover,
        hover,
        withGroup,
        pickTargetRef,
        applySelection,
        selectedIndices,
        selectIds,
        setPendingBox,
        setClipLine,
        setMeasure,
        setTool,
        moveStep,
        dockToNeighbours,
        snapToVertex,
        vertexSnapMarker,
        refreshCordon,
        projectMetaRef,
        goToPoint,
        setPanel,
        applyEdit,
        commitTranslate,
        commitRotate,
        commitScale,
        runEdit,
        cloneSelection,
        createEntityAt,
        selectedOverlay,
        finishPickTarget,
        propsOnlyFactors,
        selectionBounds,
        ensureVertexHandles,
        vertexHandleAt,
        selectionEdges,
        hitTest2D,
        idOf,
        objectsInRect,
        cordonFromRect,
        boxFromRect,
        resizeBoxByHandle,
        scaleFromHandle,
        viewAxisVector,
        showTransformPreview,
        drawOverlays,
        updateGizmo,
      }),
    [
      applySelection,
      boxFromRect,
      commitRotate,
      commitScale,
      commitTranslate,
      cordonFromRect,
      createEntityAt,
      drawOverlays,
      refreshCordon,
      runEdit,
      setClipLine,
      hitTest2D,
      idOf,
      objectsInRect,
      applyEdit,
      ensureVertexHandles,
      vertexHandleAt,
      scaleFromHandle,
      selectIds,
      selectedIndices,
      selectionBounds,
      selectionEdges,
      setPendingBox,
      showTransformPreview,
      updateGizmo,
      viewAxisVector,
      withGroup,
    ],
  );

  // Shell info and content status (in a plain browser the API is a dev stub).
  useEffect(() => {
    void api.appInfo().then(setApp);
    void api.contentStatus().then(setContent);
    const un = api.onContentStatus(setContent);
    return () => {
      void un.then((f) => f());
    };
  }, []);

  /** Makes a parsed map the current one: resets selection, frames the views, uploads it. */
  const installMap = useCallback(
    async (loaded: LoadedMap, path: string, name: string) => {
      const s = session.current;
      if (!s) return;
      current.current?.doc.free();
      current.current = loaded;
      currentPath.current = path;
      selection.current = new Set();
      setHandleMode("move");
      setPendingBox(null);
      setSelectedCount(0);
      setHover(null);
      setMapName(name);
      updateMapInfo(loaded);
      setHist(history(loaded));
      setProblems(null);
      const stamp = path ? stampOf(loaded.doc.to_vmf()) : null;
      savedStampRef.current = stamp;
      setSavedStamp(stamp);
      void loadMeta(path);
      const st = loaded.stats;
      const bounds = st.bounds ?? [
        [-512, -512, -256],
        [512, 512, 256],
      ];
      s.camera.frame(bounds[0], bounds[1]);
      for (const kind of VIEW_KINDS) {
        const v = s.views[kind];
        if (v) v.camera.frame(bounds[0], bounds[1], v.canvas.clientWidth || 400, v.canvas.clientHeight || 300);
      }
      setBusy(tr("Загрузка материалов…"));
      const tm = openTiming.current;
      let t = performance.now();
      const project = path ? await api.openMapProject(path) : { root: null, files: 0 };
      tm.project = performance.now() - t;
      t = performance.now();
      const infos = await api.materialsInfo(loaded.mesh.materials);
      materialInfos.current = new Map(infos.map((i) => [i.name, i]));
      tm.materials = performance.now() - t;
      t = performance.now();
      s.renderer.setMesh(loaded.mesh, infos);
      tm.mesh = performance.now() - t;
      classInfos.current.clear();
      modelCache.current.clear();
      t = performance.now();
      await refreshEntities();
      tm.entities = performance.now() - t;
      refreshCordon();
      setClipLine(null);
      scheduleDocSyncRef.current();
      return project;
    },
    [refreshCordon, refreshEntities, setClipLine, setPendingBox, updateMapInfo, loadMeta],
  );

  /**
   * Channel to the satellite windows. The main window answers "hello" and
   * every edit with the whole document; a satellite installs it, keeping
   * its own cameras, and reports "ready" the first time.
   */
  const satChannel = useRef<BroadcastChannel | null>(null);
  /** Satellite windows that said hello and have not said bye: with none, edits are not serialised at all. */
  const satPeers = useRef(new Set<string>());
  const satTimer = useRef<number | null>(null);
  const satReadyWaiters = useRef<((n: number) => void)[]>([]);
  const satFirstDoc = useRef(true);
  const sendDoc = useCallback(() => {
    const map = current.current;
    const ch = satChannel.current;
    if (!map || !ch || SAT_ANY || !satPeers.current.size) return;
    const msg: DocMessage = { type: "doc", text: map.doc.to_vmf(), name: mapNameRef.current, path: currentPath.current };
    ch.postMessage(msg);
  }, []);
  /** Sends the document to the satellites a moment after the last edit. */
  const scheduleDocSync = useCallback(() => {
    if (SAT_ANY || !satChannel.current) return;
    if (satTimer.current !== null) window.clearTimeout(satTimer.current);
    satTimer.current = window.setTimeout(() => {
      satTimer.current = null;
      sendDoc();
    }, 150);
  }, [sendDoc]);
  const receiveDoc = useCallback(
    async (text: string, name: string, path: string) => {
      const s = session.current;
      if (!s) return;
      const keep = !satFirstDoc.current;
      const cam = { position: Float32Array.from(s.camera.position), yaw: s.camera.yaw, pitch: s.camera.pitch };
      const views2d = VIEW_KINDS.map((k) => {
        const v = s.views[k];
        return v ? { k, center: [...v.camera.center] as [number, number], upp: v.camera.unitsPerPixel } : null;
      });
      try {
        const loaded = await loadMap(text);
        await installMap(loaded, path, name);
        if (keep) {
          s.camera.position.set(cam.position);
          s.camera.yaw = cam.yaw;
          s.camera.pitch = cam.pitch;
          for (const v2 of views2d) {
            const v = v2 && s.views[v2.k];
            if (v && v2) {
              v.camera.center = v2.center;
              v.camera.unitsPerPixel = v2.upp;
            }
          }
        }
        if (satFirstDoc.current) {
          satFirstDoc.current = false;
          // The canvases had no size when the map was framed: frame again once laid out.
          requestAnimationFrame(() => {
            const b = loaded.stats.bounds;
            if (!b) return;
            s.camera.frame(b[0], b[1]);
            for (const k of VIEW_KINDS) {
              const v = s.views[k];
              if (v) v.camera.frame(b[0], b[1], v.canvas.clientWidth || 400, v.canvas.clientHeight || 300);
            }
          });
          const msg: DocMessage = { type: "ready", from: satelliteLabel(SATELLITE ?? "3d"), view: SATELLITE ?? "3d", solids: loaded.stats.solids };
          satChannel.current?.postMessage(msg);
          void api.log(`satellite ${SATELLITE}: ${loaded.stats.solids} solids`);
        }
      } catch (e) {
        void api.log(`satellite doc: ${String(e)}`);
      }
    },
    [installMap],
  );
  const receiveDocRef = useRef(receiveDoc);
  receiveDocRef.current = receiveDoc;
  scheduleDocSyncRef.current = scheduleDocSync;
  const sendDocRef = useRef(sendDoc);
  sendDocRef.current = sendDoc;
  useEffect(() => {
    const ch = docChannel();
    if (!ch) return;
    satChannel.current = ch;
    satChannelRef.current = ch;
    ch.onmessage = (ev: MessageEvent<DocMessage>) => {
      const m = ev.data;
      if (m.type === "zoom") {
        const s = session.current;
        if (!s) return;
        for (const kind of VIEW_KINDS) {
          const v = s.views[kind];
          if (v && !lockedViewsRef.current.includes(kind) && (!SATELLITE || SATELLITE === kind)) v.camera.unitsPerPixel = m.upp;
        }
        return;
      }
      if (m.type === "cmd") {
        if (!SAT_ANY) cmdRef.current(m);
        return;
      }
      if (SAT_ANY) {
        if (m.type === "doc") void receiveDocRef.current(m.text, m.name, m.path);
        else if (m.type === "sel" && current.current) {
          selection.current = new Set(m.ids);
          applySelectionRef.current();
        }
      } else if (m.type === "hello") {
        satPeers.current.add(m.from);
        sendDocRef.current();
      } else if (m.type === "bye") satPeers.current.delete(m.from);
      else if (m.type === "ready") {
        void api.log(`satellite ${m.view} ready: ${m.solids} solids`);
        for (const w of satReadyWaiters.current.splice(0)) w(m.solids);
      }
    };
    return () => {
      ch.close();
      satChannel.current = null;
      satChannelRef.current = null;
    };
  }, []);
  // A satellite asks for the document once its renderer exists, and again every two seconds until it gets one.
  useEffect(() => {
    const sat = SATELLITE;
    if (!sat || !gpuOk) return;
    const hello = () => {
      if (!satFirstDoc.current) return;
      satChannel.current?.postMessage({ type: "hello", from: satelliteLabel(sat) } satisfies DocMessage);
    };
    hello();
    const timer = window.setInterval(hello, 2000);
    const bye = () => satChannel.current?.postMessage({ type: "bye", from: satelliteLabel(sat) } satisfies DocMessage);
    window.addEventListener("beforeunload", bye);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("beforeunload", bye);
    };
  }, [gpuOk]);
  /** Opens a browser panel (textures, models, prefabs) in its own window; its clicks come back as commands. */
  const openPanelWindow = useCallback((kind: Panel) => {
    if (!inTauri) return;
    const label = `sat-panel-${kind}-${Date.now().toString(36)}`;
    const w = new WebviewWindow(label, { url: `/?panel=${kind}`, title: `${PANEL_TITLES[kind]} - Mallet`, width: 460, height: 760, minWidth: 320, minHeight: 300 });
    void w.once("tauri://error", (e) => void api.log(`panel window ${label}: ${JSON.stringify(e.payload)}`));
  }, []);
  /** Commands a panel window sends: they run here as if clicked in the main window. */
  const cmdRef = useRef<(m: Extract<DocMessage, { type: "cmd" }>) => void>(() => {});
  cmdRef.current = (m) => {
    if (m.cmd === "replace") {
      void replaceTextures(m.find, m.replace, m.scope, m.substring);
      return;
    }
    const name = m.name ?? "";
    if (m.cmd === "material") {
      setCurrentMaterial(name);
      if (toolRef.current !== "texture") setTool("texture");
    } else if (m.cmd === "paintMode") {
      setCurrentMaterial(name);
      setTool("texture");
      setPaintClick(true);
    } else if (m.cmd === "applyMaterial") void applyMaterialToSelection();
    else if (m.cmd === "model") void pickModel(name);
    else if (m.cmd === "placeModel") void placeModelRef.current(name);
    else if (m.cmd === "savePrefab") void savePrefab(name);
    else if (m.cmd === "prefab") {
      const p = (prefabsRef.current ?? []).find((x) => x.name === name);
      if (p) void insertPrefab(p);
      else
        void api.listPrefabs().then((list) => {
          const q = list.find((x) => x.name === name);
          if (q) void insertPrefab(q);
        });
    }
  };
  /** Opens a view in its own window (another monitor, a second camera); resolves once it shows the map. */
  const openSatellite = useCallback(
    (view: ViewId): Promise<number> =>
      new Promise((resolve) => {
        if (!inTauri) {
          resolve(-1);
          return;
        }
        const timer = window.setTimeout(() => resolve(-1), 30000);
        satReadyWaiters.current.push((n) => {
          window.clearTimeout(timer);
          resolve(n);
        });
        const label = satelliteLabel(view);
        const w = new WebviewWindow(label, {
          url: `/?satellite=${view}`,
          title: `${VIEW_NAMES[view]} - Mallet`,
          width: 960,
          height: 680,
          minWidth: 400,
          minHeight: 300,
        });
        void w.once("tauri://error", (e) => {
          void api.log(`satellite window ${label}: ${JSON.stringify(e.payload)}`);
          resolve(-1);
        });
      }),
    [],
  );

  /** Where the autosave copy of a map lives: `<dir>/autosave/<name>`. */
  const autosavePathOf = (path: string) => {
    const sep = path.includes("\\") ? "\\" : "/";
    const at = path.lastIndexOf(sep);
    return `${path.slice(0, at + 1)}autosave${sep}${path.slice(at + 1)}`;
  };

  /** Offers the autosave when it is newer than the file just opened (a crash or a lost session). */
  const checkAutosave = useCallback(async (path: string) => {
    setRestoreOffer(null);
    if (!inTauri || !/\.vmf$/i.test(path)) return;
    try {
      const auto = autosavePathOf(path);
      const [a, m] = await Promise.all([api.fileMtime(auto), api.fileMtime(path)]);
      if (a !== null && (m === null || a > m + 1000)) {
        setRestoreOffer({ path: auto, when: new Date(a).toLocaleString() });
        void api.log(`autosave newer than the map: ${auto}`);
      }
    } catch (err) {
      void api.log(`autosave check: ${String(err)}`);
    }
  }, []);

  /** An asset dragged out of a panel: what it is, where the cursor is, which view it is over. */
  const { assetDrag, matPreview, revertMaterialPreview, updateMaterialPreview, placementBox, pushOutOfSurface, clearModelGhost, updateModelGhost, dropAssetRef, startAssetDrag } = useAssetDrag({
    openSoundSetup,
    canvasRef,
    session,
    current,
    materialInfos,
    classInfos,
    gridRef,
    setStatusText,
    modelCache,
    prefabsRef,
    setCurrentMaterial,
    setEntityClass,
    setCurrentModel,
    selectionBoundsRef,
    ensureModel,
    insertPrefab,
    applyMaterial,
    createEntityAt,
    selectionBounds,
  });

  /** Resource panel data, refreshed each second while the panel is on screen. */
  const [resources, setResources] = useState<ResourceSnapshot | null>(null);
  const resourcesOpen = visiblePanels(layout).includes("resources");
  useEffect(() => {
    if (!resourcesOpen) return;
    const take = () => {
      const s = session.current;
      const map = current.current;
      if (!s || !map) {
        setResources(null);
        return;
      }
      const st = map.stats;
      const rs = s.renderer.stats();
      const mem = s.renderer.memory();
      const ents = map.entities;
      const brushEnts = ents.filter((e) => e.brush).length;
      const pointEnts = ents.length - brushEnts;
      const props = ents.filter((e) => e.classname.startsWith("prop_")).length;
      const lights = ents.filter((e) => e.classname.startsWith("light")).length;
      const overlays = ents.filter((e) => e.classname === "info_overlay" || e.classname === "infodecal").length;
      const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
      const worldTris = Math.max(0, rs.triangles - mem.modelTriangles);
      const frameTris = Math.max(1, rs.triangles);
      setResources({
        takenAt: Date.now(),
        frameMs: rs.frameMs,
        drawCalls: rs.drawCalls,
        triangles: rs.triangles,
        limits: [
          { key: "brushes", label: tr("Браши"), hint: tr("MAX_MAP_BRUSHES: максимум брашей, который VBSP примет в карту"), value: st.solids, limit: 8192 },
          { key: "faces", label: tr("Грани"), hint: tr("MAX_MAP_FACES: грани после разбиения; реальных граней после сборки обычно больше, чем в редакторе"), value: st.faces, limit: 65536 },
          { key: "disp", label: tr("Дисплейсменты"), hint: tr("MAX_MAP_DISPINFO: граней с рельефом"), value: st.displacement_faces, limit: 2048 },
          { key: "ents", label: tr("Энтити"), hint: tr("MAX_MAP_ENTITIES при сборке; в игре одновременно живут 2048 сетевых (edicts)"), value: ents.length, limit: 4096 },
          { key: "bmodels", label: tr("Брашевые энтити"), hint: tr("MAX_MAP_MODELS: func_detail не считается, остальные брашевые энтити - по одной модели"), value: brushEnts, limit: 1024 },
          { key: "mats", label: tr("Материалы"), hint: tr("MAX_MAP_TEXDATA: разных материалов на гранях"), value: st.materials, limit: 2048 },
          { key: "overlays", label: tr("Оверлеи"), hint: tr("MAX_MAP_OVERLAYS: info_overlay на карте"), value: overlays, limit: 512 },
        ],
        load: [
          {
            key: "world",
            label: tr("Геометрия мира"),
            value: tr("{0} брашей · {1} треуг.", [st.solids, worldTris.toLocaleString(currentLocale())]),
            share: worldTris / frameTris,
            hint: tr("Треугольники брашей и дисплейсментов в кадре"),
          },
          {
            key: "props",
            label: tr("Пропы"),
            value: tr("{0} шт. · {1} моделей · {2} треуг.", [props, mem.uniqueModels, mem.modelTriangles.toLocaleString(currentLocale())]),
            share: mem.modelTriangles / frameTris,
            hint: tr("prop_* на карте, уникальных моделей и их треугольники с учётом повторов"),
          },
          { key: "point", label: tr("Точечные энтити"), value: tr("{0} шт.", [pointEnts]), hint: tr("Энтити без брашей: свет, спавны, звуки, логика") },
          { key: "lights", label: tr("Источники света"), value: tr("{0} шт.", [lights]), hint: tr("light, light_spot, light_environment: основная нагрузка на VRAD") },
          { key: "disp", label: tr("Дисплейсменты"), value: tr("{0} граней", [st.displacement_faces]), hint: tr("Рельефные грани: увеличивают время работы VBSP и VRAD") },
          {
            key: "textures",
            label: tr("Текстуры"),
            value: tr("{0} загружено · {1} не найдено · {2} в очереди", [rs.texturesLoaded, rs.texturesMissing, rs.texturesPending]),
            hint: tr("Материалы: найденные в контенте, не найденные и ещё загружаемые"),
          },
          { key: "draws", label: tr("Вызовы отрисовки"), value: `${rs.drawCalls}`, hint: tr("Число draw call за кадр: по одному на материал мира и по одному на модель") },
        ],
        memory: [
          { key: "geometry", label: tr("Геометрия карты"), bytes: mem.geometry, hint: tr("Вершины, нормали, координаты текстур, рёбра и индексы брашей на GPU") },
          { key: "models", label: tr("Модели"), bytes: mem.models, hint: tr("Меши пропов на GPU (по разу на модель, повторы через инстансы)") },
          { key: "textures", label: tr("Текстуры"), bytes: mem.textures, hint: tr("{0} текстур с мип-цепочками в VRAM", [mem.textureCount]) },
          { key: "doc", label: tr("Документ и история"), bytes: coreMemoryBytes(), hint: tr("Память WebAssembly-ядра: карта, отмена и повтор") },
          { key: "heap", label: tr("Интерфейс (JS)"), bytes: heap, hint: tr("Куча JavaScript: React, списки, миниатюры") },
        ],
      });
    };
    take();
    const t = window.setInterval(take, 1000);
    return () => window.clearInterval(t);
  }, [resourcesOpen, layout]);

  /** Model pictures for the icons view, rendered lazily two at a time. */
  const [modelThumbs, setModelThumbs] = useState<Map<string, string>>(() => new Map());
  const thumbQueue = useRef<string[]>([]);
  const thumbBusy = useRef(0);
  const thumbSeen = useRef(new Set<string>());
  /** Tiles that came into view before the content or the renderer were ready get a few more tries. */
  const thumbTries = useRef(new Map<string, number>());
  const pumpThumbs = useCallback(() => {
    while (thumbBusy.current < 2 && thumbQueue.current.length) {
      const name = thumbQueue.current.shift()!;
      thumbBusy.current += 1;
      void (async () => {
        let png: string | null = null;
        try {
          const key = await ensureModel(name, 0);
          if (key) await waitModelTextures(key);
          const s = session.current;
          png = key && s ? await s.renderer.renderModelPreview(key, 96) : null;
          if (png) setModelThumbs((m) => new Map(m).set(name, png!));
        } catch {
          /* no picture for this model */
        } finally {
          if (!png) {
            const n = (thumbTries.current.get(name) ?? 0) + 1;
            thumbTries.current.set(name, n);
            if (n < 5) {
              window.setTimeout(() => {
                thumbSeen.current.delete(name);
                requestThumbRef.current(name);
              }, 2000 * n);
            }
          }
          thumbBusy.current -= 1;
          pumpThumbs();
        }
      })();
    }
  }, [ensureModel, waitModelTextures]);
  const requestThumb = useCallback(
    (name: string) => {
      if (thumbSeen.current.has(name)) return;
      thumbSeen.current.add(name);
      thumbQueue.current.push(name);
      pumpThumbs();
    },
    [pumpThumbs],
  );
  const requestThumbRef = useRef(requestThumb);
  requestThumbRef.current = requestThumb;

  /** The tool reminder over the views shows for a few seconds after the tool changes. */
  const [hintShown, setHintShown] = useState(true);
  useEffect(() => {
    setHintShown(true);
    const t = window.setTimeout(() => setHintShown(false), 6000);
    return () => window.clearTimeout(t);
  }, [tool]);

  const openPath = useCallback(
    async (path: string) => {
      if (!session.current) return;
      if (!(await confirmDiscardRef.current())) return;
      setError("");
      setBusy(tr("Чтение файла…"));
      const t0 = performance.now();
      try {
        let decompiled: DecompileResult | null = null;
        let text: string;
        if (/\.bsp$/i.test(path)) {
          // A compiled map: decompiled on the fly, opened as an unsaved VMF next to it.
          setBusy(tr("Декомпиляция BSP…"));
          decompiled = await api.decompileBsp(path);
          text = decompiled.vmf;
          path = path.replace(/\.bsp$/i, "_d.vmf");
        } else text = await api.readTextFile(path);
        if (/\.map$/i.test(path)) {
          // Quake / Hammer-export .map: converted on the fly, saved as a VMF next to it.
          setBusy(tr("Импорт .map…"));
          text = await importMapText(text);
          path = path.replace(/\.map$/i, ".vmf");
        }
        setBusy(tr("Разбор VMF и построение геометрии…"));
        openTiming.current = {};
        const tParse = performance.now();
        openTiming.current.memBefore = coreMemoryBytes();
        const loaded = await loadMap(text);
        openTiming.current.parse = performance.now() - tParse;
        openTiming.current.memParsed = coreMemoryBytes();
        const project = await installMap(loaded, path, path.split(/[\\/]/).pop() ?? path);
        void checkAutosave(path);
        rememberRecent(path);
        if (decompiled) {
          const d = decompiled;
          void api.log(
            `decompiled: ${d.worldBrushes} world + ${d.detailBrushes} detail + ${d.entityBrushes} entity brushes, ${d.entities} entities, ${d.staticProps} props, ${d.displacements} displacements, ${d.skippedBrushes} skipped, ${d.ms} ms`,
          );
          void ask({
            title: tr("Карта декомпилирована"),
            text: tr("Восстановлено: {0} брашей, {1} энтити и {2} дисплейсментов. Карта ещё не сохранена: Ctrl+S сохранит её как {3}.{4}", [
              d.worldBrushes + d.detailBrushes + d.entityBrushes,
              d.entities,
              d.displacements,
              path.split(/[\/]/).pop(),
              d.lost.length ? tr("\n\nНе сохранилось в BSP:\n•{0}", [d.lost.join("\n• ")]) : "",
            ]),
            buttons: [{ label: tr("ОК"), kind: "primary", value: "ok" }],
          });
        }
        const st = loaded.stats;
        lastOpenMs.current = performance.now() - t0;
        // A map saved with objects hidden in Hammer opens looking half empty: say so, and how to bring them back.
        const hiddenCount = (loaded.doc.hidden_ids() as Uint32Array).length;
        if (hiddenCount)
          setStatusText(
            tr("скрыто в файле: {0} {1} (так сохранено) · U - показать всё, Shift+U - показать и выделить", [hiddenCount, plural(hiddenCount, tr("объект"), tr("объекта"), tr("объектов"))]),
          );
        const tm = openTiming.current;
        const ms = (k: string) => (tm[k] ?? 0).toFixed(0);
        const mb = (k: string) => ((tm[k] ?? 0) / 1048576).toFixed(0);
        void api.log(
          `open timing: parse+geometry ${ms("parse")} ms, project ${ms("project")} ms, materials ${ms("materials")} ms, mesh upload ${ms("mesh")} ms, entities ${ms("entities")} ms (models ${tm.models ?? 0}, fetched ${tm.modelLoads ?? 0} in ${ms("modelMs")} ms); core memory ${mb("memBefore")} → ${mb("memParsed")} MB after parse, ${(coreMemoryBytes() / 1048576).toFixed(0)} MB now; vmf text ${(text.length / 1048576).toFixed(1)} MB`,
        );
        void api.log(
          `opened ${path.split(/[\\/]/).pop()}: ${st.solids} solids, ${st.triangles} tris, ${st.materials} materials, ${loaded.pointEntities.length} point entities, project ${project?.root ?? "none"} (${project?.files ?? 0} files), ${(performance.now() - t0).toFixed(0)} ms`,
        );
      } catch (e) {
        setError(String(e));
        void api.log(`open failed: ${String(e)}`);
      } finally {
        setBusy("");
      }
    },
    [checkAutosave, installMap, rememberRecent],
  );

  /** Re-reads the stored versions of the current map. */
  const refreshHistory = useCallback(async () => {
    const path = currentPath.current;
    if (!inTauri || !path) {
      setHistoryEntries(inTauri ? [] : null);
      return;
    }
    try {
      setHistoryEntries(await api.listHistory(path));
    } catch (err) {
      setError(String(err));
    }
  }, []);
  const refreshHistoryRef = useRef(refreshHistory);
  refreshHistoryRef.current = refreshHistory;

  /** Opens a stored version in place of the current map; it stays unsaved until Ctrl+S. */
  /** Compares the open map with a saved version object by object. */
  const compareHistoryEntry = useCallback(
    async (e: HistoryEntry) => {
      const map = current.current;
      if (!map) return;
      setBusy(tr("Сравнение версий…"));
      try {
        const old = await loadMap(await api.readTextFile(e.path));
        historyOld.current?.map.doc.free();
        const snap = snapshot(old.doc);
        historyOld.current = { map: old, snap };
        setHistoryDiff({ entry: e, rows: diffSnapshots(snap, snapshot(map.doc)) });
      } catch (err) {
        setError(String(err));
      } finally {
        setBusy("");
      }
    },
    [setError],
  );
  const closeHistoryDiff = useCallback(() => {
    historyOld.current?.map.doc.free();
    historyOld.current = null;
    setHistoryDiff(null);
  }, []);
  // A different map makes the comparison meaningless.
  useEffect(() => closeHistoryDiff(), [mapName, closeHistoryDiff]);
  const goToDiffRow = useCallback(
    (row: DiffRow) => {
      if (row.object === "entity") selectObject(row.id);
      else {
        selectIds([row.id]);
        focusSelection();
      }
    },
    [focusSelection, selectIds, selectObject],
  );
  /** Puts the version's object back (removed, changed) or deletes an added one, as one undo step; the comparison follows. */
  const revertDiffRow = useCallback(
    async (row: DiffRow) => {
      const map = current.current;
      const old = historyOld.current;
      if (!map || !old) return;
      const idsOf = (id: number) => (row.object === "entity" && map.doc.kind_of(id) === "entity" ? [id, ...Array.from(map.doc.entity_solids(id) as Uint32Array)] : [id]);
      await runEdit(() => {
        let res: EditResult | undefined;
        let steps = 0;
        if (row.kind !== "removed") {
          const r = map.doc.delete_objects(Uint32Array.from(idsOf(row.id))) as EditResult | undefined;
          if (r) {
            res = r;
            steps++;
          }
        }
        if (row.kind !== "added") {
          const r = map.doc.paste_vmf(old.map.doc.export_objects(Uint32Array.from([row.id])), Float64Array.from([0, 0, 0])) as EditResult | undefined;
          if (r) {
            res = r;
            steps++;
          }
        }
        if (steps > 1) map.doc.merge_undo(steps, tr("Возврат из версии"));
        return res;
      });
      setHistoryDiff((d) => (d ? { ...d, rows: diffSnapshots(old.snap, snapshot(map.doc)) } : d));
    },
    [runEdit],
  );
  const openHistoryEntry = useCallback(
    async (e: HistoryEntry) => {
      const path = currentPath.current;
      if (!path) return;
      if (!(await confirmDiscardRef.current())) return;
      setBusy(tr("Открытие версии…"));
      try {
        const loaded = await loadMap(await api.readTextFile(e.path));
        await installMap(loaded, path, path.split(/[\\/]/).pop() ?? path);
        setStatusText(tr("версия от {0} открыта · Ctrl+S - сохранить её", [new Date(e.when).toLocaleString()]));
        void api.log(`history: opened ${e.path}`);
      } catch (err) {
        setError(String(err));
      } finally {
        setBusy("");
      }
    },
    [installMap],
  );

  /** Loads the autosave copy in place of the opened file; the map stays unsaved until Ctrl+S. */
  const restoreAutosave = useCallback(async () => {
    const offer = restoreOffer;
    const path = currentPath.current;
    if (!offer || !path) return;
    if (!(await confirmDiscardRef.current())) return;
    setRestoreOffer(null);
    setBusy(tr("Восстановление…"));
    try {
      const text = await api.readTextFile(offer.path);
      const loaded = await loadMap(text);
      await installMap(loaded, path, path.split(/[\\/]/).pop() ?? path);
      setStatusText(tr("восстановлено из автосохранения: сохраните карту (Ctrl+S), чтобы оставить эту версию"));
      void api.log(`restored from ${offer.path}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy("");
    }
  }, [installMap, restoreOffer]);

  /** New map wizard: an empty VMF, then a hollow starting room with spawn and light. */
  const newMap = useCallback(
    async (o: NewMapOptions) => {
      if (!session.current) return;
      if (!(await confirmDiscardRef.current())) return;
      setError("");
      setBusy(tr("Новая карта…"));
      try {
        const loaded = await loadMap(await emptyMapText(o.skyname));
        await installMap(loaded, "", tr("новая карта.vmf"));
        projectMetaRef.current = { ...EMPTY_META, goal: (o.goal ?? "").trim() };
        setProjectMetaState(projectMetaRef.current);
        const map = loaded;
        const hx = Math.max(64, o.width) / 2;
        const hy = Math.max(64, o.length) / 2;
        const hz = Math.max(64, o.height) / 2;
        const wall = Math.max(1, o.wall);
        const room = map.doc.create_block(new Float64Array([-hx - wall, -hy - wall, -hz - wall, hx + wall, hy + wall, hz + wall]), "dev/dev_measuregeneric01b") as EditResult | undefined;
        if (room) {
          const hollow = map.doc.hollow(new Uint32Array([room.changed_ids[0]]), wall) as EditResult | undefined;
          if (hollow && o.outdoor) {
            // The topmost piece is the ceiling: it becomes sky.
            let top: number | null = null;
            let topZ = -Infinity;
            for (const id of hollow.changed_ids) {
              const v = map.doc.solid_vertices(id);
              let z = -Infinity;
              for (let i = 2; i < v.length; i += 3) z = Math.max(z, v[i]);
              if (z > topZ) {
                topZ = z;
                top = id;
              }
            }
            if (top !== null) {
              const faces: number[] = [];
              for (const side of map.doc.solid_sides(top)) faces.push(top, side);
              map.doc.set_material(new Uint32Array(faces), "tools/toolsskybox");
            }
          }
        }
        refreshMap(map);
        const place = async (cls: string, origin: Vec3, extra: [string, string][] = []) => {
          const info = (await api.entityClasses([cls]))[0];
          if (info) classInfos.current.set(cls, info);
          let defaults = await api.entityDefaults(cls);
          for (const [k, v] of extra) {
            defaults = defaults.filter(([key]) => key.toLowerCase() !== k.toLowerCase());
            defaults.push([k, v]);
          }
          map.doc.create_entity(cls, new Float64Array(origin), defaults, new Uint8Array(info?.color ?? [220, 30, 220]));
        };
        if (o.spawn) {
          // Spawns of the chosen game mode: one in the centre, more in a ring facing inwards.
          const tpl = GAME_TEMPLATES.find((t) => t.id === o.template) ?? GAME_TEMPLATES[0];
          const total = tpl.spawns.reduce((n, sp) => n + sp.count, 0);
          const radius = Math.max(64, Math.min(o.width, o.length) / 2 - 96);
          let k = 0;
          for (const sp of tpl.spawns) {
            for (let i = 0; i < sp.count; i++, k++) {
              if (total === 1) {
                await place(sp.classname, [0, 0, -hz + 1]);
                continue;
              }
              const a = (k / total) * Math.PI * 2;
              const x = Math.round((Math.cos(a) * radius) / 16) * 16;
              const y = Math.round((Math.sin(a) * radius) / 16) * 16;
              const yaw = Math.round(((Math.atan2(-y, -x) * 180) / Math.PI + 360) % 360);
              await place(sp.classname, [x, y, -hz + 1], [["angles", `0 ${yaw} 0`]]);
            }
          }
        }
        if (o.light) {
          if (o.outdoor)
            await place(
              "light_environment",
              [0, 0, 0],
              [
                ["pitch", "-60"],
                ["angles", "0 45 0"],
              ],
            );
          else await place("light", [0, 0, hz - 32], [["_light", "255 255 255 200"]]);
        }
        // One cubemap at eye height, so water and metal reflect the room instead of black from the first compile.
        await place("env_cubemap", [0, 0, Math.min(-hz + 64, hz - 16)]);
        map.doc.mark_saved();
        await applyEdit();
        setPanel("none");
        void api.log(`new map: ${map.stats.solids} solids, ${map.entities.length} entities, sky ${o.skyname}, ${o.outdoor ? "outdoor" : "indoor"}`);
      } catch (e) {
        setError(String(e));
        void api.log(`new map failed: ${String(e)}`);
      } finally {
        setBusy("");
      }
    },
    [applyEdit, installMap],
  );

  // When content finishes mounting after a map was opened, refresh materials and classes.
  useEffect(() => {
    if (content?.state !== "ready" || !current.current || !session.current) return;
    const names = current.current.mesh.materials;
    void api.materialsInfo(names).then((infos: MaterialInfo[]) => {
      materialInfos.current = new Map(infos.map((i) => [i.name, i]));
      session.current?.renderer.updateMaterials(infos);
    });
    classInfos.current.clear();
    void refreshEntities().then(applySelection);
  }, [applySelection, content?.state, refreshEntities]);

  /** The refresh a panel needs when it comes into view (the problems check opens its panel itself). */
  const refreshPanel = useCallback(
    (kind: Panel) => {
      if (kind === "properties" || kind === "inspector") {
        loadClassList();
        refreshProperties();
      } else if (kind === "world") refreshWorld();
      else if (kind === "visgroups") refreshVisgroups();
      else if (kind === "problems") void checkProblems();
      else if (kind === "prefabs") void refreshPrefabs();
      else if (kind === "history") void refreshHistory();
    },
    [checkProblems, loadClassList, refreshHistory, refreshPrefabs, refreshProperties, refreshVisgroups, refreshWorld],
  );
  /** Opens a panel the way its toolbar button did: with the refresh it needs. */
  const openPanel = useCallback(
    (kind: Panel) => {
      refreshPanel(kind);
      if (kind !== "problems") setPanel(kind);
    },
    [refreshPanel, setPanel],
  );
  openPanelRef.current = openPanel;
  /** Unreal's Select Actors Using This Asset: every prop with the library's current model, or every brush with the current material. */
  const selectAssetUsers = useCallback(
    (kind: "model" | "material") => {
      const map = current.current;
      if (!map) return;
      if (kind === "model") {
        const model = currentModelRef.current.toLowerCase();
        const ids = model ? map.entities.filter((e) => e.model?.toLowerCase() === model).map((e) => e.id) : [];
        selectIds(ids);
        setStatusText(
          model ? (ids.length ? tr("с моделью {0}: {1}", [model.split("/").pop(), ids.length]) : tr("на карте нет пропов с {0}", [model.split("/").pop()])) : tr("выберите модель в библиотеке"),
        );
        return;
      }
      const material = materialRef.current.toLowerCase();
      const mi = map.mesh.materials.findIndex((m) => m.toLowerCase() === material);
      const solids = new Set<number>();
      const t = map.mesh.faceTable;
      for (let f = 0; mi >= 0 && f < t.length / 4; f++) if (t[f * 4 + 3] === mi) solids.add(t[f * 4 + 1]);
      selectIds([...solids]);
      setStatusText(solids.size ? tr("браши с {0}: {1}", [material, solids.size]) : tr("на карте нет граней с {0}", [material]));
    },
    [selectIds, setStatusText],
  );
  /** Unreal's Find in Content Browser: the selected prop's model, or the selected face's or brush's material, comes up in its library. */
  const browseToAsset = useCallback(() => {
    const map = current.current;
    if (!map) return;
    const face = [...faceSel.current.values()][0];
    if (face) {
      requestBrowse("material", map.doc.face_material(face[0], face[1]));
      openPanel("textures");
      return;
    }
    const owners = [...selection.current].map((id) => map.doc.entity_of_solid(id) || id);
    const prop = map.entities.find((e) => owners.includes(e.id) && e.model?.toLowerCase().endsWith(".mdl"));
    if (prop?.model) {
      requestBrowse("model", prop.model);
      openPanel("models");
      setStatusText(tr("в библиотеке моделей: {0}", [prop.model]));
      return;
    }
    const solid = [...selection.current].find((id) => map.doc.kind_of(id) === "solid");
    const side = solid !== undefined ? (map.doc.solid_sides(solid) as Uint32Array)[0] : undefined;
    if (solid !== undefined && side !== undefined) {
      const material = map.doc.face_material(solid, side);
      requestBrowse("material", material);
      openPanel("textures");
      setStatusText(tr("в браузере текстур: {0}", [material]));
      return;
    }
    setStatusText(tr("выделите проп, браш или грань"));
  }, [openPanel, setStatusText]);
  /** Replaces the whole layout (a preset or a saved one) and refreshes the panels that came into view. */
  const applyWholeLayout = useCallback(
    (next: DockLayout) => {
      const before = visiblePanels(layoutRef.current);
      applyLayout(next);
      setShowColumn(true);
      const after = visiblePanels(next);
      for (const k of after) if (!before.includes(k)) refreshPanel(k as Panel);
      if (!after.includes(panelRef.current)) {
        const first = (after[0] as Panel | undefined) ?? "none";
        panelRef.current = first;
        setPanelState(first);
      }
    },
    [applyLayout, refreshPanel, setShowColumn],
  );

  /** Everything the palette can run; built fresh each render so `disabled` is current. */
  const setGrid = useCallback((size: number) => {
    setGridSize(size);
    gridRef.current = size;
    const s = session.current;
    if (!s) return;
    for (const kind of VIEW_KINDS) {
      const v = s.views[kind];
      if (v) v.camera.gridSize = size;
    }
  }, []);

  /** Moves the grid one step coarser (+1) or finer (−1). */
  const stepGrid = useCallback(
    (dir: 1 | -1) => {
      setGridSize((g) => {
        const i = GRID_SIZES.indexOf(g);
        const next = GRID_SIZES[Math.max(0, Math.min(GRID_SIZES.length - 1, i + dir))];
        setGrid(next);
        return next;
      });
    },
    [setGrid],
  );
  // Alt+wheel over the views steps the grid (Unity's snap increments, Hammer's [ and ]) instead of zooming.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.altKey || e.ctrlKey || !(e.target instanceof Element) || !e.target.closest(".views")) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY !== 0) stepGrid(e.deltaY < 0 ? 1 : -1);
    };
    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [stepGrid]);

  const openDialog = useCallback(async () => {
    const picked = await open({
      multiple: false,
      filters: [
        { name: tr("Карты"), extensions: ["vmf", "map", "bsp"] },
        { name: "Valve Map Format", extensions: ["vmf"] },
        { name: "Quake / Hammer .map", extensions: ["map"] },
        { name: tr("Собранная карта BSP (декомпиляция)"), extensions: ["bsp"] },
      ],
    });
    if (typeof picked === "string") await openPath(picked);
  }, [openPath]);

  const { baseCommands, paletteExtra, commands, texturesShown, tourSteps, startTour, finishOnboarding, keymapPreset, commandsRef, byId, contextItems, menus } = useCommands({
    savedLayouts,
    session,
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
    showJourney,
    setShowJourney,
    layout,
    setPanel,
    viewsRef,
    setViews,
    addNoteHere,
    setPaletteOpen,
    keymap,
    firstSteps,
    showFirstSteps,
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
    selectDetailCandidates,
    convertProps,
    growSelection,
    flipHinge,
    nodrawHiddenFaces,
    copyTransform,
    pasteTransform,
    selectRandom,
    mergeBrushes,
    selectParent,
    originToCentre,
    revealAndSelect,
    browseToAsset,
    selectAssetUsers,
    duplicateUnique,
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
  });

  // ---- The journey bar's state and actions.
  const journey = useMemo<JourneyStage[]>(
    () =>
      computeJourney({
        mapOpen: !!mapName,
        path: currentPath.current,
        stamp: hist?.dirty ? null : savedStamp,
        solids: current.current?.stats.solids ?? 0,
        classes: current.current?.entities.map((x) => x.classname) ?? [],
        problems: problems ? problems.length : null,
        compiling: compileState.running,
        meta: projectMeta,
        gameRunning: !!bridge?.running,
      }),
    [mapName, hist, savedStamp, problems, compileState.running, projectMeta, bridge],
  );
  const journeyRef = useRef(journey);
  journeyRef.current = journey;
  const journeyShow = useCallback(
    (action: string) => {
      if (action === "save") void (currentPath.current ? saveCurrent() : saveAs());
      else if (action === "compile") void compileCurrent();
      else if (action === "game") void runGame();
      else if (action.startsWith("panel:")) setPanel(action.slice(6) as Panel);
      else if (action.startsWith("select:")) selectObject(Number(action.slice(7)));
    },
    [saveCurrent, saveAs, compileCurrent, runGame, selectObject],
  );
  const journeyAsk = useCallback((prompt: string) => {
    setPanel("assistant");
    assistantBus.ask(prompt);
  }, []);

  // ---- The compile log in the mapper's words, with the editor's own fixes.
  const compileIssues = useMemo(() => analyzeCompileLog(compileState.lines), [compileState.lines]);
  const compileIssuesRef = useRef(compileIssues);
  compileIssuesRef.current = compileIssues;
  const applyCompileFix = useCallback(
    async (issue: CompileIssue) => {
      const map = current.current;
      if (!map || !issue.fix) return;
      const f = issue.fix;
      if (f.kind === "env_cubemap") {
        const b = map.stats.bounds ?? [
          [-256, -256, 0],
          [256, 256, 256],
        ];
        const origin: Vec3 = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, b[1][2] - 64];
        setEntityClass("env_cubemap");
        await createEntityAt(origin.map((v) => Math.round(v / 16) * 16) as Vec3);
        setStatusText(tr("env_cubemap добавлен: после сборки карты соберите кубмапы в панели «Сборка»"));
      } else if (f.kind === "replace_material") {
        await replaceTextures(String(f.arg), "dev/dev_measuregeneric01b", "map", false);
        setStatusText(tr("{0} заменён на dev/dev_measuregeneric01b", [f.arg]));
      } else if (f.kind === "fix_problems") {
        const list = (await checkProblems()) ?? [];
        const chosen = typeof f.arg === "number" ? list.filter((p) => p.object === f.arg) : list;
        const n = (await fixProblems(chosen.length ? chosen : list)) ?? 0;
        if (typeof f.arg === "number") selectObject(f.arg);
        setStatusText(n ? tr("исправлено: {0}", [n]) : tr("автоматическое исправление недоступно: проверьте браш в видах"));
      } else if (f.kind === "show_leak") {
        setPanel("compile");
        setStatusText(tr("красная линия утечки ведёт от энтити наружу"));
      } else if (f.kind === "set_skyname") {
        await setWorldKeys([["skyname", String(f.arg)]]);
      } else if (f.kind === "select_object") selectObject(Number(f.arg));
    },
    [createEntityAt, replaceTextures, checkProblems, fixProblems, selectObject, setWorldKeys, setEntityClass],
  );
  const askAboutCompile = useCallback(() => {
    setPanel("assistant");
    assistantBus.ask(askAboutLog(compileIssuesRef.current, compileLinesRef.current));
  }, []);
  autoAfterCompileRef.current = async (ok: boolean) => {
    const issues = analyzeCompileLog(compileLinesRef.current);
    const plan = autoFixRef.current ? autoFixPlan(issues) : [];
    const done: string[] = [];
    for (const issue of plan) {
      try {
        await applyCompileFix(issue);
        done.push(issue.fix!.label.toLowerCase());
      } catch (e) {
        void api.log(`autofix ${issue.id}: ${String(e)}`);
      }
    }
    const unknown = issues.filter((i) => !i.fix || !plan.includes(i));
    let text = "";
    if (done.length) text = tr("Исправлено автоматически: {0}. Требуется пересборка.", [done.join(", ")]);
    if (unknown.length)
      text += tr("{0}Требуют ручного исправления: {1}.", [
        text ? " " : "",
        unknown
          .map((i) => i.title.toLowerCase())
          .slice(0, 3)
          .join(", "),
      ]);
    if (!ok && !issues.length) text = tr("Сборка завершилась ошибкой по неизвестной причине.");
    autoReportRef.current = text;
    setAutoReport(text);
    if (text) void api.log(`autofix: ${text}`);
    if (autoAskRef.current && (unknown.length || (!ok && !issues.length))) askAboutCompile();
  };
  const askAboutProblems = useCallback(() => {
    setPanel("assistant");
    const list = problems ?? [];
    assistantBus.ask(
      tr("Проверь карту (check_problems), объясни каждую находку и исправь их; что нельзя исправить автоматически - поправь правками брашей и энтити.{0}", [
        list.length
          ? tr("\n\nСейчас панель «Проблемы» показывает:\n{0}", [
              list
                .slice(0, 30)
                .map((p) => tr("- [{0}] объект {1}: {2}", [p.kind, p.object, p.message]))
                .join("\n"),
            ])
          : "",
      ]),
    );
  }, [problems]);

  // ---- The game's view: screenshots through the bridge, a live view and the test cycle.
  const getEditorCamera = useCallback(() => {
    const s = session.current;
    if (!s) return null;
    const p = s.camera.position;
    return { pos: [p[0], p[1], p[2]] as [number, number, number], pitch: -s.camera.pitch, yaw: s.camera.yaw };
  }, []);
  const setEditorCamera = useCallback((pos: [number, number, number] | null, pitch: number | null, yaw: number | null) => {
    const s = session.current;
    if (!s) return;
    if (pos) s.camera.position = new Float32Array(pos);
    if (pitch !== null) s.camera.pitch = Math.max(-89, Math.min(89, -pitch));
    if (yaw !== null) s.camera.yaw = yaw;
  }, []);
  const editorScreenshot = useCallback(async (view: "3d" | "top" | "front" | "side") => {
    const s = session.current;
    if (!s) throw new Error(tr("карта не открыта"));
    const url = view === "3d" ? await s.renderer.capture(s.camera) : s.views[view] ? await s.renderer.capture2D(s.views[view]!) : null;
    if (!url) throw new Error(tr("вида {0} нет", [view]));
    const comma = url.indexOf(",");
    return { data: url.slice(comma + 1), mediaType: "image/png" };
  }, []);
  const [gameShot, setGameShot] = useState<GameShot | null>(null);
  const gameShotUrl = useRef<string | null>(null);
  const [gameLive, setGameLiveState] = useState(false);
  const [gameBusy, setGameBusy] = useState("");
  const takeGameShot = useCallback(async (quality = 75, camera: [number, number, number, number, number, number] | null = null) => {
    const bytes = await api.bridgeScreenshot({ quality, camera: camera ?? undefined });
    const st = await api.bridgeStatus();
    if (gameShotUrl.current) URL.revokeObjectURL(gameShotUrl.current);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/jpeg" }));
    gameShotUrl.current = url;
    setGameShot({ url, at: Date.now(), pos: st.pos, bytes: bytes.length });
    return { bytes, pos: st.pos };
  }, []);
  const setGameLive = useCallback((v: boolean) => setGameLiveState(v), []);
  useEffect(() => {
    if (!gameLive) return;
    let stop = false;
    let inFlight = false;
    const timer = setInterval(() => {
      if (stop || inFlight) return;
      inFlight = true;
      takeGameShot(60)
        .catch(() => setGameLiveState(false))
        .finally(() => {
          inFlight = false;
        });
    }, 1000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [gameLive, takeGameShot]);
  const bridgeNoclip = useCallback(async (on: boolean) => {
    await api.bridgeSend({ type: "noclip", on });
  }, []);
  const bridgeHud = useCallback(async (on: boolean) => {
    await api.bridgeSend({ type: "hud", on });
  }, []);
  /** Save, compile, reload the map in the game (or launch it), put the player in the camera, shoot. */
  const testCycle = useCallback(
    async (quiet?: boolean): Promise<{ text: string; failed: boolean; shot: { bytes: Uint8Array } | null }> => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const lines: string[] = [];
      try {
        setGameBusy(tr("Сохранение…"));
        await saveCurrent();
        if (!currentPath.current) return { text: tr("карта не сохранена"), failed: true, shot: null };
        setGameBusy(tr("Сборка…"));
        const before = compileRun.current;
        await compileCurrent();
        const run = compileRun.current;
        if (run === before) return { text: tr("сборка не запустилась: {0}", [compileResultRef.current.message]), failed: true, shot: null };
        const t0 = Date.now();
        while (compileDoneRef.current !== run && Date.now() - t0 < 600000) await sleep(500);
        const r = compileResultRef.current;
        lines.push(r.ok ? tr("сборка: {0}", [r.message]) : tr("сборка провалилась: {0}", [r.message]));
        if (!r.ok) return { text: lines.join("\n"), failed: true, shot: null };
        const trouble = compileLinesRef.current.filter((l) => /leaked|\*\*\* error/i.test(l));
        if (trouble.length) lines.push(tr("в логе: {0}", [trouble.slice(0, 3).join(" | ")]));
        let st = await api.bridgeStatus();
        const hellos = (await api.bridgeReports()).filter((x) => x.event === "hello").length;
        if (st.connected) {
          setGameBusy(tr("Перезагрузка карты в игре…"));
          await api.bridgeSend({ type: "reload" });
        } else {
          setGameBusy(tr("Запуск игры…"));
          await runGame();
        }
        const t1 = Date.now();
        let loaded = false;
        while (Date.now() - t1 < 180000) {
          const reports = await api.bridgeReports();
          st = await api.bridgeStatus();
          if (reports.filter((x) => x.event === "hello").length > hellos && st.connected) {
            loaded = true;
            break;
          }
          if (!st.running && Date.now() - t1 > 20000) break;
          await sleep(1000);
        }
        if (!loaded) {
          lines.push(tr("игра не загрузила карту за три минуты"));
          return { text: lines.join("\n"), failed: true, shot: null };
        }
        lines.push(tr("игра загрузила {0} за {1} с", [st.map ?? tr("карту"), Math.round((Date.now() - t1) / 1000)]));
        await sleep(1500);
        setGameBusy(tr("Снимок из камеры редактора…"));
        const cam = getEditorCamera();
        const shot = await takeGameShot(75, cam ? [cam.pos[0], cam.pos[1], cam.pos[2], cam.pitch, cam.yaw, 0] : null);
        const errors = compileLinesRef.current.filter((l) => l.startsWith("[game]") && /error|attempt to|traceback/i.test(l));
        if (errors.length) lines.push(tr("консоль игры: {0} ошибок, первая: {1}", [errors.length, errors[0].slice(0, 160)]));
        lines.push(
          tr("снимок {0} КБ{1}", [
            Math.round(shot.bytes.length / 1024),
            shot.pos
              ? tr(" из {0}", [
                  shot.pos
                    .slice(0, 3)
                    .map((v) => Math.round(v))
                    .join(" "),
                ])
              : "",
          ]),
        );
        if (!quiet) setPanel("gameview");
        return { text: lines.join("\n"), failed: false, shot };
      } catch (err) {
        lines.push(String(err));
        return { text: lines.join("\n"), failed: true, shot: null };
      } finally {
        setGameBusy("");
      }
    },
    [saveCurrent, compileCurrent, runGame, takeGameShot, getEditorCamera],
  );
  const askAboutShot = useCallback(() => {
    setPanel("assistant");
    assistantBus.ask(
      tr(
        "Сделай снимок из игры (game_screenshot), посмотри на него и скажи, что видишь: как выглядят свет, текстуры и пропорции, что стоит поправить. Если что-то явно не так - исправь и покажи снова через test_cycle.",
      ),
    );
  }, []);

  // ---- The Claude assistant (phase 8): its tools over the editor and the key's status.
  const assistantConfirm = useRef<Confirm>(async () => true);
  const assistantTools = useMemo(
    () =>
      createAssistantTools(
        {
          current,
          currentPath,
          selection,
          faceSel,
          materialRef,
          gridRef,
          classInfos,
          runEdit,
          selectIds,
          applySelection,
          focusSelection,
          commitTranslate,
          setEntityKeys,
          setEntityConnections,
          commandsRef,
          saveCurrent,
          compileCurrent,
          runGame,
          objectBounds,
          compileLinesRef,
          compileRun,
          compileDoneRef,
          compileResultRef,
          gameConsoleRef,
          leakPointsRef,
          checkProblems,
          fixProblems,
          setWorldKeys,
          bridgeReload,
          gameKill,
          analyzePack,
          undo,
          showLeak,
          projectMetaRef,
          addNoteAt,
          addNoteHere,
          setNotes,
          goToPoint,
          journeyRef,
          takeGameShot,
          testCycle,
          getEditorCamera,
          setEditorCamera,
          editorScreenshot,
          replaceTextures,
        },
        assistantConfirm,
      ),
    [
      runEdit,
      selectIds,
      applySelection,
      focusSelection,
      commitTranslate,
      setEntityKeys,
      setEntityConnections,
      commandsRef,
      saveCurrent,
      compileCurrent,
      runGame,
      objectBounds,
      checkProblems,
      fixProblems,
      setWorldKeys,
      setPanel,
      bridgeReload,
      gameKill,
      analyzePack,
      undo,
      showLeak,
      takeGameShot,
      testCycle,
      getEditorCamera,
      setEditorCamera,
      editorScreenshot,
      replaceTextures,
    ],
  );
  const [assistantKey, setAssistantKeyState] = useState<AssistantKeyStatus | null>(null);
  useEffect(() => {
    api.assistantKeyStatus().then(setAssistantKeyState, () => setAssistantKeyState({ present: false, source: "", hint: "", cli: null }));
  }, []);
  const setAssistantKey = useCallback(async (key: string | null) => {
    setAssistantKeyState(key ? await api.assistantSetKey(key) : await api.assistantClearKey());
  }, []);

  // ---- The assistant store: tools, backends and the environment it sees.
  useEffect(() => {
    assistantStore.configure({
      tools: assistantTools,
      backend: apiBackend,
      demoBackend: mockBackend,
      undo,
      log: (l) => void api.log(l),
      busyRef: assistantBusy,
      undoDepth: () => (current.current ? history(current.current).undo_labels.length : 0),
      jumpHistory,
      focusIds: (ids) => {
        // The user asked from a card: frame the objects, but keep the assistant panel in front (no auto-inspector).
        const was = assistantBusy.current;
        assistantBusy.current = true;
        selectIds(ids);
        assistantBusy.current = was;
        focusSelection();
      },
    });
  }, [assistantTools, undo, jumpHistory, selectIds, focusSelection]);
  useEffect(() => assistantStore.setKeyStatus(assistantKey), [assistantKey]);
  useEffect(() => assistantStore.setEnv(!!mapName, inTauri), [mapName]);
  useEffect(() => {
    if (mapName) showSymmetry();
  }, [mapName, showSymmetry]);
  useEffect(() => {
    assistantConfirm.current = (t, b) => assistantStore.confirm(t, b);
  }, []);

  /** Gizmo axis under a 3D-canvas position, or null. */
  const gizmoAxisAt = useCallback(
    (css: [number, number], w: number, h: number): number | null => {
      const s = session.current;
      if (!s || !selection.current.size || toolRef.current !== "select") return null;
      const bounds = selectionBounds();
      if (!bounds) return null;
      const center = boxCenter(bounds);
      return pickGizmoAxis(s.camera.viewProjection(w / h), center, gizmoLength(s.camera, center, h), css, w, h, handleMode.current);
    },
    [selectionBounds],
  );

  /** Updates the gizmo drag's snapped delta from the current mouse position. */
  const updateGizmoDrag = useCallback(
    (css: [number, number], w: number, h: number, mods: { altKey: boolean; shiftKey: boolean }) => {
      const s = session.current;
      const g = gizmo.current;
      const bounds = selectionBounds();
      if (!s || !g.drag || !bounds) return;
      const viewProj = s.camera.viewProjection(w / h);
      const center = boxCenter(bounds);
      const axis = GIZMO_AXES[g.drag.axis];
      if (g.drag.mode === "rotate") {
        const angle = ringAngle(viewProj, s.camera.position, g.drag.axis, center, css, w, h);
        if (angle === null) return;
        let deg = angle - g.drag.t0;
        deg = mods.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg);
        deg = ((deg + 540) % 360) - 180;
        g.drag.degrees = deg;
        showTransformPreview(rotationAbout(center, axis, deg), g.drag.edges);
        liveLabel.current = deg ? tr("поворот {0} {1}°", ["XYZ"[g.drag.axis], deg]) : "";
        return;
      }
      const t = axisParam(viewProj, s.camera.position, g.drag.axis, center, css, w, h);
      if (t === null) return;
      if (g.drag.mode === "scale") {
        // One gizmo length of travel doubles the size; Shift scales all three axes together.
        const half = Math.max(8, gizmoLength(s.camera, center, h));
        const f = Math.max(0.05, Math.round((1 + (t - g.drag.t0) / half) * 100) / 100);
        let factors: Vec3 = mods.shiftKey ? [f, f, f] : [1, 1, 1];
        factors[g.drag.axis] = f;
        factors = propsOnlyFactors(factors);
        g.drag.factors = factors;
        showTransformPreview(scalingAbout(center, factors), g.drag.edges);
        liveLabel.current = f !== 1 ? tr("масштаб {0}×{1}", [mods.shiftKey ? "" : "XYZ"[g.drag.axis] + " ", f]) : "";
        return;
      }
      const moved = moveStep(t - g.drag.t0, gridRef.current || 1, mods);
      let delta: Vec3 = [axis[0] * moved, axis[1] * moved, axis[2] * moved];
      const map = current.current;
      if (mods.shiftKey && map) {
        // About ten pixels' worth of world units at the selection's distance.
        const c = boxCenter(bounds);
        const dist = Math.hypot(c[0] - s.camera.position[0], c[1] - s.camera.position[1], c[2] - s.camera.position[2]);
        delta = dockToNeighbours(map, g.drag.objects, bounds, delta, [g.drag.axis], Math.max(4, dist * 0.02));
      }
      g.drag.delta = delta;
      s.renderer.setPreview(g.drag.objects, delta);
      const shown = delta[g.drag.axis];
      liveLabel.current = shown ? tr("сдвиг {0} {1}{2}", ["XYZ"[g.drag.axis], Math.round(shown * 100) / 100, mods.shiftKey ? tr(" · стык") : ""]) : "";
    },
    [propsOnlyFactors, selectionBounds, showTransformPreview],
  );

  /** Any tool: a double click on an object selects it and switches to moving it. */
  const onDoubleClick3D = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button !== 0 || SAT_ANY) return;
      const s = session.current;
      const map = current.current;
      if (!s || !map) return;
      const { css } = canvasCss(e);
      void (async () => {
        const id = await s.renderer.pick(s.camera, css[0], css[1]);
        const info = id === null ? null : pickInfo(map, id);
        const hitId = info ? (info.kind === "face" ? info.solidId : info.entity.id) : null;
        if (hitId === null) return;
        if (toolRef.current !== "select") setTool("select");
        selection.current = new Set(withGroup(hitId));
        setHandleMode("move");
        applySelection();
      })();
    },
    [applySelection, setTool, withGroup],
  );

  // Hover, gizmo drags and click-select in the 3D view.
  const { onMouseMove, onMouseLeave, onMouseDown, onMouseUp } = useView3DTools({
    objectBounds,
    session,
    current,
    selection,
    pressed,
    hoverPending,
    activeView,
    toolRef,
    gridRef,
    handleMode,
    setHandleMode,
    liveLabel,
    gizmo,
    faceSel,
    entityClassRef,
    busy,
    setHover,
    setGridSize,
    tool,
    paintClickRef,
    setStatusText,
    paintRef,
    painting,
    currentModelRef,
    withGroup,
    setCurrentMaterial,
    refreshFaces,
    clearFaces,
    applySelection,
    selectedIndices,
    ensureModel,
    commitTranslate,
    commitRotate,
    commitScale,
    paintAt,
    faceHit,
    applyMaterial,
    createEntityAt,
    finishPickTarget,
    selectionBounds,
    selectionEdges,
    showTransformPreview,
    placementBox,
    pushOutOfSurface,
    gizmoAxisAt,
    updateGizmoDrag,
    landscapeHit,
    sculptAt,
    showBrush,
    sculpting,
    landscapeRef,
    scatterRef,
    mergeUndo,
    measureRef,
    setMeasure,
    selectIds,
  });
  // Keyboard: tools, undo/redo, save, grid, nudge, delete, block confirm.
  useEffect(
    () =>
      installKeyboard({
        session,
        selection,
        activeView,
        toolRef,
        pendingBox,
        faceSel,
        clipLineRef,
        measureRef,
        setMeasure,
        clipKeepRef,
        setStatusText,
        setPaletteOpen,
        keymapRef,
        pickTargetRef,
        setPickingTarget,
        pickModelRef,
        setPickingModel,
        clearFaces,
        selectIds,
        setPendingBox,
        setClipKeep,
        setClipLine,
        commitTranslate,
        applyClip,
        createPendingBlock,
        redo,
        commandsRef,
      }),
    [commitTranslate, createPendingBlock, redo, selectIds, setPendingBox, applyClip, setClipKeep, setClipLine, clearFaces],
  );

  // Development: GME_AUTOLOAD opens a map; GME_AUTO* variables drive an edit and a capture (app/autotest.ts).
  useEffect(() => {
    if (!(app?.autoload || app?.autonew) || !gpuOk || SAT_ANY) return;
    runAutotest(app, editorApi);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.autoload, app?.autonew, gpuOk]);

  // The boot banner (index.html) stays until the editor has painted its first frame;
  // when no frames come (a window not shown yet), it goes a moment later anyway.
  useEffect(() => {
    const t = window.setTimeout(bootDone, 1200);
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(bootDone);
    });
    return () => {
      window.clearTimeout(t);
      cancelAnimationFrame(id);
    };
  }, []);

  const contentText = !content
    ? inTauri
      ? tr("контент: …")
      : tr("контент: нет (вне Tauri)")
    : content.state === "loading"
      ? tr("контент: монтирование…")
      : content.state === "ready"
        ? tr("контент: {0} файлов из {1} источников{2}", [content.files, content.mounts, content.failed ? tr(", {0} с ошибкой", [content.failed]) : ""])
        : tr("контент: {0}", [content.message ?? content.state]);

  let hoverText = "";
  if (hover?.kind === "face") {
    const src = materialInfos.current.get(hover.material)?.source;
    hoverText = tr("браш {0} · грань {1} · {2}{3}", [hover.solidId, hover.sideId, hover.material, src ? ` (${src})` : ""]);
  } else if (hover?.kind === "entity") {
    const e = hover.entity;
    const cls = classInfos.current.get(e.classname);
    hoverText = `${e.classname}${e.targetname ? ` «${e.targetname}»` : ""} · id ${e.id}${e.model ? ` · ${e.model}` : ""}${e.instance_file ? ` · ${e.instance_file}` : ""}${cls && !cls.found ? tr(" · нет в FGD") : ""}`;
  }

  /** One docked panel by kind; the side column shows one or two of them. */
  const editorApi: EditorApi = {
    canvasRef,
    canvas2dRefs,
    session,
    current,
    currentPath,
    selection,
    perfSampler,
    lastOpenMs,
    pendingAxis,
    faceSel,
    materialRef,
    culledRef,
    gpuOk,
    content,
    mapNameRef,
    error,
    tool,
    setPanel,
    modelCache,
    setTourIndex,
    setTourKind,
    lightCountRef,
    modelBoundsRef,
    portalSegs,
    prefabsRef,
    lastBsp,
    leakPointsRef,
    compileLinesRef,
    compileRun,
    compileDoneRef,
    setViewModeState,
    setPathChain,
    pickTargetRef,
    setPickingTarget,
    setCurrentMaterial,
    setEntityClass,
    setCurrentModel,
    setShape,
    setPrim,
    refreshFaces,
    applySelection,
    refreshHelpers,
    selectIds,
    setPendingBox,
    ensureModel,
    applyEdit,
    commitTranslate,
    commitRotate,
    commitScale,
    runEdit,
    hideSelection,
    groupSelection,
    deleteSelection,
    tieSelection,
    moveToWorld,
    collapseInstances,
    clipboardRef,
    copySelection,
    savePrefab,
    insertPrefab,
    cloneSelection,
    arraySelection,
    setPaint,
    createDisplacement,
    displacementOp,
    paintAt,
    editFaces,
    setWorldKeys,
    replaceTextures,
    showPortals,
    loadPortalfile,
    cubemapsDoneRef,
    bridgeCubemaps,
    analyzePack,
    packCustom,
    importTextureFiles,
    alignSelection,
    checkProblems,
    fixProblems,
    applyMaterialToSelection,
    createEntityAt,
    createPendingBlock,
    setEntityKeys,
    selectedOverlay,
    finishPickTarget,
    setEntityConnections,
    saveTo,
    compileCurrent,
    objectBounds,
    selectionBounds,
    updateGizmo,
    openSatellite,
    matPreview,
    revertMaterialPreview,
    updateMaterialPreview,
    clearModelGhost,
    updateModelGhost,
    dropAssetRef,
    openPath,
    newMap,
    openPanel,
    texturesShown,
    paintRef,
    satChannelRef,
    toolRef,
    mapName,
    busy,
    setError,
    selectedCount,
    gridSize,
    setPaintClick,
    snapMoves,
    setStatusText,
    currentMaterial,
    layout,
    layoutRef,
    savedLayouts,
    storeSavedLayouts,
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
    pickModelRef,
    setPickingModel,
    classList,
    entityDetails,
    classDef,
    targetnames,
    openProperties,
    placeModelRef,
    clearFaces,
    selectionBoundsRef,
    setTool,
    setSnapMoves,
    rotatePreview,
    pickModel,
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
    selectDetailCandidates,
    convertProps,
    growSelection,
    flipHinge,
    nodrawHiddenFaces,
    copyTransform,
    pasteTransform,
    selectRandom,
    mergeBrushes,
    selectParent,
    originToCentre,
    revealAndSelect,
    browseToAsset,
    selectAssetUsers,
    duplicateUnique,
    refreshPrefabs,
    sewDisplacements,
    removeDisplacement,
    replaceEntityKeys,
    focusSelection,
    selectObject,
    goToRef,
    showLeak,
    runGame,
    bridgeTeleport,
    bridgeCameraToGame,
    bridgeGameToCamera,
    bridgeSyncEntities,
    bridgeReload,
    gameKill,
    importTexturesDialog,
    applyMaterial,
    inputsFor,
    classDefFor,
    lockedRef,
    setKeysOnEntities,
    inspectorItems,
    moveSelectionCentre,
    resizeSelection,
    startAssetDrag,
    resources,
    modelThumbs,
    requestThumb,
    refreshHistory,
    openHistoryEntry,
    jumpHistory,
    historyDiff,
    compareHistoryEntry,
    closeHistoryDiff,
    goToDiffRow,
    revertDiffRow,
    applyWholeLayout,
    baseCommands,
    commands,
    setGrid,
    overlayRefs,
    handleModeUi,
    setHandleMode,
    gpu,
    mapInfo,
    render,
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
    hist,
    railWide,
    setRailWide,
    paintClick,
    textureLock,
    statusText,
    cordonState,
    clipKeep,
    showColumn,
    setShowColumn,
    applyLayout,
    pruneTransient,
    panel,
    setPanelState,
    panelRef,
    setPaletteOpen,
    paletteOpen,
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
    setShowFirstSteps,
    tourIndex,
    onboardingOpen,
    recent,
    selectGroups,
    entityClass,
    viewMode,
    setViewMode,
    pathChain,
    pickingTarget,
    pickingModel,
    loadClassList,
    setTieClass,
    setClipKeep,
    setQuickCut,
    quickCut,
    quickCutSelection,
    setCordonActive,
    removeCordon,
    setHollowThickness,
    hollowThickness,
    hollowSelection,
    openPanelWindow,
    assetDrag,
    hintShown,
    restoreAutosave,
    paletteExtra,
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
    hoverText,
    hoverPending,
    activeView,
    drag,
    handleMode,
    handleHover,
    liveBounds,
    liveLabel,
    pressedCss,
    pendingBox,
    blockStart,
    blockEdit,
    cordonStart,
    clipLineRef,
    measureRef,
    setMeasure,
    vertexHandles,
    vertexHover,
    setGpu,
    setGpuOk,
    setRender,
    lockedViewsRef,
    setHover,
    hover,
    withGroup,
    selectedIndices,
    setClipLine,
    moveStep,
    dockToNeighbours,
    snapToVertex,
    vertexSnapMarker,
    refreshCordon,
    propsOnlyFactors,
    ensureVertexHandles,
    vertexHandleAt,
    selectionEdges,
    hitTest2D,
    idOf,
    objectsInRect,
    cordonFromRect,
    boxFromRect,
    resizeBoxByHandle,
    scaleFromHandle,
    viewAxisVector,
    showTransformPreview,
    drawOverlays,
    pressed,
    gridRef,
    gizmo,
    entityClassRef,
    setGridSize,
    paintClickRef,
    painting,
    currentModelRef,
    faceHit,
    placementBox,
    pushOutOfSurface,
    gizmoAxisAt,
    updateGizmoDrag,
    clipKeepRef,
    keymapRef,
    applyClip,
    redo,
    commandsRef,
    textureLockRef,
    snapRef,
    tourKind,
    setOnboardingOpen,
    showSkybox,
    showSkyboxRef,
    setShowSkybox,
    setSelectGroupsState,
    selectGroupsRef,
    refreshVisgroups,
    pathChainRef,
    refreshProperties,
    setTextureLock,
    refreshEntities,
    ungroupSelection,
    carveSelection,
    pasteClipboard,
    refreshWorld,
    goToPoint,
    undo,
    saveAs,
    saveCurrent,
    stepGrid,
    materialInfos,
    classInfos,
    autoFix,
    setAutoFix,
    autoAsk,
    setAutoAsk,
    autoReport,
    autoReportRef,
    landscape,
    setLandscape,
    landscapeRef,
    scatter,
    setScatter,
    scatterRef,
    mergeUndo,
    symmetry,
    setSymmetry,
    symmetryRef,
    mirrorSelection,
    mirrorIds,
    sculpting,
    landscapeHit,
    sculptAt,
    showBrush,
    createLandscape,
    suggestLandscapeOrigin,
    placeSound,
    soundExported,
    setSoundExported,
    applyPaintedTexture,
    assistantTools,
    assistantConfirm,
    assistantKey,
    setAssistantKey,
    assistantBusy,
    compileResultRef,
    gameConsoleRef,
    journey,
    journeyRef,
    showJourney,
    setShowJourney,
    journeyShow,
    journeyAsk,
    projectMeta,
    projectMetaRef,
    updateMeta,
    createGenerated,
    regenerateGenerator,
    detachGenerator,
    addNoteHere,
    addNoteAt,
    setNotes,
    soundSetup,
    setSoundSetup,
    openSoundSetup,
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
    setEditorCamera,
    editorScreenshot,
  };
  return <Shell e={editorApi} />;
}
