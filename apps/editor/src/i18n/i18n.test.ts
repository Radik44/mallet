// The dictionaries against the sources: every translated text still exists
// in the code (no stale keys) and every text in the code has a translation
// in each dictionary; placeholders survive translation.

import { describe, expect, it } from "vitest";
import { LANGUAGES, SOURCE_LOCALE, applyLocale, lazy, t, tb } from "./index";
import { collectKeys } from "./collect";

const sources = import.meta.glob<string>("../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });
const rust = import.meta.glob<string>("../../src-tauri/src/*.rs", { query: "?raw", import: "default", eager: true });
// The core's undo labels, visgroup names and map-check messages reach the interface through `tb()`.
const core = import.meta.glob<string>("../../../../crates/{map-model,map-core-wasm}/src/lib.rs", { query: "?raw", import: "default", eager: true });
const keys = collectKeys({ ...sources, ...rust, ...core });
const dictionaries = import.meta.glob<Record<string, string>>("./locales/*.json", { import: "default", eager: true });
const dictionary = (code: string) => dictionaries[`./locales/${code}.json`];

describe("i18n", () => {
  it("formats placeholders and falls back to the source text", () => {
    expect(t("{0} брашей, {1} граней", [3, "12"])).toBe("3 брашей, 12 граней");
    expect(t("Новая карта…")).toBe("Новая карта…");
    expect(t("{1} до {0}", [1])).toBe("{1} до 1");
  });

  it("lazy tables behave like their object", () => {
    const table = lazy(() => ({ a: t("Выбор"), b: "x" }));
    expect(table.a).toBe("Выбор");
    expect(Object.keys(table)).toEqual(["a", "b"]);
    expect({ ...table }).toEqual({ a: "Выбор", b: "x" });
    const list = lazy(() => [t("обе части"), t("передняя часть")]);
    expect(list.length).toBe(2);
    expect(list.map((s) => s.length)).toEqual([9, 14]);
    expect([...list]).toEqual(["обе части", "передняя часть"]);
  });

  it("finds the interface texts in the sources", () => {
    expect(keys.size).toBeGreaterThan(2000);
    expect(keys.has("Новая карта…")).toBe(true);
    expect(keys.has("{0} завершился с кодом {1}")).toBe(true); // from compile.rs
    expect([...keys.keys()].some((k) => k.includes("ФОРМАТ ОТВЕТА"))).toBe(false); // assistant_cli.rs stays out
  });

  it("translates backend messages by template", async () => {
    await applyLocale("en");
    try {
      expect(tb("vbsp завершился с кодом 1")).toBe("vbsp exited with code 1");
      expect(tb("C:/maps/x.bsp: BSP не найден, сначала соберите карту")).toBe("C:/maps/x.bsp: BSP not found, compile the map first");
      expect(tb("сборка отменена")).toBe("compile cancelled");
      expect(tb("something unknown")).toBe("something unknown");
    } finally {
      await applyLocale(SOURCE_LOCALE);
    }
  });

  const codes = LANGUAGES.map((l) => l.code).filter((c) => c !== SOURCE_LOCALE);
  it("has a dictionary for every language", () => {
    for (const code of codes) expect(dictionary(code), code).toBeTruthy();
  });

  for (const code of codes) {
    const dict = dictionary(code);
    if (!dict) continue;
    describe(code, () => {
      it("has no stale keys", () => {
        const stale = Object.keys(dict).filter((k) => !keys.has(k));
        expect(stale, `stale: ${stale.slice(0, 5).join(" | ")}`).toEqual([]);
      });
      it("translates every text", () => {
        const missing = [...keys.keys()].filter((k) => !(k in dict) || !dict[k]);
        expect(missing, `missing: ${missing.slice(0, 5).join(" | ")}`).toEqual([]);
      });
      it("keeps the placeholders", () => {
        const bad = Object.entries(dict).filter(([k, v]) => {
          const want = [...k.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort();
          const got = [...v.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort();
          return want.join() !== got.join();
        });
        expect(
          bad.map(([k]) => k),
          `placeholders: ${bad
            .slice(0, 3)
            .map(([k, v]) => `${k} → ${v}`)
            .join(" | ")}`,
        ).toEqual([]);
      });
    });
  }
});
