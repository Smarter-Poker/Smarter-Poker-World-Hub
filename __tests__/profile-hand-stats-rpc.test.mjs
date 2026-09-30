/**
 * The profile hand-stats migration: what the database is asked to hold.
 *
 * supabase/migrations/20260930170300_profile_hand_stats_rpc.sql creates one
 * index and one read-only RPC. The RPC is the only reader of
 * club_member_daily_stats that a profile can reach, so this pins what it may
 * read (hands_played, table_id, stat_date, biggest_pot_won), what it must
 * never read (the two money-result columns; the words do not appear in the
 * file at all), who may call it (service_role only) and the safety template
 * every World Hub migration follows. The migration was proven on a disposable
 * local Postgres; the numbers are recorded in the agent report.
 *
 * Run: node --test __tests__/profile-hand-stats-rpc.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'supabase/migrations/20260930170300_profile_hand_stats_rpc.sql';
const SQL = readFileSync(join(ROOT, FILE), 'utf8');
const FN = 'public.fn_profile_hand_stats(uuid)';

function section(start, end) {
  const from = SQL.indexOf(start);
  const to = SQL.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `section ${start} .. ${end}`);
  return SQL.slice(from, to);
}
const functionBody = section('CREATE OR REPLACE FUNCTION public.fn_profile_hand_stats', '$fn$;');

test('the migration follows the safety template: header, one transaction, pre-flight, post-apply, a rollback that drops exactly what it creates', () => {
  for (const key of ['TIER:', 'AUTHOR:', 'AFFECTS:', 'IRREVERSIBLE:', 'WHY:', 'EVIDENCE']) {
    assert.match(SQL, new RegExp(`^-- ${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'), key);
  }
  assert.match(SQL, /^SET lock_timeout = '10s';\s*^BEGIN;/m);
  assert.match(SQL, /PRE-FLIGHT[\s\S]*DO \$preflight\$[\s\S]*END \$preflight\$;/);
  assert.match(SQL, /POST-APPLY[\s\S]*DO \$postapply\$[\s\S]*END \$postapply\$;\s*COMMIT;/);
  assert.equal((SQL.match(/^BEGIN;/gm) || []).length, 1);
  assert.equal((SQL.match(/^COMMIT;/gm) || []).length, 1);
  const rollback = section('-- ROLLBACK (manual', '-- COMMIT;');
  assert.match(rollback, /^-- DROP FUNCTION IF EXISTS public\.fn_profile_hand_stats\(uuid\);/m);
  assert.match(rollback, /^-- DROP INDEX IF EXISTS public\.idx_cmds_user_stat_date;/m);
  assert.equal((rollback.match(/^-- DROP /gm) || []).length, 2, 'two objects created, two dropped');
});

test('the pre-flight refuses a database missing the ledger columns, the roles, or already holding the function', () => {
  const preflight = section('DO $preflight$', 'END $preflight$;');
  for (const column of ['user_id', 'stat_date', 'table_id', 'hands_played', 'biggest_pot_won']) {
    assert.match(preflight, new RegExp(`\\('club_member_daily_stats', '${column}'\\)`), column);
  }
  assert.match(preflight, /\('profiles', 'id'\)/);
  assert.match(preflight, /\('anon'\), \('authenticated'\), \('service_role'\)/);
  assert.match(preflight, /p\.proname = 'fn_profile_hand_stats';\s*IF n <> 0 THEN/);
});

test('the index is the contracted user-leading covering index, created IF NOT EXISTS so a hand-built one no-ops', () => {
  assert.match(
    SQL,
    /CREATE INDEX IF NOT EXISTS idx_cmds_user_stat_date\s+ON public\.club_member_daily_stats \(user_id, stat_date DESC\)\s+INCLUDE \(table_id, hands_played, biggest_pot_won\);/
  );
  assert.doesNotMatch(SQL, /CREATE INDEX CONCURRENTLY/, 'CONCURRENTLY cannot run inside the transaction; the lead builds it by hand');
  assert.match(SQL, /NOTE FOR THE LEAD/);
});

test('the function is one STABLE SECURITY DEFINER sql aggregate over the last 30 days with the seven keys', () => {
  assert.match(functionBody, /RETURNS jsonb\s+LANGUAGE sql\s+STABLE\s+SECURITY DEFINER\s+SET search_path = public/);
  assert.match(functionBody, /FROM public\.club_member_daily_stats s\s+WHERE s\.user_id = p_user_id\s+AND s\.stat_date >= current_date - 30;/);
  for (const key of ['hands30d', 'sessions30d', 'daysActive30d', 'biggestPotWon30d', 'handsThisMonth', 'lastPlayed', 'computedAt']) {
    assert.match(functionBody, new RegExp(`'${key}',`), key);
  }
  assert.match(functionBody, /count\(DISTINCT \(s\.table_id, s\.stat_date\)\)::int/);
  assert.match(functionBody, /count\(DISTINCT s\.stat_date\)::int/);
  assert.match(functionBody, /coalesce\(max\(s\.biggest_pot_won\), 0\)::numeric/);
  assert.match(functionBody, /FILTER \(\s*WHERE s\.stat_date >= date_trunc\('month', current_date\)::date\)/);
  assert.match(functionBody, /max\(s\.stat_date\)/);
  assert.equal((SQL.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 1);
  assert.doesNotMatch(functionBody, /RAISE/);
});

test('the function reads four ledger columns and never a money result', () => {
  const columns = new Set((functionBody.match(/\bs\.([a-z_]+)/g) || []).map((m) => m.slice(2)));
  assert.deepEqual([...columns].sort(), ['biggest_pot_won', 'hands_played', 'stat_date', 'table_id', 'user_id']);
  assert.doesNotMatch(SQL, /profit/i);
  assert.doesNotMatch(SQL, /total_won/i);
  assert.doesNotMatch(SQL, /hands_won|topup_total|biggest_pot\b/);
  assert.doesNotMatch(functionBody, /is_horse|profiles/);
});

test('only the service role may execute it; the post-apply block checks the same', () => {
  assert.match(SQL, /^REVOKE ALL ON FUNCTION public\.fn_profile_hand_stats\(uuid\) FROM PUBLIC, anon, authenticated;$/m);
  assert.match(SQL, /^GRANT EXECUTE ON FUNCTION public\.fn_profile_hand_stats\(uuid\) TO service_role;$/m);
  const postapply = section('DO $postapply$', 'END $postapply$;');
  assert.match(postapply, new RegExp(`has_function_privilege\\('anon', '${FN.replace(/[()]/g, '\\$&')}', 'EXECUTE'\\)`));
  assert.match(postapply, new RegExp(`has_function_privilege\\('authenticated', '${FN.replace(/[()]/g, '\\$&')}', 'EXECUTE'\\)`));
  assert.match(postapply, new RegExp(`NOT has_function_privilege\\('service_role', '${FN.replace(/[()]/g, '\\$&')}', 'EXECUTE'\\)`));
  assert.match(postapply, /p\.prosecdef AND p\.provolatile = 's'/);
  assert.match(postapply, /indisvalid/);
  assert.match(postapply, /'00000000-0000-4000-8000-000000000000'::uuid/, 'the empty-player shape is asserted at install time');
});

test('the file carries no emoji and no em or en dash', () => {
  assert.doesNotMatch(SQL, /[–—]|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});
