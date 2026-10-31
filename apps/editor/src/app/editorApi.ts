// The editor's inner API: the refs, state and callbacks App.tsx defines,
// handed as one object to the modules split out of it (the autotest runner,
// the panels). Members are added as the modules need them.

import { type ClassDef, type ClassEntry, type CompileOptions, type ContentStatus, type BridgeStatus, type CubemapsDone, type IoDef } from "../tauri";
import type { SymmetrySettings } from "./symmetry";
import type { Measurement } from "./measure";
import type { ScatterSettings } from "./scatter";
import { type CompileState } from "../ui/CompilePanel";
import { type NewMapOptions } from "../ui/NewMapPanel";
import { type Command } from "../ui/CommandPalette";
import { type DialogSpec } from "../ui/ConfirmDialog";
import { type AssetKind } from "../ui/assetDrag";
import { type ResourceSnapshot } from "../ui/ResourcesPanel";
import { type DockLayout, type SavedLayout } from "../ui/Dock";
import { type FirstStepsState } from "../ui/FirstSteps";
import { type TourKind } from "../ui/tutorial";
import { type Experience } from "../ui/Onboarding";
import { type InspectorItem } from "../ui/InspectorPanel";
import { type ModelData } from "../viewport/models";
import { type Connection, type EntityDetails } from "../ui/PropertiesPanel";
import { type FaceEdit, type FaceInfo, type PaintSettings } from "../ui/FaceEditor";
import { type Problem } from "../ui/ProblemsPanel";
import { type Theme } from "../ui/SettingsPanel";
import { type ArrayOptions } from "../ui/ArrayPanel";
import { type Keymap } from "../ui/hotkeys";
import { type HistoryDiff } from "../ui/HistoryPanel";
import { type DiffRow } from "./mapDiff";
import { type GeneratorRecord } from "./generators";
import { type MapNote } from "./notes";
import { type OverlayFrame } from "../viewport/overlays";
import { type LogRef } from "../map/compilelog";
import type { HistoryEntry, ImportedTexture, PackReport, PrefabInfo, AssistantKeyStatus, GameConsole } from "../tauri";
import type { AssistantContext } from "./assistant";
import type { Confirm } from "./assistantTools";
import type { JourneyStage, ProjectMeta } from "./journey";
import type { CompileIssue } from "../map/compileIssues";
import type { GameShot } from "../ui/GameViewPanel";
import { type AutoVisGroup, type VisGroupInfo } from "../ui/VisgroupsPanel";
import { type ClipKeep } from "../viewport/clipper";
import { type EditResult, type HistoryState, type LoadedMap } from "../map/loader";
import { FlyCamera } from "../viewport/camera";
import { type ViewKind } from "../viewport/camera2d";
import { type ViewId, type ViewsLayout } from "../ui/viewsLayout";
import { type HandleMode } from "../viewport/handles";
import { type RenderStats } from "../viewport/renderer";
import { type Box3, type Vec3 } from "../viewport/transform";
import type React from "react";
import type { LandscapeHit, LandscapeOptions, LandscapeSettings } from "../ui/LandscapePanel";
import type { MaterialInfo, ClassInfo } from "../tauri";
import type { ClipLine } from "../viewport/clipper";
import type { OrthoCamera } from "../viewport/camera2d";
import type { Handle } from "../viewport/handles";
import type { Affine } from "../viewport/transform";
import type { GizmoState, Drag2D } from "./constants";
import type { PickInfo } from "../map/loader";
import type { VertexHandle } from "../viewport/vertices";

import type { Menu, MenuItem } from "../ui/MenuBar";
import type { TourStep } from "../ui/Tour";
import type { Panel, Session, Shape, Tool, ViewMode } from "./constants";

