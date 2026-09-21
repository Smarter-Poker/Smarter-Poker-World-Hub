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

/**
 * THE BODY ENDS AT ITS OWN DOLLAR QUOTE, NOT AT THE NEXT FUNCTION (2026-09-21).
 *
 * Slicing from one CREATE FUNCTION to the next one hands the scan everything
 * that follows the LAST function in a file - the grants, the backfills, the
 * one-off UPDATEs a migration runs at top level - and then reports whatever it
 * finds there under that function's name.
 *
 * Measured: 20260920150544_poker_news_search_vector_include_excerpt.sql defines
 * the trigger function `poker_news_search_update`, whose entire body is
 * `NEW.search_vector := ...; RETURN NEW;` and which contains no UPDATE at all.
 * The migration then runs one top-level backfill `UPDATE public.poker_news SET
 * search_vector = ...` with no WHERE, correctly, as `postgres`, which does not
 * preload safeupdate. The guard attributed that statement to the function and
 * refused the file.
 *
 * This file's own header already names the failure: "It also flagged
 * fn_ca_money_path_log, which contains no UPDATE at all ... A guard that
 * miscounts is how the wrong function gets fixed." Same miscount, new cause.
 *
 * NOTHING TRUE IS LOST. safeupdate applies to what runs INSIDE the function
 * when PostgREST calls it, so a statement after the closing dollar quote was
 * never in scope; a WHERE-less write actually inside a body is still found, and
 * the test below proves both halves on a fixture rather than on the corpus.
 * A body with no dollar quote keeps the old slice - the conservative direction.
 */
function functionBody(sql, from, to) {
  const slice = sql.slice(from, to);
  const open = /\$([a-z_0-9]*)\$/.exec(slice);
  if (!open) return slice;
  const tag = open[0];
  const close = slice.indexOf(tag, open.index + tag.length);
  return close === -1 ? slice : slice.slice(0, close + tag.length);
}

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
        body: functionBody(sql, marks[i].at, marks[i + 1]?.at ?? sql.length),
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

test('the scan reads the function body, and not what the migration runs after it', () => {
  // Both halves on a fixture, because the corpus can only ever show one of
  // them and a guard that stopped catching anything would look identical to a
  // guard that stopped over-reaching.
  const withTrailingBackfill = stripLiteralsAndComments(
    `create or replace function public.t_vector() returns trigger language plpgsql as $function$
     begin new.v := 1; return new; end;
     $function$;
     update public.some_table set v = 2;`.toLowerCase(),
  );
  assert.deepEqual(
    whereLessWrites(functionBody(withTrailingBackfill, 0, withTrailingBackfill.length)),
    [],
    'a top-level statement after the closing dollar quote is not inside the function',
  );

  const reallyInside = stripLiteralsAndComments(
    `create or replace function public.t_writer() returns void language plpgsql as $function$
     begin update public.some_table set v = 2; end;
     $function$;`.toLowerCase(),
  );
  assert.equal(
    whereLessWrites(functionBody(reallyInside, 0, reallyInside.length)).length,
    1,
    'a WHERE-less write actually inside a body is still an offender',
  );
});
