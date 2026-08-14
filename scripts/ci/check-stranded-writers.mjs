#!/usr/bin/env node
/**
 * check-stranded-writers.mjs — Phase U4.1
 * ─────────────────────────────────────────────────────────────────────────
 * Fails CI when `src/services/*` READS a table that nothing ever WRITES from
 * a trusted server-side path.
 *
 * WHY
 * A table that is read but never written is not a crash — it is a feature
 * that renders an empty state forever. That failure mode is invisible in
 * review and indistinguishable from "no data yet", which is exactly how it
 * survives. This repo has shipped several: a public posts endpoint that was
 * fully built, rate-limited and privacy-filtered but returned `[]` forever
 * because no writer existed; and a cron health dashboard that could never
 * report a healthy job because `cron_health_log` had no writer at all.
 *
 * `check-phantom-tables.mjs` (U4.2) catches tables that do not EXIST. This
 * catches tables that exist but have no supply.
 *
 * WHAT COUNTS AS A WRITE
 * `.insert(`, `.upsert(`, `.update(`, `.delete(` on the table, anywhere the
 * write is trusted: `pages/api/**`, `server/**`, `scripts/**`,
 * `supabase/**` (SQL seeds/migrations), or a DB trigger/RPC recorded in a
 * migration. Client-side writes in `src/` also count — they are still a
 * supply — but a table with ONLY client writes and no server write is
 * reported as a warning, not a failure, because RLS may legitimately allow
 * it.
 *
 * Deliberately NOT reported (learned from a monitor in this repo that cried
 * wolf permanently and was therefore ignored):
 *   - comments (stripped before matching)
 *   - `storage.from('bucket')` — buckets are not tables
 *   - clients pointed at another Supabase project
 *   - anything in scripts/ci/supabase-invariants.allowlist.json
 *
 * USAGE
 *   node scripts/ci/check-stranded-writers.mjs [--warn-only] [--json]
 *
 * Needs no database access — it is pure static analysis.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'scripts', 'ci', 'supabase-invariants.allowlist.json');
const WARN_ONLY = process.argv.includes('--warn-only');
const AS_JSON = process.argv.includes('--json');

const READ_SCAN_DIRS = ['src/services'];
const SERVER_WRITE_DIRS = ['pages/api', 'server', 'scripts', 'supabase'];
const CLIENT_WRITE_DIRS = ['src'];
const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.sql']);

const FOREIGN_PROJECT_PATHS = ['pages/api/mlb/', 'src/lib/mlb_data'];
const FOREIGN_CLIENT_IDENTIFIERS = new Set(['mlbDb', 'mlbSupabase', 'mlbdb']);

function stripComments(src) {
  let out = '';
  let mode = 'code';
  for (let i = 0; i < src.length;) {
    const c = src[i];
    const d = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && d === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; i += 2; continue; }
      if (c === '-' && d === '-') { mode = 'line'; i += 2; continue; } // SQL
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

const FROM_RE = /([A-Za-z_$][A-Za-z0-9_$]*)?\s*(?:\(\))?\s*(\.\s*storage)?\s*\.\s*from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;
// A write is the mutating verb chained after .from(...), within a short window.
const WRITE_AFTER = /^\s*(?:\/\/[^\n]*\n\s*)*\.\s*(insert|upsert|update|delete)\s*\(/;

function tablesIn(src, { writesOnly = false } = {}) {
  const clean = stripComments(src);
  const found = new Map();
  let m;
  FROM_RE.lastIndex = 0;
  while ((m = FROM_RE.exec(clean)) !== null) {
    const receiver = m[1] || '';
    if (m[2] || receiver === 'storage') continue;
    if (FOREIGN_CLIENT_IDENTIFIERS.has(receiver)) continue;
    const table = m[3];
    if (writesOnly) {
      const tail = clean.slice(m.index + m[0].length, m.index + m[0].length + 120);
      if (!WRITE_AFTER.test(tail)) continue;
    }
    const line = clean.slice(0, m.index).split('\n').length;
    if (!found.has(table)) found.set(table, []);
    found.get(table).push(line);
  }
  return found;
}

/** SQL writers: INSERT INTO x / UPDATE x — covers triggers, RPCs, seeds. */
const SQL_WRITE_RE = /\b(?:insert\s+into|update)\s+(?:public\.)?["']?([a-zA-Z0-9_]+)["']?/gi;

function collect(dirs, { writesOnly = false, includeSql = false } = {}) {
  const acc = new Map();
  for (const dir of dirs) {
    for (const file of walk(path.join(REPO_ROOT, dir))) {
      const rel = path.relative(REPO_ROOT, file).split(path.sep).join('/');
      if (FOREIGN_PROJECT_PATHS.some((p) => rel.startsWith(p))) continue;
      let src;
      try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }

      if (includeSql && rel.endsWith('.sql')) {
        const clean = stripComments(src);
        let sm;
        SQL_WRITE_RE.lastIndex = 0;
        while ((sm = SQL_WRITE_RE.exec(clean)) !== null) {
          const t = sm[1];
          if (!acc.has(t)) acc.set(t, []);
          acc.get(t).push(rel);
        }
        continue;
      }
      if (!src.includes('.from(')) continue;
      for (const [table, lines] of tablesIn(src, { writesOnly })) {
        if (!acc.has(table)) acc.set(table, []);
        for (const ln of lines) acc.get(table).push(`${rel}:${ln}`);
      }
    }
  }
  return acc;
}

