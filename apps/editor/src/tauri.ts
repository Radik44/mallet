// Typed access to the Tauri side. Everything the frontend asks the shell for
// goes through here, so the surface stays visible in one place.

import { Channel, convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { t } from "./i18n";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface AppInfo {
  tauri: string;
  webview: string;
  os: string;
  profile: string;
  autoload: string | null;
  autoshot: string | null;
  autoselect: string | null;
  autocam: string | null;
  automove: string | null;
  autosave: string | null;
  autoblock: string | null;
  autodelete: string | null;
  autorotate: string | null;
  autoscale: string | null;
  autotexture: string | null;
  autoentity: string | null;
  autokey: string | null;
  autooutput: string | null;
  autohide: string | null;
  autogroup: string | null;
  autovisgroup: string | null;
  autoclip: string | null;
  autocordon: string | null;
  autohollow: string | null;
  autocarve: string | null;
  autovertex: string | null;
  autoprimitive: string | null;
  autotie: string | null;
  autoworld: string | null;
  autocollapse: string | null;
  autoface: string | null;
  autoproblems: string | null;
  autofix: string | null;
  autoisolate: string | null;
  autoclone: string | null;
  autocompile: string | null;
  autopack: string | null;
  autoprefab: string | null;
  autoviewmode: string | null;
  /** Seconds of frames to sample for a performance report. */
  autoperf: string | null;
  autobridge: string | null;
  autotour: string | null;
  autolandscape: string | null;
  autosound: string | null;
  autopaint: string | null;
  autoassist: string | null;
  autojourney: string | null;
  autoworkshop: string | null;
  autosculpt: string | null;
  autosatellite: string | null;
  autodrop: string | null;
  autoplace: string | null;
  autoscatter: string | null;
  automeasure: string | null;
  autosymmetry: string | null;
  automatpreview: string | null;
  automodelghost: string | null;
  autodom: string | null;
  autopanel: string | null;
  autopath: string | null;
  autopick: string | null;
  autooverlay: string | null;
  autoextra: string | null;
  autoarray: string | null;
  autoimport: string | null;
  autoalign: string | null;
  autoexit: string | null;
  autodisp: string | null;
  autodispop: string | null;
  autoprop: string | null;
  autoworldkey: string | null;
  autoreplace: string | null;
  autoalpha: string | null;
  autosew: string | null;
  autohelpers: string | null;
  autonew: string | null;
}

export interface CompileOptions {
  vbsp: boolean;
  vvis: boolean;
  vrad: boolean;
  fast: boolean;
  hdr: boolean;
  install: boolean;
  runGame: boolean;
  /** Expert mode: one command per line with $vmf/$bsp/$name/$dir/$game/$bin. */
  extraCommands: string;
  vbspArgs: string;
  vvisArgs: string;
  vradArgs: string;
}

export interface PackRequest {
  materials: string[];
  models: string[];
  sounds: string[];
  skyname: string | null;
}

export interface PackFile {
  path: string;
  source: string;
  size: number;
  custom: boolean;
  neededBy: string;
}

export interface PackReport {
  files: PackFile[];
  missing: string[];
  customBytes: number;
}

export interface PackResult {
  packed: number;
  bytes: number;
  output: string;
  installed: string | null;
  log: string[];
}

export interface WorkshopPackRequest {
  bsp: string;
  map: string;
  title: string;
  tags: string[];
  outDir: string;
}

export interface WorkshopPackResult {
  folder: string;
  gma: string;
  bytes: number;
  files: string[];
  log: string[];
}

export interface WorkshopPublishRequest {
  gma: string;
  icon: string | null;
  id: string | null;
  changes: string | null;
}

export interface WorkshopPublishResult {
  id: string | null;
  url: string | null;
  log: string[];
}

export interface HistoryEntry {
  path: string;
  when: number;
  bytes: number;
}

export interface ImportedTexture {
  material: string;
  vtf: string;
  vmt: string;
  width: number;
  height: number;
  translucent: boolean;
}

export interface PrefabInfo {
  name: string;
  path: string;
  bytes: number;
}

export interface CompileLog {
  run: number;
  step: string;
  line: string;
}

/** What the game's console said while the map loaded (see compile.rs). */
/** The bridge to a running game: see src-tauri/src/bridge.rs. */
export interface BridgeStatus {
  /** A game was launched and the shared folder data/gme_bridge exists. */
  ready: boolean;
  /** The addon in the game reported within the last seconds. */
  connected: boolean;
  /** The game the editor started is still running. */
  running: boolean;
  map: string | null;
  /** Player eye position and angles: x, y, z, pitch, yaw (Source: pitch is positive down). */
  pos: [number, number, number, number, number] | null;
  queued: number;
  /** The shared folder garrysmod/data/gme_bridge, once a game was launched. */
  dataDir: string | null;
  /** Why the game is gone, when it was launched and is not running. */
  exitHint: string | null;
}

/** How a game screenshot is taken. */
export interface ShotOptions {
  quality?: number;
  /** A free camera: x, y, z, pitch, yaw, fov (0 keeps the game's). */
  camera?: [number, number, number, number, number, number];
  hud?: boolean;
}

export interface LuaResult {
  ok: boolean;
  result: string;
  realm: string;
}

export interface VtfInfo {
  width: number;
  height: number;
  mips: number;
  frames: number;
  format: string;
  flags: number;
  version: string;
}

/** What the addon posted: `hello`, `pos`, `cubemaps_start`, `cubemaps_done`. */
export interface BridgeReport {
  event?: string;
  map?: string;
  [key: string]: unknown;
}

/** How a cubemap build in the engine went (`game-cubemaps` event). */
export interface CubemapsDone {
  ok: boolean;
  map: string;
  ms: number;
  timeout: boolean;
  relaunched: boolean;
}

export interface GameConsole {
  loaded: boolean;
  lines: number;
  errors: string[];
  ended: "map" | "exit" | "timeout" | "nolog";
}

export interface CompileDone {
  run: number;
  ok: boolean;
  bsp: string | null;
  installed: string | null;
  ms: number;
  message: string;
}

export interface ContentStatus {
  state: "loading" | "ready" | "missing" | "error";
  root: string | null;
  mounts: number;
  failed: number;
  files: number;
  ms: number;
  message: string | null;
}

export interface MaterialInfo {
  name: string;
  found: boolean;
  shader: string;
  baseTexture: string | null;
  /** `$basetexture2` of WorldVertexTransition materials. */
  baseTexture2: string | null;
  width: number;
  height: number;
  translucent: boolean;
  alphaTest: boolean;
  additive: boolean;
  noCull: boolean;
  tool: boolean;
  color: [number, number, number];
  source: string | null;
}

export interface ClassInfo {
  classname: string;
  found: boolean;
  point: boolean;
  color: [number, number, number];
  mins: [number, number, number];
  maxs: [number, number, number];
  description: string;
  model: string | null;
  icon: string | null;
}

export interface ProjectMount {
  root: string | null;
  files: number;
}

/** A BSP turned back into a VMF, with what the compile had thrown away. */
/** A visleaf of the compiled map with the number of clusters it sees. */
export interface LeafInfo {
  mins: [number, number, number];
  maxs: [number, number, number];
  cluster: number;
  visible: number;
}

export interface LeafReport {
  leaves: LeafInfo[];
  clusters: number;
  maxVisible: number;
}

export interface DecompileResult {
  vmf: string;
  worldBrushes: number;
  detailBrushes: number;
  entityBrushes: number;
  entities: number;
  staticProps: number;
  displacements: number;
  cubemaps: number;
  skippedBrushes: number;
  lost: string[];
  ms: number;
}

export interface MaterialList {
  names: string[];
  total: number;
}

/** A subfolder of the material tree: its name with the trailing slash and how many materials are under it. */
export interface FolderEntry {
  name: string;
  count: number;
}

export interface ResourceReport {
  missingMaterials: string[];
  missingModels: string[];
  missingSky: string[];
}

export interface ClassEntry {
  classname: string;
  point: boolean;
  description: string;
}

export interface KeyDef {
  name: string;
  ty: string;
  display: string;
  default: string | null;
  help: string;
  readonly: boolean;
  choices: [string, string][];
  flags: [number, string, boolean][];
}

export interface IoDef {
  name: string;
  ty: string;
  help: string;
}

export interface ClassDef {
  classname: string;
  found: boolean;
  description: string;
  keys: KeyDef[];
  inputs: IoDef[];
  outputs: IoDef[];
}

const tauriApi = {
  appInfo: () => invoke<AppInfo>("app_info"),
  contentStatus: () => invoke<ContentStatus>("content_status"),
  installerLanguage: () => invoke<string | null>("installer_language"),
  onContentStatus: (cb: (s: ContentStatus) => void): Promise<UnlistenFn> => listen<ContentStatus>("content-status", (e) => cb(e.payload)),
  readTextFile: (path: string) => invoke<string>("read_text_file", { path }),
  decompileBsp: (path: string) => invoke<DecompileResult>("decompile_bsp", { path }),
  /** Visleaves of a compiled BSP for the overlay; fails when there is no BSP. */
  bspLeaves: (path: string) => invoke<LeafReport>("bsp_leaves", { path }),
  writeTextFile: (path: string, text: string) => invoke<void>("write_text_file", { path, text }),
  /** Modification time in ms, or null when the file does not exist. */
  fileMtime: (path: string) => invoke<number | null>("file_mtime", { path }),
  removeFile: (path: string) => invoke<void>("remove_file", { path }),
  listHistory: (path: string) => invoke<HistoryEntry[]>("list_history", { path }),
  saveHistory: (path: string, text: string, keep: number) => invoke<string>("save_history", { path, text, keep }),
  clearHistory: (path: string) => invoke<number>("clear_history", { path }),
  openMapProject: (path: string) => invoke<ProjectMount>("open_map_project", { path }),
  materialsInfo: (names: string[]) => invoke<MaterialInfo[]>("materials_info", { names }),
  entityClasses: (names: string[]) => invoke<ClassInfo[]>("entity_classes", { names }),
  /** `shader` narrows to one shader (lower-case) or "tool" for tools/; empty for all. */
  listMaterials: (filter: string, limit: number, shader = "", withBroken = false) => invoke<MaterialList>("list_materials", { filter, limit, shader: shader || null, withBroken }),
  /** Immediate subfolders of `prefix` ("" for the root) among the material names, with counts. */
  materialFolders: (prefix: string) => invoke<FolderEntry[]>("material_folders", { prefix }),
  /** The same for models, relative to `models/`: the root lists `props_c17/` …. */
  modelFolders: (prefix: string) => invoke<FolderEntry[]>("model_folders", { prefix }),
  listModels: (filter: string, limit: number) => invoke<MaterialList>("list_models", { filter, limit }),
  listSounds: (filter: string, limit: number) => invoke<MaterialList>("list_sounds", { filter, limit }),
  readFileBytes: async (path: string) => new Uint8Array(await invoke<ArrayBuffer>("read_file_bytes", { path })),
  /** Writes a WAV into the map project's sound/<map>/ folder; the bytes go as the raw request body. */
  writeTexture: (map: string, name: string, dir: string, shader: string, png: Uint8Array) =>
    invoke<ImportedTexture>("write_texture", png, {
      headers: { "x-map": encodeURIComponent(map), "x-name": encodeURIComponent(name), "x-dir": encodeURIComponent(dir), "x-shader": encodeURIComponent(shader) },
    }),
  writeSound: (map: string, name: string, bytes: Uint8Array) => invoke<WrittenSound>("write_sound", bytes, { headers: { "x-map": encodeURIComponent(map), "x-name": encodeURIComponent(name) } }),
  checkResources: (materials: string[], models: string[], skyname: string | null) => invoke<ResourceReport>("check_resources", { materials, models, skyname }),
  /** Header flags of each model, null for one the game does not have; 0x10 marks a model made for prop_static. */
  modelFlags: (models: string[]) => invoke<(number | null)[]>("model_flags", { models }),
  entityClassList: () => invoke<ClassEntry[]>("entity_class_list"),
  entityDefaults: (classname: string) => invoke<[string, string][]>("entity_defaults", { classname }),
  entityClassDef: (classname: string) => invoke<ClassDef>("entity_class_def", { classname }),
  compileMap: (vmf: string, options: CompileOptions) => invoke<number>("compile_map", { vmf, options }),
  /** Starts the game on `map` (BSP name without extension in garrysmod/maps). */
  runGame: (map: string, debug = false, project: string | null = null, clean = false) => invoke<string>("run_game", { map, debug, project, clean }),
  assistantKeyStatus: () => invoke<AssistantKeyStatus>("assistant_key_status"),
  assistantSetKey: (key: string) => invoke<AssistantKeyStatus>("assistant_set_key", { key }),
  assistantClearKey: () => invoke<AssistantKeyStatus>("assistant_clear_key"),
  assistantChat: (request: AssistantChatRequest) => invoke<AssistantChatResponse>("assistant_chat", { request }),
  assistantChatStream: (request: AssistantChatRequest, onEvent: (e: AssistantStreamEvent) => void) => {
    const channel = new Channel<AssistantStreamEvent>();
    channel.onmessage = onEvent;
    return invoke<void>("assistant_chat_stream", { request, onEvent: channel });
  },
  assistantCliRun: (request: AssistantCliRequest, onEvent: (e: AssistantCliEvent) => void) => {
    const channel = new Channel<AssistantCliEvent>();
    channel.onmessage = onEvent;
    return invoke<void>("assistant_cli_run", { request, onEvent: channel });
  },
  assistantToolReply: (callId: string, reply: unknown) => invoke<boolean>("assistant_tool_reply", { callId, reply }),
  assistantCliStop: () => invoke<void>("assistant_cli_stop"),
  assistantInstallCli: () => invoke<AssistantKeyStatus>("assistant_install_cli"),
  assistantLoginCli: () => invoke<void>("assistant_login_cli"),
  assistantCliReset: () => invoke<void>("assistant_cli_reset"),
  projectListFiles: (map: string, dir: string) => invoke<ProjectFile[]>("project_list_files", { map, dir }),
  projectReadFile: (map: string, path: string) => invoke<string>("project_read_file", { map, path }),
  projectWriteFile: (map: string, path: string, text: string) => invoke<string>("project_write_file", { map, path, text }),
  buildCubemaps: (map: string, relaunch: boolean) => invoke<string>("build_cubemaps", { map, relaunch }),
  onGameCubemaps: (cb: (d: CubemapsDone) => void): Promise<UnlistenFn> => listen<CubemapsDone>("game-cubemaps", (e) => cb(e.payload)),
  bridgeSend: (command: Record<string, unknown>) => invoke<void>("bridge_send", { command }),
  bridgeStatus: () => invoke<BridgeStatus>("bridge_status"),
  bridgeReports: () => invoke<BridgeReport[]>("bridge_reports"),
  gameKill: () => invoke<boolean>("game_kill"),
  /** JPEG of what the player sees, from the running game. */
  bridgeScreenshot: async (options: ShotOptions = {}) =>
    new Uint8Array(await invoke<ArrayBuffer>("bridge_screenshot", { options: { quality: options.quality ?? 80, camera: options.camera ?? null, hud: options.hud ?? false } })),
  bridgeLua: (code: string, realm: "client" | "server") => invoke<LuaResult>("bridge_lua", { code, realm }),
  bridgeTeleport: (pos: [number, number, number], pitch: number, yaw: number) => invoke<Record<string, unknown>>("bridge_teleport", { pos, pitch, yaw }),
  bridgeConsole: (cmd: string) => invoke<string[]>("bridge_console", { cmd }),
  vfsExists: (path: string) => invoke<boolean>("vfs_exists", { path }),
  vtfInfo: (name: string) => invoke<VtfInfo>("vtf_info", { name }),
  onBridge: (cb: (r: BridgeReport) => void): Promise<UnlistenFn> => listen<BridgeReport>("game-bridge", (e) => cb(e.payload)),
  packAnalyze: (request: PackRequest) => invoke<PackReport>("pack_analyze", { request }),
  /** PNG/TGA files → VTF+VMT in the map project's materials/<dir>; returns the new materials. */
  importTextures: (map: string, paths: string[], dir: string) => invoke<ImportedTexture[]>("import_textures", { map, paths, dir }),
  prefabDir: () => invoke<string>("prefab_dir"),
  listPrefabs: () => invoke<PrefabInfo[]>("list_prefabs"),
  deletePrefab: (name: string) => invoke<void>("delete_prefab", { name }),
  packBsp: (bsp: string, files: string[], install: boolean) => invoke<PackResult>("pack_bsp", { bsp, files, install }),
  /** The addon folder of a compiled map, packed with gmad into a GMA. */
  workshopPack: (request: WorkshopPackRequest) => invoke<WorkshopPackResult>("workshop_pack", { request }),
  /** gmpublish create or update; Steam must be running. */
  workshopPublish: (request: WorkshopPublishRequest) => invoke<WorkshopPublishResult>("workshop_publish", { request }),
  writeFileBytes: (path: string, bytes: Uint8Array) => invoke<number>("write_file_bytes", bytes, { headers: { "x-path": encodeURIComponent(path) } }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),
  exitApp: (code: number) => invoke<void>("exit_app", { code }),
  onCompileLog: (cb: (l: CompileLog) => void): Promise<UnlistenFn> => listen<CompileLog>("compile-log", (e) => cb(e.payload)),
  onCompileDone: (cb: (d: CompileDone) => void): Promise<UnlistenFn> => listen<CompileDone>("compile-done", (e) => cb(e.payload)),
  onGameLog: (cb: (line: string) => void): Promise<UnlistenFn> => listen<string>("game-log", (e) => cb(e.payload)),
  onGameDone: (cb: (c: GameConsole) => void): Promise<UnlistenFn> => listen<GameConsole>("game-done", (e) => cb(e.payload)),
  gpuReport: (report: { ok: boolean; message: string; adapter?: string }) => invoke("gpu_report", { report }),
  log: (line: string) => invoke("log", { line }),
  debugScreenshot: (dataUrl: string, path: string) => invoke("debug_screenshot", { dataUrl, path }),
};

/**
 * Development fallback for a plain browser (`vite` without the shell): the
 * `GME_AUTO*` variables come from URL query parameters (`?autoload=C:/x.vmf`),
 * files are read through Vite's `/@fs/` route, nothing is written, and
 * content lookups report everything missing.
 */
/** `?fakecontent=1` in the browser: made-up material and model lists, so the panels can be checked without the game. */
export const fakeContent = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("fakecontent") === "1";

const browserApi: typeof tauriApi = {
  appInfo: () => {
    const q = new URLSearchParams(window.location.search);
    const get = (k: string) => q.get(k);
    return Promise.resolve({
      tauri: "none",
      webview: navigator.userAgent,
      os: "browser",
      profile: "dev",
      autoload: get("autoload"),
      autoshot: null,
      autoselect: get("autoselect"),
      autocam: get("autocam"),
      automove: get("automove"),
      autosave: null,
      autoblock: get("autoblock"),
      autodelete: get("autodelete"),
      autorotate: get("autorotate"),
      autoscale: get("autoscale"),
      autotexture: get("autotexture"),
      autoentity: get("autoentity"),
      autokey: get("autokey"),
      autooutput: get("autooutput"),
      autohide: get("autohide"),
      autogroup: get("autogroup"),
      autovisgroup: get("autovisgroup"),
      autoclip: get("autoclip"),
      autocordon: get("autocordon"),
      autohollow: get("autohollow"),
      autocarve: get("autocarve"),
      autovertex: get("autovertex"),
      autoprimitive: get("autoprimitive"),
      autotie: get("autotie"),
      autoworld: get("autoworld"),
      autocollapse: get("autocollapse"),
      autoface: get("autoface"),
      autoproblems: get("autoproblems"),
      autofix: get("autofix"),
      autoisolate: get("autoisolate"),
      autoclone: get("autoclone"),
      autocompile: get("autocompile"),
      autopack: get("autopack"),
      autoprefab: get("autoprefab"),
      autoviewmode: get("autoviewmode"),
      autoperf: get("autoperf"),
      autobridge: get("autobridge"),
      autotour: get("autotour"),
      autolandscape: get("autolandscape"),
      autosound: get("autosound"),
      autopaint: get("autopaint"),
      autoassist: get("autoassist"),
      autojourney: get("autojourney"),
      autoworkshop: get("autoworkshop"),
      autosculpt: get("autosculpt"),
      autosatellite: get("autosatellite"),
      autodrop: get("autodrop"),
      autoplace: get("autoplace"),
      autoscatter: get("autoscatter"),
      automeasure: get("automeasure"),
      autosymmetry: get("autosymmetry"),
      automatpreview: get("automatpreview"),
      automodelghost: get("automodelghost"),
      autodom: get("autodom"),
      autopanel: get("autopanel"),
      autopath: get("autopath"),
      autopick: get("autopick"),
      autooverlay: get("autooverlay"),
      autoextra: get("autoextra"),
      autoarray: get("autoarray"),
      autoimport: get("autoimport"),
      autoalign: get("autoalign"),
      autoexit: null,
      autodisp: get("autodisp"),
      autodispop: get("autodispop"),
      autoprop: get("autoprop"),
      autoworldkey: get("autoworldkey"),
      autoreplace: get("autoreplace"),
      autoalpha: get("autoalpha"),
      autosew: get("autosew"),
      autohelpers: get("autohelpers"),
      autonew: get("autonew"),
    });
  },
  installerLanguage: () => Promise.resolve(null),
  contentStatus: () =>
    Promise.resolve(
      fakeContent
        ? { state: "ready" as const, root: "fake", mounts: 1, failed: 0, files: 0, ms: 0, message: t("фиктивный контент") }
        : { state: "missing" as const, root: null, mounts: 0, failed: 0, files: 0, ms: 0, message: t("вне Tauri") },
    ),
  onContentStatus: () => Promise.resolve(() => {}),
  decompileBsp: (_path: string) => Promise.reject(new Error(t("Декомпиляция BSP доступна только в приложении"))),
  bspLeaves: (_path: string) => Promise.resolve({ leaves: [], clusters: 0, maxVisible: 0 } as LeafReport),
  readTextFile: async (path: string) => {
    const url = /^[A-Za-z]:[\\/]/.test(path) ? `/@fs/${path.replace(/\\/g, "/")}` : path;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r.text();
  },
  writeTextFile: () => Promise.reject(new Error(t("Сохранение доступно только в приложении"))),
  fileMtime: () => Promise.resolve(null),
  removeFile: () => Promise.resolve(),
  listHistory: () => Promise.resolve([]),
  saveHistory: () => Promise.resolve(""),
  clearHistory: () => Promise.resolve(0),
  openMapProject: () => Promise.resolve({ root: null, files: 0 }),
  materialsInfo: (names: string[]) =>
    Promise.resolve(
      names.map((name) => ({
        name,
        found: false,
        shader: "",
        baseTexture: null,
        baseTexture2: null,
        width: 0,
        height: 0,
        translucent: false,
        alphaTest: false,
        additive: false,
        noCull: false,
        tool: false,
        color: [0.6, 0.6, 0.6] as [number, number, number],
        source: null,
      })),
    ),
  entityClasses: (names: string[]) =>
    Promise.resolve(
      names.map((classname) => ({
        classname,
        found: false,
        point: true,
        color: [220, 30, 220] as [number, number, number],
        mins: [-8, -8, -8] as [number, number, number],
        maxs: [8, 8, 8] as [number, number, number],
        description: "",
        model: null,
        icon: null,
      })),
    ),
  // `?fakecontent=1` lists made-up names so the browsers can be laid out without the game.
  listMaterials: (filter: string, limit: number, _shader = "", _withBroken = false) =>
    Promise.resolve(
      fakeContent ? { names: Array.from({ length: Math.min(limit, 40) }, (_, i) => `${filter || "dev/"}fake_material_${String(i + 1).padStart(2, "0")}`), total: 166 } : { names: [], total: 0 },
    ),
  materialFolders: (prefix: string) =>
    Promise.resolve(
      fakeContent && !prefix
        ? [
            { name: "brick/", count: 41 },
            { name: "concrete/", count: 58 },
            { name: "dev/", count: 166 },
            { name: "tools/", count: 29 },
          ]
        : [],
    ),
  modelFolders: (prefix: string) =>
    Promise.resolve(
      fakeContent && !prefix
        ? [
            { name: "props_c17/", count: 412 },
            { name: "props_junk/", count: 230 },
            { name: "props_wasteland/", count: 188 },
          ]
        : [],
    ),
  listSounds: () => Promise.resolve({ names: [], total: 0 }),
  readFileBytes: () => Promise.reject(new Error(t("Чтение файлов доступно только в приложении"))),
  writeSound: () => Promise.reject(new Error(t("Сохранение звука доступно только в приложении"))),
  writeTexture: () => Promise.reject(new Error(t("Сохранение текстуры доступно только в приложении"))),
  listModels: (filter: string, limit: number) =>
    Promise.resolve(fakeContent ? { names: Array.from({ length: Math.min(limit, 30) }, (_, i) => `models/${filter || "props_c17/"}fake_model_${i + 1}.mdl`), total: 286 } : { names: [], total: 0 }),
  checkResources: () => Promise.resolve({ missingMaterials: [], missingModels: [], missingSky: [] }),
  modelFlags: (models: string[]) => Promise.resolve(models.map(() => null)),
  entityClassList: () => Promise.resolve([]),
  entityDefaults: () => Promise.resolve([]),
  entityClassDef: (classname: string) => Promise.resolve({ classname, found: false, description: "", keys: [], inputs: [], outputs: [] }),
  compileMap: () => Promise.reject(new Error(t("Сборка карты доступна только в приложении"))),
  runGame: () => Promise.reject(new Error(t("Запуск игры доступен только в приложении"))),
  assistantKeyStatus: () => Promise.resolve({ present: false, source: "", hint: "", cli: null }),
  assistantSetKey: () => Promise.reject(new Error(t("Ключ API хранится только в приложении"))),
  assistantClearKey: () => Promise.resolve({ present: false, source: "", hint: "", cli: null }),
  assistantChat: () => Promise.reject(new Error(t("Ассистент доступен только в приложении"))),
  assistantChatStream: () => Promise.reject(new Error(t("Ассистент доступен только в приложении"))),
  assistantCliRun: () => Promise.reject(new Error(t("Ассистент доступен только в приложении"))),
  assistantToolReply: () => Promise.resolve(false),
  assistantCliStop: () => Promise.resolve(),
  assistantInstallCli: () => Promise.reject(new Error(t("Ассистент доступен только в приложении"))),
  assistantLoginCli: () => Promise.reject(new Error(t("Ассистент доступен только в приложении"))),
  assistantCliReset: () => Promise.resolve(),
  projectListFiles: () => Promise.resolve([]),
  projectReadFile: () => Promise.reject(new Error(t("Файлы проекта доступны только в приложении"))),
  projectWriteFile: () => Promise.reject(new Error(t("Файлы проекта доступны только в приложении"))),
  buildCubemaps: () => Promise.reject(new Error(t("Сборка кубмапов доступна только в приложении"))),
  onGameCubemaps: () => Promise.resolve(() => {}),
  bridgeSend: () => Promise.resolve(),
  bridgeStatus: () => Promise.resolve<BridgeStatus>({ ready: false, connected: false, running: false, map: null, pos: null, queued: 0, dataDir: null, exitHint: null }),
  bridgeReports: () => Promise.resolve<BridgeReport[]>([]),
  gameKill: () => Promise.resolve(false),
  bridgeScreenshot: () => Promise.reject(new Error(t("Снимки из игры доступны только в приложении"))),
  bridgeLua: () => Promise.reject(new Error(t("Lua в игре доступен только в приложении"))),
  bridgeTeleport: () => Promise.reject(new Error(t("Телепорт доступен только в приложении"))),
  bridgeConsole: () => Promise.reject(new Error(t("Консоль игры доступна только в приложении"))),
  vfsExists: () => Promise.resolve(false),
  vtfInfo: () => Promise.reject(new Error(t("VTF доступны только в приложении"))),
  onBridge: () => Promise.resolve(() => {}),
  packAnalyze: () => Promise.resolve({ files: [], missing: [], customBytes: 0 }),
  prefabDir: () => Promise.resolve(""),
  importTextures: () => Promise.reject(new Error(t("Импорт текстур доступен только в приложении"))),
  listPrefabs: () => Promise.resolve([]),
  deletePrefab: () => Promise.reject(new Error(t("Префабы доступны только в приложении"))),
  packBsp: () => Promise.reject(new Error(t("Упаковка доступна только в приложении"))),
  workshopPack: () => Promise.reject(new Error(t("Публикация доступна только в приложении"))),
  workshopPublish: () => Promise.reject(new Error(t("Публикация доступна только в приложении"))),
  writeFileBytes: () => Promise.reject(new Error(t("Запись файлов доступна только в приложении"))),
  openUrl: (url: string) => {
    window.open(url, "_blank");
    return Promise.resolve();
  },
  exitApp: () => Promise.resolve(),
  onCompileLog: () => Promise.resolve(() => {}),
  onCompileDone: () => Promise.resolve(() => {}),
  onGameLog: () => Promise.resolve(() => {}),
  onGameDone: () => Promise.resolve(() => {}),
  gpuReport: () => Promise.resolve(),
  log: (line: string) => Promise.resolve(console.log(line)),
  debugScreenshot: () => Promise.resolve(),
};

export const api = inTauri ? tauriApi : browserApi;

/**
 * Textures and materials the editor rewrote in this session: the protocol's
 * responses are cached for an hour, so their URLs carry a version.
 */
const textureVersions = new Map<string, number>();
export function bumpTextureVersion(name: string): void {
  textureVersions.set(name.toLowerCase(), (textureVersions.get(name.toLowerCase()) ?? 0) + 1);
}
const versionQuery = (name: string) => {
  const v = textureVersions.get(name.toLowerCase());
  return v ? `v=${v}` : "";
};

/** URL of a texture served by the shell's `gmod-asset` protocol. */
export function textureUrl(name: string, rgba: boolean): string {
  const q = [rgba ? "rgba=1" : "", versionQuery(name)].filter(Boolean).join("&");
  return convertFileSrc(`texture/${name}${q ? `?${q}` : ""}`, "gmod-asset");
}

/** URL of a model's GMDL container (empty outside Tauri). */
export function modelUrl(name: string, skin: number, body = 0): string {
  const q = [skin ? `skin=${skin}` : "", body ? `body=${body}` : ""].filter(Boolean).join("&");
  return inTauri ? convertFileSrc(`model/${name}${q ? `?${q}` : ""}`, "gmod-asset") : "";
}

/** URL of a material's PNG thumbnail (empty outside Tauri). */
/** A game or project sound (`sound/` path without the prefix) for playback. */
export function soundUrl(name: string): string {
  return inTauri ? convertFileSrc(`sound/${name}`, "gmod-asset") : "";
}

/** The assistant's API key, as the shell sees it. */
export interface AssistantKeyStatus {
  present: boolean;
  source: string;
  hint: string;
  /** Path of a local Claude Code, when installed. */
  cli: string | null;
}

export interface AssistantChatRequest {
  model: string;
  system: string;
  messages: unknown[];
  tools: unknown[];
  maxTokens?: number;
  /** "auto", "api" or "cli". */
  backend?: string;
}

export interface AssistantChatResponse {
  content: unknown[];
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
}

/** One request through Claude Code: the text, the prompt, the tools served over MCP, the session to continue. */
export interface AssistantCliRequest {
  prompt: string;
  system: string;
  model: string;
  tools: unknown[];
  resume: string | null;
}

/** What a Claude Code run reports as it goes: the session, streamed blocks, tool calls to answer, the result. */
export type AssistantCliEvent =
  | { kind: "session"; id: string }
  | { kind: "block_start"; type: string; name?: string | null }
  | { kind: "text"; text: string }
  | { kind: "json"; text: string }
  | { kind: "block_stop" }
  | { kind: "tool_call"; callId: string; name: string; input: Record<string, unknown> }
  | { kind: "done"; isError: boolean; subtype: string; result: string; sessionId?: string | null; inputTokens: number; outputTokens: number; numTurns: number; costUsd?: number | null };

/** One piece of a streamed reply, as the shell forwards the API's events. */
export type AssistantStreamEvent =
  | { kind: "block_start"; index: number; type: string; id?: string | null; name?: string | null }
  | { kind: "text"; index: number; text: string }
  | { kind: "json"; index: number; text: string }
  | { kind: "block_stop"; index: number }
  | { kind: "done"; stopReason: string; inputTokens: number; outputTokens: number };

export interface ProjectFile {
  path: string;
  bytes: number;
  dir: boolean;
}

/** A sound the editor wrote into the map project. */
export interface WrittenSound {
  name: string;
  path: string;
  bytes: number;
}

export function thumbnailUrl(material: string, size = 64): string {
  const q = [size !== 64 ? `size=${size}` : "", versionQuery(material)].filter(Boolean).join("&");
  return inTauri ? convertFileSrc(`thumb/${material}${q ? `?${q}` : ""}`, "gmod-asset") : "";
}

/** STUDIOHDR_FLAGS_STATIC_PROP in a model header: compiled with $staticprop, the only kind prop_static accepts. */
export const STATIC_PROP_FLAG = 0x10;
