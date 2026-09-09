import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL(
  '../supabase/migrations/20260907200500_training_phase6_acl_contract_closeout.sql',
  import.meta.url,
), 'utf8');
const verifier = readFileSync(new URL(
  '../scripts/verify-training-acl-closeout-postgres.mjs',
  import.meta.url,
), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the additive closeout resets authority and Memory tables to explicit ACLs', () => {
  assert.match(migration, /^BEGIN;$/m);
  assert.match(migration, /SET LOCAL lock_timeout = '5s'/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /REVOKE ALL PRIVILEGES \(%s\) ON TABLE public\.%I FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.training_question_snapshots TO service_role/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON TABLE public\.training_question_cache TO service_role/);
  assert.doesNotMatch(
    migration,
    /GRANT[^;]*DELETE[^;]*public\.training_question_cache TO service_role/,
    'cache repair deletes must stay behind owner-executed maintenance functions',
  );
  assert.match(migration, /GRANT SELECT ON TABLE public\.training_attempts TO authenticated, service_role/);
  assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.training_attempt_hands TO service_role/);
  assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.training_answers TO service_role/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.memory_game_sessions TO authenticated, service_role/);
  assert.match(migration, /GRANT SELECT ON TABLE public\.memory_leaderboards TO anon, authenticated, service_role/);
  assert.match(migration, /COMMIT;\s*$/);
});

test('legacy feature tables lose utility privileges without a blanket CRUD reset', () => {
  assert.match(
    migration,
    /REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public\.%I FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /REVOKE REFERENCES \(%s\) ON TABLE public\.%I FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    migration,
    /REVOKE ALL PRIVILEGES ON TABLE public\.%I[\s\S]{0,500}user_seen_questions/,
    'legacy feature tables must preserve established SELECT and server CRUD contracts',
  );
});

test('all five internal trigger helpers become owner-only', () => {
  for (const functionName of [
    'fn_training_snapshot_immutable_v2',
    'fn_validate_training_attempt_hand_v2',
    'fn_validate_training_answer_v2',
    'fn_reject_training_answer_delete_v2',
    'fn_score_training_attempt_hand_v2',
  ]) {
    assert.match(
      migration,
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${functionName}\\(\\)[\\s\\S]{0,80}FROM PUBLIC, anon, authenticated, service_role`),
    );
  }
});

test('postflight checks full PostgreSQL 17, column, RLS, policy, function, and sequence contracts', () => {
  for (const privilege of [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN',
  ]) {
    assert.match(migration, new RegExp(`\\('${privilege}'\\)`));
  }
  assert.match(migration, /aclexplode\(attribute\.attacl\)/);
  assert.match(migration, /aclexplode\(relation\.relacl\)/);
  assert.match(migration, /TRAINING_ACL_CLOSEOUT_PUBLIC_TABLE_ACL_REMAINS/);
  assert.match(migration, /TRAINING_ACL_CLOSEOUT_COLUMN_ACL_REMAINS/);
  assert.match(migration, /TRAINING_ACL_CLOSEOUT_COLUMN_REFERENCE_REMAINS/);
  assert.match(migration, /TRAINING_ACL_CLOSEOUT_RLS_DISABLED/);
  assert.match(migration, /TRAINING_ACL_CLOSEOUT_BROWSER_MUTATION_POLICY_REMAINS/);
  assert.match(migration, /TRAINING_ACL_CLOSEOUT_CANONICAL_READ_POLICY_MISSING/);
  assert.match(migration, /policy\.permissive = 'PERMISSIVE'/);
  assert.match(migration, /policy\.roles @> expected\.policy_roles/);
  assert.match(migration, /policy\.roles <@ expected\.policy_roles/);
  assert.match(migration, /TRAINING_ACL_CLOSEOUT_EXTRA_BROWSER_READ_POLICY_REMAINS/);
  assert.match(migration, /TRAINING_ACL_CLOSEOUT_TRIGGER_HELPER_EXECUTABLE/);
  assert.match(migration, /dependency\.deptype IN \('a', 'i'\)/);
  assert.match(
    migration,
    /'memory_game_sessions', 'memory_leaderboards', 'user_seen_questions',[\s\S]{0,500}'training_daily_bonus'/,
    'owned-sequence protection must cover all 27 exact and legacy targets',
  );
  assert.match(migration, /TRAINING_ACL_CLOSEOUT_UNEXPECTED_OWNED_SEQUENCE/);
});

test('the disposable verifier recreates production defaults and applies the closeout twice', () => {
  assert.match(verifier, /GRANT ALL ON TABLES TO anon, authenticated, service_role/);
  assert.match(verifier, /GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role/);
  assert.match(verifier, /GRANT ALL ON SEQUENCES TO anon, authenticated, service_role/);
  assert.match(verifier, /prove_fixture_matches_live_leaks/);
  assert.match(verifier, /GRANT DELETE ON TABLE public\.training_question_cache TO PUBLIC/);
  assert.match(verifier, /GRANT SELECT \(user_id\) ON TABLE public\.training_attempts TO PUBLIC/);
  assert.match(verifier, /GRANT REFERENCES \(user_id\) ON TABLE public\.user_seen_questions/);
  assert.match(verifier, /training_attempts_select_self[\s\S]{0,80}USING \(true\)/);
  assert.match(verifier, /authenticated-user-a/);
  assert.match(verifier, /authenticated-user-b/);
  assert.match(verifier, /anonymous-memory-leaderboard/);
  assert.match(verifier, /rls_checks <> 13/);
  assert.match(verifier, /rls\.check_count = 13/);
  assert.match(verifier, /exact_privilege_mismatches/);
  assert.match(verifier, /exact_column_acl_entries/);
  assert.match(verifier, /legacy_column_reference_acl_entries/);
  assert.equal(
    (verifier.match(/'-f', MIGRATION/g) || []).length,
    4,
    'two successful applications plus two rejected adversarial applications are required',
  );
  assert.match(verifier, /TRAINING_ACL_CLOSEOUT_EXTRA_BROWSER_READ_POLICY_REMAINS/);
  assert.match(verifier, /phase6_owned_sequence_probe/);
  assert.match(verifier, /TRAINING_ACL_CLOSEOUT_UNEXPECTED_OWNED_SEQUENCE/);
  assert.match(verifier, /successfulMigrationApplications: 2/);
  assert.match(verifier, /rejectedAdversarialApplications: 2/);
  assert.doesNotMatch(verifier, /'ownedSequences', 0/);
  assert.doesNotMatch(verifier, /'passed', true/);
  assert.equal(
    packageJson.scripts['audit:training:acl-db'],
    'node scripts/verify-training-acl-closeout-postgres.mjs',
  );
  assert.match(packageJson.scripts['audit:training:phase6-db'], /audit:training:acl-db/);
});
