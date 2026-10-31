// The prop class a model wants. Hammer places every model as prop_static, and
// a model built without $staticprop then simply vanishes in the compile (VBSP:
// "must be used on a dynamic entity"). The model header says which it is:
// static models stay prop_static, models with a collision mesh (.phy) become
// prop_physics, the rest prop_dynamic.

import { STATIC_PROP_FLAG, api, inTauri } from "../tauri";

export type PropClass = "prop_static" | "prop_physics" | "prop_dynamic";

/** The class for a model with header `flags` (null when unknown) and with or without a .phy beside it. */
export function propClassFor(flags: number | null, hasPhysics: boolean): PropClass {
  if (flags === null || flags & STATIC_PROP_FLAG) return "prop_static";
  return hasPhysics ? "prop_physics" : "prop_dynamic";
}

/** Classes already read, shared by the model library and placement. */
const known = new Map<string, PropClass>();

/** The class each model wants, read from the game in one batch for those not known yet; prop_static outside the app or on error. */
export async function classesOf(names: string[]): Promise<Map<string, PropClass>> {
  const ask = names.filter((n) => !known.has(n));
  if (ask.length && inTauri) {
    try {
      const flags = await api.modelFlags(ask);
      const phy = ask.map((n) => n.replace(/\.mdl$/i, ".phy"));
      const noPhy = new Set((await api.checkResources([], phy, null)).missingModels);
      ask.forEach((n, i) => known.set(n, propClassFor(flags[i], !noPhy.has(phy[i]))));
    } catch {
      /* the class is a hint: placement falls back to prop_static */
    }
  }
  return new Map(names.map((n) => [n, known.get(n) ?? "prop_static"]));
}
