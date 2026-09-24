#!/usr/bin/env node
/**
 * check-phantom-rpcs.mjs - CHECK 26
 * -------------------------------------------------------------------------
 * Fails CI when code CALLS a Postgres function that the live database does
 * not have. The function-level member of the phantom family: CHECK 11 covers
 * tables, CHECK 13 covers columns, this covers `supabase.rpc('name')`.
 *
 * WHY THIS EXISTS (2026-09-24)
 * PostgREST answers a call for a function it cannot resolve with PGRST202,
 * "Could not find the function ... in the schema cache". That is a 404 in an
 * `error` object, not a thrown exception, so a call site that logs and moves
 * on, or that fires and forgets, loses the feature in total silence. It is the
 * same failure shape as 42P01 on a table and 42703 on a column, and it has the
 * same cause: the database moved and the caller did not.
 *
 * The motivating case is a DROP, not a typo, which is the half CHECK 17 cannot
 * see. Club Arena migration three_watchers_whose_defects_were_fixed_stop_running
 * dropped increment_club_table_count and decrement_club_table_count on
 * 2026-09-20, because they wrote clubs.table_count by blind +1 and
 * GREATEST(0, x - 1) while the trg_tables_sync_club_counts_* triggers recompute
 * that column from fn_live_table_count(). Dropping them was correct. But
 * pages/api/club-arena/manage-table.js was still calling the decrement on every
 * table delete, and nothing in this repository could tell: the migration lives
 * in another repository, so CHECK 17 (a migration this branch adds must already
 * be applied) never looks at it. A cross-repository DROP is invisible to every
 * gate that reads only this repository's own migrations. This one reads the
 * live catalogue instead, so it does not care which repository moved it.
 *
 * WHAT IT READS FOR THE LIVE SIDE
 * The PostgREST OpenAPI document, the same source CHECK 11 and CHECK 13 use.
 * Its `paths` carry one `/rpc/<name>` entry per callable function, which is
 * precisely the set a `.rpc()` call can resolve against - a stronger statement
 * than pg_proc, because a function that exists but is not exposed to the REST
 * schema still answers PGRST202.
 *
 * HOW IT READS THE CODE - deliberately conservative
 * Comment-stripped source, string-literal first arguments only. A retired
 * function's name belongs in the header comment that explains its retirement,
 * and a scanner that counted prose as a call would make "stop explaining it"
 * the cheapest way to green. See scripts/ci/lib/rpc-calls.mjs.
 *
 * SCOPE is pages/api, src and server: the same directories as CHECK 13, which
 * is to say the code this project deploys. One-off migration and import
 * helpers under scripts/ are not deployed and are out of scope on purpose.
 *
 * USAGE
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
 *     node scripts/ci/check-phantom-rpcs.mjs [--warn-only] [--json]
 *
 *   --catalogue=<file>   read the live function list from a JSON array of
 *                        names instead of fetching it. For offline
 *                        verification and for the law test, which must be
 *                        able to run with no database credentials. CI passes
 *                        no such flag and therefore always fetches.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resilientFetch } from './lib/resilient-fetch.mjs';
import { lineIndex } from './lib/from-calls.mjs';
import { rpcCalls, stripComments } from './lib/rpc-calls.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'scripts', 'ci', 'supabase-invariants.allowlist.json');
const WARN_ONLY = process.argv.includes('--warn-only');
const AS_JSON = process.argv.includes('--json');
const CATALOGUE_ARG = process.argv.find((a) => a.startsWith('--catalogue='));

const SCAN_DIRS = ['pages/api', 'src', 'server'];
const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);
const FOREIGN_PROJECT_PATHS = ['pages/api/mlb/', 'src/lib/mlb_data', 'src/lib/mlb_cached_data'];

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

/** Live function names, from the PostgREST OpenAPI `/rpc/<name>` paths. */
async function fetchFunctions() {
  if (CATALOGUE_ARG) {
    const names = JSON.parse(fs.readFileSync(CATALOGUE_ARG.slice('--catalogue='.length), 'utf8'));
    if (!Array.isArray(names) || names.length === 0) {
      console.error('check-phantom-rpcs: --catalogue must be a non-empty JSON array of names.');
      process.exit(2);
    }
    return new Set(names);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('check-phantom-rpcs: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.');
    process.exit(2);
  }
  const doc = await resilientFetch(
    'check-phantom-rpcs',
    `${url.replace(/\/$/, '')}/rest/v1/`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' } },
    { exitCode: 2 }
  );
  const fns = new Set(
    Object.keys(doc.paths || {})
      .filter((p) => p.startsWith('/rpc/'))
      .map((p) => p.slice(5))
  );
  if (fns.size === 0) {
    // Refuse to pass vacuously. resilientFetch has already retried the
    // transient shape of this (PostgREST serves an empty document while it
    // reloads its schema cache), so an empty set here is really empty, and an
    // empty live catalogue would mark every call in the repository phantom.
    console.error('check-phantom-rpcs: zero /rpc/ paths - refusing to pass vacuously.');
    process.exit(2);
  }
  return fns;
}

