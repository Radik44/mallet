// Instance parameters: an instance VMF declares them on a
// func_instance_parms entity as `"parmN" "$name type default"`, and a
// func_instance sets them with `"replaceNN" "$name value"` keys (Hammer's
// Instance Parameters sheet). Pure text helpers, no document access.

export interface InstanceParm {
  /** Including the `$`. */
  name: string;
  /** Hammer type word: boolean, integer, float, string, color255, choices, flags… */
  type: string;
  /** Default value as written in the instance. */
  def: string;
}

/** Parameters declared by an instance VMF, in parm order. */
export function parseInstanceParms(text: string): InstanceParm[] {
  const out: InstanceParm[] = [];
  const re = /"parm(\d+)"\s+"\$([^\s"]+)\s*([^\s"]*)\s*([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ name: `$${m[2]}`, type: m[3] || "string", def: m[4].trim() });
  }
  return out;
}

/** `$name` → value from the func_instance's replaceNN keys. */
export function instanceReplacements(keyvalues: [string, string][]): Map<string, string> {
  const map = new Map<string, string>();
  for (const [k, v] of keyvalues) {
    if (!/^replace\d+$/i.test(k)) continue;
    const t = v.trim();
    if (!t.startsWith("$")) continue;
    const sp = t.indexOf(" ");
    if (sp < 0) map.set(t, "");
    else map.set(t.slice(0, sp), t.slice(sp + 1).trim());
  }
  return map;
}

/**
 * Key changes that set `$name` to `value` on a func_instance: the existing
 * replaceNN row for it is rewritten, otherwise the first free replaceNN is
 * used (Hammer numbers them 01..). An empty value removes the row.
 */
export function replacementChanges(keyvalues: [string, string][], name: string, value: string): [string, string | null][] {
  const used = new Set<number>();
  let existing: string | null = null;
  for (const [k, v] of keyvalues) {
    const m = /^replace(\d+)$/i.exec(k);
    if (!m) continue;
    used.add(Number(m[1]));
    const t = v.trim();
    const sp = t.indexOf(" ");
    const n = sp < 0 ? t : t.slice(0, sp);
    if (n === name) existing = k;
  }
  if (value === "") return existing ? [[existing, null]] : [];
  if (existing) return [[existing, `${name} ${value}`]];
  let n = 1;
  while (used.has(n)) n++;
  return [[`replace${String(n).padStart(2, "0")}`, `${name} ${value}`]];
}
