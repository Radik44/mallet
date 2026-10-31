// The assistant's tools against the editor: the map summary the model sees
// and every tool call, run through the same functions the UI uses, so each
// edit is one undo step and the views update as usual.

import { tb } from "../i18n";
import { api } from "../tauri";
import type { EditorApi } from "./editorApi";
import { history, type EditResult } from "../map/loader";
import type { EntityDetails, Connection } from "../ui/PropertiesPanel";
import type { Problem } from "../ui/ProblemsPanel";
import type { MapNote } from "./notes";
import { ASSISTANT_LABEL_MARK, splitUndoLabel } from "./undoLabel";
import { analyzeCompileLog } from "../map/compileIssues";
import type { FaceInfo } from "../ui/FaceEditor";
import type { AssistantContext, ToolOutcome } from "./assistant";

type Deps = Pick<
  EditorApi,
  | "current"
  | "currentPath"
  | "selection"
  | "faceSel"
  | "materialRef"
  | "gridRef"
  | "classInfos"
  | "runEdit"
  | "selectIds"
  | "applySelection"
  | "focusSelection"
  | "commitTranslate"
  | "setEntityKeys"
  | "setEntityConnections"
  | "commandsRef"
  | "saveCurrent"
  | "compileCurrent"
  | "runGame"
  | "objectBounds"
  | "compileLinesRef"
  | "compileRun"
  | "compileDoneRef"
  | "compileResultRef"
  | "gameConsoleRef"
  | "leakPointsRef"
  | "checkProblems"
  | "fixProblems"
  | "setWorldKeys"
  | "bridgeReload"
  | "gameKill"
  | "analyzePack"
  | "undo"
  | "showLeak"
  | "projectMetaRef"
  | "journeyRef"
  | "takeGameShot"
  | "testCycle"
  | "getEditorCamera"
  | "setEditorCamera"
  | "editorScreenshot"
  | "replaceTextures"
  | "addNoteAt"
  | "addNoteHere"
  | "setNotes"
  | "goToPoint"
>;

/** Asks the user before a side effect; the panel draws the question. */
export type Confirm = (title: string, body: string) => Promise<boolean>;

const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const vec = (v: unknown): [number, number, number] | null => (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? [v[0], v[1], v[2]] : null);
const idList = (v: unknown): number[] => (Array.isArray(v) ? v.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0) : []);
const fmt = (v: [number, number, number] | null | undefined) => (v ? v.map((n) => Math.round(n * 100) / 100).join(" ") : "-");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TROUBLE = /error|leak|\*\*\*|fail|warning|не найден|ошибк|missing|not found|could not|couldn't|can't|attempt to|stack traceback/i;
const CONSOLE_NOISE =
  /font|txr_smoke|DejaVu|clearsans|HUDNumber|Unknown command|ConVarRef|Changing gamemode|Addon .* is|KeyValues Error|Couldn't find any entities named|CSoundEmitterSystem|SOLID_VPHYSICS|lua_openscript/i;
