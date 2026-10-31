// The assistant's state outside any React tree: the conversation, the step
// cards, the running turn, confirmation questions. The panel is a view over
// it, so closing the tab mid-turn loses nothing, and a question asked while
// the tab is closed waits for the user instead of answering itself.

import { useSyncExternalStore } from "react";
import {
  MODELS,
  assistantTurn,
  cliTurn,
  type AssistantContext,
  type AssistantEvent,
  type Backend,
  type BackendKind,
  type Block,
  type ChatRequest,
  type ChatResponse,
  type CliSession,
  type Message,
  type StreamDelta,
} from "./assistant";
import { assistantBus } from "./assistantBus";
import { shellCliRunner } from "./assistantCli";
import { api, type AssistantKeyStatus, type AssistantStreamEvent } from "../tauri";
import { t as tr, tb, lazy } from "../i18n";

/**
 * The Messages API or Claude Code through the shell, which holds the key.
 * The API streams: the shell forwards each content block as it arrives and
 * the reply is put together here; Claude Code answers whole.
 */
export const apiBackend: Backend = async (req, onDelta) => {
  if (req.backend === "api" && onDelta) return streamChat(req, onDelta);
  return (await api.assistantChat({ model: req.model, system: req.system, messages: req.messages, tools: req.tools, maxTokens: req.maxTokens, backend: req.backend ?? "auto" })) as ChatResponse;
};

const parseInput = (json: string): Record<string, unknown> => {
  if (!json.trim()) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

async function streamChat(req: ChatRequest, onDelta: (d: StreamDelta) => void): Promise<ChatResponse> {
  type Part = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; json: string };
  const parts: Part[] = [];
  let stopReason = "end_turn";
  let inputTokens = 0;
  let outputTokens = 0;
  await api.assistantChatStream({ model: req.model, system: req.system, messages: req.messages, tools: req.tools, maxTokens: req.maxTokens, backend: "api" }, (e: AssistantStreamEvent) => {
    if (e.kind === "block_start") {
      parts[e.index] = e.type === "tool_use" ? { type: "tool_use", id: e.id ?? "", name: e.name ?? "", json: "" } : { type: "text", text: "" };
      onDelta({ kind: "block_start", type: e.type === "tool_use" ? "tool_use" : "text", name: e.name ?? undefined });
    } else if (e.kind === "text") {
      const p = parts[e.index];
      if (p?.type === "text") {
        p.text += e.text;
        onDelta({ kind: "text", text: e.text });
      }
    } else if (e.kind === "json") {
      const p = parts[e.index];
      if (p?.type === "tool_use") p.json += e.text;
    } else if (e.kind === "block_stop") {
      const p = parts[e.index];
      if (p?.type === "tool_use") onDelta({ kind: "tool_use", id: p.id, name: p.name, input: parseInput(p.json) });
    } else if (e.kind === "done") {
      stopReason = e.stopReason;
      inputTokens = e.inputTokens;
      outputTokens = e.outputTokens;
    }
  });
  const content: Block[] = parts.filter(Boolean).map((p) => (p.type === "text" ? { type: "text", text: p.text } : { type: "tool_use", id: p.id, name: p.name, input: parseInput(p.json) }));
  return { content, stopReason, inputTokens, outputTokens };
}

export interface ToolStep {
  id: number;
  name: string;
  input: Record<string, unknown>;
  /** Pending: the model is still writing the call. */
  status: "pending" | "running" | "ok" | "error";
  result: string;
  startedAt: number;
  ms: number;
  edited: boolean;
  /** Objects the step touched, for the card's "show in views" button. */
  ids?: number[];
  /** Undo steps on the map right after this edit; the card's history button returns to just before it. */
  depth?: number;
}

export type ChatItem =
  | { id: number; kind: "user"; text: string; at: number }
  /** Live: still being typed by the model. */
  | { id: number; kind: "assistant"; text: string; at: number; live?: boolean }
  | { id: number; kind: "steps"; steps: ToolStep[]; at: number }
  | { id: number; kind: "note"; text: string; at: number }
  | { id: number; kind: "error"; text: string; at: number };

export interface Question {
  title: string;
  body: string;
  resolve: (ok: boolean) => void;
}

export interface AssistantState {
  items: ChatItem[];
  busy: boolean;
  /** What the turn is doing right now, for the status row. */
  phase: "idle" | "thinking" | "typing" | "tool";
  phaseSince: number;
  currentTool: string | null;
  question: Question | null;
  model: string;
  backend: BackendKind;
  ask: boolean;
  lastEdits: number;
  tokens: { input: number; output: number };
  /** What Claude Code reported the requests of this conversation cost, in dollars (an estimate). */
  cost: number;
  steps: number;
  keyStatus: AssistantKeyStatus | null;
  mapOpen: boolean;
  inApp: boolean;
}

