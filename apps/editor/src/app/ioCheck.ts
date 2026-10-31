// Outputs aimed at an input the target does not have: a typo ("Toogle"), or an
// input of another class (TurnOn sent to a door). Hammer paints the line red
// only inside the Outputs tab of that one entity; the game drops the event
// without a word. Each finding names the nearest real input, and the fix uses it.

/** Edit distance between two words, without case. */
import { t } from "../i18n";

export function editDistance(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[y.length];
}

/** The input of `known` closest to `asked`, if it is near enough to be a typo (at most a third of the word off). */
export function nearestInput(asked: string, known: string[]): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const k of known) {
    const d = editDistance(asked, k);
    if (d < bestD) [best, bestD] = [k, d];
  }
  return best && bestD <= Math.max(1, Math.floor(asked.length / 3)) ? best : null;
}

export type IoIssue = { source: number; index: number; target: string; input: string; classes: string[]; suggestion: string | null };

/**
 * Connections whose input none of the named targets accept. `targetClasses` gives the classes of
 * the entities a target name reaches (none for special names like !activator or unknown names);
 * `inputsOf` the inputs of a class, or null when the FGD does not know it - then nothing is said.
 */
export function unknownInputs(
  conns: { source: number; index: number; target: string; input: string }[],
  targetClasses: (target: string) => string[],
  inputsOf: (classname: string) => string[] | null,
): IoIssue[] {
  const out: IoIssue[] = [];
  for (const c of conns) {
    if (!c.input || c.target.startsWith("!")) continue;
    const classes = [...new Set(targetClasses(c.target))];
    if (!classes.length) continue;
    const lists = classes.map(inputsOf);
    if (lists.some((l) => l === null)) continue;
    const accepted = lists.some((l) => l!.some((i) => i.toLowerCase() === c.input.toLowerCase()));
    if (accepted) continue;
    out.push({ ...c, classes, suggestion: nearestInput(c.input, [...new Set(lists.flat() as string[])]) });
  }
  return out;
}

export type OutputIssue = { source: number; index: number; output: string; classname: string; suggestion: string | null };

/**
 * Connections on an output their own entity never fires: OnTrigger on a func_button (it has
 * OnPressed), OnTriger with a typo. `outputsOf` gives the outputs of a class, or null when the FGD
 * does not know it - then nothing is said.
 */
export function unknownOutputs(conns: { source: number; index: number; output: string; classname: string }[], outputsOf: (classname: string) => string[] | null): OutputIssue[] {
  const out: OutputIssue[] = [];
  for (const c of conns) {
    const known = outputsOf(c.classname);
    if (!c.output || !known || known.some((o) => o.toLowerCase() === c.output.toLowerCase())) continue;
    out.push({ ...c, suggestion: nearestInput(c.output, known) });
  }
  return out;
}

/**
 * What is wrong with one connection, as Hammer's red I/O rows say, in words: an output the
 * entity never fires, a target no entity is named, an input the target lacks. Empty lists mean
 * "not known yet" and say nothing; special targets (!activator…) and patterns with * are not judged.
 */
export function connectionWarnings(c: { output: string; target: string; input: string }, outputs: string[], inputs: string[], names: string[]): string[] {
  const has = (list: string[], v: string) => list.some((x) => x.toLowerCase() === v.toLowerCase());
  const out: string[] = [];
  if (c.output && outputs.length && !has(outputs, c.output)) out.push(t("класс не вызывает выход {0}", [c.output]));
  const special = c.target.startsWith("!") || c.target.includes("*");
  if (c.target && !special && names.length && !has(names, c.target)) out.push(t("нет энтити с именем «{0}»", [c.target]));
  else if (c.input && inputs.length && !has(inputs, c.input)) out.push(t("у цели нет входа {0}", [c.input]));
  return out;
}
