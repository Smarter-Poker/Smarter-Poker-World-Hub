/**
 * LAW: AN RPC CALL NAMES A FUNCTION THE LIVE DATABASE HAS.
 *
 * The sibling law, an-rpc-call-names-a-real-signature, pins six calls that were
 * each broken by hand and found by hand. This one pins the GATE that finds the
 * next one without a person looking: scripts/ci/check-phantom-rpcs.mjs, CHECK 26.
 *
 * WHY A GATE AND NOT ANOTHER LIST (2026-09-24)
 * The break that prompted it was not a typo, it was a DROP in another
 * repository. Club Arena's three_watchers_whose_defects_were_fixed_stop_running
 * removed two blind writers of clubs.table_count on 2026-09-20, correctly: the
 * trg_tables_sync_club_counts_* triggers recompute that column from
 * fn_live_table_count(). pages/api/club-arena/manage-table.js was still calling
 * one of them, and no gate in THIS repository could see it, because CHECK 17
 * reads the migrations this branch adds and the migration that mattered lives
 * somewhere else. A list of known-bad names cannot catch a name that was good
 * when it was written. Reading the live catalogue can.
 *
 * WHAT IS ASSERTED HERE, AND WHAT IS ASSERTED IN CI
 * These are pure-function tests: the scanner's parser and its decision, run
 * against fixtures, with no database. They prove the gate WORKS. CI additionally
 * runs the scanner against the live PostgREST catalogue (CHECK 26), which is
 * what proves the repository is CLEAN. Neither half is sufficient alone, which
 * is why the workflow runs both.
 *
 * THE TRAP THIS FILE IS BUILT AROUND
 * A retired function's name stays in the prose that explains its retirement.
 * That prose is the point: it is how the next person learns why the call went.
 * So a scanner that read raw source would make "delete the explanation" the
 * cheapest route to green, and a test that asserted `not.toContain(name)`
 * against a whole file would fail on its own header. Every negative below is
 * asserted against COMMENT-STRIPPED source, and the header's continued
 * existence is asserted separately and positively.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { rpcCalls, stripComments } from '../scripts/ci/lib/rpc-calls.mjs';
import { phantomRpcs } from '../scripts/ci/check-phantom-rpcs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const RETIRED = 'decrement_club_table_count';
const names = (src) => rpcCalls(stripComments(src)).map((c) => c.name);

// ── the parser ──────────────────────────────────────────────────────────────

test('a name that appears only in a comment is not a call', () => {
  const src = [
    `// the ${RETIRED} rpc was dropped on 2026-09-20`,
    `/* ${RETIRED} again, in a block comment */`,
    "const ok = await db.rpc('fn_live_table_count', { p_club_id: id });",
  ].join('\n');
  assert.deepEqual(names(src), ['fn_live_table_count']);
});

test('both quote styles are read, and a dynamic name is skipped rather than guessed', () => {
  const src = [
    "a.rpc('single_quoted');",
    'b.rpc("double_quoted");',
    'c.rpc(chosenAtRuntime);',
    'd.rpc(`fn_${suffix}`);',
  ].join('\n');
  assert.deepEqual(names(src), ['single_quoted', 'double_quoted']);
});

test('a name inside a string literal is still seen, because a comment is not a string', () => {
  // stripComments must not eat string contents: `.rpc('x')` IS a string literal.
  const src = "const q = client\n  .rpc(\n    'fn_spin_sweep_unbooked',\n    {}\n  );";
  assert.deepEqual(names(src), ['fn_spin_sweep_unbooked']);
});

test('line numbers survive comment stripping, so a report points at the real line', () => {
  const src = ['/* one', ' * two', ' */', "x.rpc('fn_here');"].join('\n');
  const clean = stripComments(src);
  assert.equal(clean.split('\n').length, src.split('\n').length);
  assert.equal(clean.slice(0, rpcCalls(clean)[0].offset).split('\n').length, 4);
});

// ── the decision ────────────────────────────────────────────────────────────

const live = new Set(['fn_live_table_count', 'fn_diamond_purchase_refund']);

test('a call the live catalogue does not have is a phantom', () => {
  const refs = new Map([[RETIRED, ['pages/api/club-arena/manage-table.js:189']]]);
  const { phantom } = phantomRpcs(refs, live, new Map());
  assert.equal(phantom.length, 1);
  assert.equal(phantom[0].name, RETIRED);
  assert.deepEqual(phantom[0].sites, ['pages/api/club-arena/manage-table.js:189']);
});

test('a call the live catalogue has is not', () => {
  const refs = new Map([['fn_live_table_count', ['x.js:1']]]);
  assert.deepEqual(phantomRpcs(refs, live, new Map()).phantom, []);
});

test('an allowlisted name is excused, and the allowlist can only shrink', () => {
  const refs = new Map([['deliberate_fallback', ['x.js:1']]]);
  const allow = new Map([['deliberate_fallback', 'reason']]);
  assert.deepEqual(phantomRpcs(refs, live, allow).phantom, []);

  // The moment the function exists, the entry is stale and CI says so. This is
  // what stops the allowlist becoming a place names go to be forgotten.
  const stale = new Map([['fn_live_table_count', 'reason']]);
  assert.deepEqual(phantomRpcs(new Map(), live, stale).staleAllow, ['fn_live_table_count']);
});

test('every allowlist entry carries a reason, not an empty string', () => {
  const j = JSON.parse(read('scripts/ci/supabase-invariants.allowlist.json'));
  const entries = Object.entries(j.phantom_rpcs || {});
  assert.ok(entries.length > 0, 'the phantom_rpcs section must exist');
  for (const [name, reason] of entries) {
    assert.equal(typeof reason, 'string');
    assert.ok(reason.trim().length > 80, `${name} needs a real reason, not a placeholder`);
  }
});

// ── the regression this law was written for ─────────────────────────────────

test('manage-table does not call the dropped decrement, in code', () => {
  // Asserted against stripped source ON PURPOSE. The raw file DOES contain the
  // name, once, in the comment tested immediately below, and that is correct.
  const src = read('pages/api/club-arena/manage-table.js');
  assert.ok(!names(src).includes(RETIRED), `${RETIRED} was dropped on 2026-09-20; calling it is PGRST202`);
  assert.ok(!stripComments(src).includes(RETIRED), 'the name must not survive anywhere in code');
});

test('and the header still explains why it does not', () => {
  // The positive half. Deleting the explanation must not be a way to pass the
  // negative half above.
  const src = read('pages/api/club-arena/manage-table.js');
  assert.ok(src.includes(RETIRED), 'the retirement must stay explained, in prose');
  assert.match(src, /trg_tables_sync_club_counts_upd/, 'the header must name the writer that owns the count');
  assert.match(src, /fn_live_table_count/, 'and what that writer recomputes from');
});

test('the gate is wired into the build safety gate, not merely present', () => {
  const wf = read('.github/workflows/build-safety-gate.yml');
  assert.match(wf, /check-phantom-rpcs\.mjs/, 'CHECK 26 must actually run in CI');
  assert.match(wf, /an-rpc-call-names-a-live-function\.law\.test\.mjs/, 'and this law must run beside it');
});