function loadAllowlist() {
  try {
    const j = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
    return {
      stranded: new Map(Object.entries(j.stranded_writers || {})),
      phantom: new Map(Object.entries(j.phantom_tables || {})),
    };
  } catch {
    return { stranded: new Map(), phantom: new Map() };
  }
}

// ─────────────────────────────────────────────────────────────────────────
const allow = loadAllowlist();
const serviceReads = collect(READ_SCAN_DIRS);
const serverWrites = collect(SERVER_WRITE_DIRS, { writesOnly: true, includeSql: true });
const clientWrites = collect(CLIENT_WRITE_DIRS, { writesOnly: true });

const stranded = [];
const clientOnly = [];
for (const [table, sites] of serviceReads) {
  // A phantom table is U4.2's problem, not this script's — don't double-report.
  if (allow.phantom.has(table)) continue;
  if (allow.stranded.has(table)) continue;
  if (serverWrites.has(table)) continue;
  if (clientWrites.has(table)) { clientOnly.push({ table, sites }); continue; }
  stranded.push({ table, sites });
}

const staleAllow = [...allow.stranded.keys()].filter((t) => serverWrites.has(t));

if (AS_JSON) {
  console.log(JSON.stringify({ stranded, clientOnly, staleAllow }, null, 2));
} else {
  console.log(
    `check-stranded-writers: ${serviceReads.size} tables read by src/services, ` +
    `${serverWrites.size} written server-side.`
  );
  if (clientOnly.length) {
    console.log(`\n${clientOnly.length} table(s) written ONLY from client code (warning, not a failure):`);
    for (const { table } of clientOnly) console.log(`  ${table}`);
  }
  if (stranded.length) {
    console.error(`\n${stranded.length} STRANDED TABLE(S) — read by a service, written by NOTHING:\n`);
    for (const { table, sites } of stranded) {
      console.error(`  ${table}`);
      for (const s of sites.slice(0, 4)) console.error(`      read at ${s}`);
    }
    console.error(
      '\nA table with no writer renders an empty state forever, which is\n' +
      'indistinguishable from "no data yet" — the reason this class of bug\n' +
      'survives review. Fix: add the writer, delete the dead read, or record it\n' +
      'in scripts/ci/supabase-invariants.allowlist.json with a reason.'
    );
  }
  if (staleAllow.length) {
    console.error(`\n${staleAllow.length} STALE ALLOWLIST ENTR(IES) — now written, remove them:`);
    for (const t of staleAllow) console.error(`  ${t}`);
  }
  if (!stranded.length && !staleAllow.length) console.log('OK — no stranded tables.');
}

process.exit((stranded.length || staleAllow.length) && !WARN_ONLY ? 1 : 0);
