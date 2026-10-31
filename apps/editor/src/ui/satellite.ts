// Satellite windows: extra editor windows that show one view (a second
// camera, the top view on another monitor). They are the same app opened
// with `?satellite=<view>`; the main window feeds them the document over a
// BroadcastChannel after every edit, and they render it with their own
// WebGPU context and camera. They do not edit: selection and changes come
// from the main window.

import { ALL_VIEWS, type ViewId } from "./viewsLayout";

/** Which view this window shows when it is a satellite, else null. */
export const SATELLITE: ViewId | null = (() => {
  try {
    const v = new URLSearchParams(window.location.search).get("satellite");
    return v && ALL_VIEWS.includes(v as ViewId) ? (v as ViewId) : null;
  } catch {
    return null;
  }
})();

/** Panels that can live in their own window; their actions go to the main window as commands. */
export type PanelKind = "textures" | "models" | "prefabs";
export const SATELLITE_PANEL: PanelKind | null = (() => {
  try {
    const v = new URLSearchParams(window.location.search).get("panel");
    return v === "textures" || v === "models" || v === "prefabs" ? v : null;
  } catch {
    return null;
  }
})();

/** Any kind of satellite window: a view or a panel. */
export const SAT_ANY = SATELLITE !== null || SATELLITE_PANEL !== null;

export type DocMessage =
  | { type: "hello"; from: string }
  | { type: "bye"; from: string }
  | { type: "doc"; text: string; name: string; path: string }
  | { type: "sel"; ids: number[] }
  | { type: "ready"; from: string; view: ViewId; solids: number }
  | { type: "zoom"; upp: number }
  | { type: "cmd"; cmd: "material" | "paintMode" | "applyMaterial" | "model" | "placeModel" | "prefab" | "savePrefab"; name?: string }
  | { type: "cmd"; cmd: "replace"; find: string; replace: string; scope: "selection" | "map"; substring: boolean };

export function docChannel(): BroadcastChannel | null {
  try {
    return new BroadcastChannel("gme-doc");
  } catch {
    return null;
  }
}

/** A label for a new satellite window; the capability file allows `sat-*`. */
export function satelliteLabel(view: ViewId): string {
  return `sat-${view}-${Date.now().toString(36)}`;
}
