// The folder column of the content browsers (Unity's project browser): the filter text carries the
// folder the way a path does, so the column only reads and rewrites the leading `a/b/` of its first word.

/** The folder the filter is in: the leading `a/b/` of its first word, lower-case; "" at the root or for the `*` / `@` lists. */
export function folderPrefix(filter: string): string {
  const word = filter.trimStart().split(/\s+/)[0] ?? "";
  if (word.startsWith("*") || word.startsWith("@")) return "";
  const i = word.lastIndexOf("/");
  return i < 0 ? "" : word.slice(0, i + 1).toLowerCase();
}

/** The folder above `prefix`: `dev/sub/` → `dev/`, `dev/` → "". */
export function parentFolder(prefix: string): string {
  return prefix.replace(/[^/]+\/$/, "");
}

/** The filter moved into `folder`, keeping the words typed after the old folder. */
export function filterInFolder(filter: string, folder: string): string {
  const trimmed = filter.trimStart();
  const old = folderPrefix(trimmed);
  const rest = old && trimmed.toLowerCase().startsWith(old) ? trimmed.slice(old.length) : trimmed.startsWith("*") || trimmed.startsWith("@") ? trimmed.slice(1).trimStart() : trimmed;
  return folder + rest;
}
