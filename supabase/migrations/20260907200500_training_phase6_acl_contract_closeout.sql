-- Close the Phase 6 Training ACL gaps left by production's broad default
-- privileges. The earlier authority migrations are already in the production
-- ledger, so this additive migration resets their objects to explicit grants.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog;

DO $preflight$
DECLARE
  table_name text;
  function_name text;
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
    IF pg_catalog.to_regclass(pg_catalog.format('public.%I', table_name)) IS NULL THEN
      RAISE EXCEPTION 'TRAINING_ACL_CLOSEOUT_MISSING_TABLE: public.%', table_name;
    END IF;
  END LOOP;

  FOREACH function_name IN ARRAY ARRAY[
    'fn_training_snapshot_immutable_v2',
    'fn_validate_training_attempt_hand_v2',
    'fn_validate_training_answer_v2',
    'fn_reject_training_answer_delete_v2',
    'fn_score_training_attempt_hand_v2'
  ]
  LOOP
    IF pg_catalog.to_regprocedure(pg_catalog.format('public.%I()', function_name)) IS NULL THEN
      RAISE EXCEPTION 'TRAINING_ACL_CLOSEOUT_MISSING_FUNCTION: public.%()', function_name;
    END IF;
  END LOOP;
END
$preflight$;

-- Reset authority and Memory archive tables completely. REVOKE on a table
-- does not remove independently granted column ACLs, so remove those too.
DO $clear_exact_table_column_acls$
DECLARE
  table_name text;
  column_list text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'training_question_snapshots', 'training_question_cache',
    'training_verified_leaderboard', 'training_streak_milestone_claims',
    'training_questions', 'training_daily_challenge', 'training_attempts',
    'training_attempt_hands', 'training_answers', 'training_hand_replay',
    'memory_game_sessions', 'memory_leaderboards'
  ]
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
      table_name
    );

    SELECT pg_catalog.string_agg(pg_catalog.format('%I', attribute.attname), ', '
      ORDER BY attribute.attnum)
    INTO column_list
    FROM pg_catalog.pg_attribute attribute
    WHERE attribute.attrelid = pg_catalog.to_regclass(pg_catalog.format('public.%I', table_name))
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped;

    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
      column_list,
      table_name
    );
  END LOOP;
END
$clear_exact_table_column_acls$;

GRANT SELECT, INSERT ON TABLE public.training_question_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.training_question_cache TO service_role;
GRANT SELECT ON TABLE public.training_verified_leaderboard TO service_role;
GRANT SELECT ON TABLE public.training_streak_milestone_claims TO service_role;
GRANT SELECT ON TABLE public.training_questions TO service_role;
GRANT SELECT ON TABLE public.training_daily_challenge TO service_role;
GRANT SELECT ON TABLE public.training_attempts TO authenticated, service_role;
GRANT SELECT ON TABLE public.training_attempt_hands TO authenticated;
GRANT SELECT, INSERT ON TABLE public.training_attempt_hands TO service_role;
GRANT SELECT ON TABLE public.training_answers TO authenticated;
GRANT SELECT, INSERT ON TABLE public.training_answers TO service_role;
GRANT SELECT ON TABLE public.training_hand_replay TO authenticated, service_role;
GRANT SELECT ON TABLE public.memory_game_sessions TO authenticated, service_role;
GRANT SELECT ON TABLE public.memory_leaderboards TO anon, authenticated, service_role;

-- Reassert the complete browser read boundary instead of trusting that a
-- same-named policy still has its original owner predicate.
ALTER POLICY training_attempts_select_self ON public.training_attempts
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY training_attempt_hands_select_self ON public.training_attempt_hands
  TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.training_attempts attempts
    WHERE attempts.id = training_attempt_hands.attempt_id
      AND attempts.user_id = (SELECT auth.uid())
  ));
ALTER POLICY training_answers_select_self ON public.training_answers
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY training_hand_replay_select_self_v2 ON public.training_hand_replay
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY memory_game_sessions_self_read ON public.memory_game_sessions
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY memory_leaderboards_read ON public.memory_leaderboards
  TO anon, authenticated
  USING (true);

-- Existing Training feature/archive stores keep their established read and
-- server CRUD contracts. Remove only privileges that application requests do
-- not legitimately need and that RLS does not govern.
DO $strip_legacy_utility_privileges$
DECLARE
  table_name text;
  column_list text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'user_seen_questions', 'training_streaks', 'training_progress',
    'training_level_history', 'training_sessions', 'training_leaderboard',
    'training_spaced_repetition', 'jarvis_training_sessions',
    'jarvis_user_training_profile', 'user_question_history',
    'user_level_progress', 'training_user_achievements',
    'training_user_challenges', 'training_tournament_entries',
    'training_daily_bonus'
  ]
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
      table_name
    );

    SELECT pg_catalog.string_agg(pg_catalog.format('%I', attribute.attname), ', '
      ORDER BY attribute.attnum)
    INTO column_list
    FROM pg_catalog.pg_attribute attribute
    WHERE attribute.attrelid = pg_catalog.to_regclass(pg_catalog.format('public.%I', table_name))
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped;

    EXECUTE pg_catalog.format(
      'REVOKE REFERENCES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
      column_list,
      table_name
    );
  END LOOP;
