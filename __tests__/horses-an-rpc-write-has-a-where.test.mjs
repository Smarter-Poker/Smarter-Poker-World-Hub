/**
 * A write inside an RPC must carry a WHERE, or PostgREST refuses it.
 *
 * WHAT HAPPENED (2026-09-04)
 * --------------------------
 * `fn_ca_collusion_scan_advance` is the function that records how far the
 * collusion detector has scanned. Its UPDATE had no WHERE clause, because
 * `ca_collusion_scan_state` is a singleton with a boolean primary key and a
 * WHERE looked like noise. Correct SQL. Unreachable in production:
 *
 *   POST /rest/v1/rpc/fn_ca_collusion_scan_advance
 *   {"code":"21000","message":"UPDATE requires a WHERE clause"}
 *
 * The `authenticator` role carries `session_preload_libraries=safeupdate`, so
 * every request arriving through PostgREST runs in safe-update mode, and a
 * WHERE-less UPDATE or DELETE is refused before a row is touched - inside a
 * SECURITY DEFINER function as much as anywhere else.
 *
 * WHY NOTHING CAUGHT IT. `postgres` does not preload safeupdate. The function
 * works from psql, works in a rolled-back probe, works when a migration calls
 * it. Three separate migrations asserted it and all three passed. The one
 * caller it failed for was the only one that mattered, and it failed silently:
 * the scan read hands, wrote findings, and forgot where it got to, answering
 * HTTP 200 every time. `last_scanned_hands` was NULL after four clean runs,
 * which is the only reason anybody noticed.
 *
 * WHAT THIS FILE CHECKS, AND WHAT IT DOES NOT
 * -------------------------------------------
 * It reads the migrations in this repo, takes the LAST definition of each
 * function (an older file legitimately holds a superseded body), strips
 * comments and string literals, and fails on a write with no WHERE.
 *
 * Stripping literals is not optional. A scan without it reported eleven
 * offenders where there are five, because `fn_resolve_settled_financial_alerts`
 * writes a note containing "raised; the prize path credited this player" and a
 * regex ends the statement at that semicolon - so a perfectly good WHERE reads
 * as missing. It also flagged `fn_ca_money_path_log`, which contains no UPDATE
 * at all: the match was inside an error message telling an operator how to
 * reopen a door. A guard that miscounts is how the wrong function gets fixed.
 *
 * THIS IS NOT A DATABASE AUDIT. It sees migration FILES. The live schema holds
 * six WHERE-less writers and only one of them is named below, because the
 * others were created by paths that never passed through this directory. The
 * live check, which is the authoritative one:
 *
 *   select p.proname, pg_get_functiondef(p.oid) from pg_proc p
 *     join pg_namespace n on n.oid = p.pronamespace
 *    where n.nspname = 'public' and p.prokind = 'f';
 *
 *   -- then strip literals and comments before scanning for
 *   -- (update|delete from) public.<table> ... ;  with no WHERE
 *
 * Of the six live ones, five run only under pg_cron or triggers, where
 * safeupdate is not loaded, so they work today and become this bug the moment
 * somebody exposes them as an RPC: fn_ca_execute_epoch3_reset,
 * fn_rake_spec_rebuild_caps, fn_rebuild_agent_commission_rollup,
 * pnm_refresh_venue_integrity_state_basics, sp_compact_hand_history. They are
 * named in migration 20260904233000 and left alone deliberately - two are
 * money paths owned by other work, and a blind edit to a treasury or rake
 * function to satisfy a lint is a worse idea than the lint.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.join(process.cwd(), 'supabase', 'migrations');

/**
 * Functions that already had a WHERE-less write when this guard was written.
 * Every entry is a real defect waiting for whoever exposes it through
 * PostgREST; none is on a path this phase touches. Shrink this list, never
 * grow it - a new name here means the guard was silenced rather than heeded.
 */
const KNOWN_BEFORE_THIS_GUARD = new Set([
  'pnm_refresh_venue_integrity_state_basics',
]);

const stripLiteralsAndComments = (sql) =>
  sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\s+/g, ' ');

function lastDefinitionOfEveryFunction() {
  const last = new Map();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = stripLiteralsAndComments(
      readFileSync(path.join(MIGRATIONS, file), 'utf8').toLowerCase(),
    );
    const marks = [
      ...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_0-9]+)/g),
    ].map((m) => ({ name: m[1], at: m.index }));
    for (let i = 0; i < marks.length; i++) {
      last.set(marks[i].name, {
        file,
        body: sql.slice(marks[i].at, marks[i + 1]?.at ?? sql.length),
      });
    }
  }
  return last;
}

const whereLessWrites = (body) =>
  [...body.matchAll(/\b(?:update|delete\s+from)\s+public\.[a-z_0-9]+[^;]*;/g)]
    .map((m) => m[0])
    .filter((stmt) => !stmt.includes(' where '));

test('no NEW function writes without a WHERE, because PostgREST refuses it', () => {
  const offenders = [];
  for (const [name, { file, body }] of lastDefinitionOfEveryFunction()) {
    if (KNOWN_BEFORE_THIS_GUARD.has(name)) continue;
    const bad = whereLessWrites(body);
    if (bad.length > 0) offenders.push(`${name} (${file}): ${bad[0].slice(0, 80)}`);
  }
  assert.deepEqual(
    offenders,
    [],
    'These functions hold an UPDATE or DELETE with no WHERE clause. PostgREST runs ' +
      'with safeupdate preloaded and will refuse them with SQLSTATE 21000 - the ' +
      'function will look correct in psql and never run in production. Add a WHERE ' +
      'that names the row, even on a singleton table:\n  ' +
      offenders.join('\n  '),
  );
});

test('the collusion scan advance carries its WHERE, and it is the newest definition', () => {
  // Named on its own because this is the one that actually broke, and because
  // a future "tidy up the redundant predicate on a singleton table" pass is
  // exactly how it comes back.
  const def = lastDefinitionOfEveryFunction().get('fn_ca_collusion_scan_advance');
  assert.ok(def, 'fn_ca_collusion_scan_advance is not defined by any migration');
  assert.equal(
    whereLessWrites(def.body).length,
    0,
    `fn_ca_collusion_scan_advance writes without a WHERE in ${def.file}. ` +
      'The detector will answer 200, scan hands, insert findings, and never ' +
      'record where it got to.',
  );
  assert.match(def.body, /where\s+id\s*=\s*v_id/);
});

test('the known offenders are listed, not merely tolerated', () => {
  // An allowlist whose entries no longer exist is a comment. If one of these
  // is fixed or deleted, this fails and the name comes off the list.
  const last = lastDefinitionOfEveryFunction();
  for (const name of KNOWN_BEFORE_THIS_GUARD) {
    const def = last.get(name);
    assert.ok(def, `${name} is allow-listed but no migration defines it - remove it from the list`);
    assert.ok(
      whereLessWrites(def.body).length > 0,
      `${name} no longer writes without a WHERE. Remove it from KNOWN_BEFORE_THIS_GUARD.`,
    );
  }
});
