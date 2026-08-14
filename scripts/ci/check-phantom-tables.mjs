#!/usr/bin/env node
/**
 * check-phantom-tables.mjs — Phase U4.2
 * ─────────────────────────────────────────────────────────────────────────
 * Fails CI when the codebase queries a Postgres table that does not exist.
 *
 * WHY
 * A `.from('does_not_exist')` does not throw at build time and usually does
 * not throw at runtime either — PostgREST returns a `42P01` in the `error`
 * channel, and the overwhelmingly common call shape in this repo is:
 *
 *     const { error } = await supabase.from('training_moves').insert(rows);
 *     if (error) console.warn('Failed to save moves:', error);
 *
 * So the write is silently discarded forever and nothing surfaces. Three
 * such tables were live when this script was written (see below), one of
 * them dropping every individual training move the app recorded.
 *
 * HOW IT RESOLVES THE TABLE LIST
 * Via the PostgREST OpenAPI document (`GET /rest/v1/` with the service key),
 * NOT a direct Postgres connection. That is deliberate: `SUPABASE_DB_PASSWORD`
 * in this repo is stale and fails authentication, whereas the service key
 * works, and CI already has it. It also means this script needs no `pg`
 * dependency and no database credentials beyond what CI already holds.
 *
 * Caveat of that choice: the OpenAPI document lists what PostgREST EXPOSES.
 * A table that exists but is not exposed to the API schema would be reported
 * as phantom. That is arguably still worth flagging (client code cannot
 * reach it), but if it ever bites, add it to the allowlist with a reason.
 *
 * FALSE POSITIVES THIS DELIBERATELY AVOIDS
 * A checker that cries wolf gets ignored — this repo already had a health
 * monitor that reported `0/8_HEALTHY` permanently and was therefore useless.
 * So it excludes, with evidence rather than guesswork:
 *
 *   1. COMMENTS.  `* const { data } = await supabase.from('posts')...` in a
 *      docblock is not a query. Comments are stripped before matching.
 *   2. STORAGE BUCKETS.  `supabase.storage.from('uploads')` is a bucket, not
 *      a table — and the call is frequently split across lines, so a naive
 *      same-line regex misses it.
 *   3. OTHER SUPABASE PROJECTS.  `pages/api/mlb/**` reads the separate
 *      `mlb-analytics-engine` project (agg_*, dim_*, fact_*, raw_*, pred_*).
 *      Those tables are real, just not in this database.
 *
 * USAGE
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *     node scripts/ci/check-phantom-tables.mjs
 *
 *   --warn-only   exit 0 even on findings (Phase U4.3 rollout period)
 *   --json        machine-readable output
 *
 * Exceptions live in scripts/ci/supabase-invariants.allowlist.json.
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

// Paths whose Supabase client points at a DIFFERENT project.
const FOREIGN_PROJECT_PATHS = [
  'pages/api/mlb/',
  'src/lib/mlb_data',
];

// Client identifiers that hold a connection to a DIFFERENT Supabase project.
// Path-based exclusion alone is too brittle: pages/api/cron/mlb-hr-cache-refresh.js
// lives outside pages/api/mlb/** but calls `mlbDb.from('agg_pitcher')` on a
// client from getMlbSupabase(). Matching the RECEIVER is what actually
// distinguishes "different database" from "missing table".
const FOREIGN_CLIENT_IDENTIFIERS = new Set([
  'mlbDb',
  'mlbSupabase',
  'mlbdb',
]);

// ─────────────────────────────────────────────────────────────────────────
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
    } else if (EXTS.has(path.extname(e.name))) {
      out.push(p);
    }
  }
  return out;
}

/**
 * `.from('x')` where the receiver is NOT `.storage`.
 *
 * `[\s\S]{0,40}?` before `.from` lets the match see across a newline, because
 * the storage form is routinely written as:
 *     await supabase.storage
 *         .from('uploads')
 * A same-line negative lookbehind would miss that and report every bucket.
 */
const FROM_RE = /([A-Za-z_$][A-Za-z0-9_$]*)?\s*(?:\(\))?\s*(\.\s*storage)?\s*\.\s*from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;

