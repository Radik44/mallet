// Configurable hotkeys: every palette command has a default combo
// ("Ctrl+Shift+C"); the person can rebind or clear it in the settings
// panel, and the choice is remembered in localStorage.

import { t, lazy } from "../i18n";

export type Keymap = Record<string, string>;

const STORAGE = "gme.keymap";

const CODE_NAMES: Record<string, string> = {
  Enter: "Enter",
  NumpadEnter: "Enter",
  Delete: "Delete",
  Backspace: "Backspace",
  Escape: "Esc",
  Space: "Space",
  Tab: "Tab",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  NumpadDecimal: "Num.",
  NumpadAdd: "Num+",
  NumpadSubtract: "Num-",
};

/** The key part of a combo from a KeyboardEvent code, or null for modifiers alone. */
export function keyName(code: string): string | null {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad") && code.length === 7) return `Num${code.slice(6)}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  if (/^(Shift|Control|Alt|Meta)(Left|Right)$/.test(code)) return null;
  return CODE_NAMES[code] ?? null;
}

/** "Ctrl+Shift+X" for the event, or null when only modifiers are down. */
export function comboFromEvent(e: KeyboardEvent): string | null {
  const key = keyName(e.code);
  if (!key) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

/** Normalises a combo written by hand or by an older version ("Shift+Ctrl+x" → "Ctrl+Shift+X"). */
export function normalizeCombo(combo: string): string {
  const parts = combo
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  const mods = new Set(parts.slice(0, -1).map((p) => p.toLowerCase()));
  const key = parts[parts.length - 1];
  const out: string[] = [];
  if (mods.has("ctrl") || mods.has("cmd") || mods.has("meta")) out.push("Ctrl");
  if (mods.has("alt")) out.push("Alt");
  if (mods.has("shift")) out.push("Shift");
  out.push(key.length === 1 ? key.toUpperCase() : key);
  return out.join("+");
}

export function loadKeymap(): Keymap {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Keymap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === "string") out[k] = normalizeCombo(v);
    return out;
  } catch {
    return {};
  }
}

export function saveKeymap(map: Keymap): void {
  try {
    if (Object.keys(map).length) localStorage.setItem(STORAGE, JSON.stringify(map));
    else localStorage.removeItem(STORAGE);
  } catch {
    /* storage unavailable */
  }
}

/** The combo in force for a command: the override when set (possibly ""), else the default. */
export function effectiveHotkey(map: Keymap, id: string, fallback: string | undefined): string {
  if (id in map) return map[id];
  return fallback ? normalizeCombo(fallback) : "";
}

/** Ready-made layouts for people coming from other editors; Hammer's is the default. */
export const KEYMAP_PRESETS: { id: string; title: string; map: Keymap }[] = lazy((): { id: string; title: string; map: Keymap }[] => [
  { id: "default", title: t("По умолчанию: инструменты на 1–9"), map: {} },
  {
    // Hammer's Shift+letter tools clash with flying (Shift+WASD), so they are a preset, not the default.
    id: "hammer",
    title: t("Hammer: инструменты на Shift+S, B, A, E, X, V, K"),
    map: {
      "t-select": "Shift+S",
      "t-block": "Shift+B",
      "t-tex": "Shift+A",
      "t-ent": "Shift+E",
      "t-clip": "Shift+X",
      "t-vertex": "Shift+V",
      "t-cordon": "Shift+K",
      "t-landscape": "Shift+D",
      "t-measure": "Shift+R",
    },
  },
  {
    id: "unity",
    title: "Unity",
    map: {
      focus: "F",
      duplicate: "Ctrl+D",
      delete: "Delete",
      hide: "H",
      showall: "Alt+H",
      "t-select": "Shift+Q",
      "t-block": "Shift+B",
      "t-ent": "Shift+E",
      "p-inspector": "Ctrl+I",
      "p-settings": "Ctrl+,",
    },
  },
  {
    id: "blender",
    title: "Blender",
    map: {
      focus: "Num.",
      duplicate: "Shift+D",
      "repeat-copy": "Shift+R",
      delete: "X",
      hide: "H",
      showall: "Alt+H",
      group: "Ctrl+G",
      ungroup: "Ctrl+Alt+G",
      "t-select": "Shift+Q",
      "t-block": "Shift+A",
      "t-tex": "Shift+T",
      "p-props": "N",
      "p-inspector": "Ctrl+I",
    },
  },
]);