export interface EditorApi {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  canvas2dRefs: React.MutableRefObject<Record<ViewKind, HTMLCanvasElement | null>>;
  session: React.MutableRefObject<Session | null>;
  current: React.MutableRefObject<LoadedMap | null>;
  currentPath: React.MutableRefObject<string>;
  selection: React.MutableRefObject<Set<number>>;
  perfSampler: React.MutableRefObject<{ until: number; stamps: number[] } | null>;
  lastOpenMs: React.MutableRefObject<number>;
  pendingAxis: React.MutableRefObject<number>;
  faceSel: React.MutableRefObject<Map<string, [number, number]>>;
  materialRef: React.MutableRefObject<string>;
  culledRef: React.MutableRefObject<Set<number>>;
  gpuOk: boolean | null;
  content: ContentStatus | null;
  mapNameRef: React.MutableRefObject<string>;
  error: string;
  tool: Tool;
  setPanel: (v: Panel | ((p: Panel) => Panel)) => void;
  modelCache: React.MutableRefObject<Map<string, ModelData | null>>;
  setTourIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setTourKind: React.Dispatch<React.SetStateAction<TourKind>>;
  lightCountRef: React.MutableRefObject<number>;
  modelBoundsRef: React.MutableRefObject<Map<number, Box3>>;
  portalSegs: React.MutableRefObject<Float32Array | null>;
  prefabsRef: React.MutableRefObject<PrefabInfo[] | null>;
  lastBsp: React.MutableRefObject<string | null>;
  leakPointsRef: React.MutableRefObject<number>;
  compileLinesRef: React.MutableRefObject<string[]>;
  compileRun: React.MutableRefObject<number>;
  compileDoneRef: React.MutableRefObject<number>;
  setViewModeState: React.Dispatch<React.SetStateAction<ViewMode>>;
  setPathChain: (on: boolean) => void;
  pickTargetRef: React.MutableRefObject<{ entity: number; key: string } | null>;
  setPickingTarget: React.Dispatch<React.SetStateAction<string | null>>;
  setCurrentMaterial: (name: string) => void;
  setEntityClass: (name: string) => void;
  setCurrentModel: (name: string) => void;
  setShape: (s: Shape) => void;
  setPrim: (p: Partial<{ sides: number; wall: number; arc: number; step: number; reverse: boolean }>) => void;
  refreshFaces: () => void;
  applySelection: () => void;
  refreshHelpers: () => void;
  selectIds: (ids: Iterable<number>) => void;
  setPendingBox: (box: Box3 | null) => void;
  ensureModel: (name: string, skin: number, body?: number) => Promise<string | null>;
  applyEdit: () => Promise<void>;
  commitTranslate: (ids: Iterable<number>, delta: Vec3) => Promise<void>;
  commitRotate: (ids: Iterable<number>, pivot: Vec3, axis: Vec3, degrees: number) => Promise<void>;
  commitScale: (ids: Iterable<number>, pivot: Vec3, factors: Vec3) => Promise<void>;
  runEdit: (edit: () => unknown) => Promise<EditResult | undefined>;
  hideSelection: () => Promise<void>;
  groupSelection: () => Promise<EditResult | undefined>;
  deleteSelection: (confirmBig?: boolean) => Promise<void>;
  tieSelection: (classname?: string) => Promise<void>;
  moveToWorld: () => Promise<void>;
  collapseInstances: () => Promise<void>;
  clipboardRef: React.MutableRefObject<string>;
  copySelection: () => void;
  savePrefab: (name: string) => Promise<void>;
  insertPrefab: (p: PrefabInfo, at?: Vec3) => Promise<void>;
  cloneSelection: (delta: Vec3) => Promise<void>;
  arraySelection: (o: ArrayOptions) => Promise<void>;
  setPaint: (p: PaintSettings) => void;
  createDisplacement: (power: number) => Promise<void>;
  displacementOp: (op: "invert" | "subdivide") => Promise<void>;
  paintAt: (solid: number, side: number, at: Vec3, lower: boolean, merge: boolean) => Promise<void>;
  editFaces: (edit: FaceEdit) => Promise<void>;
  setWorldKeys: (changes: [string, string | null][]) => Promise<void>;
  replaceTextures: (find: string, replace: string, scope: "selection" | "map", substring: boolean) => Promise<void>;
  showPortals: (on: boolean) => void;
  loadPortalfile: () => Promise<number>;
  cubemapsDoneRef: React.MutableRefObject<CubemapsDone | null>;
  bridgeCubemaps: (relaunch?: boolean) => Promise<void>;
  analyzePack: () => Promise<PackReport | null>;
  packCustom: (report?: PackReport | null) => Promise<void>;
  importTextureFiles: (paths: string[], dir?: string) => Promise<ImportedTexture[]>;
  alignSelection: (axis: 0 | 1 | 2, mode: "min" | "center" | "max" | "grid" | "distribute") => Promise<void>;
  /** Checks the map; `quiet` keeps the problems panel closed (the check after a save). */
  checkProblems: (quiet?: boolean) => Promise<Problem[] | undefined>;
  fixProblems: (list: Problem[]) => Promise<number | undefined>;
  applyMaterialToSelection: () => Promise<void>;
  createEntityAt: (origin: Vec3, extraKeys?: [string, string][]) => Promise<number | undefined>;
  createPendingBlock: () => Promise<void>;
  setEntityKeys: (id: number, changes: [string, string | null][]) => Promise<void>;
  /** The same key changes on several entities, one undo step. */
  setKeysOnEntities: (ids: number[], changes: [string, string | null][]) => Promise<void>;
  selectedOverlay: () => { id: number; frame: OverlayFrame } | null;
  finishPickTarget: (id: number | null) => boolean;
  setEntityConnections: (id: number, connections: Connection[]) => Promise<void>;
  saveTo: (path: string) => Promise<void>;
  /** Quiet: the compile panel is not brought up (the assistant's calls). */
  compileCurrent: (options?: CompileOptions, quiet?: boolean) => Promise<void>;
  objectBounds: (map: LoadedMap, index: number) => Box3 | null;
  selectionBounds: () => Box3 | null;
  updateGizmo: (camera: FlyCamera) => void;
  openSatellite: (view: ViewId) => Promise<number>;
  matPreview: React.MutableRefObject<{ key: string } | null>;
  revertMaterialPreview: () => Promise<void>;
  updateMaterialPreview: (name: string, ev: MouseEvent) => Promise<void>;
  clearModelGhost: () => void;
  updateModelGhost: (name: string, ev: MouseEvent) => Promise<void>;
  dropAssetRef: React.MutableRefObject<(kind: AssetKind, name: string, ev: MouseEvent) => Promise<void>>;
  openPath: (path: string) => Promise<void>;
  newMap: (o: NewMapOptions) => Promise<void>;
  openPanel: (kind: Panel) => void;
  texturesShown: boolean;
  paintRef: React.MutableRefObject<PaintSettings>;
  satChannelRef: React.MutableRefObject<BroadcastChannel | null>;
  toolRef: React.MutableRefObject<Tool>;
  mapName: string;
  busy: string;
  setError: (v: string) => void;
  selectedCount: number;
  gridSize: number;
  setPaintClick: (v: boolean) => void;
  snapMoves: boolean;
  setStatusText: (v: string) => void;
  currentMaterial: string;
  layout: DockLayout;
  layoutRef: React.MutableRefObject<DockLayout>;
  savedLayouts: SavedLayout[];
  storeSavedLayouts: (list: SavedLayout[]) => void;
  keymap: Keymap;
  setKeymap: (m: Keymap) => void;
  faceInfo: FaceInfo | null;
  faceCount: number;
  paint: PaintSettings;
  problems: Problem[] | null;
  worldDetails: EntityDetails | null;
  worldDef: ClassDef | null;
  currentModel: string;
  modelPreview: string | null;
  modelPreviewInfo: string;
  theme: Theme;
  uiScale: number;
  setTheme: (t: Theme) => void;
  setUiScale: (v: number) => void;
  autoInspector: boolean;
  setAutoInspector: (v: boolean) => void;
  showHints: boolean;
  setShowHints: (v: boolean) => void;
  compileOptions: CompileOptions;
  setCompileOptions: React.Dispatch<React.SetStateAction<CompileOptions>>;
  compileState: CompileState;
  setCompileState: React.Dispatch<React.SetStateAction<CompileState>>;
  bridge: BridgeStatus | null;
  bridgeFollow: boolean;
  bridgeLive: boolean;
  setBridgeLive: (v: boolean) => void;
  setBridgeFollow: (v: boolean) => void;
  portalCount: number;
  portalsShown: boolean;
  /** Visleaves of the compiled BSP: how many, whether drawn, the toggle and the reader. */
  leafCount: number;
  leavesShown: boolean;
  showLeaves: (on: boolean) => void;
  loadLeaves: () => Promise<number>;
  leakPoints: number;
  pack: PackReport | null;
  packBusy: boolean;
  packAfterCompile: boolean;
  setPackAfterCompile: (v: boolean) => void;
  autoFix: boolean;
  setAutoFix: (v: boolean) => void;
  autoAsk: boolean;
  setAutoAsk: (v: boolean) => void;
  autoReport: string;
  autoReportRef: React.MutableRefObject<string>;
  prefabs: PrefabInfo[] | null;
  historyEntries: HistoryEntry[] | null;
  prefabDir: string;
  canPack: boolean;
  visgroups: { user: VisGroupInfo[]; auto: AutoVisGroup[]; hidden: number };
  pickModelRef: React.MutableRefObject<{ entity: number; key: string } | null>;
  setPickingModel: React.Dispatch<React.SetStateAction<string | null>>;
  classList: ClassEntry[];
  entityDetails: EntityDetails | null;
  classDef: ClassDef | null;
  targetnames: string[];
  openProperties: () => void;
  placeModelRef: React.MutableRefObject<(model: string) => Promise<void>>;
  clearFaces: () => void;
  selectionBoundsRef: React.MutableRefObject<() => Box3 | null>;
  setTool: (t: Tool) => void;
  setSnapMoves: (on: boolean) => void;
  rotatePreview: (dYaw: number, dPitch: number) => Promise<void>;
  pickModel: (name: string) => Promise<void>;
  showAll: () => void;
  /** Hides everything but the selection; again, or with nothing selected, shows all. */
  isolateSelection: () => Promise<void>;
  /** Selects brushes sharing a material with the selection and entities of the same classes. */
  selectSimilar: () => void;
  /** Selects every visible object, or with `invert` every visible object not selected now. */
  selectAllVisible: (invert: boolean) => void;
  /** Locks the selection against picking, or with false unlocks everything. */
  lockSelection: (lock: boolean) => void;
  /** Adds the entities parented to the selection, at any depth. */
  selectWithChildren: () => void;
  /** Hides every all-tools brush, or shows them when they are hidden. */
  toggleToolBrushes: () => Promise<void>;
  /** Remembers the 3D camera in slot 0…4 of this map's bookmarks. */
  saveCameraBookmark: (slot: number) => void;
  /** Moves the 3D camera to bookmark slot 0…4. */
  goCameraBookmark: (slot: number) => void;
  /** Moves the selection down onto the highest object under it. */
  dropToFloor: () => Promise<void>;
  /** Duplicates the selection shifted by the last move. */
  repeatMoveCopy: () => Promise<void>;
  /** Copies the settings of the selected entity, without name and place. */
  copyEntityKeys: () => void;
  /** Pastes copied settings into the selected entities of the same class. */
  pasteEntityKeys: () => Promise<void>;
  /** Sets angles 0 0 0 and drops modelscale on the selected point entities. */
  resetTransform: () => Promise<void>;
  /** Gives each selected point entity its own random yaw and a slight tilt. */
  randomizeRotation: () => Promise<void>;
  /** Selects every brush and point entity wholly inside the selection's bounds. */
  selectInside: () => void;
  /** Gives every selected prop the model picked in the model browser. */
  replaceSelectedModel: () => Promise<void>;
  /** Turns the selection a quarter about its centre on axis 0…2. */
  rotateSelection90: (axis: 0 | 1 | 2, degrees: 90 | -90) => Promise<void>;
  /** Selects brushes whose bounds dig into each other. */
  findOverlaps: () => void;
  /** Copies the selection's centre, or the camera, as text: x y z, or a Lua Vector. */
  copyCoordinates: (lua: boolean) => void;
  /** Asks for a name and gives it to the selected entities, numbered when there are several. */
  renameSelection: () => Promise<void>;
  /** Saves the map to the next free numbered file (room_2.vmf…). */
  saveIncremental: () => Promise<void>;
  /** Builds a trigger_multiple brush around the selection. */
  wrapInTrigger: () => Promise<void>;
  /** Pastes the clipboard onto the surface in the middle of the 3D view. */
  pasteHere: () => Promise<void>;
  /** Puts the selection's min corner (or each object's, with `each`) on the grid. */
  snapSelectionToGrid: (each: boolean) => Promise<void>;
  /** Moves the selection's centre to the 3D camera. */
  moveToCamera: () => Promise<void>;
  /** Selects the entities whose outputs or name keys point at the selected names. */
  selectReferencing: () => void;
  /** Selects the whole path_track / path_corner chain of the selection. */
  selectPathChain: () => void;
  /** Looks through the selected entity; the second call writes the new aim back and returns the camera. */
  pilotSelection: () => Promise<void>;
  /** Frames every visible object in all views. */
  frameAll: () => void;
  /** Selects small world brushes that should be func_detail. */
  selectDetailCandidates: () => void;
  /** Adds every visible object touching the selection. */
  growSelection: () => void;
  /** Moves a rotating door's hinge to its other end. */
  flipHinge: () => Promise<void>;
  /** Paints nodraw on faces of selected boxes pressed against other solid boxes. */
  nodrawHiddenFaces: () => Promise<void>;
  /** Keeps where the selection stands and a point entity's angles. */
  copyTransform: () => void;
  /** Keeps a random half of the selected objects. */
  selectRandom: () => void;
  /** Joins selected world box brushes that share whole faces. */
  mergeBrushes: () => Promise<void>;
  /** Selects the parents of the selection (or the roots of their chains). */
  selectParent: (toRoot: boolean) => void;
  /** Puts each selected brush entity's origin in the middle of its brushes. */
  originToCentre: () => Promise<void>;
  /** Shows everything hidden and selects what came back. */
  revealAndSelect: () => Promise<void>;
  /** Shows the selected prop's model or brush's material in its library. */
  browseToAsset: () => void;
  /** Selects every prop with the current model or brush with the current material. */
  selectAssetUsers: (kind: "model" | "material") => void;
  /** Duplicates the selection in place with the next free names, its own I/O following. */
  duplicateUnique: () => Promise<void>;
  /** Puts the selection at the copied point, or gives point entities the copied angles. */
  pasteTransform: (what: "position" | "rotation") => Promise<void>;
  /** Turns the selected props into another prop class. */
  convertProps: (cls: "prop_static" | "prop_physics" | "prop_dynamic") => Promise<void>;
  refreshPrefabs: () => Promise<void>;
  sewDisplacements: () => Promise<void>;
  removeDisplacement: () => Promise<void>;
  replaceEntityKeys: (ids: number[], key: string, find: string, replace: string) => Promise<void>;
  focusSelection: () => void;
  selectObject: (id: number) => void;
  goToRef: (ref: LogRef) => void;
  showLeak: (positions: Float32Array | null) => void;
  runGame: (debug?: boolean, clean?: boolean) => Promise<void>;
  bridgeTeleport: () => Promise<void>;
  bridgeCameraToGame: () => Promise<void>;
  bridgeGameToCamera: () => Promise<void>;
  bridgeSyncEntities: () => Promise<void>;
  bridgeReload: () => Promise<void>;
  gameKill: () => Promise<void>;
  importTexturesDialog: () => Promise<void>;
  applyMaterial: (faces: number[]) => Promise<void>;
  inputsFor: (target: string) => Promise<IoDef[]>;
  /** The FGD definition of a class (keys, inputs, outputs), cached. */
  classDefFor: (classname: string) => Promise<ClassDef>;
  /** Ids kept out of selection (Ctrl+Shift+L), mutable; the outliner toggles single objects. */
  lockedRef: React.MutableRefObject<Set<number>>;
  inspectorItems: () => InspectorItem[];
  moveSelectionCentre: (centre: Vec3) => Promise<void>;
  resizeSelection: (size: Vec3) => Promise<void>;
  startAssetDrag: (kind: AssetKind, name: string, e: React.MouseEvent) => void;
  resources: ResourceSnapshot | null;
  modelThumbs: Map<string, string>;
  requestThumb: (name: string) => void;
  refreshHistory: () => Promise<void>;
  historyDiff: HistoryDiff | null;
  compareHistoryEntry: (e: HistoryEntry) => Promise<void>;
  closeHistoryDiff: () => void;
  goToDiffRow: (row: DiffRow) => void;
  revertDiffRow: (row: DiffRow) => Promise<void>;
  openHistoryEntry: (e: HistoryEntry) => Promise<void>;
  applyWholeLayout: (next: DockLayout) => void;
  baseCommands: Command[];
  commands: Command[];
  setGrid: (size: number) => void;
  overlayRefs: React.MutableRefObject<Record<ViewKind, HTMLCanvasElement | null>>;
  handleModeUi: HandleMode;
  setHandleMode: (m: HandleMode) => void;
  gpu: string;
  mapInfo: string;
  render: RenderStats | null;
  lockedViews: ViewKind[];
  toggleViewLock: (kind: ViewKind) => void;
  views: ViewsLayout;
  viewsRef: React.MutableRefObject<ViewsLayout>;
  viewsEl: React.MutableRefObject<HTMLDivElement | null>;
  viewsSize: { w: number; h: number };
  setViews: (next: ViewsLayout) => void;
  viewDrag: { id: ViewId; x: number; y: number; target: ViewId | "float" | null } | null;
  startViewDrag: (id: ViewId, e: React.MouseEvent) => void;
  startViewFloat: (id: ViewId, mode: "move" | "resize", e: React.MouseEvent) => void;
  startViewSplit: (axis: "col" | "row" | "both", e: React.MouseEvent) => void;
  hist: HistoryState | null;
  railWide: boolean;
  setRailWide: (v: boolean) => void;
  paintClick: boolean;
  textureLock: boolean;
  statusText: string;
  cordonState: { active: boolean } | null;
  clipKeep: ClipKeep;
  showColumn: boolean;
  setShowColumn: (v: boolean) => void;
  applyLayout: (next: DockLayout) => void;
  pruneTransient: (l: DockLayout) => DockLayout;
  panel: Panel;
  setPanelState: React.Dispatch<React.SetStateAction<Panel>>;
  panelRef: React.MutableRefObject<Panel>;
  setPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  paletteOpen: boolean;
  shape: Shape;
  prim: { sides: number; wall: number; arc: number; step: number; reverse: boolean };
  tieClass: string;
  solidClasses: ClassEntry[];
  autosaveNote: string;
  cheatOpen: boolean;
  setCheatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRestoreOffer: React.Dispatch<React.SetStateAction<{ path: string; when: string } | null>>;
  restoreOffer: { path: string; when: string } | null;
  contextMenu: { x: number; y: number } | null;
  setContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  leftHeld: React.MutableRefObject<boolean>;
  dialog: DialogSpec | null;
  answerDialog: (v: string) => void;
  firstSteps: FirstStepsState;
  showFirstSteps: boolean;
  setShowFirstSteps: (v: boolean) => void;
  tourIndex: number | null;
  onboardingOpen: boolean;
  recent: string[];
  selectGroups: boolean;
  entityClass: string;
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  pathChain: boolean;
  pickingTarget: string | null;
  pickingModel: string | null;
  loadClassList: () => void;
  setTieClass: (name: string) => void;
  setClipKeep: (k: ClipKeep) => void;
  setQuickCut: React.Dispatch<React.SetStateAction<{ parts: number; axis: "x" | "y" | "z" }>>;
  quickCut: { parts: number; axis: "x" | "y" | "z" };
  quickCutSelection: () => Promise<void>;
  setCordonActive: (active: boolean) => void;
  removeCordon: () => void;
  setHollowThickness: React.Dispatch<React.SetStateAction<number>>;
  hollowThickness: number;
  hollowSelection: () => Promise<void>;
  openPanelWindow: (kind: Panel) => void;
  assetDrag: { kind: AssetKind; name: string; x: number; y: number; over: ViewId | null; yaw?: number } | null;
  hintShown: boolean;
  restoreAutosave: () => Promise<void>;
  paletteExtra: (query: string) => Command[];
  tourSteps: TourStep[];
  startTour: (kind?: TourKind) => void;
  finishOnboarding: (choice: Experience) => void;
  keymapPreset: string;
  byId: Map<string, Command>;
  contextItems: MenuItem[];
  menus: Menu[];
  openDialog: () => Promise<void>;
  onDoubleClick3D: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseLeave: () => void;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: (e: React.MouseEvent<HTMLCanvasElement>) => Promise<void>;
  contentText: string;
  hoverText: string;
  hoverPending: React.MutableRefObject<{ x: number; y: number } | null>;
  activeView: React.MutableRefObject<OrthoCamera | null>;
  drag: React.MutableRefObject<Drag2D | null>;
  handleMode: React.MutableRefObject<HandleMode>;
  handleHover: React.MutableRefObject<{ view: ViewKind; handle: Handle } | null>;
  liveBounds: React.MutableRefObject<Box3 | null>;
  liveLabel: React.MutableRefObject<string>;
  pressedCss: React.MutableRefObject<[number, number] | null>;
  pendingBox: React.MutableRefObject<Box3 | null>;
  blockStart: React.MutableRefObject<[number, number] | null>;
  blockEdit: React.MutableRefObject<{ kind: "resize"; handle: Handle; bounds: Box3 } | { kind: "move"; start: [number, number]; bounds: Box3 } | null>;
  cordonStart: React.MutableRefObject<[number, number] | null>;
  clipLineRef: React.MutableRefObject<ClipLine | null>;
  measureRef: React.MutableRefObject<Measurement | null>;
  vertexHandles: React.MutableRefObject<Record<ViewKind, VertexHandle[]>>;
  vertexHover: React.MutableRefObject<{ view: ViewKind; index: number } | null>;
  setGpu: React.Dispatch<React.SetStateAction<string>>;
  setGpuOk: React.Dispatch<React.SetStateAction<boolean | null>>;
  setRender: React.Dispatch<React.SetStateAction<RenderStats | null>>;
  lockedViewsRef: React.MutableRefObject<ViewKind[]>;
  setHover: React.Dispatch<React.SetStateAction<PickInfo | null>>;
  hover: PickInfo | null;
  withGroup: (id: number) => number[];
  selectedIndices: () => number[];
  setClipLine: (line: ClipLine | null) => void;
  setMeasure: (m: Measurement | null) => void;
  moveStep: (v: number, grid: number, mods?: { altKey: boolean }) => number;
  dockToNeighbours: (map: LoadedMap, moving: number[], bounds: Box3, delta: Vec3, axes: number[], threshold: number) => Vec3;
  /** Vertex snapping for a move in a 2D view (V held): the result's delta replaces the move, `lists` is the cache for the rest of the drag. */
  snapToVertex: (
    map: LoadedMap,
    moving: number[],
    delta: Vec3,
    axes: number[],
    cursor: [number, number],
    threshold: number,
    cache: { mine: number[]; others: number[] } | null,
  ) => { delta: Vec3; target: [number, number] | null; lists: { mine: number[]; others: number[] } };
  /** The other object's vertex the selection is snapped to, drawn in that view. */
  vertexSnapMarker: React.MutableRefObject<{ view: ViewKind; world2: [number, number] } | null>;
  refreshCordon: () => void;
  propsOnlyFactors: (factors: Vec3) => Vec3;
  ensureVertexHandles: () => void;
  vertexHandleAt: (view: OrthoCamera, css: [number, number]) => number | null;
  selectionEdges: () => Float32Array;
  hitTest2D: (view: OrthoCamera, world: [number, number]) => number | null;
  idOf: (map: LoadedMap, index: number) => number | null;
  objectsInRect: (view: OrthoCamera, a: [number, number], b: [number, number]) => number[];
  cordonFromRect: (view: OrthoCamera, a: [number, number], b: [number, number]) => Box3 | null;
  boxFromRect: (view: OrthoCamera, a: [number, number], b: [number, number]) => Box3 | null;
  resizeBoxByHandle: (view: OrthoCamera, handle: Handle, bounds: Box3, world: [number, number]) => Box3;
  scaleFromHandle: (view: OrthoCamera, handle: Handle, bounds: Box3, world: [number, number]) => { pivot: Vec3; factors: Vec3; bounds: Box3 };
  viewAxisVector: (view: OrthoCamera) => Vec3;
  showTransformPreview: (affine: Affine | null, _edges: Float32Array | null) => void;
  drawOverlays: () => void;
  pressed: React.MutableRefObject<{ x: number; y: number } | null>;
  gridRef: React.MutableRefObject<number>;
  gizmo: React.MutableRefObject<GizmoState>;
  entityClassRef: React.MutableRefObject<string>;
  setGridSize: React.Dispatch<React.SetStateAction<number>>;
  paintClickRef: React.MutableRefObject<boolean>;
  painting: React.MutableRefObject<{ solid: number; side: number; pickId: number; last: Vec3; lower: boolean } | null>;
  currentModelRef: React.MutableRefObject<string>;
  faceHit: (css: [number, number], w: number, h: number, pickId: number) => Vec3 | null;
  placementBox: (cls: string, model: string | null, yaw?: number) => Box3;
  pushOutOfSurface: (hit: Vec3, n: Vec3, box: Box3) => Vec3;
  gizmoAxisAt: (css: [number, number], w: number, h: number) => number | null;
  updateGizmoDrag: (css: [number, number], w: number, h: number, mods: { altKey: boolean; shiftKey: boolean }) => void;
  clipKeepRef: React.MutableRefObject<ClipKeep>;
  keymapRef: React.MutableRefObject<Keymap>;
  applyClip: () => Promise<void>;
  redo: () => Promise<void>;
  commandsRef: React.MutableRefObject<Command[]>;
  textureLockRef: React.MutableRefObject<boolean>;
  snapRef: React.MutableRefObject<boolean>;
  tourKind: TourKind;
  setOnboardingOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showSkybox: boolean;
  showSkyboxRef: React.MutableRefObject<boolean>;
  setShowSkybox: (v: boolean) => void;
  setSelectGroupsState: React.Dispatch<React.SetStateAction<boolean>>;
  selectGroupsRef: React.MutableRefObject<boolean>;
  refreshVisgroups: () => void;
  pathChainRef: React.MutableRefObject<{ on: boolean; last: number | null; n: number }>;
  refreshProperties: () => void;
  setTextureLock: (on: boolean) => void;
  refreshEntities: () => Promise<void>;
  ungroupSelection: () => void;
  carveSelection: () => Promise<void>;
  pasteClipboard: () => Promise<void>;
  refreshWorld: () => void;
  goToPoint: (p: Vec3) => void;
  undo: () => Promise<void>;
  /** Several undos (negative) or redos (positive) in one go. */
  jumpHistory: (delta: number) => Promise<void>;
  saveAs: () => Promise<void>;
  saveCurrent: () => Promise<void>;
  stepGrid: (dir: 1 | -1) => void;
  materialInfos: React.MutableRefObject<Map<string, MaterialInfo>>;
  classInfos: React.MutableRefObject<Map<string, ClassInfo>>;
  landscape: LandscapeSettings;
  setLandscape: (patch: Partial<LandscapeSettings>) => void;
  landscapeRef: React.MutableRefObject<LandscapeSettings>;
  scatter: ScatterSettings;
  setScatter: (patch: Partial<ScatterSettings>) => void;
  scatterRef: React.MutableRefObject<ScatterSettings>;
  mergeUndo: (count: number, label: string) => void;
  symmetry: SymmetrySettings;
  setSymmetry: (patch: Partial<SymmetrySettings>) => void;
  symmetryRef: React.MutableRefObject<SymmetrySettings>;
  mirrorSelection: () => Promise<void>;
  mirrorIds: (ids: number[], label: string, extraSteps?: number, select?: boolean) => Promise<number[]>;
  sculpting: React.MutableRefObject<{ last: Vec3; lower: boolean; height: number } | null>;
  landscapeHit: (css: [number, number], w: number, h: number) => LandscapeHit | null;
  sculptAt: (at: Vec3, lower: boolean, merge: boolean, height: number, face: { solidId: number; sideId: number } | null) => Promise<void>;
  showBrush: (point: Vec3 | null, normal?: Vec3) => void;
  createLandscape: (o: LandscapeOptions) => Promise<void>;
  suggestLandscapeOrigin: () => Vec3;
  /** An ambient_generic with the sound in front of the camera. */
  placeSound: (name: string, loop: boolean) => Promise<void>;
  soundExported: { name: string; loop: boolean; bytes: number } | null;
  setSoundExported: React.Dispatch<React.SetStateAction<{ name: string; loop: boolean; bytes: number } | null>>;
  applyPaintedTexture: (material: string, apply: boolean) => Promise<void>;
  assistantTools: AssistantContext;
  assistantConfirm: React.MutableRefObject<Confirm>;
  assistantBusy: React.MutableRefObject<boolean>;
  compileResultRef: React.MutableRefObject<{ ok: boolean | null; message: string; ms: number }>;
  journey: JourneyStage[];
  journeyRef: React.MutableRefObject<JourneyStage[]>;
  showJourney: boolean;
  setShowJourney: (v: boolean) => void;
  journeyShow: (action: string) => void;
  journeyAsk: (prompt: string) => void;
  projectMeta: ProjectMeta;
  projectMetaRef: React.MutableRefObject<ProjectMeta>;
  updateMeta: (patch: Partial<ProjectMeta>) => void;
  /** Parametric brushes: create one, rebuild one with new parameters, or forget its parameters. */
  createGenerated: (spec: Omit<GeneratorRecord, "group" | "extent">) => Promise<boolean>;
  regenerateGenerator: (rec: GeneratorRecord, patch: Partial<GeneratorRecord>) => Promise<void>;
  detachGenerator: (rec: GeneratorRecord) => void;
  /** Notes pinned to the map: add one at the selection (or the camera), change the list. */
  addNoteHere: (text?: string, quiet?: boolean) => void;
  addNoteAt: (pos: Vec3, text?: string, quiet?: boolean) => void;
  setNotes: (notes: MapNote[]) => void;
  soundSetup: { id: number; name: string; keys: [string, string][] } | null;
  setSoundSetup: React.Dispatch<React.SetStateAction<{ id: number; name: string; keys: [string, string][] } | null>>;
  openSoundSetup: (id: number, name: string) => void;
  compileIssues: CompileIssue[];
  applyCompileFix: (issue: CompileIssue) => Promise<void>;
  askAboutCompile: () => void;
  askAboutProblems: () => void;
  gameShot: GameShot | null;
  gameLive: boolean;
  setGameLive: (v: boolean) => void;
  gameBusy: string;
  testCycle: (quiet?: boolean) => Promise<{ text: string; failed: boolean; shot: { bytes: Uint8Array } | null }>;
  bridgeNoclip: (on: boolean) => Promise<void>;
  bridgeHud: (on: boolean) => Promise<void>;
  askAboutShot: () => void;
  /** The 3D camera: position, pitch, yaw. */
  getEditorCamera: () => { pos: [number, number, number]; pitch: number; yaw: number } | null;
  setEditorCamera: (pos: [number, number, number] | null, pitch: number | null, yaw: number | null) => void;
  /** PNG of a view as the editor draws it, base64 without the prefix. */
  editorScreenshot: (view: "3d" | "top" | "front" | "side") => Promise<{ data: string; mediaType: string }>;
  takeGameShot: (quality?: number, camera?: [number, number, number, number, number, number] | null) => Promise<{ bytes: Uint8Array; pos: [number, number, number, number, number] | null }>;
  gameConsoleRef: React.MutableRefObject<GameConsole | null>;
  assistantKey: AssistantKeyStatus | null;
  setAssistantKey: (key: string | null) => Promise<void>;
}
