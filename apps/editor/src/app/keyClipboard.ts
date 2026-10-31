// Copy and paste entity properties, as Copy/Paste Component Values in Unity:
// take the settings of one light and hand them to twenty others. Identity
// and placement keys stay where they are, so the pasted entities keep their
// names, places and classes.

/** Keys that say what and where an entity is rather than how it is set up. */
export const IDENTITY_KEYS = ["classname", "targetname", "origin", "angles", "id", "hammerid", "parentname"];

/** The keys worth carrying over from `source`. */
export function copyableKeys(source: [string, string][]): [string, string][] {
  return source.filter(([k]) => !IDENTITY_KEYS.includes(k.toLowerCase()));
}

/** The changes that make `target` carry `copied`; keys already equal are left out. */
export function pasteChanges(copied: [string, string][], target: [string, string][]): [string, string][] {
  const have = new Map(target.map(([k, v]) => [k.toLowerCase(), v]));
  return copied.filter(([k, v]) => have.get(k.toLowerCase()) !== v);
}

/** `existing` outputs with those of `add` that are not there yet (same output, target, input and parameter); null when nothing is new. */
export function mergeConnections<T extends { output: string; target: string; input: string; parameter: string }>(existing: T[], add: T[]): T[] | null {
  const key = (c: T) => `${c.output}|${c.target}|${c.input}|${c.parameter}`.toLowerCase();
  const have = new Set(existing.map(key));
  const fresh = add.filter((c) => !have.has(key(c)));
  return fresh.length ? [...existing, ...fresh] : null;
}