/** Bytes as base64, in chunks so big pictures do not blow the call stack. */
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function createAssistantTools(e: Deps, confirm: { current: Confirm }): AssistantContext {
  const map = () => {
    const m = e.current.current;
    if (!m) throw new Error("карта не открыта");
    return m;
  };

  const summary = (): string => {
    const m = e.current.current;
    if (!m) return "Карта не открыта.";
    const lines: string[] = [];
    const path = e.currentPath.current;
    lines.push(`Файл: ${path || "(не сохранена: файлы проекта и сборка недоступны, пока не сохранить)"}`);
    const b = m.stats.bounds;
    lines.push(
      `Браши: ${m.stats.solids}, энтити: ${m.stats.entities}, границы: ${b ? `${fmt(b[0])} … ${fmt(b[1])}` : "пусто"}, сетка ${e.gridRef.current}, текущий материал ${e.materialRef.current}, небо ${m.stats.skyname ?? "-"}`,
    );
    const meta = e.projectMetaRef.current;
    if (meta.goal || meta.title || meta.description)
      lines.push(`Проект: ${meta.title ? `«${meta.title}» ` : ""}${meta.goal ? `цель: ${meta.goal}` : ""}${meta.description ? `; ${meta.description}` : ""}`);
    const j = e.journeyRef.current;
    const cur = j.find((st) => st.status === "current" || st.status === "blocked");
    lines.push(
      `Путь карты: ${j.map((st) => `${st.title} ${st.status === "done" ? "✓" : st.status === "blocked" ? "✗" : st.status === "current" ? "←" : "·"}`).join(", ")}${cur?.reasons.length ? `; сейчас: ${cur.reasons.join("; ")}` : ""}`,
    );
    const pins = meta.pins;
    if (pins.length) {
      const open = pins.filter((n) => !n.done);
      lines.push(
        `Заметки: ${open.length} открытых из ${pins.length}${
          open.length
            ? `: ${open
                .slice(0, 10)
                .map((n) => `#${n.id} «${n.text}» @ ${fmt(n.pos)}`)
                .join(", ")}`
            : ""
        }`,
      );
    }
    const sel = Array.from(e.selection.current);
    lines.push(`Выделено объектов: ${sel.length}${sel.length ? ` (id ${sel.slice(0, 40).join(", ")})` : ""}, граней: ${e.faceSel.current.size}`);
    const ents = m.entities.filter((x) => x.classname !== "worldspawn");
    lines.push(`Энтити (${ents.length}, первые 80):`);
    for (const x of ents.slice(0, 80))
      lines.push(`  ${x.id} ${x.classname}${x.targetname ? ` "${x.targetname}"` : ""}${x.origin ? ` @ ${fmt(x.origin)}` : x.brush ? " (брашевая)" : ""}${x.model ? ` ${x.model}` : ""}`);
    const solids = m.doc.solid_ids() as Uint32Array;
    const bounds = m.doc.solid_bounds() as Float32Array;
    lines.push(`Браши (${solids.length}, первые 40, id и границы):`);
    for (let i = 0; i < Math.min(40, solids.length); i++) {
      const o = i * 6;
      lines.push(`  ${solids[i]} ${fmt([bounds[o], bounds[o + 1], bounds[o + 2]])} … ${fmt([bounds[o + 3], bounds[o + 4], bounds[o + 5]])}`);
    }
    return lines.join("\n");
  };

  const edited = (res: EditResult | undefined, what: string): ToolOutcome =>
    res
      ? { result: `${what}: ${splitUndoLabel(res.label).text}${res.changed_ids.length ? `, id ${res.changed_ids.slice(0, 20).join(", ")}` : ""}`, edited: true, ids: res.changed_ids.slice(0, 500) }
      : { result: `${what}: ничего не изменилось`, error: true };

  const createEntity = async (classname: string, origin: [number, number, number], keyvalues: Record<string, unknown>): Promise<ToolOutcome> => {
    const m = map();
    const cls = classname.trim();
    if (!cls) return { result: "нужен classname", error: true };
    if (!e.classInfos.current.has(cls)) {
      const infos = await api.entityClasses([cls]);
      for (const c of infos) e.classInfos.current.set(c.classname, c);
    }
    const info = e.classInfos.current.get(cls);
    const defaults = await api.entityDefaults(cls);
    const keys = new Map<string, string>(defaults);
    for (const [k, v] of Object.entries(keyvalues)) if (v !== null && v !== undefined) keys.set(k, String(v));
    keys.delete("origin");
    const res = (await e.runEdit(() => m.doc.create_entity(cls, new Float64Array(origin), Array.from(keys.entries()), new Uint8Array(info?.color ?? [220, 30, 220])))) as EditResult | undefined;
    if (res?.changed_ids.length) e.selectIds(res.changed_ids);
    return edited(res, `${cls} в ${fmt(origin)}`);
  };

  /** What the compile panel shows, as text for the model. */
  const compileSummary = (tail: number, all: boolean): string => {
    const lines = e.compileLinesRef.current;
    const r = e.compileResultRef.current;
    const running = e.compileRun.current !== 0 && e.compileDoneRef.current !== e.compileRun.current;
    const out: string[] = [];
    if (!lines.length && r.ok === null) return "сборки ещё не было";
    out.push(running ? "сборка ещё идёт" : r.ok === null ? "итог неизвестен" : r.ok ? `сборка успешна: ${r.message} (${(r.ms / 1000).toFixed(1)} с)` : `сборка провалилась: ${r.message}`);
    const leak = e.leakPointsRef.current;
    if (leak || lines.some((l) => /leaked/i.test(l))) out.push(`УТЕЧКА: ${leak} точек линии утечки, вызови leak_info`);
    const trouble = lines.filter((l) => TROUBLE.test(l) && !/0 errors|0 warnings/i.test(l));
    const known = analyzeCompileLog(lines);
    if (known.length) {
      out.push(`знакомые находки (${known.length}):`);
      for (const k of known) out.push(`  [${k.severity}] ${k.title}: ${k.explain.slice(0, 160)}${k.fix ? ` (редактор умеет: ${k.fix.label})` : ""}`);
    }
    if (trouble.length) {
      out.push(`строки с ошибками и предупреждениями (${trouble.length}):`);
      for (const l of trouble.slice(0, 30)) out.push(`  ${l.trim()}`);
    } else out.push("ошибок и предупреждений в логе нет");
    const game = lines.filter((l) => l.startsWith("[game]"));
    if (game.length) {
      out.push(`консоль игры (${game.length} строк, последние):`);
      for (const l of game.slice(-15)) out.push(`  ${l.trim()}`);
    }
    const shown = all ? lines : lines.slice(-Math.max(5, tail));
    out.push(`${all ? "весь лог" : `последние ${shown.length} строк`}:`);
    for (const l of shown) out.push(`  ${l.trim()}`);
    return out.join("\n");
  };

  let lastProblems: Problem[] = [];
  const problemsText = (list: Problem[]) => (list.length ? list.map((p, i) => `${i + 1}. [${p.kind}] объект ${p.object}: ${p.message}`).join("\n") : "проблем не найдено");

  const gameText = async (): Promise<string> => {
    const st = await api.bridgeStatus();
    const reports = await api.bridgeReports();
    const out = [
      `игра: ${st.running ? "работает" : "не запущена редактором"}, мост ${st.connected ? "на связи" : st.ready ? "ждёт аддон" : "нет"}, карта ${st.map ?? "-"}${st.pos ? `, игрок ${fmt([st.pos[0], st.pos[1], st.pos[2]])}` : ""}`,
    ];
    if (st.exitHint) out.push(`выход: ${st.exitHint}`);
    const ev = reports.slice(-10).map((r) => `${r.event ?? "?"}${r.type ? ` ${String(r.type)}` : ""}${r.map ? ` ${r.map}` : ""}`);
    if (ev.length) out.push(`события моста: ${ev.join("; ")}`);
    const c = e.gameConsoleRef.current;
    if (c)
      out.push(
        `консоль последнего запуска: ${c.lines} строк, карта ${c.loaded ? "загрузилась" : "не отметилась"}, ошибок ${c.errors.length}${c.errors.length ? ":\n  " + c.errors.slice(0, 20).join("\n  ") : ""}`,
      );
    const live = e.compileLinesRef.current.filter((l) => l.startsWith("[game]")).slice(-15);
    if (live.length) out.push(`последние строки консоли:\n  ${live.join("\n  ")}`);
    return out.join("\n");
  };

  const runToolInner = async (name: string, input: Record<string, unknown>): Promise<ToolOutcome> => {
    switch (name) {
      case "map_summary":
        return { result: summary() };
      case "list_entities": {
        const m = map();
        const cls = String(input.classname ?? "").toLowerCase();
        const nm = String(input.name ?? "").toLowerCase();
        const list = m.entities.filter((x) => x.classname !== "worldspawn" && (!cls || x.classname.toLowerCase().includes(cls)) && (!nm || (x.targetname ?? "").toLowerCase().includes(nm)));
        return {
          result: list.length
            ? list
                .slice(0, 200)
                .map((x) => `${x.id} ${x.classname}${x.targetname ? ` "${x.targetname}"` : ""}${x.origin ? ` @ ${fmt(x.origin)}` : " (брашевая)"}`)
                .join("\n")
            : "ничего не найдено",
        };
      }
      case "entity_info": {
        const m = map();
        const id = num(input.id, -1);
        const d = m.doc.entity_details(id) as EntityDetails | undefined;
        if (!d) return { result: `энтити ${id} нет`, error: true };
        const lines = [`${d.id} ${d.classname}${d.brush ? " (брашевая)" : ""}`];
        for (const [k, v] of d.keyvalues) lines.push(`  ${k} = ${v}`);
        if (d.connections.length) lines.push("  выходы:");
        for (const c of d.connections) lines.push(`    ${c.output} -> ${c.target} ${c.input}${c.parameter ? ` (${c.parameter})` : ""} через ${c.delay}с ×${c.times_to_fire}`);
        if (d.brush) {
          const solids = Array.from(m.doc.entity_solids(id) as Uint32Array);
          lines.push(`  браши: ${solids.join(", ")}`);
        }
        return { result: lines.join("\n") };
      }
      case "create_brush": {
        const m = map();
        const lo = vec(input.min);
        const hi = vec(input.max);
        if (!lo || !hi) return { result: "нужны min и max по три числа", error: true };
        const bounds = [Math.min(lo[0], hi[0]), Math.min(lo[1], hi[1]), Math.min(lo[2], hi[2]), Math.max(lo[0], hi[0]), Math.max(lo[1], hi[1]), Math.max(lo[2], hi[2])];
        if (bounds[3] - bounds[0] < 1 || bounds[4] - bounds[1] < 1 || bounds[5] - bounds[2] < 1) return { result: "браш должен быть толще 1 юнита по каждой оси", error: true };
        const material = String(input.material ?? "").trim() || e.materialRef.current;
        const res = (await e.runEdit(() => m.doc.create_block(new Float64Array(bounds), material))) as EditResult | undefined;
        if (res?.changed_ids.length) e.selectIds(res.changed_ids);
        return edited(res, `браш ${fmt(lo)} … ${fmt(hi)}`);
      }
      case "hollow_brushes": {
        const m = map();
        const list = idList(input.ids);
        if (!list.length) return { result: "нужны ids", error: true };
        const res = (await e.runEdit(() => m.doc.hollow(new Uint32Array(list), num(input.thickness, 16) || 16))) as EditResult | undefined;
        if (res?.changed_ids.length) e.selectIds(res.changed_ids);
        return edited(res, `полые браши ${list.join(", ")}`);
      }
      case "create_entity": {
        const origin = vec(input.origin);
        if (!origin) return { result: "нужен origin по три числа", error: true };
        return createEntity(String(input.classname ?? ""), origin, (input.keyvalues as Record<string, unknown>) ?? {});
      }
      case "tie_to_entity": {
        const m = map();
        const list = idList(input.ids);
        const cls = String(input.classname ?? "").trim();
        if (!list.length || !cls) return { result: "нужны ids и classname", error: true };
        if (!e.classInfos.current.has(cls)) {
          const infos = await api.entityClasses([cls]);
          for (const c of infos) e.classInfos.current.set(c.classname, c);
        }
        const info = e.classInfos.current.get(cls);
        const keys = new Map<string, string>(await api.entityDefaults(cls));
        for (const [k, v] of Object.entries((input.keyvalues as Record<string, unknown>) ?? {})) if (v !== null && v !== undefined) keys.set(k, String(v));
        const res = (await e.runEdit(() => m.doc.tie_to_entity(new Uint32Array(list), cls, Array.from(keys.entries()), new Uint8Array(info?.color ?? [220, 30, 220])))) as EditResult | undefined;
        if (!res) return { result: "привязка не удалась", error: true };
        const entId = res.changed_ids.length ? m.doc.entity_of_solid(res.changed_ids[0]) : 0;
        if (entId) e.selectIds([entId]);
        return { result: `${cls}: энтити id ${entId}, браши ${list.join(", ")}`, edited: true };
      }
      case "set_entity_keys": {
        const id = num(input.id, -1);
        const keys = (input.keyvalues as Record<string, unknown>) ?? {};
        const changes: [string, string | null][] = Object.entries(keys).map(([k, v]) => [k, v === null || v === undefined ? null : String(v)]);
        if (!changes.length) return { result: "нужны keyvalues", error: true };
        await e.setEntityKeys(id, changes);
        return { result: `энтити ${id}: ${changes.map(([k, v]) => `${k}=${v ?? "(удалён)"}`).join(", ")}`, edited: true };
      }
      case "add_connections": {
        const m = map();
        const id = num(input.id, -1);
        const d = m.doc.entity_details(id) as EntityDetails | undefined;
        if (!d) return { result: `энтити ${id} нет`, error: true };
        const add = Array.isArray(input.connections) ? (input.connections as Record<string, unknown>[]) : [];
        const list: Connection[] = [...d.connections];
        for (const c of add)
          list.push({
            output: String(c.output ?? ""),
            target: String(c.target ?? ""),
            input: String(c.input ?? ""),
            parameter: String(c.parameter ?? ""),
            delay: num(c.delay),
            times_to_fire: num(c.times, -1),
          });
        await e.setEntityConnections(id, list);
        return { result: `энтити ${id}: ${add.length} выходов добавлено, всего ${list.length}`, edited: true };
      }
      case "set_material": {
        const m = map();
        const list = idList(input.ids);
        const material = String(input.material ?? "").trim();
        if (!list.length || !material) return { result: "нужны ids и material", error: true };
        const faces: number[] = [];
        for (const id of list) for (const side of m.doc.solid_sides(id) as Uint32Array) faces.push(id, side);
        if (!faces.length) return { result: "у этих id нет граней", error: true };
        const res = (await e.runEdit(() => m.doc.set_material(new Uint32Array(faces), material))) as EditResult | undefined;
        return edited(res, `${material} на ${faces.length / 2} граней`);
      }
      case "move_objects": {
        const list = idList(input.ids);
        const delta = vec(input.delta);
        if (!list.length || !delta) return { result: "нужны ids и delta", error: true };
        await e.commitTranslate(list, delta);
        return { result: `сдвинуто ${list.length} объектов на ${fmt(delta)}`, edited: true };
      }
      case "delete_objects": {
        const m = map();
        const list = idList(input.ids);
        if (!list.length) return { result: "нужны ids", error: true };
        const res = (await e.runEdit(() => m.doc.delete_objects(new Uint32Array(list)))) as EditResult | undefined;
        return edited(res, `удаление ${list.join(", ")}`);
      }
      case "select_objects": {
        const list = idList(input.ids);
        // Selection only: the camera and the panels stay the user's.
        e.selectIds(list);
        e.applySelection();
        return { result: `выделено ${list.length}`, ids: list };
      }
      case "list_commands": {
        const f = String(input.filter ?? "").toLowerCase();
        const cmds = e.commandsRef.current.filter((c) => !c.disabled && (!f || c.id.includes(f) || c.title.toLowerCase().includes(f) || (c.keywords ?? "").toLowerCase().includes(f)));
        return {
          result:
            cmds
              .slice(0, 150)
              .map((c) => `${c.id}: ${c.title}`)
              .join("\n") || "ничего не найдено",
        };
      }
      case "run_command": {
        const id = String(input.id ?? "");
        const c = e.commandsRef.current.find((x) => x.id === id);
        if (!c) return { result: `команды ${id} нет`, error: true };
        if (c.disabled) return { result: `команда ${id} сейчас недоступна`, error: true };
        c.run();
        return { result: `выполнено: ${c.title}` };
      }
      case "list_files": {
        const path = e.currentPath.current;
        if (!path) return { result: "карта не сохранена: у проекта нет папки", error: true };
        const files = await api.projectListFiles(path, String(input.dir ?? ""));
        return { result: files.length ? files.map((f) => `${f.path}${f.dir ? "/" : ` (${f.bytes} Б)`}`).join("\n") : "папка пуста" };
      }
      case "read_file": {
        const path = e.currentPath.current;
        if (!path) return { result: "карта не сохранена: у проекта нет папки", error: true };
        return { result: await api.projectReadFile(path, String(input.path ?? "")) };
      }
      case "write_file": {
        const path = e.currentPath.current;
        if (!path) return { result: "карта не сохранена: у проекта нет папки", error: true };
        const rel = String(input.path ?? "").trim();
        const text = String(input.text ?? "");
        if (!rel) return { result: "нужен path", error: true };
        let old = "";
        try {
          old = await api.projectReadFile(path, rel);
        } catch {
          old = "";
        }
        const ok = await confirm.current(`Записать ${rel}?`, old ? diffText(old, text) : text);
        if (!ok) return { result: `пользователь отклонил запись ${rel}`, error: true };
        const full = await api.projectWriteFile(path, rel, text);
        return { result: `записан ${full} (${text.length} символов)` };
      }
      case "save_map": {
        if (!e.currentPath.current) return { result: "карта ещё не сохранялась: пусть пользователь сохранит её сам (Ctrl+S) и выберет папку", error: true };
        await e.saveCurrent();
        return { result: `сохранено: ${e.currentPath.current}` };
      }
      case "compile_map": {
        if (!e.currentPath.current) return { result: "карта не сохранена", error: true };
        if (!(await confirm.current("Собрать карту?", "Будут запущены VBSP, VVIS и VRAD с настройками панели «Сборка»."))) return { result: "пользователь отклонил сборку", error: true };
        await e.saveCurrent();
        const before = e.compileRun.current;
        await e.compileCurrent(undefined, true);
        const run = e.compileRun.current;
        if (run === before) return { result: `сборка не запустилась: ${e.compileResultRef.current.message || "неизвестная причина"}`, error: true };
        const t0 = Date.now();
        while (e.compileDoneRef.current !== run && Date.now() - t0 < 600000) await sleep(500);
        if (e.compileDoneRef.current !== run) return { result: "сборка не закончилась за десять минут; смотри compile_log", error: true };
        await sleep(800); // the pointfile and portals settle
        const r = e.compileResultRef.current;
        return { result: compileSummary(12, false), error: r.ok === false };
      }
      case "compile_log":
        return { result: compileSummary(num(input.tail, 40), !!input.all) };
      case "leak_info": {
        const n = e.leakPointsRef.current;
        if (!n) return { result: "точек утечки нет: последняя сборка без leak или pointfile не загружен" };
        const m = map();
        const lines = e.compileLinesRef.current.filter((l) => /leaked|entity .* leaked|pointfile|\(\s*-?\d+\.?\d*\s+-?\d+\.?\d*\s+-?\d+\.?\d*\s*\)/i.test(l)).slice(0, 8);
        const b = m.stats.bounds;
        return {
          result: `линия утечки: ${n} точек, подсвечена в видах. Строки сборки:\n  ${lines.join("\n  ")}\nГраницы карты: ${b ? `${fmt(b[0])} … ${fmt(b[1])}` : "-"}. Утечка идёт от энтити (первая строка «Entity … leaked») наружу через дыру между мировыми брашами или потому что энтити стоит вне комнаты.`,
        };
      }
      case "check_problems": {
        lastProblems = (await e.checkProblems(true)) ?? [];
        const known = analyzeCompileLog(e.compileLinesRef.current);
        const extra = known.length
          ? `\n\nИз лога последней сборки:\n${known.map((k) => `- [${k.severity}] ${k.title}: ${k.lines[0] ?? ""}${k.fix ? ` (редактор умеет: ${k.fix.label})` : ""}`).join("\n")}`
          : "";
        return { result: problemsText(lastProblems) + extra };
      }
      case "fix_problems": {
        if (!lastProblems.length) lastProblems = (await e.checkProblems(true)) ?? [];
        const nums = idList(input.numbers);
        const chosen = nums.length ? nums.map((n) => lastProblems[n - 1]).filter(Boolean) : lastProblems;
        if (!chosen.length) return { result: "нечего исправлять" };
        const fixed = (await e.fixProblems(chosen)) ?? 0;
        lastProblems = (await e.checkProblems(true)) ?? [];
        return { result: `исправлено ${fixed} из ${chosen.length}; осталось:\n${problemsText(lastProblems)}`, edited: fixed > 0 };
      }
      case "set_world_keys": {
        const keys = (input.keyvalues as Record<string, unknown>) ?? {};
        const changes: [string, string | null][] = Object.entries(keys).map(([k, v]) => [k, v === null || v === undefined ? null : String(v)]);
        if (!changes.length) return { result: "нужны keyvalues", error: true };
        await e.setWorldKeys(changes);
        return { result: `worldspawn: ${changes.map(([k, v]) => `${k}=${v ?? "(удалён)"}`).join(", ")}`, edited: true };
      }
      case "pack_report": {
        if (!e.currentPath.current) return { result: "карта не сохранена", error: true };
        const r = await e.analyzePack();
        if (!r) return { result: "отчёт не составлен", error: true };
        return {
          result: `файлов к упаковке: ${r.files.length} (${Math.round(r.customBytes / 1024)} КБ своего контента); не хватает: ${r.missing.length ? r.missing.slice(0, 40).join(", ") : "ничего"}`,
        };
      }
      case "run_game": {
        if (!e.currentPath.current) return { result: "карта не сохранена", error: true };
        if (!(await confirm.current("Запустить игру?", "Garry's Mod загрузит собранную карту; Lua-файлы проекта будут подключены как аддон.")))
          return { result: "пользователь отклонил запуск", error: true };
        e.gameConsoleRef.current = null;
        await e.runGame(false, !!input.clean);
        const t0 = Date.now();
        let connected = false;
        while (Date.now() - t0 < 150000) {
          const st = await api.bridgeStatus();
          if (st.connected) {
            connected = true;
            break;
          }
          if (!st.running && Date.now() - t0 > 15000) break;
          await sleep(1000);
        }
        // Let the console watch report the load.
        await sleep(connected ? 3000 : 1000);
        const text = await gameText();
        return {
          result: `${connected ? `игра вышла на связь за ${Math.round((Date.now() - t0) / 1000)} с` : "игра не вышла на связь за две минуты (не запустилась, упала или BSP не установлен в maps)"}\n${text}`,
          error: !connected,
        };
      }
      case "game_status":
        return { result: await gameText() };
      case "game_reload": {
        await e.bridgeReload();
        await sleep(4000);
        return { result: `карта перезагружается\n${await gameText()}` };
      }
      case "game_teleport": {
        const pos = vec(input.pos);
        if (!pos) return { result: "нужен pos", error: true };
        const r = await api.bridgeTeleport(pos, num(input.pitch), num(input.yaw));
        const got = [num(r.x), num(r.y), num(r.z)] as [number, number, number];
        const off = Math.hypot(got[0] - pos[0], got[1] - pos[1], got[2] - pos[2]);
        return {
          result: `игрок стоит в ${fmt(got)} (глаза), взгляд pitch ${Math.round(num(r.pitch))} yaw ${Math.round(num(r.yaw))}${off > 80 ? `; от запрошенной точки ${Math.round(off)} юнитов - глаза выше ног на 64, остальное застряло` : ""}`,
          error: off > 300,
        };
      }
      case "game_lua": {
        const code = String(input.code ?? "");
        if (!code.trim()) return { result: "нужен code", error: true };
        const r = await api.bridgeLua(code, input.realm === "client" ? "client" : "server");
        return { result: `${r.realm}: ${r.ok ? "ok" : "ОШИБКА"}\n${r.result}`, error: !r.ok };
      }
      case "game_console": {
        const cmd = String(input.cmd ?? "").trim();
        if (!cmd) return { result: "нужен cmd", error: true };
        const lines = await api.bridgeConsole(cmd);
        return { result: lines.length ? `консоль после «${cmd}»:\n${lines.slice(0, 60).join("\n")}` : `«${cmd}» выполнена, консоль ничего не написала` };
      }
      case "game_trace": {
        const a = vec(input.from);
        const b = vec(input.to);
        if (!a || !b) return { result: "нужны from и to", error: true };
        const r = await api.bridgeLua(
          `local tr = util.TraceLine({ start = Vector(${a.join(",")}), endpos = Vector(${b.join(",")}), mask = MASK_SOLID }) return { hit = tr.Hit, pos = tostring(tr.HitPos), frac = tr.Fraction, entity = tostring(tr.Entity), class = IsValid(tr.Entity) and tr.Entity:GetClass() or (tr.HitWorld and "world" or "none"), material = tr.MatType, surface = tr.SurfaceProps, normal = tostring(tr.HitNormal), sky = tr.HitSky }`,
          "server",
        );
        return { result: r.ok ? `луч ${fmt(a)} → ${fmt(b)}: ${r.result}` : `луч не удался: ${r.result}`, error: !r.ok };
      }
      case "game_light_at": {
        const p = vec(input.pos);
        if (!p) return { result: "нужен pos", error: true };
        const r = await api.bridgeLua(`local c = render.GetLightColor(Vector(${p.join(",")})) local v = math.max(c.x, c.y, c.z) return { r = c.x, g = c.y, b = c.z, level = v }`, "client");
        if (!r.ok) return { result: `свет не измерен: ${r.result}`, error: true };
        let note = "";
        try {
          const j = JSON.parse(r.result) as { level?: number };
          const v = j.level ?? 0;
          note = v < 0.05 ? " - темнота" : v < 0.2 ? " - тускло" : v < 0.6 ? " - нормально" : " - ярко";
        } catch {
          /* text */
        }
        return { result: `свет в ${fmt(p)}: ${r.result}${note}` };
      }
      case "game_console_log": {
        const f = String(input.filter ?? "").toLowerCase();
        const limit = Math.max(5, Math.min(200, num(input.limit, 60) || 60));
        const raw = e.compileLinesRef.current.filter((l) => l.startsWith("[game]")).map((l) => l.slice(7).trim());
        const counts = new Map<string, number>();
        for (const l of raw) {
          if (CONSOLE_NOISE.test(l)) continue;
          if (f && !l.toLowerCase().includes(f)) continue;
          counts.set(l, (counts.get(l) ?? 0) + 1);
        }
        const mapName = (e.currentPath.current.split(/[\\/]/).pop() ?? "").replace(/\.vmf$/i, "").toLowerCase();
        const score = (l: string) =>
          (l.toLowerCase().includes(mapName) ? 4 : 0) +
          (/lua|error|attempt to|traceback/i.test(l) ? 3 : 0) +
          (/material|texture|vmt|vtf/i.test(l) ? 2 : 0) +
          (/model|\.mdl/i.test(l) ? 2 : 0) +
          (/sound|\.wav|\.mp3/i.test(l) ? 2 : 0);
        const list = Array.from(counts.entries()).sort((x, y) => score(y[0]) - score(x[0]));
        return {
          result: list.length
            ? `консоль игры (${raw.length} строк, без шума ${list.length}):\n${list
                .slice(0, limit)
                .map(([l, n]) => `${n > 1 ? `×${n} ` : ""}${l}`)
                .join("\n")}`
            : "консоль игры пуста или только шум",
        };
      }
      case "find_faces": {
        const m = map();
        const q = String(input.material ?? "")
          .toLowerCase()
          .trim();
        if (!q) return { result: "нужен material", error: true };
        const hits: string[] = [];
        for (const id of m.doc.solid_ids() as Uint32Array) {
          for (const side of m.doc.solid_sides(id) as Uint32Array) {
            const mat = m.doc.face_material(id, side);
            if (!mat.toLowerCase().includes(q)) continue;
            const fi = m.doc.face_info(id, side) as FaceInfo | undefined;
            hits.push(`браш ${id} грань ${side}: ${mat}${fi ? `, нормаль ${fmt(fi.normal)}, масштаб ${fi.uaxis[4]}×${fi.vaxis[4]}` : ""}`);
            if (hits.length >= 200) break;
          }
          if (hits.length >= 200) break;
        }
        return { result: hits.length ? `граней с «${q}»: ${hits.length}\n${hits.join("\n")}` : `граней с «${q}» нет` };
      }
      case "brush_info": {
        const m = map();
        const id = num(input.id, -1);
        const sides = m.doc.solid_sides(id) as Uint32Array;
        if (!sides.length) return { result: `браша ${id} нет`, error: true };
        const ids = m.doc.solid_ids() as Uint32Array;
        const bounds = m.doc.solid_bounds() as Float32Array;
        const idx = Array.from(ids).indexOf(id);
        const b = idx >= 0 ? `${fmt([bounds[idx * 6], bounds[idx * 6 + 1], bounds[idx * 6 + 2]])} … ${fmt([bounds[idx * 6 + 3], bounds[idx * 6 + 4], bounds[idx * 6 + 5]])}` : "-";
        const ent = m.doc.entity_of_solid(id);
        const lines = [`браш ${id}: границы ${b}${ent ? `, энтити ${ent}` : ", мировой"}, граней ${sides.length}`];
        for (const side of sides) {
          const fi = m.doc.face_info(id, side) as FaceInfo | undefined;
          if (fi)
            lines.push(
              `  грань ${side}: ${fi.material}, нормаль ${fmt(fi.normal)}, u ${fi.uaxis.map((v) => Math.round(v * 100) / 100).join(" ")}, v ${fi.vaxis.map((v) => Math.round(v * 100) / 100).join(" ")}, поворот ${fi.rotation}, lightmap ${fi.lightmap_scale}${fi.disp_power ? `, дисплейсмент power ${fi.disp_power}` : ""}`,
            );
        }
        return { result: lines.join("\n") };
      }
      case "replace_material": {
        const from = String(input.from ?? "").trim();
        const to = String(input.to ?? "").trim();
        if (!from || !to) return { result: "нужны from и to", error: true };
        await e.replaceTextures(from, to, input.scope === "selection" ? "selection" : "map", !!input.substring);
        return { result: `${from} → ${to} (${input.scope === "selection" ? "выделение" : "вся карта"})`, edited: true };
      }
      case "game_file_exists": {
        const path = String(input.path ?? "")
          .trim()
          .replace(/\\/g, "/");
        if (!path) return { result: "нужен path", error: true };
        const ok = await api.vfsExists(path);
        return { result: ok ? `${path}: есть` : `${path}: нет ни в игре, ни в проекте`, error: !ok };
      }
      case "vtf_info": {
        const name = String(input.name ?? "").trim();
        if (!name) return { result: "нужен name", error: true };
        try {
          const v = await api.vtfInfo(name);
          return { result: `${name}: ${v.width}×${v.height}, мипов ${v.mips}, кадров ${v.frames}, формат ${v.format}, флаги 0x${v.flags.toString(16)}, VTF ${v.version}` };
        } catch (err) {
          return { result: tb(String(err)), error: true };
        }
      }
      case "editor_camera": {
        const pos = vec(input.pos);
        if (pos || typeof input.pitch === "number" || typeof input.yaw === "number") {
          e.setEditorCamera(pos, typeof input.pitch === "number" ? input.pitch : null, typeof input.yaw === "number" ? input.yaw : null);
        }
        const c = e.getEditorCamera();
        return { result: c ? `камера редактора: ${fmt(c.pos)}, pitch ${Math.round(c.pitch)} yaw ${Math.round(c.yaw)}` : "карта не открыта" };
      }
      case "editor_screenshot": {
        const view = (["3d", "top", "front", "side"].includes(String(input.view)) ? String(input.view) : "3d") as "3d" | "top" | "front" | "side";
        const shot = await e.editorScreenshot(view);
        return { result: `снимок вида ${view} редактора`, image: shot };
      }
      case "game_kill": {
        await e.gameKill();
        return { result: "игра закрыта" };
      }
      case "game_screenshot": {
        const q = Math.max(20, Math.min(95, num(input.quality, 75) || 75));
        const p = vec(input.pos);
        const cam: [number, number, number, number, number, number] | null = p ? [p[0], p[1], p[2], num(input.pitch), num(input.yaw), num(input.fov)] : null;
        const frames = Math.max(1, Math.min(4, num(input.frames, 1) || 1));
        const interval = Math.max(0.2, Math.min(5, num(input.interval, 1) || 1));
        const shots: { bytes: Uint8Array; pos: [number, number, number, number, number] | null }[] = [];
        for (let i = 0; i < frames; i++) {
          shots.push(await e.takeGameShot(q, cam));
          if (i < frames - 1) await sleep(interval * 1000);
        }
        const last = shots[shots.length - 1];
        const where = cam
          ? `камера ${fmt([cam[0], cam[1], cam[2]])} pitch ${Math.round(cam[3])} yaw ${Math.round(cam[4])}`
          : last.pos
            ? `глаза игрока в ${fmt([last.pos[0], last.pos[1], last.pos[2]])}, pitch ${Math.round(last.pos[3])} yaw ${Math.round(last.pos[4])}`
            : "";
        return {
          result: `${frames > 1 ? `серия из ${frames} кадров через ${interval} с, последний` : "снимок"} (${Math.round(last.bytes.length / 1024)} КБ), ${where}`,
          image: { mediaType: "image/jpeg", data: toBase64(last.bytes) },
        };
      }
      case "test_cycle": {
        if (!e.currentPath.current) return { result: "карта не сохранена", error: true };
        if (
          !(await confirm.current(
            "Пересобрать и проверить в игре?",
            "Карта будет сохранена, собрана и перезагружена в игре (или игра будет запущена); игрок переместится в позицию камеры редактора, затем будет сделан снимок.",
          ))
        )
          return { result: "пользователь отклонил тест-цикл", error: true };
        const r = await e.testCycle(true);
        return { result: r.text, image: r.shot ? { mediaType: "image/jpeg", data: toBase64(r.shot.bytes) } : undefined, error: r.failed };
      }
      case "undo_last": {
        const n = Math.max(1, Math.min(50, num(input.count, 1)));
        for (let i = 0; i < n; i++) await e.undo();
        return { result: `отменено ${n} шагов`, edited: false };
      }
      case "list_notes": {
        const pins = e.projectMetaRef.current.pins;
        return { result: pins.length ? pins.map((n) => `#${n.id} ${n.done ? "[сделана]" : "[открыта]"} «${n.text}» @ ${fmt(n.pos)}`).join("\n") : "заметок нет" };
      }
      case "add_note": {
        map();
        const text = String(input.text ?? "").trim();
        if (!text) return { result: "нужен текст заметки", error: true };
        const pos = vec(input.pos);
        if (pos) e.addNoteAt(pos, text, true);
        else e.addNoteHere(text, true);
        await sleep(50);
        const n = e.projectMetaRef.current.pins.at(-1);
        return n && n.text === text ? { result: `заметка #${n.id} «${n.text}» @ ${fmt(n.pos)}` } : { result: "заметка не добавлена", error: true };
      }
      case "update_note": {
        const pins = e.projectMetaRef.current.pins;
        const id = num(input.id, -1);
        const n = pins.find((x) => x.id === id);
        if (!n) return { result: `заметки #${id} нет`, error: true };
        if (input.remove === true) {
          e.setNotes(pins.filter((x) => x.id !== id));
          return { result: `заметка #${id} удалена` };
        }
        const patch: Partial<MapNote> = {};
        if (typeof input.text === "string") patch.text = input.text;
        if (typeof input.done === "boolean") patch.done = input.done;
        e.setNotes(pins.map((x) => (x.id === id ? { ...x, ...patch } : x)));
        const what = [patch.done === undefined ? "" : patch.done ? "сделана" : "снова открыта", patch.text === undefined ? "" : `текст «${patch.text}»`].filter(Boolean).join(", ");
        return { result: `заметка #${id}: ${what || "без изменений"}` };
      }
      default:
        return { result: `неизвестный инструмент ${name}`, error: true };
    }
  };

  /** Every step a tool commits is marked as the assistant's, so the history list can show whose it was. */
  const runTool = async (name: string, input: Record<string, unknown>): Promise<ToolOutcome> => {
    e.current.current?.doc.set_label_prefix(ASSISTANT_LABEL_MARK);
    try {
      return await runToolInner(name, input);
    } finally {
      e.current.current?.doc.set_label_prefix(undefined);
    }
  };

  const undoDepth = (): number => {
    const m = e.current.current;
    return m ? history(m).undo_labels.length : 0;
  };

  /** The map since the last request of a living conversation: counts, the selection, notes, and the steps made meanwhile. */
  const brief = (sinceDepth: number): string => {
    const m = e.current.current;
    if (!m) return "Карта не открыта.";
    const lines: string[] = [];
    lines.push(`Файл: ${e.currentPath.current || "(не сохранена)"}; браши: ${m.stats.solids}, энтити: ${m.stats.entities}`);
    const sel = Array.from(e.selection.current);
    lines.push(`Выделено объектов: ${sel.length}${sel.length ? ` (id ${sel.slice(0, 40).join(", ")})` : ""}`);
    const labels = history(m).undo_labels;
    const made = labels.slice(Math.max(0, Math.min(sinceDepth, labels.length)));
    if (sinceDepth > labels.length) lines.push(`Отменено шагов с прошлого запроса: ${sinceDepth - labels.length}`);
    lines.push(
      made.length
        ? `Правки с прошлого запроса (${made.length}): ${made
            .slice(-30)
            .map((l) => {
              const s = splitUndoLabel(l);
              return s.assistant ? `${s.text} (ассистент)` : s.text;
            })
            .join("; ")}`
        : "Правок с прошлого запроса не было.",
    );
    const open = e.projectMetaRef.current.pins.filter((n) => !n.done).length;
    if (open) lines.push(`Открытых заметок: ${open}`);
    return lines.join("\n");
  };

  return { summary, brief, undoDepth, runTool };
}

/** A small line diff for the confirmation card: `-` old, `+` new, context around changes. */
export function diffText(oldText: string, newText: string): string {
  const a = oldText ? oldText.split("\n") : [];
  const b = newText ? newText.split("\n") : [];
  // Longest common subsequence over lines (files here are small scripts).
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) return `--- старый (${n} строк)\n+++ новый (${m} строк)\n${newText}`;
  const dp = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) dp[i * (m + 1) + j] = a[i] === b[j] ? dp[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push(` ${a[i]}`);
      i++;
      j++;
    } else if (i < n && (j >= m || dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1])) {
      out.push(`-${a[i]}`);
      i++;
    } else {
      out.push(`+${b[j]}`);
      j++;
    }
  }
  // Keep two lines of context around changes.
  const keep = new Array<boolean>(out.length).fill(false);
  out.forEach((l, k) => {
    if (l[0] !== " ") for (let d = -2; d <= 2; d++) if (out[k + d] !== undefined) keep[k + d] = true;
  });
  const res: string[] = [];
  let skipping = false;
  out.forEach((l, k) => {
    if (keep[k]) {
      res.push(l);
      skipping = false;
    } else if (!skipping) {
      res.push("…");
      skipping = true;
    }
  });
  return res.join("\n");
}