function loadAllowlist() {
  try {
    const j = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
    return new Map(Object.entries(j.phantom_rpcs || {}));
  } catch { return new Map(); }
}

/**
 * The whole decision, as a pure function, so the law test can exercise exactly
 * what CI runs.
 * @param {Map<string,string[]>} refs   name -> ["file:line", ...]
 * @param {Set<string>} live            live function names
 * @param {Map<string,string>} allow    allowlisted name -> reason
 */
export function phantomRpcs(refs, live, allow) {
  const phantom = [];
  const staleAllow = [];
  for (const [name, sites] of refs) {
    if (live.has(name)) continue;
    if (allow.has(name)) continue;
    phantom.push({ name, sites });
  }
  for (const name of allow.keys()) if (live.has(name)) staleAllow.push(name);
  return { phantom, staleAllow };
}

/** name -> ["file:line", ...] across the scanned tree. */
export function collectRefs(repoRoot = REPO_ROOT) {
  const refs = new Map();
  for (const dir of SCAN_DIRS) {
    for (const file of walk(path.join(repoRoot, dir))) {
      const rel = path.relative(repoRoot, file).split(path.sep).join('/');
      if (FOREIGN_PROJECT_PATHS.some((p) => rel.startsWith(p))) continue;
      let src;
      try { src = fs.readFileSync(file, 'utf8'); } catch { continue; }
      if (!src.includes('.rpc(')) continue;
      /* stripComments preserves every newline, so a line number taken from the
         stripped text is the line number in the file. The index MUST be built
         on the stripped text, because that is what the offsets point into. */
      const clean = stripComments(src);
      const lineOf = lineIndex(clean);
      for (const { name, offset } of rpcCalls(clean)) {
        if (!refs.has(name)) refs.set(name, []);
        refs.get(name).push(`${rel}:${lineOf(offset)}`);
      }
    }
  }
  return refs;
}

// -------------------------------------------------------------------------
// Running as a script rather than being imported by the law test.
if (import.meta.url === `file://${process.argv[1]}`) {
  const live = await fetchFunctions();
  const allow = loadAllowlist();
  const refs = collectRefs();
  const { phantom, staleAllow } = phantomRpcs(refs, live, allow);

  if (AS_JSON) {
    console.log(JSON.stringify({ phantom, staleAllow, checked: refs.size }, null, 2));
  } else {
    console.log(`check-phantom-rpcs: ${refs.size} distinct rpc names checked against ${live.size} live functions.`);
    if (phantom.length) {
      console.error(`\n${phantom.length} PHANTOM RPC(S) - called in code, absent from the live catalogue:\n`);
      for (const { name, sites } of phantom.sort((a, b) => a.name.localeCompare(b.name))) {
        console.error(`  ${name}`);
        for (const s of sites.slice(0, 4)) console.error(`      ${s}`);
        if (sites.length > 4) console.error(`      ...and ${sites.length - 4} more`);
      }
      console.error(
        '\nEach of these answers PGRST202 at runtime. The error arrives in the\n' +
        '`error` object rather than as a throw, so the call site usually logs it\n' +
        'and continues and the feature silently never works. Fix the call, create\n' +
        'the function, or allowlist the name with a reason in\n' +
        'scripts/ci/supabase-invariants.allowlist.json.'
      );
    }
    if (staleAllow.length) {
      console.error(`\n${staleAllow.length} STALE ALLOWLIST ENTR(IES) - function now exists, remove:`);
      for (const n of staleAllow) console.error(`  ${n}`);
    }
    if (!phantom.length && !staleAllow.length) console.log('OK - no phantom rpcs.');
  }
  process.exit((phantom.length || staleAllow.length) && !WARN_ONLY ? 1 : 0);
}
