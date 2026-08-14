#!/usr/bin/env node
/**
 * check-phantom-columns.mjs — CHECK 13
 * ─────────────────────────────────────────────────────────────────────────
 * Fails CI when code references a COLUMN that does not exist on the table it
 * queries. The column-level twin of check-phantom-tables (CHECK 11).
 *
 * WHY THIS EXISTS (2026-08-14)
 * Hours after cron telemetry went live, its first catch was
 * /api/cron/yt-pipeline-recovery failing EVERY 15-minute tick since it
 * shipped: it selected `video_transcode_jobs.attempts` and wrote
 * `locked_at` — neither column existed. 42703 on a column behaves exactly
 * like 42P01 on a table: no build error, an `error` object the call site
 * swallows, and a feature that silently never works. CHECK 11 cannot see it
 * because the TABLE exists. This gate closes that class.
 *
 * HOW IT KNOWS THE SCHEMA
 * The PostgREST OpenAPI document (same source as CHECK 11) carries a
 * `definitions` block with per-table `properties` — the live column list for
 * all ~764 exposed tables. No direct Postgres connection needed.
 *
 * HOW IT READS THE CODE — deliberately conservative
 * A column checker's false positives are far more dangerous than its false
 * negatives, because a gate that cries wolf gets disabled. So it only
 * examines what it can parse with certainty, walking each `.from('t')` call
 * chain:
 *
 *   - .select('a, b, c')     only when the string has NO parentheses — an
 *                            embed like `profiles:owner_id(...)` mixes other
 *                            tables' columns in, so those selects are skipped
 *                            wholesale. `alias:col` takes the col. Entries
 *                            containing * -> . " ! are skipped.
 *   - .eq/.neq/.gt/.gte/.lt/.lte/.like/.ilike/.is/.in/.contains/.order/
 *     .filter/.not           first argument, only when it is a plain string
 *                            literal identifier (no dots — `group.x` targets
 *                            an embedded table; no ->> json paths).
 *   - .insert({...})/.update({...})/.upsert({...})
 *                            literal object keys only. Spreads and computed
 *                            keys contribute nothing (and do not disqualify
 *                            the literal keys beside them).
 *
 * Chains through variables (`const q = supabase.from(...); q.eq(...)`) are
 * NOT followed — out of scope, by design.
 *
 * Shares CHECK 11's exclusions: comments stripped, storage buckets, foreign
 * Supabase clients (mlbDb et al), foreign project paths, and the shared
 * allowlist (`phantom_columns`, keyed "table.column", reasons mandatory).
 *
 * USAGE
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *     node scripts/ci/check-phantom-columns.mjs [--warn-only] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'scripts', 'ci', 'supabase-invariants.allowlist.json');
const WARN_ONLY = process.argv.includes('--warn-only');
const AS_JSON = process.argv.includes('--json');

const SCAN_DIRS = ['pages/api', 'src', 'server'];
const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);
const FOREIGN_PROJECT_PATHS = ['pages/api/mlb/', 'src/lib/mlb_data'];
const FOREIGN_CLIENT_IDENTIFIERS = new Set(['mlbDb', 'mlbSupabase', 'mlbdb']);

const FILTER_METHODS = new Set([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
  'contains', 'containedBy', 'order', 'not',
]);
const WRITE_METHODS = new Set(['insert', 'update', 'upsert']);
const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function stripComments(src) {
  let out = '';
  let mode = 'code';
  for (let i = 0; i < src.length;) {
    const c = src[i];
    const d = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && d === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; i += 2; continue; }
      if (c === "'") mode = 'sq';
      else if (c === '"') mode = 'dq';
      else if (c === '`') mode = 'tpl';
      out += c; i += 1; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c; } i += 1; continue; }
    if (mode === 'block') { if (c === '*' && d === '/') { mode = 'code'; i += 2; continue; } if (c === '\n') out += c; i += 1; continue; }
    if (c === '\\') { out += c + (d === undefined ? '' : d); i += 2; continue; }
    if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'tpl' && c === '`')) mode = 'code';
    out += c; i += 1;
  }
  return out;
}

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.next', '.git', 'dist', 'build'].includes(e.name)) continue;
      walk(p, out);
    } else if (EXTS.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

/** Extract a balanced-paren argument list starting at `(`; returns [inner, endIndex]. */
function balanced(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return [src.slice(openIdx + 1, i), i];
    }
  }
  return [null, -1];
}

