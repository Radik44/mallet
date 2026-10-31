// Camera bookmarks, as Ctrl+digit in Unreal: Ctrl+1…5 remembers where the 3D
// camera stands and looks, Shift+1…5 flies back there. Kept per map file, so
// every map has its own five spots; Hammer has nothing like it.

import { t } from "../i18n";

export interface CameraBookmark {
  pos: [number, number, number];
  pitch: number;
  yaw: number;
}

export const BOOKMARK_SLOTS = 5;

const KEY = "gme.camBookmarks";

/** The storage key of a map's bookmarks; unsaved maps share one set. */
export function bookmarksKey(mapPath: string | null): string {
  return `${KEY}:${(mapPath ?? "").replace(/\\/g, "/").toLowerCase()}`;
}

/** Parses stored bookmarks, dropping anything malformed. */
export function parseBookmarks(raw: string | null): (CameraBookmark | null)[] {
  const out: (CameraBookmark | null)[] = Array(BOOKMARK_SLOTS).fill(null);
  if (!raw) return out;
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return out;
    for (let i = 0; i < BOOKMARK_SLOTS; i++) {
      const b = arr[i] as Partial<CameraBookmark> | null | undefined;
      if (b && Array.isArray(b.pos) && b.pos.length === 3 && b.pos.every(Number.isFinite) && Number.isFinite(b.pitch) && Number.isFinite(b.yaw)) {
        out[i] = { pos: [b.pos[0], b.pos[1], b.pos[2]], pitch: b.pitch as number, yaw: b.yaw as number };
      }
    }
  } catch {
    /* corrupt storage: start empty */
  }
  return out;
}

export function withBookmark(list: (CameraBookmark | null)[], slot: number, b: CameraBookmark): (CameraBookmark | null)[] {
  const next = list.slice(0, BOOKMARK_SLOTS);
  while (next.length < BOOKMARK_SLOTS) next.push(null);
  next[slot] = { pos: [...b.pos] as [number, number, number], pitch: b.pitch, yaw: b.yaw };
  return next;
}

/** A short text for the status bar: where the bookmark stands. */
export function bookmarkText(slot: number, b: CameraBookmark): string {
  return t("закладка {0}: {1}", [slot + 1, b.pos.map((v) => Math.round(v)).join(" ")]);
}
