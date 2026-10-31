// Collects the source texts the interface translates: the first argument of
// every `t("…")` / `tr("…")` call in src (tests and the autotest excluded).
// Used by `i18n.test.ts` to check the dictionaries and by `i18n-report.cjs`.

const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const SKIP = [/\.test\.tsx?$/, /[\\/]autotest\.ts$/, /[\\/]wasm[\\/]/, /\.d\.ts$/];

function listSources(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !SKIP.some((re) => re.test(p))) out.push(p);
    }
  };
  walk(root);
  return out.sort();
}

/** The Russian literals of a Rust file as keys, placeholders made positional (same rule as src/i18n/collect.ts). */
function rustKeys(src) {
  const out = [];
  for (const m of src.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    const raw = m[1];
    if (!/[\u0400-\u04ff]/.test(raw) || raw.includes("\\n")) continue;
    let n = 0;
    out.push(
      raw
        .replace(/\\"/g, '"')
        .replace(/\{\{|\}\}/g, (b) => b[0])
        .replace(/\{[^{}]*\}/g, () => `{${n++}}`),
    );
  }
  return out;
}

/** The shell's sources and the core crates whose labels and messages reach the interface. */
function listRustSources(root) {
  const dir = path.join(root, "..", "src-tauri", "src");
  const shell = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".rs") && f !== "assistant_cli.rs" && f !== "mcp_bridge.rs")
        .map((f) => path.join(dir, f))
    : [];
  const crates = ["map-model", "map-core-wasm"].map((c) => path.join(root, "..", "..", "..", "crates", c, "src", "lib.rs")).filter((f) => fs.existsSync(f));
  return [...shell, ...crates].sort();
}

/** Map of key → list of "file:line" where it is used. */
function collectKeys(root) {
  const keys = new Map();
  for (const file of listRustSources(root)) {
    const rel = path.relative(root, file).replace(/\\/g, "/");
    for (const k of rustKeys(fs.readFileSync(file, "utf8"))) {
      if (!keys.has(k)) keys.set(k, []);
      keys.get(k).push(rel);
    }
  }
  for (const file of listSources(root)) {
    const src = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && (node.expression.text === "t" || node.expression.text === "tr") && node.arguments.length) {
        const a = node.arguments[0];
        if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) {
          const line = sf.getLineAndCharacterOfPosition(a.getStart()).line + 1;
          const rel = path.relative(root, file).replace(/\\/g, "/");
          if (!keys.has(a.text)) keys.set(a.text, []);
          keys.get(a.text).push(`${rel}:${line}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return keys;
}

module.exports = { collectKeys, listSources };
