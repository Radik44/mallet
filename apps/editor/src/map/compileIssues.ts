// What a compile log means in a mapper's words, and what the editor can do
// about it by itself: known errors get an explanation and a one-click fix;
// everything else is handed to the assistant with the log.

import { t } from "../i18n";

export type FixKind = "env_cubemap" | "replace_material" | "fix_problems" | "show_leak" | "select_object" | "set_skyname" | "none";

export interface CompileIssue {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  /** What happened and why, for a beginner. */
  explain: string;
  /** A fix the editor can apply itself, when there is one. */
  fix: { kind: FixKind; label: string; arg?: string | number } | null;
  /** The log lines behind it (first few). */
  lines: string[];
}

const strip = (l: string) => l.replace(/^\[\w+\]\s*/, "").trim();

/** Known findings of VBSP, VVIS, VRAD and the game console, with fixes. */
export function analyzeCompileLog(lines: string[]): CompileIssue[] {
  const out: CompileIssue[] = [];
  const seen = new Set<string>();
  const add = (i: CompileIssue) => {
    if (seen.has(i.id)) {
      const prev = out.find((x) => x.id === i.id)!;
      if (prev.lines.length < 4) prev.lines.push(...i.lines);
      return;
    }
    seen.add(i.id);
    out.push(i);
  };
  const game = lines.filter((l) => l.startsWith("[game]"));
  for (const raw of lines) {
    const l = strip(raw);
    const lc = l.toLowerCase();
    if (/leaked!/i.test(l)) {
      const m = /Entity (\S+) \(([-\d. e+]+)\) leaked!/i.exec(l);
      add({
        id: "leak",
        severity: "error",
        title: t("Утечка: карта не замкнута"),
        explain: t(
          "Мир не изолирован от пустоты, поэтому VVIS и VRAD не смогут рассчитать видимость и освещение{0}. Красная линия в видах ведёт от этой энтити наружу: закройте брашем место, где она выходит из помещения, или удалите энтити, если она находится снаружи.",
          [m ? t(". Утечка идёт от энтити {0} в точке {1}", [m[1], m[2]]) : ""],
        ),
        fix: { kind: "show_leak", label: t("Показать линию утечки") },
        lines: [l],
      });
      continue;
    }
    if (/skybox vtf files .* weren't compiled|skybox .*missing|can't load skybox/i.test(l)) {
      const m = /skybox\/(\S+?)\s/i.exec(l) ?? /skybox\/(\S+)/i.exec(l);
      add({
        id: "skybox",
        severity: "warning",
        title: t("Скайбокс не преобразован в cubemap"),
        explain: t(
          "Файлы неба {0}различаются по размеру или флагам, поэтому VBSP не создал стандартный cubemap. Карта работоспособна, но отражения на глянцевых поверхностях будут чёрными. Добавьте env_cubemap в помещение и соберите кубмапы (Сборка → кубмапы).",
          [m ? `«${m[1]}» ` : ""],
        ),
        fix: { kind: "env_cubemap", label: t("Поставить env_cubemap") },
        lines: [l],
      });
      continue;
    }
    const mat =
      /(?:material|texture) ["']?([a-z0-9_\-/\\.]+)["']? (?:not found|does not exist|is missing)|couldn't find (?:material|texture) ["']?([a-z0-9_\-/\\.]+)/i.exec(l) ??
      /missing material ["']?([a-z0-9_\-/\\.]+)/i.exec(l);
    if (mat) {
      const name = (mat[1] ?? mat[2]).replace(/\\/g, "/");
      add({
        id: `material:${name.toLowerCase()}`,
        severity: "warning",
        title: t("Нет материала {0}", [name]),
        explain: t(
          "Грани ссылаются на материал, которого нет ни в игре, ни в проекте: в игре они будут отображаться розово-чёрной шахматной текстурой. Замените его на существующий или добавьте VMT и VTF в папку materials проекта.",
        ),
        fix: { kind: "replace_material", label: t("Заменить на dev-текстуру"), arg: name },
        lines: [l],
      });
      continue;
    }
    const brush = /(?:Entity \d+, )?Brush (\d+)[^\n]*?(non-convex|degenerate|bad normal|invalid|FloatPlane|out of range|too many|duplicate plane|overlap)/i.exec(l);
    if (brush) {
      add({
        id: `brush:${brush[1]}`,
        severity: "error",
        title: t("Браш {0}: {1}", [brush[1], brush[2].toLowerCase() === "non-convex" ? t("невыпуклый") : t("некорректная геометрия")]),
        explain: t(
          "VBSP не смог обработать этот браш: грани пересекаются или вершины не лежат в своих плоскостях (обычно после редактирования вершин или масштабирования). Проверка карты может исправить такие браши; в противном случае удалите браш и создайте его заново.",
        ),
        fix: { kind: "fix_problems", label: t("Исправить проверкой"), arg: Number(brush[1]) },
        lines: [l],
      });
      continue;
    }
    if (/no (?:info_player_start|player start|spawn)/i.test(lc)) {
      add({ id: "nospawn", severity: "error", title: t("Нет точки появления игрока"), explain: t("Игроку негде появиться: добавьте info_player_start на пол."), fix: null, lines: [l] });
      continue;
    }
    if (/too many (\w+)/i.test(lc) && /limit|max/i.test(lc)) {
      add({
        id: `limit:${lc.slice(0, 40)}`,
        severity: "error",
        title: t("Превышен лимит движка"),
        explain: t("Превышен лимит Source: {0}. Упростите геометрию: сократите число брашей и граней, переведите мелкие детали в func_detail, рельеф делайте дисплейсментами.", [l]),
        fix: null,
        lines: [l],
      });
      continue;
    }
    if (/\*\*\* error|^error:|fatal/i.test(l) && !/0 errors/i.test(l)) {
      add({ id: `error:${lc.slice(0, 60)}`, severity: "error", title: t("Ошибка инструмента сборки"), explain: l, fix: null, lines: [l] });
      continue;
    }
  }
  // The game console: Lua errors and missing content.
  const lua = game.filter((l) => /\[error\]|lua error|attempt to|stack traceback|addons\/.*\.lua:\d+/i.test(l));
  if (lua.length)
    add({
      id: "lua",
      severity: "error",
      title: t("Ошибки Lua в игре ({0})", [lua.length]),
      explain: t("Скрипты карты завершаются с ошибкой. В строках ниже указаны файл и номер строки; ассистент может разобрать и исправить их."),
      fix: null,
      lines: lua.slice(0, 4).map(strip),
    });
  const missingModels = game.filter((l) => /model .* not found|couldn't load model|error loading model|MDLCache/i.test(l));
  if (missingModels.length)
    add({
      id: "models",
      severity: "warning",
      title: t("Модели не найдены в игре ({0})", [missingModels.length]),
      explain: t("Пропы ссылаются на модели, которых нет в игре: вместо них будет отображаться красная надпись ERROR. Проверьте пути или упакуйте модели в карту."),
      fix: null,
      lines: missingModels.slice(0, 3).map(strip),
    });
  return out;
}

/** The request for the assistant: the issues it should look at and the lines behind them. */
export function askAboutLog(issues: CompileIssue[], lines: string[]): string {
  const trouble = lines.filter((l) => /error|leak|\*\*\*|fail|warning|attempt to|traceback/i.test(l) && !/0 errors|0 warnings/i.test(l)).slice(-40);
  const known = issues.map((i) => `- ${i.title}: ${i.lines[0] ?? ""}`).join("\n");
  return t(
    "Разбери лог сборки и консоль игры: объясни, что не так, и исправь то, что можно исправить в карте и в файлах проекта, затем пересобери и проверь.\n\nЧто редактор уже заметил:\n{0}\n\nСтроки лога с ошибками и предупреждениями:\n{1}",
    [known || t("- ничего знакомого"), trouble.join("\n") || t("(нет)")],
  );
}

/** Fixes safe to apply without asking: they add or replace, never delete or move the camera. */
export const AUTO_FIX_KINDS: FixKind[] = ["env_cubemap", "replace_material", "fix_problems", "set_skyname"];

/** The findings the auto-analysis fixes, one per fix kind and argument. */
export function autoFixPlan(issues: CompileIssue[]): CompileIssue[] {
  const seen = new Set<string>();
  const out: CompileIssue[] = [];
  for (const i of issues) {
    if (!i.fix || !AUTO_FIX_KINDS.includes(i.fix.kind)) continue;
    const key = `${i.fix.kind}:${i.fix.arg ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(i);
  }
  return out;
}
