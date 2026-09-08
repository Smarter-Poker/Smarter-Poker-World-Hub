#!/usr/bin/env node

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260907200500_training_phase6_acl_contract_closeout.sql',
);

function command(binary, args, { input, quiet = false } = {}) {
  const result = spawnSync(binary, args, {
    cwd: ROOT,
    encoding: 'utf8',
    input,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error([
      `${path.basename(binary)} ${args.join(' ')} failed with status ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  if (!quiet && result.stdout?.trim()) process.stdout.write(result.stdout);
  return result;
}

function expectCommandFailure(binary, args, expectedMarker) {
  const result = spawnSync(binary, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.status === 0 || !combined.includes(expectedMarker)) {
    throw new Error([
      `${path.basename(binary)} ${args.join(' ')} did not fail with ${expectedMarker}`,
      combined,
    ].filter(Boolean).join('\n'));
  }
}

function resolvePostgresBin() {
  const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
  const candidates = [
    process.env.PHASE6_POSTGRES_BIN,
    pgConfig.status === 0 ? pgConfig.stdout.trim() : null,
    '/opt/homebrew/opt/postgresql@17/bin',
    '/usr/local/opt/postgresql@17/bin',
    '/usr/lib/postgresql/17/bin',
    '/usr/local/pgsql/bin',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (
      ['postgres', 'initdb', 'pg_ctl', 'psql', 'createdb'].every((tool) => existsSync(path.join(candidate, tool)))
    ) {
      const version = spawnSync(path.join(candidate, 'postgres'), ['--version'], { encoding: 'utf8' });
      if (version.status === 0 && /\b17\.\d+\b/.test(version.stdout)) return candidate;
    }
  }
  const resolved = spawnSync('sh', ['-c', 'command -v postgres'], { encoding: 'utf8' });
  if (resolved.status === 0 && resolved.stdout.trim()) {
    const candidate = path.dirname(resolved.stdout.trim());
    const version = spawnSync(path.join(candidate, 'postgres'), ['--version'], { encoding: 'utf8' });
    if (version.status === 0 && /\b17\.\d+\b/.test(version.stdout)) return candidate;
  }
  throw new Error(
    'PostgreSQL 17 binaries are required. Set PHASE6_POSTGRES_BIN to the directory containing postgres, initdb, pg_ctl, psql, and createdb.',
  );
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (!port) throw new Error('Could not reserve a disposable PostgreSQL port.');
  return port;
}

const BASELINE_SQL = String.raw`
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

-- Reproduce the broad defaults measured on PokerIQ-Production. PostgreSQL 17
-- includes MAINTAIN in ALL TABLES, which is the privilege older assertions
-- failed to enumerate.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

DO $fixture_tables$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'training_question_snapshots', 'training_question_cache',
    'training_verified_leaderboard', 'training_streak_milestone_claims',
    'training_questions', 'training_daily_challenge', 'training_attempts',
    'training_attempt_hands', 'training_answers', 'training_hand_replay',
    'memory_game_sessions', 'memory_leaderboards', 'user_seen_questions',
    'training_streaks', 'training_progress', 'training_level_history',
    'training_sessions', 'training_leaderboard', 'training_spaced_repetition',
    'jarvis_training_sessions', 'jarvis_user_training_profile',
    'user_question_history', 'user_level_progress',
    'training_user_achievements', 'training_user_challenges',
    'training_tournament_entries', 'training_daily_bonus'
  ]
  LOOP
    EXECUTE format(
      'CREATE TABLE public.%I (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid)',
      table_name
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    -- Production already globally removed client TRUNCATE before Phase 6.
    EXECUTE format('REVOKE TRUNCATE ON TABLE public.%I FROM anon, authenticated', table_name);
  END LOOP;
END
$fixture_tables$;

ALTER TABLE public.training_attempt_hands ADD COLUMN attempt_id uuid;

CREATE POLICY training_attempts_select_self ON public.training_attempts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY training_attempt_hands_select_self ON public.training_attempt_hands
  FOR SELECT TO authenticated USING (true);
CREATE POLICY training_answers_select_self ON public.training_answers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY training_hand_replay_select_self_v2 ON public.training_hand_replay
  FOR SELECT TO authenticated USING (true);
CREATE POLICY memory_game_sessions_self_read ON public.memory_game_sessions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY memory_leaderboards_read ON public.memory_leaderboards
  FOR SELECT TO anon, authenticated USING (true);

DO $fixture_read_policies$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'user_seen_questions', 'training_streaks', 'training_progress',
    'training_level_history', 'training_sessions', 'training_spaced_repetition',
    'jarvis_training_sessions', 'jarvis_user_training_profile',
    'user_question_history', 'user_level_progress',
    'training_user_achievements', 'training_user_challenges',
    'training_tournament_entries', 'training_daily_bonus'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)',
      table_name || '_fixture_self_read',
      table_name
    );
  END LOOP;
END
$fixture_read_policies$;
CREATE POLICY training_leaderboard_fixture_read ON public.training_leaderboard
  FOR SELECT TO anon, authenticated USING (true);

-- Reproduce the partial revokes left by 070100 and 070102 before the closeout.
REVOKE ALL ON TABLE public.training_question_snapshots
  FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON TABLE public.training_question_cache
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.training_verified_leaderboard,
  public.training_streak_milestone_claims, public.training_questions,
  public.training_daily_challenge
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.training_attempts, public.training_attempt_hands,
  public.training_answers, public.training_hand_replay,
  public.user_seen_questions, public.training_streaks, public.training_progress,
  public.training_level_history, public.training_sessions,
  public.training_leaderboard, public.training_spaced_repetition,
  public.jarvis_training_sessions, public.jarvis_user_training_profile,
  public.user_question_history, public.user_level_progress,
  public.training_user_achievements, public.training_user_challenges,
  public.training_tournament_entries, public.training_daily_bonus
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.training_attempts, public.training_attempt_hands,
  public.training_answers, public.training_hand_replay TO authenticated;
GRANT SELECT, INSERT ON TABLE public.training_question_snapshots TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.training_question_snapshots FROM service_role;
GRANT SELECT ON TABLE public.training_verified_leaderboard,
  public.training_streak_milestone_claims, public.training_questions,
  public.training_daily_challenge, public.training_attempts,
  public.training_hand_replay TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.training_verified_leaderboard, public.training_streak_milestone_claims,
  public.training_questions, public.training_daily_challenge,
  public.training_attempts, public.training_hand_replay FROM service_role;
GRANT SELECT, INSERT ON TABLE public.training_attempt_hands,
  public.training_answers TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.training_attempt_hands,
  public.training_answers FROM service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.memory_game_sessions, public.memory_leaderboards
  FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON TABLE public.memory_game_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.memory_game_sessions TO authenticated, service_role;
GRANT SELECT ON TABLE public.memory_leaderboards TO anon, authenticated, service_role;

-- Seed the ACL forms the original migrations failed to clear. Table-level
-- REVOKE is not sufficient for explicit per-column grants.
GRANT DELETE ON TABLE public.training_question_cache TO PUBLIC;
GRANT SELECT (user_id) ON TABLE public.training_attempts TO PUBLIC;
GRANT UPDATE (user_id) ON TABLE public.training_answers TO authenticated;
GRANT REFERENCES (user_id) ON TABLE public.user_seen_questions
  TO PUBLIC, authenticated, service_role;

CREATE FUNCTION public.fn_training_snapshot_immutable_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION public.fn_validate_training_attempt_hand_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION public.fn_validate_training_answer_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION public.fn_reject_training_answer_delete_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN OLD; END $$;
CREATE FUNCTION public.fn_score_training_attempt_hand_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.fn_training_snapshot_immutable_v2(),
  public.fn_validate_training_attempt_hand_v2(),
  public.fn_validate_training_answer_v2(),
  public.fn_reject_training_answer_delete_v2(),
  public.fn_score_training_attempt_hand_v2()
  FROM PUBLIC, anon, authenticated;

DO $prove_fixture_matches_live_leaks$
BEGIN
  IF NOT has_table_privilege('anon', 'public.training_question_cache', 'INSERT,UPDATE,DELETE,REFERENCES,TRIGGER,MAINTAIN')
     OR NOT has_table_privilege('authenticated', 'public.memory_game_sessions', 'MAINTAIN')
     OR NOT has_table_privilege('service_role', 'public.memory_game_sessions', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     OR NOT has_table_privilege('authenticated', 'public.training_attempts', 'REFERENCES,TRIGGER,MAINTAIN')
     OR NOT has_function_privilege('service_role', 'public.fn_training_snapshot_immutable_v2()', 'EXECUTE')
       OR NOT EXISTS (
         SELECT 1 FROM pg_attribute attribute
         CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
         WHERE attribute.attrelid = 'public.training_attempts'::regclass
           AND attribute.attname = 'user_id'
           AND acl.grantee = 0
           AND acl.privilege_type = 'SELECT'
       )
       OR NOT EXISTS (
         SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'training_attempts'
           AND policyname = 'training_attempts_select_self'
           AND qual = 'true'
       ) THEN
    RAISE EXCEPTION 'fixture did not reproduce the measured production ACL gaps';
  END IF;
END
$prove_fixture_matches_live_leaks$;
`;

const VERIFY_SQL = String.raw`
CREATE TEMP TABLE phase6_exact_targets (table_name text PRIMARY KEY);
INSERT INTO phase6_exact_targets(table_name) VALUES
  ('training_question_snapshots'), ('training_question_cache'),
  ('training_verified_leaderboard'), ('training_streak_milestone_claims'),
  ('training_questions'), ('training_daily_challenge'), ('training_attempts'),
  ('training_attempt_hands'), ('training_answers'), ('training_hand_replay'),
  ('memory_game_sessions'), ('memory_leaderboards');

CREATE TEMP TABLE phase6_legacy_targets (table_name text PRIMARY KEY);
INSERT INTO phase6_legacy_targets(table_name) VALUES
  ('user_seen_questions'), ('training_streaks'), ('training_progress'),
  ('training_level_history'), ('training_sessions'), ('training_leaderboard'),
  ('training_spaced_repetition'), ('jarvis_training_sessions'),
  ('jarvis_user_training_profile'), ('user_question_history'),
  ('user_level_progress'), ('training_user_achievements'),
  ('training_user_challenges'), ('training_tournament_entries'),
  ('training_daily_bonus');

CREATE TEMP TABLE phase6_expected_acl (
  table_name text NOT NULL,
  role_name text NOT NULL,
  privileges text[] NOT NULL,
  PRIMARY KEY (table_name, role_name)
);
INSERT INTO phase6_expected_acl(table_name, role_name, privileges) VALUES
  ('training_question_snapshots', 'anon', ARRAY[]::text[]),
  ('training_question_snapshots', 'authenticated', ARRAY[]::text[]),
  ('training_question_snapshots', 'service_role', ARRAY['SELECT','INSERT']),
  ('training_question_cache', 'anon', ARRAY[]::text[]),
  ('training_question_cache', 'authenticated', ARRAY[]::text[]),
  ('training_question_cache', 'service_role', ARRAY['SELECT','INSERT','UPDATE']),
  ('training_verified_leaderboard', 'anon', ARRAY[]::text[]),
  ('training_verified_leaderboard', 'authenticated', ARRAY[]::text[]),
  ('training_verified_leaderboard', 'service_role', ARRAY['SELECT']),
  ('training_streak_milestone_claims', 'anon', ARRAY[]::text[]),
  ('training_streak_milestone_claims', 'authenticated', ARRAY[]::text[]),
  ('training_streak_milestone_claims', 'service_role', ARRAY['SELECT']),
  ('training_questions', 'anon', ARRAY[]::text[]),
  ('training_questions', 'authenticated', ARRAY[]::text[]),
  ('training_questions', 'service_role', ARRAY['SELECT']),
  ('training_daily_challenge', 'anon', ARRAY[]::text[]),
  ('training_daily_challenge', 'authenticated', ARRAY[]::text[]),
  ('training_daily_challenge', 'service_role', ARRAY['SELECT']),
  ('training_attempts', 'anon', ARRAY[]::text[]),
  ('training_attempts', 'authenticated', ARRAY['SELECT']),
  ('training_attempts', 'service_role', ARRAY['SELECT']),
  ('training_attempt_hands', 'anon', ARRAY[]::text[]),
  ('training_attempt_hands', 'authenticated', ARRAY['SELECT']),
  ('training_attempt_hands', 'service_role', ARRAY['SELECT','INSERT']),
  ('training_answers', 'anon', ARRAY[]::text[]),
  ('training_answers', 'authenticated', ARRAY['SELECT']),
  ('training_answers', 'service_role', ARRAY['SELECT','INSERT']),
  ('training_hand_replay', 'anon', ARRAY[]::text[]),
  ('training_hand_replay', 'authenticated', ARRAY['SELECT']),
  ('training_hand_replay', 'service_role', ARRAY['SELECT']),
  ('memory_game_sessions', 'anon', ARRAY[]::text[]),
  ('memory_game_sessions', 'authenticated', ARRAY['SELECT']),
  ('memory_game_sessions', 'service_role', ARRAY['SELECT']),
  ('memory_leaderboards', 'anon', ARRAY['SELECT']),
  ('memory_leaderboards', 'authenticated', ARRAY['SELECT']),
  ('memory_leaderboards', 'service_role', ARRAY['SELECT']);

CREATE TEMP TABLE phase6_expected_policies (
  table_name text PRIMARY KEY,
  policy_name text NOT NULL,
  policy_roles name[] NOT NULL
);
INSERT INTO phase6_expected_policies(table_name, policy_name, policy_roles) VALUES
  ('training_attempts', 'training_attempts_select_self', ARRAY['authenticated']::name[]),
  ('training_attempt_hands', 'training_attempt_hands_select_self', ARRAY['authenticated']::name[]),
  ('training_answers', 'training_answers_select_self', ARRAY['authenticated']::name[]),
  ('training_hand_replay', 'training_hand_replay_select_self_v2', ARRAY['authenticated']::name[]),
  ('memory_game_sessions', 'memory_game_sessions_self_read', ARRAY['authenticated']::name[]),
  ('memory_leaderboards', 'memory_leaderboards_read', ARRAY['anon','authenticated']::name[]);

INSERT INTO public.training_attempts(id, user_id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '22222222-2222-4222-8222-222222222222');
INSERT INTO public.training_attempt_hands(id, user_id, attempt_id) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
INSERT INTO public.training_answers(id, user_id) VALUES
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '11111111-1111-4111-8111-111111111111'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', '22222222-2222-4222-8222-222222222222');
INSERT INTO public.training_hand_replay(id, user_id) VALUES
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', '11111111-1111-4111-8111-111111111111'),
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd2', '22222222-2222-4222-8222-222222222222');
INSERT INTO public.memory_game_sessions(id, user_id) VALUES
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '11111111-1111-4111-8111-111111111111'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', '22222222-2222-4222-8222-222222222222');
INSERT INTO public.memory_leaderboards(id, user_id) VALUES
  ('ffffffff-ffff-4fff-8fff-fffffffffff1', '11111111-1111-4111-8111-111111111111'),
  ('ffffffff-ffff-4fff-8fff-fffffffffff2', '22222222-2222-4222-8222-222222222222');

CREATE TEMP TABLE phase6_rls_evidence (
  check_name text PRIMARY KEY,
  passed boolean NOT NULL,
  observed jsonb NOT NULL
);
GRANT INSERT ON TABLE phase6_rls_evidence TO anon, authenticated;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
INSERT INTO phase6_rls_evidence(check_name, passed, observed)
SELECT 'authenticated-user-a-attempts', own_count = 1 AND cross_count = 0,
  jsonb_build_object('ownCount', own_count, 'crossCount', cross_count)
FROM (
  SELECT
    (SELECT count(*) FROM public.training_attempts
      WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') AS own_count,
    (SELECT count(*) FROM public.training_attempts
      WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2') AS cross_count
) counts
UNION ALL
SELECT 'authenticated-user-a-hands', own_count = 1 AND cross_count = 0,
  jsonb_build_object('ownCount', own_count, 'crossCount', cross_count)
FROM (
  SELECT
    (SELECT count(*) FROM public.training_attempt_hands
      WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1') AS own_count,
    (SELECT count(*) FROM public.training_attempt_hands
      WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2') AS cross_count
) counts
UNION ALL
SELECT 'authenticated-user-a-answers', own_count = 1 AND cross_count = 0,
  jsonb_build_object('ownCount', own_count, 'crossCount', cross_count)
FROM (
  SELECT
    (SELECT count(*) FROM public.training_answers
      WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1') AS own_count,
    (SELECT count(*) FROM public.training_answers
      WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2') AS cross_count
) counts
UNION ALL
SELECT 'authenticated-user-a-replay', own_count = 1 AND cross_count = 0,
  jsonb_build_object('ownCount', own_count, 'crossCount', cross_count)
FROM (
  SELECT
    (SELECT count(*) FROM public.training_hand_replay
      WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1') AS own_count,
    (SELECT count(*) FROM public.training_hand_replay
      WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2') AS cross_count
) counts
UNION ALL
SELECT 'authenticated-user-a-memory-sessions', own_count = 1 AND cross_count = 0,
  jsonb_build_object('ownCount', own_count, 'crossCount', cross_count)
FROM (
  SELECT
    (SELECT count(*) FROM public.memory_game_sessions
      WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1') AS own_count,
    (SELECT count(*) FROM public.memory_game_sessions
      WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2') AS cross_count
) counts
UNION ALL
SELECT 'authenticated-user-a-memory-leaderboard', visible_count = 2,
  jsonb_build_object('visibleCount', visible_count)
FROM (SELECT count(*) AS visible_count FROM public.memory_leaderboards) counts;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
INSERT INTO phase6_rls_evidence(check_name, passed, observed)
SELECT 'authenticated-user-b-attempts', own_count = 1 AND cross_count = 0,
  jsonb_build_object('ownCount', own_count, 'crossCount', cross_count)
FROM (
  SELECT
    (SELECT count(*) FROM public.training_attempts
      WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2') AS own_count,
    (SELECT count(*) FROM public.training_attempts
      WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') AS cross_count
) counts
UNION ALL
SELECT 'authenticated-user-b-hands', own_count = 1 AND cross_count = 0,
  jsonb_build_object('ownCount', own_count, 'crossCount', cross_count)
FROM (
  SELECT
    (SELECT count(*) FROM public.training_attempt_hands
      WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2') AS own_count,
    (SELECT count(*) FROM public.training_attempt_hands
      WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1') AS cross_count
) counts
UNION ALL
SELECT 'authenticated-user-b-answers', own_count = 1 AND cross_count = 0,
  jsonb_build_object('ownCount', own_count, 'crossCount', cross_count)
FROM (
  SELECT
    (SELECT count(*) FROM public.training_answers
      WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2') AS own_count,
    (SELECT count(*) FROM public.training_answers
      WHERE id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1') AS cross_count
) counts
UNION ALL
SELECT 'authenticated-user-b-replay', own_count = 1 AND cross_count = 0,
  jsonb_build_object('ownCount', own_count, 'crossCount', cross_count)
FROM (
  SELECT
    (SELECT count(*) FROM public.training_hand_replay
      WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2') AS own_count,
    (SELECT count(*) FROM public.training_hand_replay
      WHERE id = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1') AS cross_count
) counts
UNION ALL
SELECT 'authenticated-user-b-memory-sessions', own_count = 1 AND cross_count = 0,
  jsonb_build_object('ownCount', own_count, 'crossCount', cross_count)
FROM (
  SELECT
    (SELECT count(*) FROM public.memory_game_sessions
      WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2') AS own_count,
    (SELECT count(*) FROM public.memory_game_sessions
      WHERE id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1') AS cross_count
) counts
UNION ALL
SELECT 'authenticated-user-b-memory-leaderboard', visible_count = 2,
  jsonb_build_object('visibleCount', visible_count)
FROM (SELECT count(*) AS visible_count FROM public.memory_leaderboards) counts;
RESET ROLE;

SET ROLE anon;
INSERT INTO phase6_rls_evidence(check_name, passed, observed)
SELECT 'anonymous-memory-leaderboard',
  (SELECT count(*) FROM public.memory_leaderboards) = 2,
  jsonb_build_object('memoryLeaderboard', (SELECT count(*) FROM public.memory_leaderboards));
RESET ROLE;

CREATE TEMP TABLE phase6_acl_metrics AS
WITH privilege_types(privilege) AS (VALUES
  ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
  ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
), exact_checks AS (
  SELECT expected.table_name, expected.role_name, privilege_types.privilege,
    privilege_types.privilege = ANY(expected.privileges) AS should_have,
    has_table_privilege(
      expected.role_name,
      format('public.%I', expected.table_name),
      privilege_types.privilege
    ) AS does_have
  FROM phase6_expected_acl expected CROSS JOIN privilege_types
), exact_by_table AS (
  SELECT table_name,
    bool_and(does_have IS NOT DISTINCT FROM should_have) AS is_exact
  FROM exact_checks
  GROUP BY table_name
), helper_signatures(signature) AS (VALUES
  ('public.fn_training_snapshot_immutable_v2()'),
  ('public.fn_validate_training_attempt_hand_v2()'),
  ('public.fn_validate_training_answer_v2()'),
  ('public.fn_reject_training_answer_delete_v2()'),
  ('public.fn_score_training_attempt_hand_v2()')
)
SELECT
  (SELECT count(*) FROM exact_checks) AS exact_privilege_checks,
  (SELECT count(*) FROM exact_checks
    WHERE does_have IS DISTINCT FROM should_have) AS exact_privilege_mismatches,
  (SELECT count(*) FROM exact_by_table WHERE is_exact) AS exact_acl_tables,
  (SELECT count(*)
   FROM pg_class relation
   JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
   JOIN phase6_exact_targets target ON target.table_name = relation.relname
   CROSS JOIN LATERAL aclexplode(relation.relacl) acl
   WHERE namespace.nspname = 'public' AND acl.grantee = 0) AS public_acl_entries,
  (SELECT count(*)
   FROM pg_class relation
   JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
   JOIN phase6_exact_targets target ON target.table_name = relation.relname
   JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
   CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
   WHERE namespace.nspname = 'public'
     AND attribute.attnum > 0 AND NOT attribute.attisdropped
     AND acl.grantee IN (0, to_regrole('anon'), to_regrole('authenticated'), to_regrole('service_role'))
  ) AS exact_column_acl_entries,
  (SELECT count(*)
   FROM pg_class relation
   JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
   JOIN phase6_legacy_targets target ON target.table_name = relation.relname
   JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
   CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
   WHERE namespace.nspname = 'public'
     AND attribute.attnum > 0 AND NOT attribute.attisdropped
     AND acl.privilege_type = 'REFERENCES'
     AND acl.grantee IN (0, to_regrole('anon'), to_regrole('authenticated'), to_regrole('service_role'))
  ) AS legacy_column_reference_acl_entries,
  (SELECT count(*)
   FROM phase6_legacy_targets target
   WHERE NOT has_table_privilege('anon', format('public.%I', target.table_name), 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     AND NOT has_table_privilege('authenticated', format('public.%I', target.table_name), 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     AND NOT has_table_privilege('service_role', format('public.%I', target.table_name), 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
  ) AS utility_only_tables,
  (SELECT count(*)
   FROM helper_signatures helper
   WHERE NOT has_function_privilege('public', to_regprocedure(helper.signature), 'EXECUTE')
     AND NOT has_function_privilege('anon', to_regprocedure(helper.signature), 'EXECUTE')
     AND NOT has_function_privilege('authenticated', to_regprocedure(helper.signature), 'EXECUTE')
     AND NOT has_function_privilege('service_role', to_regprocedure(helper.signature), 'EXECUTE')
  ) AS owner_only_trigger_helpers,
  (SELECT count(DISTINCT sequence.oid)
   FROM pg_class sequence
   JOIN pg_depend dependency
     ON dependency.classid = 'pg_class'::regclass
    AND dependency.objid = sequence.oid
    AND dependency.deptype IN ('a', 'i')
   JOIN pg_class owned_table ON owned_table.oid = dependency.refobjid
   JOIN pg_namespace namespace ON namespace.oid = owned_table.relnamespace
   LEFT JOIN phase6_exact_targets exact_target ON exact_target.table_name = owned_table.relname
   LEFT JOIN phase6_legacy_targets legacy_target ON legacy_target.table_name = owned_table.relname
   WHERE sequence.relkind = 'S'
     AND namespace.nspname = 'public'
     AND (exact_target.table_name IS NOT NULL OR legacy_target.table_name IS NOT NULL)
  ) AS owned_sequences,
  (SELECT count(*)
   FROM phase6_expected_policies expected
   JOIN pg_policies policy
     ON policy.schemaname = 'public'
    AND policy.tablename = expected.table_name
    AND policy.policyname = expected.policy_name
    AND policy.cmd = 'SELECT'
    AND policy.permissive = 'PERMISSIVE'
    AND policy.roles @> expected.policy_roles
    AND policy.roles <@ expected.policy_roles
  ) AS canonical_read_policies,
  (SELECT count(*)
   FROM pg_policies policy
   JOIN phase6_expected_policies expected ON expected.table_name = policy.tablename
   WHERE policy.schemaname = 'public'
     AND policy.cmd IN ('ALL', 'SELECT')
     AND policy.roles && ARRAY['public','anon','authenticated']::name[]
     AND policy.policyname <> expected.policy_name
  ) AS extra_browser_read_policies,
  (SELECT count(*)
   FROM pg_class relation
   JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
   LEFT JOIN phase6_exact_targets exact_target ON exact_target.table_name = relation.relname
   LEFT JOIN phase6_legacy_targets legacy_target ON legacy_target.table_name = relation.relname
   WHERE namespace.nspname = 'public'
     AND relation.relrowsecurity
     AND (exact_target.table_name IS NOT NULL OR legacy_target.table_name IS NOT NULL)
  ) AS rls_enabled_tables;

DO $verify$
DECLARE
  metrics record;
  rls_checks integer;
  rls_passed boolean;
BEGIN
  SELECT * INTO metrics FROM phase6_acl_metrics;
  SELECT count(*), coalesce(bool_and(passed), false)
    INTO rls_checks, rls_passed
  FROM phase6_rls_evidence;

  IF metrics.exact_privilege_checks <> 288
     OR metrics.exact_privilege_mismatches <> 0
     OR metrics.exact_acl_tables <> 12
     OR metrics.public_acl_entries <> 0
     OR metrics.exact_column_acl_entries <> 0
     OR metrics.legacy_column_reference_acl_entries <> 0
     OR metrics.utility_only_tables <> 15
     OR metrics.owner_only_trigger_helpers <> 5
     OR metrics.owned_sequences <> 0
     OR metrics.canonical_read_policies <> 6
     OR metrics.extra_browser_read_policies <> 0
     OR metrics.rls_enabled_tables <> 27
     OR rls_checks <> 13
     OR NOT rls_passed THEN
    RAISE EXCEPTION 'closeout evidence mismatch: metrics %, rls %/%',
      row_to_json(metrics), rls_checks, rls_passed;
  END IF;
END
$verify$;

SELECT jsonb_build_object(
  'exactPrivilegeChecks', metrics.exact_privilege_checks,
  'exactPrivilegeMismatches', metrics.exact_privilege_mismatches,
  'exactAclTables', metrics.exact_acl_tables,
  'publicAclEntries', metrics.public_acl_entries,
  'exactColumnAclEntries', metrics.exact_column_acl_entries,
  'legacyColumnReferenceAclEntries', metrics.legacy_column_reference_acl_entries,
  'utilityOnlyTables', metrics.utility_only_tables,
  'ownerOnlyTriggerHelpers', metrics.owner_only_trigger_helpers,
  'ownedSequences', metrics.owned_sequences,
  'canonicalReadPolicies', metrics.canonical_read_policies,
  'extraBrowserReadPolicies', metrics.extra_browser_read_policies,
  'rlsEnabledTables', metrics.rls_enabled_tables,
  'rlsIsolationChecks', rls.check_count,
  'rlsIsolationPassed', rls.all_passed,
  'passed',
    metrics.exact_privilege_checks = 288
    AND metrics.exact_privilege_mismatches = 0
    AND metrics.exact_acl_tables = 12
    AND metrics.public_acl_entries = 0
    AND metrics.exact_column_acl_entries = 0
    AND metrics.legacy_column_reference_acl_entries = 0
    AND metrics.utility_only_tables = 15
    AND metrics.owner_only_trigger_helpers = 5
    AND metrics.owned_sequences = 0
    AND metrics.canonical_read_policies = 6
    AND metrics.extra_browser_read_policies = 0
    AND metrics.rls_enabled_tables = 27
    AND rls.check_count = 13
    AND rls.all_passed
) AS training_acl_closeout_evidence
FROM phase6_acl_metrics metrics
CROSS JOIN (
  SELECT count(*) AS check_count, coalesce(bool_and(passed), false) AS all_passed
  FROM phase6_rls_evidence
) rls;
`;

const postgresBin = resolvePostgresBin();
const tempRoot = mkdtempSync(path.join(tmpdir(), 'sp-training-acl-closeout-'));
const dataDir = path.join(tempRoot, 'data');
const port = await reservePort();
let started = false;

const tool = (name) => path.join(postgresBin, name);
const connection = ['-h', tempRoot, '-p', String(port), '-d', 'phase6_acl'];

try {
  command(tool('initdb'), [
    '-D', dataDir, '-A', 'trust', '--locale=en_US.UTF-8', '--encoding=UTF8',
  ], { quiet: true });
  command(tool('pg_ctl'), [
    '-D', dataDir,
    '-o', `-p ${port} -k ${tempRoot}`,
    '-l', path.join(tempRoot, 'postgres.log'),
    '-w',
    'start',
  ], { quiet: true });
  started = true;
  command(tool('createdb'), ['-h', tempRoot, '-p', String(port), 'phase6_acl'], { quiet: true });
  const environment = command(tool('psql'), ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: String.raw`SELECT current_setting('server_version_num'),
      current_setting('server_encoding'),
      datcollate
    FROM pg_catalog.pg_database
    WHERE datname = current_database();`,
    quiet: true,
  }).stdout.trim().split('|');
  if (
    !/^17\d{4}$/.test(environment[0] || '')
    || environment[1] !== 'UTF8'
    || environment[2] !== 'en_US.UTF-8'
  ) {
    throw new Error(`Training ACL verifier requires PostgreSQL 17, UTF8, en_US.UTF-8; received ${environment.join('|')}`);
  }
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: BASELINE_SQL,
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', MIGRATION], {
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', MIGRATION], {
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: `
      CREATE POLICY training_attempts_adversarial_read
        ON public.training_attempts FOR SELECT TO authenticated USING (true);
    `,
    quiet: true,
  });
  expectCommandFailure(
    tool('psql'),
    ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', MIGRATION],
    'TRAINING_ACL_CLOSEOUT_EXTRA_BROWSER_READ_POLICY_REMAINS',
  );
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: 'DROP POLICY training_attempts_adversarial_read ON public.training_attempts;',
    quiet: true,
  });

  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: `
      ALTER TABLE public.training_daily_bonus
        ADD COLUMN phase6_owned_sequence_probe bigint GENERATED BY DEFAULT AS IDENTITY;
    `,
    quiet: true,
  });
  expectCommandFailure(
    tool('psql'),
    ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', MIGRATION],
    'TRAINING_ACL_CLOSEOUT_UNEXPECTED_OWNED_SEQUENCE',
  );
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: 'ALTER TABLE public.training_daily_bonus DROP COLUMN phase6_owned_sequence_probe;',
    quiet: true,
  });

  const evidence = command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', '-tA', ...connection,
  ], { input: VERIFY_SQL, quiet: true });
  const evidenceLine = evidence.stdout.trim().split('\n').at(-1);
  let parsedEvidence;
  try {
    parsedEvidence = JSON.parse(evidenceLine);
  } catch {
    throw new Error(`ACL closeout evidence was not valid JSON: ${evidenceLine || '<empty>'}`);
  }
  if (parsedEvidence.passed !== true) {
    throw new Error(`Unexpected ACL closeout evidence: ${evidenceLine || '<empty>'}`);
  }
  process.stdout.write(`Training ACL closeout PostgreSQL verifier passed: ${JSON.stringify({
    ...parsedEvidence,
    successfulMigrationApplications: 2,
    rejectedAdversarialApplications: 2,
  })}\n`);
} finally {
  if (started) {
    spawnSync(tool('pg_ctl'), ['-D', dataDir, '-m', 'fast', 'stop'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  }
  if (tempRoot.startsWith(`${tmpdir()}${path.sep}sp-training-acl-closeout-`)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
