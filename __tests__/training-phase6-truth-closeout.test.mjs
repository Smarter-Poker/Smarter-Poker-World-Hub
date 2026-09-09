import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(ROOT, relativePath), 'utf8');
const authority = read(
  'supabase/migrations/20260907203000_training_attempt_decision_delivery_authority.sql',
);
const closeout = read(
  'supabase/migrations/20260908151000_training_phase6_cache_and_level_stats_authority.sql',
);
const verifier = read('scripts/verify-training-phase6-truth-postgres.mjs');
const delivery = read('src/lib/training/trainingAttemptDelivery.mjs');

test('attempt grading derives grouped and RNG authority from immutable pre-answer evidence', () => {
  assert.match(authority, /fn_training_grade_delivered_policy_v1/);
  assert.match(authority, /v_policy_action ->> 'family'/);
  assert.match(authority, /WHEN v_pct <= 40 THEN 'grouped_small'/);
  assert.match(authority, /WHEN v_pct <= 80 THEN 'grouped_medium'/);
  assert.match(authority, /WHEN v_pct <= 100 THEN 'grouped_large'/);
  assert.match(authority, /ELSE 'grouped_overbet'/);
  assert.match(authority, /v_delivery\.metadata -> 'rngRolls'/);
  assert.match(authority, /training_answer_rng_authority_mismatch/);
  assert.match(authority, /v_existing\.metadata IS DISTINCT FROM v_event_metadata/);
  assert.match(delivery, /difficultyMode,/);
  assert.match(delivery, /rngRolls: \{ low: rngRolls\.low, high: rngRolls\.high \}/);
});

test('post-081400 closeout restores strict truth and exposes owner-bound level stats', () => {
  assert.match(closeout, /fn_training_record_answer_cache_event_v1\(NEW\)/);
  assert.match(closeout, /CREATE OR REPLACE FUNCTION public\.fn_training_cache_record_event\([\s\S]*answered_event_requires_selected_answer/);
  assert.match(closeout, /v_existing\.metadata IS DISTINCT FROM v_metadata/);
  assert.match(closeout, /Preserve the Phase 6 immutable replay contract/);
  assert.match(closeout, /CREATE OR REPLACE FUNCTION public\.get_user_level_stats\([\s\S]*p_level_id integer/);
  assert.match(closeout, /total_questions bigint[\s\S]*correct_answers bigint[\s\S]*accuracy numeric,[\s\S]*avg_ev_loss numeric/);
  assert.match(closeout, /FROM public\.training_answers answer[\s\S]*JOIN public\.training_attempts attempt/);
  assert.match(closeout, /position\('user_question_history' IN v_stats_definition\) > 0/);
  assert.match(closeout, /p_user_id IS DISTINCT FROM auth\.uid\(\)/);
  assert.match(closeout, /SELECT auth\.role\(\)[\s\S]*<> 'service_role'/);
  assert.match(closeout, /REVOKE ALL ON FUNCTION public\.get_user_level_stats\(uuid, integer\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(closeout, /GRANT EXECUTE ON FUNCTION public\.get_user_level_stats\(uuid, integer\)[\s\S]*TO authenticated, service_role/);
  assert.match(closeout, /COMMENT ON FUNCTION public\.get_user_level_stats\(uuid\)[\s\S]*Legacy one-argument profile-XP compatibility overload/);
});

test('PostgreSQL 17 verifier applies the real ordered overwrite chain and adversarial matrix', () => {
  for (const marker of [
    '20260907070000_training_cache_truth_enforcement.sql',
    '20260907203000_training_attempt_decision_delivery_authority.sql',
    '20260908140000_training_cache_event_integrity.sql',
    '20260908151000_training_phase6_cache_and_level_stats_authority.sql',
    "ARRAY['grade','frequency','ev','lineage','source-checksum']",
    "'rng-roll'",
    "'rng-target'",
    'cross-user level stats read was accepted',
    'service-role level stats authority was wrong',
    'Mirror the insecure overload already present in production',
    'phase6_truth_production_order',
    "productionOrder: ['070700', '081400', '072000', '072030', '081510']",
    'FINAL_FINGERPRINT_SQL',
    'migrationReapply: true',
    'immutable cache-event replay accepted changed metadata',
  ]) assert.ok(verifier.includes(marker), marker);
  assert.match(verifier, /--locale=en_US\.UTF-8/);
  assert.match(verifier, /server_version_num/);
  assert.match(verifier, /server_encoding/);
  assert.match(verifier, /datcollate/);
});
