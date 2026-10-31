// Finds the interface texts in the sources: the first argument of every
// `t("…")` / `tr("…")` call. Used by the dictionary test; the scripts in
// `scripts/i18n-*.cjs` carry the same logic for Node.

import ts from "typescript";

/** Source paths the dictionaries do not cover: tests and the autotest, which read Russian labels. */
export function isTranslatedSource(path: string): boolean {
  return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !/\/autotest\.ts$/.test(path) && !/\/wasm\//.test(path) && !/\.d\.ts$/.test(path);
}

/** Rust sources whose Russian strings reach the interface (not the assistant's CLI protocol, the MCP bridge or test fixtures). */
export function isTranslatedRustSource(path: string): boolean {
  return /\.rs$/.test(path) && !/assistant_cli\.rs$/.test(path) && !/mcp_bridge\.rs$/.test(path);
}

/**
 * The Russian string literals of a Rust file as dictionary keys: `{}`, `{name}` and `{:?}`
 * become `{0}`, `{1}`… in order, so `tb()` can match the formatted message against them.
 */
export function rustKeys(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    const raw = m[1];
    if (!/[Ѐ-ӿ]/.test(raw) || raw.includes("\\n")) continue;
    let n = 0;
    const key = raw
      .replace(/\\"/g, '"')
      .replace(/\{\{|\}\}/g, (b) => b[0])
      .replace(/\{[^{}]*\}/g, () => `{${n++}}`);
    out.push(key);
  }
  return out;
}

/** Map of text → the files that use it, from `path → source` pairs (TypeScript and Rust). */
export function collectKeys(sources: Record<string, string>): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  for (const [file, src] of Object.entries(sources)) {
    if (isTranslatedRustSource(file)) {
      for (const k of rustKeys(src)) {
        const list = keys.get(k) ?? [];
        list.push(file);
        keys.set(k, list);
      }
      continue;
    }
    if (!isTranslatedSource(file)) continue;
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && (node.expression.text === "t" || node.expression.text === "tr") && node.arguments.length) {
        const a = node.arguments[0];
        if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) {
          const list = keys.get(a.text) ?? [];
          list.push(file);
          keys.set(a.text, list);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return keys;
}
