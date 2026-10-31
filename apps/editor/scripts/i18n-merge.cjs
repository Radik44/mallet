// Merges translator output (several part files per language) into
// src/i18n/locales/<code>.json in the order the texts appear in the sources,
// dropping keys that no longer exist and reporting what is missing or has
// broken placeholders. Usage: node scripts/i18n-merge.cjs <outDir> [code…]
//   <outDir>/<code>/part-*.json  →  src/i18n/locales/<code>.json

const fs = require("fs");
const path = require("path");
const { collectKeys } = require("./i18n-keys.cjs");

const args = process.argv.slice(2);
// --renames <file>: texts renamed in the sources after translation ({ old: new }); the translations move along.
const ri = args.indexOf("--renames");
const renames = ri >= 0 ? JSON.parse(fs.readFileSync(args[ri + 1], "utf8")) : {};
if (ri >= 0) args.splice(ri, 2);
const [outDir, ...only] = args;
if (!outDir) {
  console.error("usage: node scripts/i18n-merge.cjs [--renames renames.json] <outDir> [code…]");
  process.exit(2);
}
const keys = collectKeys(path.join(__dirname, "..", "src"));
const localesDir = path.join(__dirname, "..", "src", "i18n", "locales");
fs.mkdirSync(localesDir, { recursive: true });

const codes = only.length ? only : fs.readdirSync(outDir).filter((d) => fs.statSync(path.join(outDir, d)).isDirectory());
for (const code of codes) {
  const dir = path.join(outDir, code);
  const merged = {};
  for (const f of fs
    .readdirSync(dir)
    .filter((f) => /^part-\d+\.json$/.test(f))
    .sort()) {
    let obj;
    try {
      obj = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch (e) {
      console.error(`${code}/${f}: ${e.message}`);
      continue;
    }
    Object.assign(merged, obj);
  }
  for (const [oldKey, newKey] of Object.entries(renames)) if (oldKey in merged && !(newKey in merged)) merged[newKey] = merged[oldKey];
  // Also keep what the existing dictionary already has (hand-made additions).
  const target = path.join(localesDir, `${code}.json`);
  const existing = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, "utf8")) : {};
  const out = {};
  const missing = [];
  const badPlaceholders = [];
  for (const k of keys.keys()) {
    const v = merged[k] ?? existing[k];
    if (!v || typeof v !== "string") {
      missing.push(k);
      continue;
    }
    const want = [...k.matchAll(/\{(\d+)\}/g)]
      .map((m) => m[1])
      .sort()
      .join();
    const got = [...v.matchAll(/\{(\d+)\}/g)]
      .map((m) => m[1])
      .sort()
      .join();
    if (want !== got) badPlaceholders.push(`${k} → ${v}`);
    out[k] = v;
  }
  const stale = Object.keys(merged).filter((k) => !keys.has(k));
  fs.writeFileSync(target, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`${code}: ${Object.keys(out).length}/${keys.size} translated, ${missing.length} missing, ${stale.length} stale dropped, ${badPlaceholders.length} placeholder problems`);
  if (missing.length) fs.writeFileSync(path.join(dir, "missing.json"), JSON.stringify(missing, null, 2), "utf8");
  for (const b of badPlaceholders.slice(0, 10)) console.log(`  ! ${b}`);
}