function referencesIn(src) {
  const found = new Map(); // table -> Set(lineNumber)
  const clean = stripComments(src);
  const lineOf = (idx) => clean.slice(0, idx).split('\n').length;
  let m;
  FROM_RE.lastIndex = 0;
  while ((m = FROM_RE.exec(clean)) !== null) {
    const receiver = m[1] || '';
    const isStorage = !!m[2];
    const table = m[3];

    // supabase.storage.from('bucket') is a storage bucket, not a table. The
    // call is routinely split across lines, which is why the regex tolerates
    // whitespace rather than matching on a single line.
    if (isStorage || receiver === 'storage') continue;

    // A client pointed at another Supabase project.
    if (FOREIGN_CLIENT_IDENTIFIERS.has(receiver)) continue;

    if (!found.has(table)) found.set(table, new Set());
    found.get(table).add(lineOf(m.index));
  }
  return found;
}

async function fetchExposedTables() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      'check-phantom-tables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.\n' +
      'Skipping is NOT safe here — an unresolvable table list would silently pass every phantom.'
    );
    process.exit(2);
  }
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
  });
  if (!res.ok) {
    console.error(`check-phantom-tables: PostgREST returned ${res.status} for the schema document.`);
    process.exit(2);
  }
  const doc = await res.json();
  const tables = new Set();
  for (const p of Object.keys(doc.paths || {})) {
    const name = p.replace(/^\//, '');
    if (name && !name.startsWith('rpc/')) tables.add(name);
  }
  if (tables.size === 0) {
    console.error('check-phantom-tables: schema document listed ZERO tables — refusing to pass vacuously.');
    process.exit(2);
  }
  return tables;
}

function loadAllowlist() {
  try {
    const j = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
    return new Map(Object.entries(j.phantom_tables || {}));
  } catch {
    return new Map();
  }
}

// ─────────────────────────────────────────────────────────────────────────
const exposed = await fetchExposedTables();
const allow = loadAllowlist();

const refs = new Map(); // table -> [ "file:line", ... ]
for (const dir of SCAN_DIRS) {
  for (const file of walk(path.join(REPO_ROOT, dir))) {
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
    if (FOREIGN_PROJECT_PATHS.some((p) => rel.startsWith(p))) continue;
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (!src.includes('.from(')) continue;
    for (const [table, lines] of referencesIn(src)) {
      if (!refs.has(table)) refs.set(table, []);
      for (const ln of lines) refs.get(table).push(`${rel}:${ln}`);
    }
  }
}

const phantom = [];
const staleAllow = [];
for (const [table, sites] of refs) {
  const missing = !exposed.has(table);
  if (missing && !allow.has(table)) phantom.push({ table, sites });
}
for (const [table, reason] of allow) {
  if (exposed.has(table)) staleAllow.push({ table, reason });
}

if (AS_JSON) {
  console.log(JSON.stringify({ phantom, staleAllow, scanned: refs.size, exposed: exposed.size }, null, 2));
} else {
  console.log(`check-phantom-tables: ${refs.size} distinct tables referenced, ${exposed.size} exposed by the API.`);
  if (phantom.length) {
    console.error(`\n${phantom.length} PHANTOM TABLE(S) — queried in code, absent from the database:\n`);
    for (const { table, sites } of phantom) {
      console.error(`  ${table}`);
      for (const s of sites.slice(0, 5)) console.error(`      ${s}`);
      if (sites.length > 5) console.error(`      ...and ${sites.length - 5} more`);
    }
    console.error(
      '\nThese queries fail with 42P01 at runtime. Call sites in this repo almost\n' +
      'always swallow that into console.warn, so the write is lost silently.\n' +
      'Fix: create the table, correct the name, or — if it is genuinely served\n' +
      'elsewhere — add it to scripts/ci/supabase-invariants.allowlist.json with a reason.'
    );
  }
  if (staleAllow.length) {
    console.error(`\n${staleAllow.length} STALE ALLOWLIST ENTR(IES) — these tables now exist and must be removed:`);
    for (const { table } of staleAllow) console.error(`  ${table}`);
  }
  if (!phantom.length && !staleAllow.length) console.log('OK — no phantom tables.');
}

const failed = phantom.length > 0 || staleAllow.length > 0;
process.exit(failed && !WARN_ONLY ? 1 : 0);
