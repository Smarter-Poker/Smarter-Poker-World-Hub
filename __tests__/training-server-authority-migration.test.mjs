import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260907010000_training_server_authoritative_completion.sql',
  import.meta.url,
);
const sql = readFileSync(migrationPath, 'utf8');
const sessionPolicyProjectionPath = new URL(
  '../supabase/migrations/20260908192000_training_session_projection_policy_checksum.sql',
  import.meta.url,
);
const sessionPolicyProjectionSql = readFileSync(sessionPolicyProjectionPath, 'utf8');

function has(pattern, message) {
  assert.match(sql, pattern, message);
}

test('the migration creates immutable snapshots and server-owned attempts', () => {
  has(/CREATE TABLE IF NOT EXISTS public\.training_question_snapshots/i);
  has(/snapshot_key text PRIMARY KEY/i);
  has(/snapshot_key ~ '\^\[0-9a-f\]\{64\}\$'/i);
  has(/CREATE TRIGGER training_question_snapshots_immutable_v2[\s\S]*BEFORE UPDATE OR DELETE/i);
  has(/CREATE TABLE IF NOT EXISTS public\.training_attempts/i);
  has(/UNIQUE \(user_id, client_nonce, game_id, level, session_kind\)/i);
  has(/parent_attempt_id uuid REFERENCES public\.training_attempts/i);
  has(/practice_only = \(session_kind = 'replay'\)/i);
});

test('the production preflight covers every mutable store and the real-Postgres verifier is reachable', () => {
  has(/^BEGIN;$/mi, 'the authority migration must deploy atomically');
  has(/SET LOCAL lock_timeout = '5s'/i, 'the migration must fail fast on a contended table lock');
  has(/SET LOCAL statement_timeout = '120s'/i, 'the migration must have a bounded statement deadline');
  has(/COMMIT;\s*$/i, 'the authority migration must commit only after every assertion passes');
  for (const table of [
    'training_question_cache',
    'training_answers',
    'user_seen_questions',
    'training_streaks',
    'training_progress',
    'training_level_history',
    'training_leaderboard',
    'training_sessions',
    'training_daily_challenge',
    'training_questions',
    'training_hand_replay',
  ]) {
    has(new RegExp(`${table}\\.[a-z_]+`, 'i'), `${table} must have explicit column preflights`);
  }
  has(/Required Training upsert uniqueness contract is missing/i);
  has(/Required safe Diamond award writer is not installed/i);
  has(/award_advisory_at[\s\S]*award_profile_at[\s\S]*award_profile_lock_at[\s\S]*award_multiplier_at[\s\S]*award_family_cap_at/i);
  has(/to_regclass\('auth\.users'\)/i);
  has(/to_regprocedure\('pg_catalog\.gen_random_uuid\(\)'\)/i);
  assert.doesNotMatch(sql, /DROP FUNCTION IF EXISTS public\.fn_complete_training_level_v2/i);

  const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
  assert.equal(
    packageJson.scripts['audit:training:authority-db'],
    'node scripts/verify-training-authority-postgres.mjs',
  );
});

