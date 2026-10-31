// One-off codemod: wraps every Russian text in src in `t("…")` (JSX text,
// string literals, template literals → `t("… {0} …", [expr])`) and wraps
// module-scope tables that hold such texts in `lazy(() => …)`. Data strings
// (object keys, comparisons, switch cases, ids, class names…) are left
// alone and listed for review. Run with `--write` to change the files;
// without it, the script only reports.

const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "src");
const WRITE = process.argv.includes("--write");
const CYR = /[Ѐ-ӿ]/;
const SKIP_FILES = [/\.test\.tsx?$/, /[\\/]autotest\.ts$/, /[\\/]ui[\\/]ru\.ts$/, /[\\/]i18n[\\/]/, /[\\/]app[\\/]assistant\.ts$/, /[\\/]app[\\/]assistantTools\.ts$/, /[\\/]wasm[\\/]/, /\.d\.ts$/];
const DATA_PROPS = new Set(["id", "kind", "cat", "icon", "className", "target", "classname", "key", "hotkey", "keywords", "class", "path", "selector", "cmd", "font", "fontFamily", "type"]);
const DATA_ATTRS = new Set(["className", "key", "id", "name", "type", "href", "src", "style", "htmlFor", "value", "defaultValue", "icon", "font"]);
const LOGIC_METHODS = new Set([
  "includes",
  "startsWith",
  "endsWith",
  "indexOf",
  "split",
  "replace",
  "replaceAll",
  "localeCompare",
  "getItem",
  "setItem",
  "removeItem",
  "querySelector",
  "querySelectorAll",
  "getAttribute",
  "setAttribute",
  "closest",
  "matches",
  "test",
  "log",
  "warn",
  "error",
  "debug",
  "info",
  "has",
  "get",
  "set",
  "delete",
  "add",
]);
const COMPARE = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken]);

function listSources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listSources(p, out);
    else if (/\.tsx?$/.test(e.name) && !SKIP_FILES.some((re) => re.test(p))) out.push(p);
  }
  return out.sort();
}

/** Why a literal is data rather than a text to translate; null when it should be wrapped. */
function skipReason(node) {
  const p = node.parent;
  if (!p) return "root";
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return "import";
  if (ts.isLiteralTypeNode(p)) return "type";
  if (ts.isPropertyAssignment(p) && p.name === node) return "key";
  if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && DATA_PROPS.has(p.name.text)) return `prop:${p.name.text}`;
  if (ts.isComputedPropertyName(p)) return "key";
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return "index";
  if (ts.isCaseClause(p)) return "case";
  if (ts.isBinaryExpression(p) && COMPARE.has(p.operatorToken.kind)) return "compare";
  if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && LOGIC_METHODS.has(p.expression.name.text)) return `call:${p.expression.name.text}`;
  if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && (p.expression.text === "t" || p.expression.text === "tr" || p.expression.text === "lazy")) return "done";
  if (ts.isNewExpression(p) && p.expression.getText() === "RegExp") return "regexp";
  if (ts.isJsxAttribute(p) && DATA_ATTRS.has(p.name.getText())) return `attr:${p.name.getText()}`;
  if (ts.isJsxAttribute(p) && p.name.getText().startsWith("data-")) return "attr:data";
  if (ts.isTaggedTemplateExpression(p)) return "tagged";
  if (ts.isEnumMember(p)) return "enum";
  if (ts.isTypeNode(p)) return "type";
  return null;
}

function hasLocalT(sf) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isFunctionDeclaration(n) || ts.isBindingElement(n)) && n.name && ts.isIdentifier(n.name) && n.name.text === "t") found = true;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function render(src, s, e, edits) {
  const inside = edits.filter((x) => x.start >= s && x.end <= e);
  const top = inside.filter((ed) => !inside.some((o) => o !== ed && o.start <= ed.start && o.end >= ed.end && (o.start < ed.start || o.end > ed.end)));
  top.sort((a, b) => a.start - b.start);
  let out = "";
  let pos = s;
  for (const ed of top) {
    out += src.slice(pos, ed.start);
    out += ed.build((s2, e2) =>
      render(
        src,
        s2,
        e2,
        inside.filter((x) => x.start >= s2 && x.end <= e2 && x !== ed),
      ),
    );
    pos = ed.end;
  }
  return out + src.slice(pos, e);
}

