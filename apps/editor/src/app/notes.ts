// Notes pinned to places in the map (Blender's annotations, a sticky note
// on a wall): "fix the leak here", "prop goes there". They live in the
// project's sidecar, not in the VMF, so Hammer never sees them, and are
// drawn over the 3D view and listed in the «Заметки» panel.

export interface MapNote {
  id: number;
  pos: [number, number, number];
  text: string;
  done: boolean;
  /** When it was written, ms since the epoch. */
  when: number;
}

export function addNote(list: MapNote[], pos: [number, number, number], text: string, when = Date.now()): MapNote[] {
  const id = list.reduce((m, n) => Math.max(m, n.id), 0) + 1;
  return [...list, { id, pos: [round(pos[0]), round(pos[1]), round(pos[2])], text, done: false, when }];
}

export function updateNote(list: MapNote[], id: number, patch: Partial<Omit<MapNote, "id">>): MapNote[] {
  return list.map((n) => (n.id === id ? { ...n, ...patch } : n));
}

export function removeNote(list: MapNote[], id: number): MapNote[] {
  return list.filter((n) => n.id !== id);
}

/** Open notes first, newest first within each group. */
export function sortNotes(list: MapNote[]): MapNote[] {
  return [...list].sort((a, b) => Number(a.done) - Number(b.done) || b.when - a.when);
}

const round = (v: number) => Math.round(v * 100) / 100;