test('legacy streak and progress truth is snapshotted once while verified authority remains erasable', () => {
  has(/ALTER TABLE public\.training_streaks[\s\S]*legacy_authority_snapshot jsonb[\s\S]*authority_current_streak/i);
  has(/ALTER TABLE public\.training_progress[\s\S]*legacy_authority_snapshot jsonb[\s\S]*authority_level/i);
  has(/UPDATE public\.training_streaks[\s\S]*WHERE legacy_authority_snapshot IS NULL/i);
  has(/UPDATE public\.training_progress[\s\S]*WHERE legacy_authority_snapshot IS NULL/i);
  has(/IF TG_OP = 'UPDATE'[\s\S]*TRAINING_LEGACY_AUTHORITY_SNAPSHOT_IMMUTABLE/i);
  has(/RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END/i);
  assert.doesNotMatch(sql, /training_progress\.current_level|current_level\s*=/i);
  has(/FOREACH erasure_table IN ARRAY ARRAY\[[\s\S]*training_verified_leaderboard[\s\S]*fk\.confdeltype = 'c'/i);
  has(/FOREACH attempt_child IN ARRAY ARRAY\[[\s\S]*training_attempt_hands[\s\S]*fk\.confrelid = 'public\.training_attempts'::regclass[\s\S]*fk\.confdeltype = 'c'/i);
  has(/fn_reject_training_answer_delete_v2[\s\S]*EXISTS \(SELECT 1 FROM auth\.users[\s\S]*TRAINING_ATTEMPT_ANSWER_IMMUTABLE/i);
});

test('campaign, configurable, Daily Challenge, and replay hand-count semantics are database constraints', () => {
  has(/session_kind = 'campaign'[\s\S]*level = 12 THEN 30[\s\S]*level = 11 THEN 25[\s\S]*ELSE 20/i);
  has(/session_kind = 'custom' AND expected_hands IN \(10, 25, 50, 100\)/i);
  has(/session_kind = 'daily' AND expected_hands = 1 AND level = 1/i);
  has(/session_kind = 'replay' AND expected_hands BETWEEN 1 AND 100/i);
  has(/normalized_kind = 'daily'[\s\S]*normalized_game <> 'daily-challenge'[\s\S]*normalized_nonce <> 'daily-' \|\| today_chicago::text/i);
  has(/normalized_kind = 'replay'[\s\S]*TRAINING_ATTEMPT_REPLAY_PARENT_REQUIRED/i);
  has(/normalized_kind = 'replay'[\s\S]*practiceOnly/i);
});

test('the exact start RPC is nonce-idempotent and validates retry and replay ownership', () => {
  has(/FUNCTION public\.fn_start_training_attempt_v2\([\s\S]*p_user_id uuid,[\s\S]*p_client_nonce text,[\s\S]*p_parent_attempt_id uuid DEFAULT NULL[\s\S]*\)\s*RETURNS jsonb/i);
  has(/ON CONFLICT \(user_id, client_nonce, game_id, level, session_kind\) DO NOTHING/i);
  has(/FOR KEY SHARE/i);
  has(/parent_row\.user_id <> p_user_id/i);
  has(/parent_row\.game_id <> normalized_game/i);
  has(/parent_row\.level <> p_level/i);
  has(/parent_row\.status <> 'completed'/i);
  has(/TRAINING_ATTEMPT_NONCE_CONFLICT/i);
  has(/FOR UPDATE/i);
  has(/attempt_row\.status = 'open' AND attempt_row\.expires_at <= now\(\)/i);
  has(/TRAINING_ATTEMPT_EXPIRED/i);
  has(/attempt_row\.status <> 'open'/i);
  has(/TRAINING_ATTEMPT_NOT_OPEN/i);
  has(/TRAINING_ATTEMPT_LEVEL_LOCKED/i);
});

test('answers are bound to immutable attempt, hand, decision and snapshot identities', () => {
  for (const column of ['attempt_id', 'hand_ordinal', 'decision_ordinal', 'snapshot_key']) {
    has(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`, 'i'));
  }
  has(/FOREIGN KEY \(attempt_id, hand_ordinal\)[\s\S]*training_attempt_hands/i);
  has(/training_answers_attempt_decision_key[\s\S]*attempt_id, hand_ordinal, decision_ordinal/i);
  has(/NEW\.session_id <> attempt_row\.client_nonce/i);
  has(/NEW\.decision_ordinal = 1 AND hand_row\.snapshot_key <> NEW\.snapshot_key/i);
  has(/NEW\.decision_ordinal > 1 AND NOT EXISTS[\s\S]*prior\.decision_ordinal = NEW\.decision_ordinal - 1/i);
  has(/TRAINING_ATTEMPT_ANSWER_IMMUTABLE/i);
  has(/exact receipt replay[\s\S]*submission_id = NEW\.submission_id/i);
});

test('only the first decision scores a hand and continuation rows cannot inflate completion', () => {
  has(/scoring_rule text NOT NULL DEFAULT 'initial_decision'/i);
  has(/NEW\.decision_ordinal = 1[\s\S]*SET status = 'scored'/i);
  has(/answers\.decision_ordinal = 1/i);
  has(/training_answers_attempt_decision_key/i);
  assert.doesNotMatch(
    sql,
    /FROM public\.training_answers[\s\S]{0,500}LIMIT\s+(required_questions|attempt_row\.expected_hands)/i,
    'completion must never truncate arbitrary answer rows to fake a hand count',
  );
});

test('completion locks the attempt and atomically derives every materialized result', () => {
  has(/FUNCTION public\.fn_complete_training_attempt_v2\([\s\S]*p_user_id uuid,[\s\S]*p_attempt_id uuid[\s\S]*\)\s*RETURNS jsonb/i);
  has(/WHERE id = p_attempt_id\s+FOR UPDATE/i);
  has(/manifest_hands <> attempt_row\.expected_hands/i);
  has(/answered <> attempt_row\.expected_hands/i);
  has(/INSERT INTO public\.training_level_history/i);
  has(/IF NOT attempt_row\.practice_only THEN[\s\S]*INSERT INTO public\.training_streaks AS streaks/i);
  has(/ON CONFLICT \(user_id\) DO UPDATE SET[\s\S]*last_training_date = today_chicago/i);
  has(/today_chicago date := timezone\('America\/Chicago', now\(\)\)::date/i);
  has(/INSERT INTO public\.training_progress AS progress/i);
  assert.equal(
    (sql.match(/PERFORM public\.fn_training_verified_leaderboard_record_v2\(/g) || []).length,
    4,
    'daily, weekly, monthly and all-time leaderboard writes must remain atomic',
  );
  has(/WHEN attempt_row\.practice_only THEN 0/i);
  has(/reward_reference := 'training_attempt:' \|\| attempt_row\.id::text[\s\S]*award_diamonds_v2\([\s\S]*'training_reward'[\s\S]*reward_reference/i);
  has(/reward_awarded := greatest\(0,[\s\S]*award_result ->> 'awarded'/i);
  has(/TRAINING_REWARD_RESPONSE_INVALID/i);
  has(/reward_reason IN \('action_limit', 'daily_cap', 'monthly_cap', 'budget_exhausted'\)/i);
  has(/TRAINING_REWARD_DUPLICATE_UNVERIFIED/i);
  has(/FROM public\.diamond_transactions transactions[\s\S]*transactions\.reference_id = reward_reference/i);
  has(/TRAINING_REWARD_NOT_SETTLED/i);
  has(/IF NOT attempt_row\.practice_only THEN[\s\S]*INSERT INTO public\.training_progress/i);
  has(/rewardReference'[\s\S]*training_attempt:/i);
  has(/weekly_key := to_char\(now_utc, 'IYYY-"W"IW'\)/i);
  has(/'trainingStreak', to_jsonb\(streak_row\)/i);
  has(/WHEN attempt_row\.session_kind = 'daily'[\s\S]*CASE WHEN daily_already_completed THEN 0 ELSE 25 END/i);
  has(/INSERT INTO public\.training_daily_challenge[\s\S]*attempt_row\.client_nonce[\s\S]*daily_selected_action/i);
  has(/'dailyChallenge', to_jsonb\(daily_row\)/i);
  has(/IF attempt_row\.status = 'completed'[\s\S]*'newCompletion', false/i);
  has(/passed = complete_attempt\.passed/i);
  has(/reward_diamonds = complete_attempt\.reward_awarded/i);
});

test('analytics session persistence is server-derived, idempotent and never awards currency', () => {
  has(/ADD COLUMN IF NOT EXISTS attempt_id uuid/i);
  has(/training_sessions_attempt_key[\s\S]*training_sessions \(attempt_id\)/i);
  has(/FUNCTION public\.fn_save_training_session_v2\([\s\S]*p_user_id uuid,[\s\S]*p_attempt_id uuid/i);
  has(/attempt_row\.status <> 'completed'/i);
  has(/'decisionOrdinal', answer\.decision_ordinal/i);
  has(/ORDER BY answer\.hand_ordinal, answer\.decision_ordinal/i);
  has(/continuation_decision_count/i);
  has(/WHERE answer\.attempt_id = attempt_row\.id;/i);
  assert.doesNotMatch(
    sql,
    /FUNCTION public\.fn_save_training_session_v2[\s\S]*?WHERE answer\.attempt_id = attempt_row\.id\s+AND answer\.decision_ordinal = 1/i,
    'analytics must retain every exact multi-street decision',
  );
  has(/ON CONFLICT \(attempt_id\)[\s\S]*DO NOTHING/i);
  has(/'diamondsEarned', 0/i);
  assert.doesNotMatch(
    sql,
    /fn_save_training_session_v2[\s\S]*PERFORM\s+public\.award_diamonds/i,
    'analytics persistence must not award a second reward',
  );
});

test('analytics projection preserves the policy checksum required by the cache completion trigger', () => {
  assert.match(sessionPolicyProjectionSql, /^BEGIN;$/mi);
  assert.match(sessionPolicyProjectionSql, /SET LOCAL lock_timeout = '5s'/i);
  assert.match(sessionPolicyProjectionSql, /SET LOCAL statement_timeout = '120s'/i);
  assert.match(
    sessionPolicyProjectionSql,
    /'policyChecksum',\s*lower\(answer\.evidence_metadata ->> 'policyChecksum'\)/i,
  );
  assert.match(
    sessionPolicyProjectionSql,
    /phase6_session_projection_repair_targets[\s\S]*attempt\.status = 'completed'[\s\S]*NOT EXISTS \([\s\S]*public\.training_sessions/i,
  );
  assert.match(
    sessionPolicyProjectionSql,
    /NOT EXISTS \([\s\S]*public\.training_answers answer[\s\S]*policyChecksum[\s\S]*!~ '\^\[0-9a-f\]\{64\}\$'/i,
  );
  assert.match(
    sessionPolicyProjectionSql,
    /result := public\.fn_save_training_session_v2\(target\.user_id, target\.id\)/i,
  );
  assert.match(sessionPolicyProjectionSql, /TRAINING_SESSION_POLICY_PROJECTION_REPAIR_INCOMPLETE/i);
  assert.match(
    sessionPolicyProjectionSql,
    /REVOKE ALL ON FUNCTION public\.fn_save_training_session_v2\(uuid, uuid\)[\s\S]*FROM PUBLIC, anon, authenticated/i,
  );
  assert.match(
    sessionPolicyProjectionSql,
    /GRANT EXECUTE ON FUNCTION public\.fn_save_training_session_v2\(uuid, uuid\)[\s\S]*TO service_role/i,
  );
  assert.match(sessionPolicyProjectionSql, /COMMIT;\s*$/i);
});

test('streak milestone claims are atomic, server-priced and service-only', () => {
  has(/CREATE TABLE IF NOT EXISTS public\.training_streak_milestone_claims/i);
  has(/diamonds_awarded integer NOT NULL DEFAULT 0/i);
  has(/entitlement_diamonds integer/i);
  has(/reward_multiplier numeric\(12,6\)/i);
  has(/PRIMARY KEY \(user_id, milestone_days\)/i);
  has(/FUNCTION public\.fn_claim_training_streak_milestone_v2\([\s\S]*p_user_id uuid,[\s\S]*p_milestone_days integer/i);
  const claimFunction = sql.match(
    /CREATE OR REPLACE FUNCTION public\.fn_claim_training_streak_milestone_v2\([\s\S]*?\$function\$;/i,
  )?.[0] || '';
  const userLock = claimFunction.indexOf('pg_catalog.pg_advisory_xact_lock');
  const streakLock = claimFunction.indexOf('FROM public.training_streaks');
  assert.ok(userLock >= 0, 'milestone claims require the shared per-user award lock');
  assert.ok(streakLock > userLock, 'the shared per-user lock must precede the streak row lock');
  assert.match(claimFunction, /1799876946[\s\S]*pg_catalog\.hashtext\(p_user_id::text\)/i);
  has(/FROM public\.training_streaks[\s\S]*WHERE user_id = p_user_id[\s\S]*FOR UPDATE/i);
  has(/greatest\([\s\S]*streak_row\.authority_current_streak[\s\S]*streak_row\.authority_longest_streak[\s\S]*< p_milestone_days/i);
  has(/streak_row\.authority_milestones_claimed[\s\S]*@> jsonb_build_array\(p_milestone_days\)/i);
  has(/award_diamonds_v2\([\s\S]*'streak_reward'[\s\S]*claim_reference/i);
  has(/'streak_diamonds', award_remaining/i);
  has(/'post_multiplier_entitlement', award_entitlement > 0/i);
  has(/award_total := claim_row\.diamonds_awarded \+ award_amount/i);
  has(/milestone_completed := award_total >= award_entitlement/i);
  has(/UPDATE public\.training_streak_milestone_claims[\s\S]*diamonds_awarded = award_total[\s\S]*entitlement_diamonds = award_entitlement[\s\S]*reward_multiplier = award_multiplier[\s\S]*claim_count = claim_count \+ 1/i);
  const claimLedgerLock = claimFunction.indexOf('FROM public.training_streak_milestone_claims');
  const claimedShortcut = claimFunction.indexOf('streak_row.authority_milestones_claimed');
  assert.ok(claimLedgerLock > streakLock, 'the claim ledger must lock after the streak row');
  assert.ok(claimedShortcut > claimLedgerLock, 'ledger truth must be loaded before the claimed shortcut');
  has(/IF milestone_completed THEN[\s\S]*UPDATE public\.training_streaks/i);
  has(/UPDATE public\.training_streaks[\s\S]*authority_milestones_claimed[\s\S]*jsonb_build_array\(p_milestone_days\)/i);
  has(/REVOKE ALL ON public\.training_streak_milestone_claims FROM PUBLIC, anon, authenticated/i);
  has(/REVOKE ALL ON FUNCTION public\.fn_claim_training_streak_milestone_v2\(uuid, integer\)[\s\S]*FROM PUBLIC, anon, authenticated/i);
  has(/GRANT EXECUTE ON FUNCTION public\.fn_claim_training_streak_milestone_v2\(uuid, integer\) TO service_role/i);
});

test('the browser cannot write scoring stores, read answer snapshots or call service RPCs', () => {
  has(/REVOKE ALL ON public\.training_question_snapshots FROM PUBLIC, anon, authenticated/i);
  has(/ALTER TABLE public\.training_question_cache ENABLE ROW LEVEL SECURITY/i);
  has(/REVOKE SELECT ON public\.training_question_cache FROM PUBLIC, anon, authenticated/i);
  has(/GRANT SELECT ON public\.training_question_cache TO service_role/i);
  has(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE[\s\S]*public\.training_answers[\s\S]*FROM PUBLIC, anon, authenticated/i);
  has(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE[\s\S]*public\.training_streaks[\s\S]*FROM PUBLIC, anon, authenticated/i);
  has(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE[\s\S]*public\.training_leaderboard[\s\S]*FROM PUBLIC, anon, authenticated/i);
  has(/REVOKE ALL ON public\.training_questions FROM PUBLIC, anon, authenticated/i);
  has(/REVOKE ALL ON public\.training_daily_challenge FROM PUBLIC, anon, authenticated/i);
  has(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE[\s\S]*public\.training_hand_replay[\s\S]*FROM PUBLIC, anon, authenticated/i);
  has(/CREATE POLICY training_hand_replay_select_self_v2[\s\S]*auth\.uid\(\)[\s\S]*user_id/i);
  has(/CREATE POLICY training_streaks_select_self_v2[\s\S]*auth\.uid\(\)[\s\S]*user_id/i);
  has(/REVOKE ALL ON FUNCTION public\.fn_start_training_attempt_v2[\s\S]*FROM PUBLIC, anon, authenticated/i);
  has(/REVOKE ALL ON FUNCTION public\.fn_complete_training_attempt_v2[\s\S]*FROM PUBLIC, anon, authenticated/i);
  has(/REVOKE ALL ON FUNCTION public\.fn_save_training_session_v2[\s\S]*FROM PUBLIC, anon, authenticated/i);
  has(/REVOKE ALL ON FUNCTION public\.fn_claim_training_streak_milestone_v2[\s\S]*FROM PUBLIC, anon, authenticated/i);
  has(/REVOKE ALL ON FUNCTION public\.fn_training_leaderboard_record\(uuid, text, text, integer, integer, boolean, integer, numeric, numeric\)[\s\S]*FROM PUBLIC, anon, authenticated/i);
  has(/GRANT EXECUTE ON FUNCTION public\.fn_training_leaderboard_record\(uuid, text, text, integer, integer, boolean, integer, numeric, numeric\)[\s\S]*TO service_role/i);
  has(/GRANT EXECUTE ON FUNCTION public\.fn_start_training_attempt_v2[\s\S]*TO service_role/i);
  has(/get_random_cached_question\(text, integer, text, uuid, text\[\]\)[\s\S]*FROM PUBLIC, anon, authenticated/i);
  has(/get_next_training_question\(uuid, integer\)[\s\S]*FROM PUBLIC, anon, authenticated/i);
  has(/training_leaderboard_refresh\(\)[\s\S]*FROM PUBLIC, anon, authenticated/i);
  has(/fn_add_xp\(uuid, integer\)[\s\S]*FROM PUBLIC, anon, authenticated/i);
  has(/unlock_achievement\(uuid, text\)[\s\S]*FROM PUBLIC, anon, authenticated/i);
  has(/DROP FUNCTION public\.claim_reward\(uuid, uuid\)/i);
  has(/DROP FUNCTION public\.complete_daily_challenge\(uuid, text\)/i);
  for (const table of [
    'training_spaced_repetition',
    'jarvis_training_sessions',
    'jarvis_user_training_profile',
    'user_question_history',
    'user_level_progress',
    'training_user_achievements',
    'training_user_challenges',
    'training_tournament_entries',
    'training_daily_bonus',
  ]) {
    has(new RegExp(`['\"]${table}['\"]`, 'i'), `${table} must be in the legacy truth lockdown`);
  }
  has(/browser-facing role retains forbidden Training authority/i);
});

test('the migration is additive and does not mutate the legacy question source', () => {
  assert.doesNotMatch(sql, /DROP TABLE\s+(?:IF EXISTS\s+)?public\.training_question_cache/i);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM|TRUNCATE)\s+public\.training_question_cache/i);
  assert.doesNotMatch(sql, /ALTER TABLE\s+public\.training_question_cache\s+(?:ADD|DROP|ALTER COLUMN|RENAME)/i);
  has(/ALTER TABLE public\.training_question_cache ENABLE ROW LEVEL SECURITY/i);
  has(/legacy training_question_cache is their source/i);
});

test('the migration version is unique in the canonical migrations directory', () => {
  const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
  const matchingNames = readdirSync(migrationDirectory)
    .filter((name) => name.startsWith('20260907010000_'));
  assert.deepEqual(matchingNames, ['20260907010000_training_server_authoritative_completion.sql']);
});