/** Column names from a .select('...') string. Empty array when unparseable. */
function selectColumns(arg) {
  const m = arg.match(/^\s*['"`]([\s\S]*?)['"`]\s*(,|$)/);
  if (!m) return [];
  const body = m[1];
  if (body.includes('(')) return []; // embeds mix in other tables' columns
  const cols = [];
  for (let part of body.split(',')) {
    part = part.trim();
    if (!part || part === '*') continue;
    if (part.includes(':')) part = part.split(':').pop().trim(); // alias:col
    if (/[*.>"!\s]/.test(part)) continue; // json paths, casts, embeds, oddities
    if (IDENT.test(part)) cols.push(part);
  }
  return cols;
}

/** First-arg column from a filter method. null when not a plain identifier. */
function filterColumn(arg) {
  const m = arg.match(/^\s*['"]([^'"]+)['"]/);
  if (!m) return null;
  const col = m[1];
  if (col.includes('.') || col.includes('->') || col.includes('(')) return null;
  return IDENT.test(col) ? col : null;
}

/** Literal object keys from insert/update/upsert first argument. */
function writeColumns(arg) {
  const t = arg.trim();
  let objSrc = null;
  if (t.startsWith('{')) {
    const [inner] = balancedBrace(t, 0);
    objSrc = inner;
  } else if (t.startsWith('[')) {
    const b = t.indexOf('{');
    if (b !== -1) { const [inner] = balancedBrace(t, b); objSrc = inner; }
  }
  if (objSrc == null) return [];
  const cols = [];
  // top-level keys only: track depth
  let depth = 0;
  for (const line of objSrc.split(',')) void line; // (split is unreliable; scan instead)
  let i = 0;
  let expectKey = true;
  while (i < objSrc.length) {
    const c = objSrc[i];
    if (c === '{' || c === '[' || c === '(') { depth++; i++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; i++; continue; }
    if (depth === 0 && expectKey) {
      const rest = objSrc.slice(i);
      const km = rest.match(/^\s*(?:['"]?([a-zA-Z_][a-zA-Z0-9_]*)['"]?)\s*:/);
      if (km) { cols.push(km[1]); i += km[0].length; expectKey = false; continue; }
      const sm = rest.match(/^\s*\.\.\./); // spread — unknown keys, skip it
      if (sm) { i += sm[0].length; expectKey = false; continue; }
    }
    if (depth === 0 && c === ',') { expectKey = true; i++; continue; }
    i++;
  }
  return cols.filter((c) => IDENT.test(c));
}

function balancedBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return [src.slice(openIdx + 1, i), i]; }
  }
  return [null, -1];
}

const FROM_RE = /([A-Za-z_$][A-Za-z0-9_$]*)?\s*(?:\(\))?\s*(\.\s*storage)?\s*\.\s*from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;

/** Walk one file: table -> Map(column -> [lines]). */
function columnRefs(src) {
  const clean = stripComments(src);
  const found = new Map();
  const lineOf = (idx) => clean.slice(0, idx).split('\n').length;
  let m;
  FROM_RE.lastIndex = 0;
  while ((m = FROM_RE.exec(clean)) !== null) {
    const receiver = m[1] || '';
    if (m[2] || receiver === 'storage') continue;
    if (FOREIGN_CLIENT_IDENTIFIERS.has(receiver)) continue;
    const table = m[3];

    // Walk the chained method calls that follow.
    let pos = m.index + m[0].length;
    for (;;) {
      const rest = clean.slice(pos);
      const cm = rest.match(/^\s*\.\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
      if (!cm) break;
      const method = cm[1];
      const openIdx = pos + cm[0].length - 1;
      const [arg, endIdx] = balanced(clean, openIdx);
      if (arg == null) break;

      let cols = [];
      if (method === 'select') cols = selectColumns(arg);
      else if (FILTER_METHODS.has(method)) {
        const c = filterColumn(arg);
        if (c) cols = [c];
      } else if (WRITE_METHODS.has(method)) cols = writeColumns(arg);

      for (const col of cols) {
        if (!found.has(table)) found.set(table, new Map());
        const tm = found.get(table);
        if (!tm.has(col)) tm.set(col, []);
        tm.get(col).push(lineOf(pos));
      }
      pos = endIdx + 1;
    }
  }
  return found;
}

async function fetchSchema() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('check-phantom-columns: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
    process.exit(2);
  }
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
  });
  if (!res.ok) {
    console.error(`check-phantom-columns: PostgREST returned ${res.status}.`);
    process.exit(2);
  }
  const doc = await res.json();
  const defs = doc.definitions || {};
  const schema = new Map();
  for (const [table, def] of Object.entries(defs)) {
    schema.set(table, new Set(Object.keys(def.properties || {})));
  }
  if (schema.size === 0) {
    console.error('check-phantom-columns: zero table definitions — refusing to pass vacuously.');
    process.exit(2);
  }
  return schema;
}

function loadAllowlist() {
  try {
    const j = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
    return new Map(Object.entries(j.phantom_columns || {}));
  } catch { return new Map(); }
}

// ─────────────────────────────────────────────────────────────────────────
const schema = await fetchSchema();
const allow = loadAllowlist();

const refs = new Map(); // "table.column" -> [file:line]
for (const dir of SCAN_DIRS) {
  for (const file of walk(path.join(REPO_ROOT, dir))) {
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    if (FOREIGN_PROJECT_PATHS.some((p) => rel.startsWith(p))) continue;
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (!src.includes('.from(')) continue;
    for (const [table, cols] of columnRefs(src)) {
      if (!schema.has(table)) continue; // phantom TABLE — CHECK 11's problem
      for (const [col, lines] of cols) {
        const key = `${table}.${col}`;
        if (!refs.has(key)) refs.set(key, []);
        for (const ln of lines) refs.get(key).push(`${rel}:${ln}`);
      }
    }
  }
}

const phantom = [];
const staleAllow = [];
for (const [key, sites] of refs) {
  const [table, col] = key.split('.');
  if (schema.get(table).has(col)) continue;
  if (allow.has(key)) continue;
  phantom.push({ key, sites });
}
for (const key of allow.keys()) {
  const [table, col] = key.split('.');
  if (schema.has(table) && schema.get(table).has(col)) staleAllow.push(key);
}

if (AS_JSON) {
  console.log(JSON.stringify({ phantom, staleAllow, checked: refs.size }, null, 2));
} else {
  console.log(`check-phantom-columns: ${refs.size} table.column references checked against ${schema.size} live tables.`);
  if (phantom.length) {
    console.error(`\n${phantom.length} PHANTOM COLUMN(S) — referenced in code, absent from the live table:\n`);
    for (const { key, sites } of phantom.sort((a, b) => a.key.localeCompare(b.key))) {
      console.error(`  ${key}`);
      for (const s of sites.slice(0, 4)) console.error(`      ${s}`);
      if (sites.length > 4) console.error(`      ...and ${sites.length - 4} more`);
    }
    console.error(
      '\nThese fail with 42703 at runtime; call sites almost always swallow it,\n' +
      'so the feature silently never works — yt-pipeline-recovery failed every\n' +
      'tick since it shipped this exact way. Fix the code, add the column, or\n' +
      'allowlist "table.column" with a reason in supabase-invariants.allowlist.json.'
    );
  }
  if (staleAllow.length) {
    console.error(`\n${staleAllow.length} STALE ALLOWLIST ENTR(IES) — column now exists, remove:`);
    for (const k of staleAllow) console.error(`  ${k}`);
  }
  if (!phantom.length && !staleAllow.length) console.log('OK — no phantom columns.');
}
process.exit((phantom.length || staleAllow.length) && !WARN_ONLY ? 1 : 0);
