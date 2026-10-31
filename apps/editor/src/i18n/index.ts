// The interface in the user's language. The source texts are Russian and
// serve as the keys: `t("Новая карта…")` returns the translation from the
// current dictionary, or the Russian text when there is none, so a missing
// line never shows up as an empty label. Dictionaries live in
// `locales/<code>.json` (Russian text → translation) and are checked by
// `i18n.test.ts` against the texts found in the sources.
//
// Texts in module-scope tables are wrapped in `lazy(() => ({ … }))`, which
// rebuilds the table when the language changes, so a running editor can
// switch languages without a restart.

import { useEffect, useState } from "react";

export interface Language {
  code: string;
  /** The name in its own language, for the settings list. */
  name: string;
  /** The name in English, for the assistant's instructions. */
  english: string;
}

/** The languages that have a dictionary; the first one is the source. */
export const LANGUAGES: Language[] = [
  { code: "ru", name: "Русский", english: "Russian" },
  { code: "en", name: "English", english: "English" },
  { code: "de", name: "Deutsch", english: "German" },
  { code: "fr", name: "Français", english: "French" },
  { code: "es", name: "Español", english: "Spanish" },
  { code: "pt-BR", name: "Português (Brasil)", english: "Brazilian Portuguese" },
  { code: "pl", name: "Polski", english: "Polish" },
  { code: "tr", name: "Türkçe", english: "Turkish" },
  { code: "uk", name: "Українська", english: "Ukrainian" },
  { code: "zh-CN", name: "中文（简体）", english: "Simplified Chinese" },
  { code: "ja", name: "日本語", english: "Japanese" },
];

export const SOURCE_LOCALE = "ru";
/** What a system language outside the dictionaries gets: the one most people can read. */
export const DEFAULT_LOCALE = "en";
const STORAGE_KEY = "gme.lang";

type Dict = Record<string, string>;

let locale = SOURCE_LOCALE;
let dict: Dict = {};
let version = 0;
const listeners = new Set<() => void>();

const files = import.meta.glob<{ default: Dict }>("./locales/*.json");

/** The language the interface shows now. */
export function currentLocale(): string {
  return locale;
}

export function languageOf(code: string): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

function matchLanguage(tag: string): string | null {
  const lower = tag.toLowerCase();
  const exact = LANGUAGES.find((l) => l.code.toLowerCase() === lower);
  if (exact) return exact.code;
  const base = lower.split("-")[0];
  return LANGUAGES.find((l) => l.code.toLowerCase().split("-")[0] === base)?.code ?? null;
}

/** Whether the person has already chosen a language (then the installer's and the system's are ignored). */
export function hasSavedLocale(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return !!saved && LANGUAGES.some((l) => l.code === saved);
  } catch {
    return false;
  }
}

/** The saved choice; else `?lang=` (for checks in the browser); else the system language when there is a dictionary for it; else English. */
export function detectLocale(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q && LANGUAGES.some((l) => l.code === q)) return q;
  }
  if (typeof navigator !== "undefined") {
    for (const tag of navigator.languages?.length ? navigator.languages : [navigator.language]) {
      const m = tag && matchLanguage(tag);
      if (m) return m;
    }
  }
  return DEFAULT_LOCALE;
}

async function load(code: string): Promise<Dict> {
  if (code === SOURCE_LOCALE) return {};
  const loader = files[`./locales/${code}.json`];
  if (!loader) return {};
  try {
    return (await loader()).default;
  } catch {
    return {};
  }
}

/** Shows the interface in `code` without remembering the choice (start-up, autotest). */
export async function applyLocale(code: string): Promise<void> {
  const next = await load(code);
  dict = next;
  locale = code;
  version++;
  if (typeof document !== "undefined") document.documentElement.lang = code;
  for (const l of listeners) l();
}

/**
 * Loads the dictionary of the start-up language; called once before the first
 * render. `installer` answers with the language picked in the installer (null
 * outside an installed copy): it beats the system language, but not a choice
 * the person already made in the editor.
 */
export async function initLocale(installer?: () => Promise<string | null>): Promise<void> {
  let code = detectLocale();
  if (installer && !hasSavedLocale()) {
    try {
      const picked = await installer();
      if (picked && LANGUAGES.some((l) => l.code === picked)) code = picked;
    } catch {
      /* not installed with the installer */
    }
  }
  return applyLocale(code);
}

/** Switches the running editor to `code` and remembers the choice. */
export async function setLocale(code: string): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* storage unavailable */
  }
  await applyLocale(code);
}

/** The translation of a source text; `{0}`, `{1}`… are replaced by `args`. */
export function t(key: string, args?: readonly unknown[]): string {
  let s = dict[key] ?? key;
  if (args) s = s.replace(/\{(\d+)\}/g, (m, i: string) => (args[Number(i)] === undefined ? m : String(args[Number(i)])));
  return s;
}

/** The dictionary's templates with placeholders as patterns, for messages the Rust side formatted. */
let patterns: { re: RegExp; key: string }[] | null = null;
let patternsVersion = -1;

function templatePatterns(): { re: RegExp; key: string }[] {
  if (patterns && patternsVersion === version) return patterns;
  patterns = [];
  for (const key of Object.keys(dict)) {
    if (!/\{\d+\}/.test(key)) continue;
    const src = key
      .split(/(\{\d+\})/)
      .map((part) => (/^\{\d+\}$/.test(part) ? "(.+?)" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("");
    patterns.push({ re: new RegExp(`^${src}$`, "s"), key });
  }
  // Longer templates first: they are the more specific ones.
  patterns.sort((a, b) => b.key.length - a.key.length);
  patternsVersion = version;
  return patterns;
}

/**
 * The translation of a message the backend already formatted (an error with a path or a
 * count in it): an exact match first, then the dictionary's templates with their
 * placeholders standing for the message's own parts. Unknown messages come back as they are.
 */
export function tb(message: string): string {
  if (locale === SOURCE_LOCALE || !message) return message;
  const exact = dict[message];
  if (exact) return exact;
  for (const { re, key } of templatePatterns()) {
    const m = re.exec(message);
    if (!m) continue;
    const order = [...key.matchAll(/\{(\d+)\}/g)].map((x) => Number(x[1]));
    const args: unknown[] = [];
    order.forEach((n, i) => {
      // A captured part that is itself a text of the interface (the verb in "{0} объекты ({1})") follows the language too.
      args[n] = dict[m[i + 1]] ?? m[i + 1];
    });
    return t(key, args);
  }
  return message;
}

/**
 * A module-scope table built from `t()` that follows the language: the
 * object is rebuilt the first time it is read after a switch. Reads,
 * `Object.keys`, iteration and array methods all go through to the fresh table.
 */
export function lazy<T extends object>(make: () => T): T {
  let built = version;
  let obj = make();
  const fresh = () => {
    if (built !== version) {
      obj = make();
      built = version;
    }
    return obj;
  };
  return new Proxy(obj, {
    get: (_, p) => Reflect.get(fresh(), p),
    has: (_, p) => Reflect.has(fresh(), p),
    ownKeys: () => Reflect.ownKeys(fresh()),
    getOwnPropertyDescriptor: (target, p) => {
      const d = Reflect.getOwnPropertyDescriptor(fresh(), p);
      if (!d) return undefined;
      const own = Reflect.getOwnPropertyDescriptor(target, p);
      if (!own || own.configurable) d.configurable = true;
      return d;
    },
    set: (_, p, v) => Reflect.set(fresh(), p, v),
  });
}

/** Re-renders the caller when the language changes and returns the current code. */
export function useLocale(): string {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return locale;
}
