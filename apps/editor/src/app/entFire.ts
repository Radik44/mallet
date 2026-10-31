// Test an output in the running game: the editor sends `ent_fire target
// input parameter` through the game bridge, so a door opens or a light
// switches without rebuilding the map. Hammer cannot do this at all.

/** The console command that fires `input` on `target` now, or a reason it cannot: !self becomes the entity's own name; !activator and !caller only exist inside a real event. */
import { t } from "../i18n";

export function entFireCommand(c: { target: string; input: string; parameter: string }, selfName: string | null): { command: string } | { reason: string } {
  let target = c.target.trim();
  const input = c.input.trim();
  if (!target || !input) return { reason: t("у выхода нет цели или входа") };
  if (target.toLowerCase() === "!self") {
    if (!selfName) return { reason: t("у энтити нет имени (targetname): из консоли к !self обратиться нельзя") };
    target = selfName;
  } else if (target.startsWith("!")) {
    return { reason: t("{0} существует только во время реального события; проверьте, вызвав его в игре", [target]) };
  }
  const p = c.parameter.trim();
  const param = !p ? "" : /\s/.test(p) ? ` "${p.replace(/"/g, "")}"` : ` ${p}`;
  return { command: `ent_fire ${target} ${input}${param}` };
}
