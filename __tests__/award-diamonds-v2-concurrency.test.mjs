import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTHORITY_MIGRATION = '20260907010000_training_server_authoritative_completion.sql';
const AWARD_MIGRATION = '20260907005900_award_diamonds_v2_serialized_family_caps.sql';
const migration = readFileSync(path.join(ROOT, 'supabase/migrations', AWARD_MIGRATION), 'utf8');
const verifier = readFileSync(
  path.join(ROOT, 'scripts/verify-award-diamonds-v2-concurrency-postgres.mjs'),
  'utf8',
);
const body = migration.match(/AS \$func\$([\s\S]*?)\$func\$;/)?.[1] || '';

test('award_diamonds_v2 safety migration lands before Training authority and preserves its callable contract', () => {
  assert.ok(AWARD_MIGRATION < AUTHORITY_MIGRATION);
  assert.deepEqual(
    readdirSync(path.join(ROOT, 'supabase/migrations'))
      .filter((name) => name.startsWith(AWARD_MIGRATION.slice(0, 14))),
    [AWARD_MIGRATION],
    'the migration timestamp must be unique',
  );
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.award_diamonds_v2\(\s*p_user_id\s+uuid,\s*p_action_key\s+text,\s*p_reference_id\s+text\s+DEFAULT NULL,\s*p_target_id\s+text\s+DEFAULT NULL,\s*p_metadata\s+jsonb\s+DEFAULT '\{\}'/i);
  assert.match(migration, /RETURNS jsonb[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = public/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.award_diamonds_v2\([^;]+\) FROM PUBLIC;/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.award_diamonds_v2\([^;]+\) FROM anon;/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.award_diamonds_v2\([^;]+\) FROM authenticated;/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.award_diamonds_v2\([^;]+\) TO service_role;/i);
});

test('per-user advisory and profile-row locks precede every user-state and cap read', () => {
  const advisory = body.indexOf('pg_advisory_xact_lock');
  const profile = body.indexOf('FROM public.profiles pr');
  const profileLock = body.indexOf('FOR UPDATE;', profile);
  const capRead = body.indexOf('FROM public.diamond_transactions t');

  assert.ok(advisory >= 0, 'per-user advisory lock is required');
  assert.ok(profile > advisory, 'profile state must be read after per-user serialization');
  assert.ok(profileLock > profile, 'profile row must be selected FOR UPDATE');
  assert.ok(capRead > profileLock, 'cap usage must be read after the profile row is locked');
  assert.match(body, /COALESCE\(v_vip_tier, ''\)/);
});

test('family ceilings are selected before but applied after the sole multiplier operation', () => {
  const multiplierExpression = 'ROUND(v_requested * v_multiplier)';
  const multiplier = body.indexOf(`v_requested := GREATEST(${multiplierExpression}`);
  const familyApplication = body.indexOf('IF v_family_monthly_cap IS NOT NULL THEN');

  assert.ok(multiplier >= 0, 'the award must have one explicit multiplier operation');
  assert.equal(body.split(multiplierExpression).length - 1, 1, 'the multiplier must be applied exactly once');
  assert.ok(familyApplication > multiplier, 'family allowance must cap the post-multiplier value');
  assert.match(body.slice(familyApplication), /v_award := LEAST\(v_award::bigint, v_family_remaining\)::int;/);

  for (const [family, cap] of [
    ['streak_reward', 'c_streak_monthly_cap'],
    ['daily_bonus', 'c_daily_bonus_monthly_cap'],
    ['training_reward', 'c_training_monthly_cap'],
    ['achievement', 'c_achievement_monthly_cap'],
    ['challenge', 'c_challenge_monthly_cap'],
  ]) {
    const branch = body.indexOf(`p_action_key = '${family}'`);
    const capSelection = body.indexOf(`v_family_monthly_cap := ${cap}`, branch);
    assert.ok(branch >= 0 && capSelection > branch, `${family} must select ${cap}`);
  }

  assert.doesNotMatch(body, /v_requested\s*:=\s*LEAST\(v_family_request,\s*c_(?:streak|daily_bonus|training|achievement|challenge)_monthly_cap/i);
});

test('only the verified milestone ledger can continue a snapshotted post-multiplier entitlement', () => {
  assert.match(body, /post_multiplier_entitlement/);
  assert.match(body, /_source'[\s\S]*fn_claim_training_streak_milestone_v2/);
  assert.match(body, /FROM public\.training_streak_milestone_claims claims[\s\S]*FOR UPDATE/);
  assert.match(body, /v_expected_streak_reference[\s\S]*v_reference_id <> v_expected_streak_reference/);
  assert.match(body, /IF NOT v_streak_entitlement_continuation THEN[\s\S]*ROUND\(v_requested \* v_multiplier\)/);
  assert.match(body, /'multiplier', v_multiplier/);
  assert.ok(
    (body.match(/'entitlement', CASE/g) || []).length >= 4,
    'family, daily, monthly, and platform deferrals must preserve streak entitlement metadata',
  );
  assert.match(body, /v_streak_entitlement > v_requested[\s\S]*v_multiplier := ROUND/);
});

test('profile, shadow balance, platform budget, and ledger remain in one exception-backed transaction', () => {
  const budgetWrite = body.indexOf('UPDATE public.diamond_platform_budget');
  const profileWrite = body.indexOf('UPDATE public.profiles', budgetWrite);
  const ledgerWrite = body.indexOf('INSERT INTO public.diamond_transactions', profileWrite);
  const exception = body.indexOf('EXCEPTION', ledgerWrite);

  assert.ok(budgetWrite >= 0 && profileWrite > budgetWrite && ledgerWrite > profileWrite);
  assert.ok(exception > ledgerWrite);
  assert.match(body.slice(profileWrite, ledgerWrite), /diamonds\s*=\s*v_new_balance,[\s\S]*diamond_balance\s*=\s*v_new_balance/);
  assert.match(body.slice(exception), /WHEN unique_violation THEN[\s\S]*GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME/);
  assert.match(body.slice(exception), /idx_diamond_transactions_reference_id/);
  assert.match(body.slice(exception), /diamond_transactions_user_reference_uidx/);
  assert.match(body.slice(exception), /IF v_constraint_name NOT IN[\s\S]*THEN\s+RAISE;/);
});

test('disposable verifier exercises real contention, maximum multiplier, caps, and rollback', () => {
  assert.match(verifier, /mkdtempSync/);
  assert.match(verifier, /pg_ctl/);
  assert.match(verifier, /diamond_multiplier\) VALUES[\s\S]*10\.00/);
  assert.match(verifier, /Array\.from\(\{ length: 12 \}[\s\S]*Promise\.all\(trainingCalls\)/);
  assert.match(verifier, /trainingAwarded !== 1500/);
  assert.match(verifier, /profile_balance <> 1000[\s\S]*ledger_total <> 1000/);
  assert.match(verifier, /profile_balance <> 1500[\s\S]*ledger_total <> 1500/);
  assert.match(verifier, /force-ledger-failure/);
  assert.match(verifier, /phase6_unrelated_user_uidx/);
  assert.match(verifier, /incorrectly translated to duplicate/);
  assert.match(verifier, /spent <> ledger_total/);
});