interface Deps {
  tools: AssistantContext;
  backend: Backend;
  demoBackend: Backend;
  undo: () => Promise<void>;
  log: (line: string) => void;
  busyRef: { current: boolean };
  /** Undo steps on the map now, to remember where each edit landed. */
  undoDepth: () => number;
  /** Undo (negative) or redo this many steps: the cards' history buttons. */
  jumpHistory: (delta: number) => Promise<void>;
  /** Selects and frames objects when the user asks from a card; the assistant itself never moves the camera. */
  focusIds: (ids: number[]) => void;
}

const read = (k: string, fallback: string) => {
  try {
    return localStorage.getItem(k) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

let state: AssistantState = {
  items: [],
  busy: false,
  phase: "idle",
  phaseSince: 0,
  currentTool: null,
  question: null,
  model: read("gme.assistantModel", MODELS[0].id),
  backend: (read("gme.assistantBackend", "auto") as BackendKind) || "auto",
  ask: read("gme.assistantAsk", "1") !== "0",
  lastEdits: 0,
  tokens: { input: 0, output: 0 },
  cost: 0,
  steps: 0,
  keyStatus: null,
  mapOpen: false,
  inApp: false,
};
const messages: Message[] = [];
/** Claude Code's own session, continued request after request; the old per-step protocol is used when streaming is unavailable. */
const cliSession: CliSession = { id: null, turns: 0, depth: 0 };
/** Requests typed while a reply is on its way; they go one after another. */
const queue: string[] = [];
let cliLegacy = false;
let nextId = 1;
let deps: Deps | null = null;
let stop = { current: false };
const listeners = new Set<() => void>();

function set(patch: Partial<AssistantState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

type NewItem = ChatItem extends infer T ? (T extends ChatItem ? Omit<T, "id" | "at"> : never) : never;

function push(item: NewItem) {
  const items = [...state.items, { ...item, id: nextId++, at: Date.now() } as ChatItem];
  if (items.length > 400) items.splice(0, items.length - 400);
  set({ items });
}

/** Which way a request goes with the current key and CLI. */
export function viaOf(s: AssistantState): "api" | "cli" | "demo" {
  const hasKey = !!s.keyStatus?.present;
  const hasCli = !!s.keyStatus?.cli;
  if (s.backend === "api") return hasKey ? "api" : "demo";
  if (s.backend === "cli") return hasCli ? "cli" : "demo";
  return hasCli ? "cli" : hasKey ? "api" : "demo";
}

export const assistantStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  configure(d: Deps) {
    deps = d;
  },
  setKeyStatus(k: AssistantKeyStatus | null) {
    set({ keyStatus: k });
  },
  setEnv(mapOpen: boolean, inApp: boolean) {
    if (state.mapOpen !== mapOpen || state.inApp !== inApp) set({ mapOpen, inApp });
  },
  setModel(m: string) {
    write("gme.assistantModel", m);
    set({ model: m });
  },
  setBackend(b: BackendKind) {
    write("gme.assistantBackend", b);
    set({ backend: b });
  },
  setAsk(v: boolean) {
    write("gme.assistantAsk", v ? "1" : "0");
    set({ ask: v });
  },
  note(text: string) {
    push({ kind: "note", text });
  },
  /** A question for the user from a tool; answered from the panel's card, or at once when asking is off. */
  confirm(title: string, body: string): Promise<boolean> {
    if (!state.ask) {
      push({ kind: "note", text: tr("{0} - подтверждено автоматически (запрос подтверждений отключён)", [title]) });
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      set({
        question: {
          title,
          body,
          resolve: (ok) => {
            set({ question: null });
            resolve(ok);
          },
        },
      });
    });
  },
  answer(ok: boolean) {
    state.question?.resolve(ok);
  },
  stop() {
    stop.current = true;
    queue.length = 0;
    if (state.question) state.question.resolve(false);
    void shellCliRunner.stop().catch(() => undefined);
  },
  clear() {
    if (state.busy) return;
    messages.length = 0;
    queue.length = 0;
    cliSession.id = null;
    cliSession.turns = 0;
    cliSession.depth = 0;
    void shellCliRunner.reset().catch(() => undefined);
    set({ items: [], lastEdits: 0, tokens: { input: 0, output: 0 }, cost: 0, steps: 0 });
  },
  async undoTurn() {
    if (!deps || state.busy) return;
    const n = state.lastEdits;
    for (let i = 0; i < n; i++) await deps.undo();
    set({ lastEdits: 0 });
    push({ kind: "note", text: n ? tr("Отменено правок: {0}.", [n]) : tr("Нет правок для отмены.") });
  },
  /** Photoshop's history: the map goes back to just before this step (later steps go with it). */
  async revertTo(step: ToolStep) {
    if (!deps || state.busy || step.depth === undefined) return;
    const now = deps.undoDepth();
    const target = step.depth - 1;
    if (now <= target) {
      push({ kind: "note", text: tr("Карта уже в состоянии до этого шага.") });
      return;
    }
    await deps.jumpHistory(target - now);
    set({ lastEdits: Math.max(0, state.lastEdits - (now - target)) });
    push({ kind: "note", text: tr("Карта возвращена к состоянию до шага «{0}» (отменено правок: {1}). Ctrl+Y вернёт их.", [TOOL_TITLES[step.name]?.title ?? step.name, now - target]) });
  },
  /** Frames the objects of a step: the user's choice, from the card. */
  show(step: ToolStep) {
    if (deps && step.ids?.length) deps.focusIds(step.ids);
  },
  /** Sends a request and runs the turn to its end. */
  async send(raw: string): Promise<void> {
    const text = raw.trim();
    if (!text || !deps) return;
    if (state.busy) {
      // Typed while a reply is on its way: it goes right after.
      queue.push(text);
      push({ kind: "note", text: tr("В очереди: «{0}» - пойдёт после текущего ответа.", [text.length > 60 ? `${text.slice(0, 59)}…` : text]) });
      return;
    }
    if (!state.mapOpen) {
      push({ kind: "error", text: tr("Сначала откройте или создайте карту.") });
      return;
    }
    const d = deps;
    const via = viaOf(state);
    push({ kind: "user", text });
    messages.push({ role: "user", content: text });
    stop = { current: false };
    d.busyRef.current = true;
    set({ busy: true, phase: "thinking", phaseSince: Date.now(), currentTool: null });
    let edits = 0;
    let stepsItem: Extract<ChatItem, { kind: "steps" }> | null = null;
    let liveItem: Extract<ChatItem, { kind: "assistant" }> | null = null;
    const putSteps = (steps: ToolStep[]) => {
      if (!stepsItem) {
        stepsItem = { id: nextId++, kind: "steps", steps, at: Date.now() };
        set({ items: [...state.items, stepsItem] });
      } else {
        stepsItem = { ...stepsItem, steps };
        set({ items: state.items.map((it) => (it.id === stepsItem!.id ? stepsItem! : it)) });
      }
    };
    const onEvent = (ev: AssistantEvent) => {
      if (ev.kind === "text") {
        stepsItem = null;
        liveItem = null;
        push({ kind: "assistant", text: ev.text });
        set({ phase: "thinking", phaseSince: Date.now(), currentTool: null });
      } else if (ev.kind === "text_delta") {
        // Typed as it arrives: one growing message until the block ends.
        stepsItem = null;
        if (!liveItem) {
          liveItem = { id: nextId++, kind: "assistant", text: ev.text, at: Date.now(), live: true };
          set({ items: [...state.items, liveItem], phase: "typing", phaseSince: Date.now(), currentTool: null });
        } else {
          liveItem = { ...liveItem, text: liveItem.text + ev.text };
          set({ items: state.items.map((it) => (it.id === liveItem!.id ? liveItem! : it)) });
        }
      } else if (ev.kind === "text_end") {
        if (liveItem) {
          const done = { ...liveItem, live: false };
          set({ items: state.items.map((it) => (it.id === done.id ? done : it)), phase: "thinking", phaseSince: Date.now() });
          liveItem = null;
        }
      } else if (ev.kind === "tool_pending") {
        const step: ToolStep = { id: nextId++, name: ev.name, input: {}, status: "pending", result: "", startedAt: Date.now(), ms: 0, edited: false };
        putSteps([...(stepsItem?.steps ?? []), step]);
      } else if (ev.kind === "tool_start") {
        const pending = stepsItem?.steps.findIndex((st) => st.status === "pending" && st.name === ev.name) ?? -1;
        const step: ToolStep = {
          id: pending >= 0 ? stepsItem!.steps[pending].id : nextId++,
          name: ev.name,
          input: ev.input,
          status: "running",
          result: "",
          startedAt: Date.now(),
          ms: 0,
          edited: false,
        };
        putSteps(pending >= 0 ? stepsItem!.steps.map((st, i) => (i === pending ? step : st)) : [...(stepsItem?.steps ?? []), step]);
        set({ phase: "tool", phaseSince: Date.now(), currentTool: ev.name });
      } else if (ev.kind === "tool") {
        if (ev.edited) edits++;
        if (stepsItem) {
          const depth = ev.edited && d.undoDepth ? d.undoDepth() : undefined;
          const steps = stepsItem.steps.map((st) =>
            st.status === "running" && st.name === ev.name
              ? { ...st, status: ev.error ? ("error" as const) : ("ok" as const), result: ev.result, ms: Date.now() - st.startedAt, edited: ev.edited, ids: ev.ids, depth }
              : st,
          );
          putSteps(steps);
          set({ phase: "thinking", phaseSince: Date.now(), currentTool: null });
        }
      } else if (ev.kind === "usage") {
        set({ tokens: { input: state.tokens.input + ev.inputTokens, output: state.tokens.output + ev.outputTokens }, steps: state.steps + 1 });
      } else push({ kind: "error", text: ev.text });
      if (ev.kind !== "text_delta")
        d.log(
          `assistant ${ev.kind}: ${ev.kind === "text" ? ev.text.slice(0, 200) : ev.kind === "tool" ? `${ev.name} -> ${ev.result.slice(0, 200)}` : ev.kind === "tool_start" || ev.kind === "tool_pending" ? ev.name : ev.kind === "usage" ? `${ev.inputTokens}/${ev.outputTokens}` : ev.kind === "text_end" ? "" : ev.text}`,
        );
    };
    try {
      let r: { edits: number; steps: number };
      if (via === "cli" && !cliLegacy) {
        // Claude Code drives the request itself and calls the editor's tools over MCP.
        try {
          const c = await cliTurn(text, state.model, shellCliRunner, d.tools, onEvent, stop, cliSession);
          if (c.text.trim()) messages.push({ role: "assistant", content: c.text });
          if (c.cost) set({ cost: state.cost + c.cost });
          r = c;
        } catch (err) {
          const msg = String(err);
          if (!/устаревш|unknown option|unknown argument/i.test(msg)) throw err;
          // An older Claude Code: fall back to the per-step protocol for the rest of this session.
          cliLegacy = true;
          push({ kind: "note", text: tb(msg) });
          r = await assistantTurn(messages, state.model, d.backend, d.tools, onEvent, stop, "cli");
        }
      } else r = await assistantTurn(messages, state.model, via === "demo" ? d.demoBackend : d.backend, d.tools, onEvent, stop, via === "cli" ? "cli" : "api");
      set({ lastEdits: r.edits });
      if (r.edits) push({ kind: "note", text: tr("Правок карты: {0}. Отменить их можно кнопкой отмены в заголовке панели.", [r.edits]) });
    } catch (err) {
      push({ kind: "error", text: tb(String(err)) });
      const last = messages[messages.length - 1];
      if (last?.role === "user" && typeof last.content !== "string") messages.pop();
    } finally {
      d.busyRef.current = false;
      if (state.question) state.question.resolve(false);
      set({ busy: false, phase: "idle", currentTool: null, question: null });
      const next = queue.shift();
      if (next) void assistantStore.send(next);
    }
    void edits;
  },
};

// Requests from the rest of the editor (compile panel, problems, hints).
assistantBus.subscribe((t) => void assistantStore.send(t));

export function useAssistant(): AssistantState {
  return useSyncExternalStore(assistantStore.subscribe, assistantStore.get, assistantStore.get);
}

/** The step names in the user's words, with a category for the icon. */
export const TOOL_TITLES: Record<string, { title: string; cat: "read" | "edit" | "build" | "game" | "file" | "ui" }> = lazy(() => ({
  map_summary: { title: tr("Обзор карты"), cat: "read" },
  list_entities: { title: tr("Поиск энтити"), cat: "read" },
  entity_info: { title: tr("Свойства энтити"), cat: "read" },
  create_brush: { title: tr("Создание браша"), cat: "edit" },
  hollow_brushes: { title: tr("Создание полого браша"), cat: "edit" },
  create_entity: { title: tr("Создание энтити"), cat: "edit" },
  tie_to_entity: { title: tr("Привязка к энтити"), cat: "edit" },
  set_entity_keys: { title: tr("Изменение ключей"), cat: "edit" },
  add_connections: { title: tr("Добавление выходов"), cat: "edit" },
  set_material: { title: tr("Назначение материала"), cat: "edit" },
  move_objects: { title: tr("Перемещение объектов"), cat: "edit" },
  delete_objects: { title: tr("Удаление объектов"), cat: "edit" },
  select_objects: { title: tr("Выделение"), cat: "ui" },
  list_notes: { title: tr("Список заметок"), cat: "read" },
  add_note: { title: tr("Добавление заметки"), cat: "edit" },
  update_note: { title: tr("Изменение заметки"), cat: "edit" },
  list_commands: { title: tr("Список команд"), cat: "read" },
  run_command: { title: tr("Выполнение команды"), cat: "ui" },
  list_files: { title: tr("Файлы проекта"), cat: "file" },
  read_file: { title: tr("Чтение файла"), cat: "file" },
  write_file: { title: tr("Запись файла"), cat: "file" },
  save_map: { title: tr("Сохранение карты"), cat: "file" },
  compile_map: { title: tr("Сборка карты"), cat: "build" },
  compile_log: { title: tr("Лог сборки"), cat: "build" },
  leak_info: { title: tr("Анализ утечки"), cat: "build" },
  check_problems: { title: tr("Проверка карты"), cat: "build" },
  fix_problems: { title: tr("Исправление проблем"), cat: "edit" },
  set_world_keys: { title: tr("Изменение свойств карты"), cat: "edit" },
  pack_report: { title: tr("Отчёт об упаковке"), cat: "build" },
  run_game: { title: tr("Запуск игры"), cat: "game" },
  game_status: { title: tr("Состояние игры"), cat: "game" },
  game_reload: { title: tr("Перезагрузка карты в игре"), cat: "game" },
  game_teleport: { title: tr("Перемещение игрока"), cat: "game" },
  game_kill: { title: tr("Закрытие игры"), cat: "game" },
  game_screenshot: { title: tr("Снимок из игры"), cat: "game" },
  game_lua: { title: tr("Выполнение Lua в игре"), cat: "game" },
  game_console: { title: tr("Команда консоли игры"), cat: "game" },
  game_trace: { title: tr("Трассировка луча в игре"), cat: "game" },
  game_light_at: { title: tr("Замер освещённости в игре"), cat: "game" },
  game_console_log: { title: tr("Чтение консоли игры"), cat: "game" },
  find_faces: { title: tr("Поиск граней"), cat: "read" },
  brush_info: { title: tr("Свойства браша"), cat: "read" },
  replace_material: { title: tr("Замена материала"), cat: "edit" },
  game_file_exists: { title: tr("Проверка файла игры"), cat: "file" },
  vtf_info: { title: tr("Чтение VTF"), cat: "file" },
  editor_camera: { title: tr("Камера редактора"), cat: "ui" },
  editor_screenshot: { title: tr("Снимок редактора"), cat: "ui" },
  test_cycle: { title: tr("Сборка и проверка в игре"), cat: "build" },
  undo_last: { title: tr("Отмена правок"), cat: "edit" },
  open_panel: { title: tr("Открытие панели"), cat: "ui" },
}));

/** A short line of the step's input for the card. */
export function describeInput(name: string, input: Record<string, unknown>): string {
  const v = (k: string) => input[k];
  const s = (x: unknown) => (typeof x === "string" ? x : Array.isArray(x) ? x.join(" ") : x === undefined ? "" : JSON.stringify(x));
  switch (name) {
    case "create_brush":
      return `${s(v("min"))} … ${s(v("max"))}${v("material") ? ` · ${s(v("material"))}` : ""}`;
    case "create_entity":
      return tr("{0} в {1}", [s(v("classname")), s(v("origin"))]);
    case "tie_to_entity":
      return tr("{0}: браши {1}", [s(v("classname")), s(v("ids"))]);
    case "set_entity_keys":
    case "entity_info":
    case "add_connections":
      return `id ${s(v("id"))}`;
    case "set_material":
      return tr("{0} на {1}", [s(v("material")), s(v("ids"))]);
    case "move_objects":
      return tr("{0} на {1}", [s(v("ids")), s(v("delta"))]);
    case "hollow_brushes":
    case "delete_objects":
    case "select_objects":
      return s(v("ids"));
    case "read_file":
    case "write_file":
      return s(v("path"));
    case "list_files":
      return s(v("dir")) || tr("корень проекта");
    case "run_command":
      return s(v("id"));
    case "open_panel":
      return s(v("name"));
    case "game_teleport":
      return s(v("pos"));
    case "set_world_keys":
      return Object.entries((v("keyvalues") as Record<string, unknown>) ?? {})
        .map(([k, x]) => `${k}=${s(x)}`)
        .join(", ");
    case "list_entities":
      return [v("classname"), v("name")].filter(Boolean).map(s).join(" ");
    default: {
      const parts = Object.entries(input).map(([k, x]) => `${k}=${s(x)}`);
      const t = parts.join(" ");
      return t.length > 100 ? `${t.slice(0, 100)}…` : t;
    }
  }
}
