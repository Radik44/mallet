// Dragging an asset out of a browser panel into the views: a texture tile
// onto a face, a model or a prefab onto a surface in 3D or onto the grid in
// a 2D view. Panels only report the press; the app runs the drag.

import { t, lazy } from "../i18n";

export type AssetKind = "material" | "model" | "prefab" | "sound";

/** Whether an exported sound loops (its WAV has a cue point), by name; the drop sets the entity flag from it. */
export const SOUND_LOOPS = new Map<string, boolean>();

export type DragAsset = (kind: AssetKind, name: string, e: React.MouseEvent) => void;

export const ASSET_TITLES: Record<AssetKind, string> = lazy(() => ({ material: t("текстура"), model: t("модель"), prefab: t("префаб"), sound: t("звук") }));
