// Undo-step labels come from the core; the assistant's steps carry a mark in
// front, which the history list turns into an icon.

/** What the assistant's tools put before the label of every step they make. */
export const ASSISTANT_LABEL_MARK = "@assistant ";

export function splitUndoLabel(label: string): { assistant: boolean; text: string } {
  return label.startsWith(ASSISTANT_LABEL_MARK) ? { assistant: true, text: label.slice(ASSISTANT_LABEL_MARK.length) } : { assistant: false, text: label };
}
