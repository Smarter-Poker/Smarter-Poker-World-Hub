/** Phase 5 database contract, pinned against the additive migration text. */
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = await readdir(path.join(ROOT, 'supabase', 'migrations'));
const names = files.filter((name) => name.includes('ca_phase5_integrity_cases_and_review_queue'));
assert.equal(names.length, 1, 'Phase 5 must be one additive migration with one reserved version');
const sql = await readFile(path.join(ROOT, 'supabase', 'migrations', names[0]), 'utf8');

function body(name) {
  const at = sql.indexOf(`FUNCTION public.${name}`);
  assert.ok(at >= 0, `${name} is missing`);
  const next = sql.indexOf('CREATE OR REPLACE FUNCTION public.', at + 40);
  return sql.slice(at, next < 0 ? sql.length : next);
}

test('the three case-management tables are additive, locked down and indexed', () => {
  for (const table of ['ca_integrity_cases', 'ca_integrity_case_items', 'ca_integrity_sanctions']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`));
  }
  assert.match(sql, /USING gin \(subject_ids\)/i);
  assert.match(sql, /ON DELETE RESTRICT/g);
});

test('evidence is immutable and retractions are uniquely append-only', () => {
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.ca_integrity_case_items/i);
  assert.match(sql, /ca_integrity_case_items_one_retraction_uq/);
  assert.match(body('fn_ca_integrity_case_retract_item'), /INSERT INTO public\.ca_integrity_case_items/i);
  assert.doesNotMatch(body('fn_ca_integrity_case_retract_item'), /DELETE FROM public\.ca_integrity_case_items/i);
});

test('all seven reads and seven mutations exist as service-role-only RPCs', () => {
  const functions = [
    'fn_ca_integrity_detector_health', 'fn_ca_integrity_queue', 'fn_ca_integrity_case',
    'fn_ca_integrity_pairs', 'fn_ca_integrity_flags', 'fn_ca_integrity_hands',
    'fn_ca_integrity_timing', 'fn_ca_integrity_case_open',
    'fn_ca_integrity_case_add_item', 'fn_ca_integrity_case_retract_item',
    'fn_ca_integrity_case_assign', 'fn_ca_integrity_case_decide',
    'fn_ca_integrity_case_close', 'fn_ca_integrity_sanction',
  ];
  for (const name of functions) {
    const fn = body(name);
    assert.match(fn, /SECURITY DEFINER/);
    assert.match(fn, /SET search_path = public, pg_temp/);
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]+\\) TO service_role`));
  }
});

test('the queue groups before pagination and implements the six written tiers', () => {
  const queue = body('fn_ca_integrity_queue');
  assert.match(queue, /GROUP BY r\.player_a_id, r\.player_b_id/);
  assert.ok(queue.indexOf('GROUP BY r.player_a_id') < queue.indexOf('LIMIT v_limit + 1'));
  for (const tier of [
    'active_case', 'multiple_signals', 'seven_day_money_flow',
    'chip_dump', 'other_non_timing', 'timing_only',
  ]) assert.match(queue, new RegExp(`'${tier}'`));
  assert.match(queue, /p_include_horses boolean DEFAULT true/i);
});

test('every case update has a keyed WHERE and every mutation has an operation id', () => {
  for (const name of [
    'fn_ca_integrity_case_open', 'fn_ca_integrity_case_add_item',
    'fn_ca_integrity_case_retract_item', 'fn_ca_integrity_case_assign',
    'fn_ca_integrity_case_decide', 'fn_ca_integrity_case_close',
    'fn_ca_integrity_sanction',
  ]) assert.match(body(name), /p_op_id\s+text/i, `${name} has no operation id`);
  for (const name of ['fn_ca_integrity_case_assign', 'fn_ca_integrity_case_decide', 'fn_ca_integrity_case_close']) {
    const fn = body(name);
    assert.match(fn, /UPDATE public\.ca_integrity_cases[\s\S]*?WHERE c\.id = p_case_id/i);
  }
});

test('confiscation is recorded as approved and contains no money mutation', () => {
  const sanction = body('fn_ca_integrity_sanction');
  assert.match(sanction, /p_kind = 'confiscation' THEN 'approved'/);
  assert.match(sanction, /no_chips_moved/);
  assert.doesNotMatch(sanction, /fn_(?:debit|credit|mint|burn)_chips/i);
  assert.doesNotMatch(sanction, /UPDATE\s+(?:public\.)?(?:chip|diamond|wallet|balance)/i);
});