function transform(file, report) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const T = hasLocalT(sf) ? "tr" : "t";
  const edits = [];
  const keys = new Set();
  const notes = [];
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const where = (n) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      if (CYR.test(node.text)) {
        const raw = src.slice(node.pos, node.end);
        const lead = raw.match(/^\s*/)[0];
        const trail = raw.match(/\s*$/)[0];
        const core = raw.slice(lead.length, raw.length - trail.length).replace(/\s*\n\s*/g, " ");
        const leadOut = lead.includes("\n") ? lead : lead ? '{" "}' : "";
        const trailOut = trail.includes("\n") ? trail : trail ? '{" "}' : "";
        keys.add(core);
        edits.push({ start: node.pos, end: node.end, build: () => `${leadOut}{${T}(${JSON.stringify(core)})}${trailOut}` });
      }
      return;
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && CYR.test(node.text)) {
      const why = skipReason(node);
      if (why) {
        if (why !== "done" && why !== "type" && why !== "import") notes.push(`${where(node)} ${why}: ${JSON.stringify(node.text).slice(0, 70)}`);
        return;
      }
      const inAttr = ts.isJsxAttribute(node.parent);
      keys.add(node.text);
      edits.push({ start: node.getStart(), end: node.end, build: () => (inAttr ? `{${T}(${JSON.stringify(node.text)})}` : `${T}(${JSON.stringify(node.text)})`) });
      return;
    }
    if (ts.isTemplateExpression(node) && (CYR.test(node.head.text) || node.templateSpans.some((sp) => CYR.test(sp.literal.text)))) {
      const why = skipReason(node);
      if (why) {
        if (why !== "done") notes.push(`${where(node)} ${why}: ${JSON.stringify(src.slice(node.getStart(), node.end)).slice(0, 70)}`);
        ts.forEachChild(node, visit);
        return;
      }
      let key = node.head.text;
      node.templateSpans.forEach((sp, i) => {
        key += `{${i}}` + sp.literal.text;
      });
      keys.add(key);
      const inAttr = ts.isJsxAttribute(node.parent);
      edits.push({
        start: node.getStart(),
        end: node.end,
        build: (inner) => {
          const args = node.templateSpans.map((sp) => inner(sp.expression.getStart(), sp.expression.end)).join(", ");
          const call = `${T}(${JSON.stringify(key)}, [${args}])`;
          return inAttr ? `{${call}}` : call;
        },
      });
      ts.forEachChild(node, visit);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Module-scope tables with translated texts follow the language through lazy().
  let needLazy = false;
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!d.initializer) continue;
      let init = d.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression?.(init) || ts.isParenthesizedExpression(init)) init = init.expression;
      const has = edits.some((e) => e.start >= d.initializer.getStart() && e.end <= d.initializer.end);
      if (!has) continue;
      if (ts.isObjectLiteralExpression(init) || ts.isArrayLiteralExpression(init) || ts.isNewExpression(init)) {
        needLazy = true;
        const s = d.initializer.getStart();
        const e = d.initializer.end;
        edits.push({ start: s, end: e, build: (inner) => `lazy(() => (${inner(s, e)}))` });
      } else if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init) || ts.isTemplateExpression(init) || ts.isBinaryExpression(init) || ts.isConditionalExpression(init)) {
        notes.push(`${where(d)} MODULE-SCOPE VALUE (stale after a language switch): ${d.name.getText()}`);
      } else if (ts.isCallExpression(init)) {
        notes.push(`${where(d)} module-scope call with texts: ${d.name.getText()}`);
      }
    }
  }

  if (!edits.length) return { rel, count: 0, keys, notes };
  let out = render(src, 0, src.length, edits);
  // The import, after the last one at the top.
  const imports = sf.statements.filter(ts.isImportDeclaration);
  const names = [T === "tr" ? "t as tr" : "t", ...(needLazy ? ["lazy"] : [])];
  let relImport = path.relative(path.dirname(file), path.join(ROOT, "i18n")).replace(/\\/g, "/");
  if (!relImport.startsWith(".")) relImport = "./" + relImport;
  const line = `import { ${names.join(", ")} } from "${relImport}";`;
  if (imports.length) {
    const last = imports[imports.length - 1];
    const endInOut = out.indexOf(src.slice(last.getStart(), last.end)) + (last.end - last.getStart());
    out = out.slice(0, endInOut) + "\n" + line + out.slice(endInOut);
  } else {
    // After the leading comment block, if any.
    const firstStmt = sf.statements[0];
    const at = firstStmt ? firstStmt.getStart() : 0;
    const head = out.slice(0, at);
    out = head + line + "\n\n" + out.slice(at);
  }
  if (WRITE) {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, out, "utf8");
    fs.renameSync(tmp, file);
  }
  return { rel, count: edits.length, keys, notes };
}

const all = new Set();
const notes = [];
const rows = [];
for (const f of listSources(ROOT)) {
  const r = transform(f, notes);
  if (r.count) rows.push(`${String(r.count).padStart(4)} ${r.rel}`);
  r.keys.forEach((k) => all.add(k));
  notes.push(...r.notes);
}
console.log(rows.join("\n"));
console.log(`\n${all.size} unique texts${WRITE ? " (files written)" : " (dry run)"}`);
console.log("\nLeft alone:\n" + notes.join("\n"));
