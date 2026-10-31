// Browse to asset, as Unreal's Ctrl+B "Find in Content Browser": the model of
// a selected prop, or the material of a selected brush, comes up in its
// library with the filter set to it, so a look-alike is one click away.
// The request waits here until the library panel is mounted to take it.

export type BrowseKind = "model" | "material";

const EVENT = "gme-browse";
let pending: { kind: BrowseKind; name: string } | null = null;

/** Asks the library of `kind` to show `name`. */
export function requestBrowse(kind: BrowseKind, name: string): void {
  pending = { kind, name };
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** The pending request for `kind`, taken (it is answered once). */
export function takeBrowse(kind: BrowseKind): string | null {
  if (!pending || pending.kind !== kind) return null;
  const name = pending.name;
  pending = null;
  return name;
}

/** Calls `onName` with every request for `kind`, the one already waiting first; returns the unsubscribe. */
export function onBrowse(kind: BrowseKind, onName: (name: string) => void): () => void {
  const take = () => {
    const name = takeBrowse(kind);
    if (name) onName(name);
  };
  take();
  window.addEventListener(EVENT, take);
  return () => window.removeEventListener(EVENT, take);
}