END
$strip_legacy_utility_privileges$;

REVOKE ALL ON FUNCTION public.fn_training_snapshot_immutable_v2()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_validate_training_attempt_hand_v2()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_validate_training_answer_v2()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_reject_training_answer_delete_v2()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_score_training_attempt_hand_v2()
  FROM PUBLIC, anon, authenticated, service_role;

DO $postflight$
DECLARE
  mismatch record;
  table_name text;
  function_name text;
BEGIN
  -- Exact effective privileges for the tables whose ACLs were reset.
  FOR mismatch IN
    WITH expected(table_name, role_name, privileges) AS (VALUES
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
      ('memory_leaderboards', 'service_role', ARRAY['SELECT'])
    ), privileges(privilege) AS (VALUES
      ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'),
      ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
    )
    SELECT expected.table_name, expected.role_name, privileges.privilege,
      privileges.privilege = ANY(expected.privileges) AS should_have,
      pg_catalog.has_table_privilege(
        expected.role_name,
        pg_catalog.to_regclass(pg_catalog.format('public.%I', expected.table_name)),
        privileges.privilege
      ) AS does_have
    FROM expected CROSS JOIN privileges
    WHERE pg_catalog.has_table_privilege(
      expected.role_name,
      pg_catalog.to_regclass(pg_catalog.format('public.%I', expected.table_name)),
      privileges.privilege
    ) IS DISTINCT FROM (privileges.privilege = ANY(expected.privileges))
  LOOP
    RAISE EXCEPTION
      'TRAINING_ACL_CLOSEOUT_TABLE_MISMATCH: public.% role % privilege % expected %, actual %',
      mismatch.table_name, mismatch.role_name, mismatch.privilege,
      mismatch.should_have, mismatch.does_have;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) acl
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY(ARRAY[
        'training_question_snapshots', 'training_question_cache',
        'training_verified_leaderboard', 'training_streak_milestone_claims',
        'training_questions', 'training_daily_challenge', 'training_attempts',
        'training_attempt_hands', 'training_answers', 'training_hand_replay',
        'memory_game_sessions', 'memory_leaderboards'
      ])
      AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION 'TRAINING_ACL_CLOSEOUT_PUBLIC_TABLE_ACL_REMAINS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid = relation.oid
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY(ARRAY[
        'training_question_snapshots', 'training_question_cache',
        'training_verified_leaderboard', 'training_streak_milestone_claims',
        'training_questions', 'training_daily_challenge', 'training_attempts',
        'training_attempt_hands', 'training_answers', 'training_hand_replay',
        'memory_game_sessions', 'memory_leaderboards'
      ])
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND acl.grantee IN (
        0, pg_catalog.to_regrole('anon'), pg_catalog.to_regrole('authenticated'),
        pg_catalog.to_regrole('service_role')
      )
  ) THEN
    RAISE EXCEPTION 'TRAINING_ACL_CLOSEOUT_COLUMN_ACL_REMAINS';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'user_seen_questions', 'training_streaks', 'training_progress',
    'training_level_history', 'training_sessions', 'training_leaderboard',
    'training_spaced_repetition', 'jarvis_training_sessions',
    'jarvis_user_training_profile', 'user_question_history',
    'user_level_progress', 'training_user_achievements',
    'training_user_challenges', 'training_tournament_entries',
    'training_daily_bonus'
  ]
  LOOP
    IF pg_catalog.has_table_privilege('anon', pg_catalog.to_regclass(pg_catalog.format('public.%I', table_name)), 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
       OR pg_catalog.has_table_privilege('authenticated', pg_catalog.to_regclass(pg_catalog.format('public.%I', table_name)), 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
       OR pg_catalog.has_table_privilege('service_role', pg_catalog.to_regclass(pg_catalog.format('public.%I', table_name)), 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') THEN
      RAISE EXCEPTION 'TRAINING_ACL_CLOSEOUT_UTILITY_PRIVILEGE_REMAINS: public.%', table_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid = relation.oid
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY(ARRAY[
        'user_seen_questions', 'training_streaks', 'training_progress',
        'training_level_history', 'training_sessions', 'training_leaderboard',
        'training_spaced_repetition', 'jarvis_training_sessions',
        'jarvis_user_training_profile', 'user_question_history',
        'user_level_progress', 'training_user_achievements',
        'training_user_challenges', 'training_tournament_entries',
        'training_daily_bonus'
      ])
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND acl.privilege_type = 'REFERENCES'
      AND acl.grantee IN (
        0, pg_catalog.to_regrole('anon'), pg_catalog.to_regrole('authenticated'),
        pg_catalog.to_regrole('service_role')
      )
  ) THEN
    RAISE EXCEPTION 'TRAINING_ACL_CLOSEOUT_COLUMN_REFERENCE_REMAINS';
  END IF;

  -- The eight prior migrations require RLS everywhere in this closeout set and
  -- forbid browser mutation policies on authority/archive stores.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY(ARRAY[
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
      ])
      AND NOT relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'TRAINING_ACL_CLOSEOUT_RLS_DISABLED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = ANY(ARRAY[
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
      ])
      AND policy.cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
      AND policy.roles && ARRAY['public', 'anon', 'authenticated']::name[]
  ) THEN
    RAISE EXCEPTION 'TRAINING_ACL_CLOSEOUT_BROWSER_MUTATION_POLICY_REMAINS';
  END IF;

  IF (
    WITH expected(table_name, policy_name, policy_roles) AS (VALUES
      ('training_attempts', 'training_attempts_select_self', ARRAY['authenticated']::name[]),
      ('training_attempt_hands', 'training_attempt_hands_select_self', ARRAY['authenticated']::name[]),
      ('training_answers', 'training_answers_select_self', ARRAY['authenticated']::name[]),
      ('training_hand_replay', 'training_hand_replay_select_self_v2', ARRAY['authenticated']::name[]),
      ('memory_game_sessions', 'memory_game_sessions_self_read', ARRAY['authenticated']::name[]),
      ('memory_leaderboards', 'memory_leaderboards_read', ARRAY['anon', 'authenticated']::name[])
    )
    SELECT pg_catalog.count(*)
    FROM expected
    JOIN pg_catalog.pg_policies policy
      ON policy.schemaname = 'public'
     AND policy.tablename = expected.table_name
     AND policy.policyname = expected.policy_name
     AND policy.cmd = 'SELECT'
     AND policy.permissive = 'PERMISSIVE'
     AND policy.roles @> expected.policy_roles
     AND policy.roles <@ expected.policy_roles
  ) <> 6 THEN
    RAISE EXCEPTION 'TRAINING_ACL_CLOSEOUT_CANONICAL_READ_POLICY_MISSING';
  END IF;

  -- No second permissive browser policy may widen any of these read stores.
  IF EXISTS (
    WITH expected(table_name, policy_name) AS (VALUES
      ('training_attempts', 'training_attempts_select_self'),
      ('training_attempt_hands', 'training_attempt_hands_select_self'),
      ('training_answers', 'training_answers_select_self'),
      ('training_hand_replay', 'training_hand_replay_select_self_v2'),
      ('memory_game_sessions', 'memory_game_sessions_self_read'),
      ('memory_leaderboards', 'memory_leaderboards_read')
    )
    SELECT 1
    FROM pg_catalog.pg_policies policy
    JOIN expected ON expected.table_name = policy.tablename
    WHERE policy.schemaname = 'public'
      AND policy.cmd IN ('ALL', 'SELECT')
      AND policy.roles && ARRAY['public', 'anon', 'authenticated']::name[]
      AND policy.policyname <> expected.policy_name
  ) THEN
    RAISE EXCEPTION 'TRAINING_ACL_CLOSEOUT_EXTRA_BROWSER_READ_POLICY_REMAINS';
  END IF;

  FOREACH function_name IN ARRAY ARRAY[
    'fn_training_snapshot_immutable_v2',
    'fn_validate_training_attempt_hand_v2',
    'fn_validate_training_answer_v2',
    'fn_reject_training_answer_delete_v2',
    'fn_score_training_attempt_hand_v2'
  ]
  LOOP
    IF pg_catalog.has_function_privilege('anon', pg_catalog.to_regprocedure(pg_catalog.format('public.%I()', function_name)), 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', pg_catalog.to_regprocedure(pg_catalog.format('public.%I()', function_name)), 'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role', pg_catalog.to_regprocedure(pg_catalog.format('public.%I()', function_name)), 'EXECUTE') THEN
      RAISE EXCEPTION 'TRAINING_ACL_CLOSEOUT_TRIGGER_HELPER_EXECUTABLE: public.%()', function_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class sequence
    JOIN pg_catalog.pg_depend dependency
      ON dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
     AND dependency.objid = sequence.oid
     AND dependency.deptype IN ('a', 'i')
    JOIN pg_catalog.pg_class owned_table ON owned_table.oid = dependency.refobjid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = owned_table.relnamespace
    WHERE sequence.relkind = 'S'
      AND namespace.nspname = 'public'
      AND owned_table.relname = ANY(ARRAY[
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
      ])
  ) THEN
    RAISE EXCEPTION 'TRAINING_ACL_CLOSEOUT_UNEXPECTED_OWNED_SEQUENCE';
  END IF;
END
$postflight$;

COMMIT;
