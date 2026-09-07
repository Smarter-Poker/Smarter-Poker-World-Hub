-- Phase 6 advisor follow-up: keep Training reads owner-scoped once, cover the
-- snapshot foreign key, and remove legacy/browser-authored sessions from the
-- live weekly Hub projection.
--
-- Read-only production inspection before authoring this migration proved:
--   * each table below had one legacy PUBLIC owner-read policy plus the new
--     authenticated owner-read policy;
--   * training_answers_snapshot_fk had no leading-column btree index;
--   * training_answers held 1,967 rows / 688 kB of heap, so the ordinary
--     transactional index build is bounded and does not justify an unsafe
--     out-of-band CONCURRENTLY operation;
--   * rpc_training_weekly_stats still aggregated every training_sessions row.
--
-- This migration is deliberately forward-only. A reversal must be a new,
-- reviewed migration; restoring the legacy PUBLIC policies or unsealed weekly
-- projection would reopen the authority defect.

DO $preflight$
DECLARE
  policy_spec record;
BEGIN
  FOR policy_spec IN
    SELECT * FROM (VALUES
      ('memory_game_sessions', 'memory_game_sessions_self_read'),
      ('training_answers', 'training_answers_select_self'),
      ('training_level_history', 'training_level_history_select_self'),
      ('training_sessions', 'training_sessions_select_self_v2'),
      ('training_streaks', 'training_streaks_select_self_v2')
    ) AS expected(table_name, policy_name)
  LOOP
    IF to_regclass(format('public.%I', policy_spec.table_name)) IS NULL THEN
      RAISE EXCEPTION 'PRE-FLIGHT FAILED: public.% is missing', policy_spec.table_name;
    END IF;

    -- Never remove an older read policy unless its replacement is already the
    -- authenticated, owner-scoped policy installed by the Phase 6 migrations.
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies policy
      WHERE policy.schemaname = 'public'
        AND policy.tablename = policy_spec.table_name
        AND policy.policyname = policy_spec.policy_name
        AND policy.permissive = 'PERMISSIVE'
        AND policy.cmd = 'SELECT'
        AND policy.roles @> ARRAY['authenticated']::name[]
        AND position('auth.uid()' IN policy.qual) > 0
        AND position('user_id' IN policy.qual) > 0
    ) THEN
      RAISE EXCEPTION
        'PRE-FLIGHT FAILED: public.% lacks its canonical authenticated owner-read policy %',
        policy_spec.table_name,
        policy_spec.policy_name;
    END IF;
  END LOOP;

  IF to_regprocedure('public.rpc_training_weekly_stats(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAILED: public.rpc_training_weekly_stats(uuid) is missing';
  END IF;
  IF to_regclass('public.training_attempts') IS NULL THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAILED: public.training_attempts is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'training_answers'
      AND column_name = 'snapshot_key'
  ) THEN
    RAISE EXCEPTION 'PRE-FLIGHT FAILED: public.training_answers.snapshot_key is missing';
  END IF;
END
$preflight$;

-- These older PUBLIC policies have the same owner predicate as the canonical
-- authenticated policies. PUBLIC also applies to authenticated, so retaining
-- both makes PostgreSQL evaluate two permissive policies for every read. Drop
-- only the redundant legacy copy; do not replace, combine, or widen a policy.
DROP POLICY IF EXISTS "Users can view own sessions"
  ON public.memory_game_sessions;
DROP POLICY IF EXISTS "Users can view own training answers"
  ON public.training_answers;
DROP POLICY IF EXISTS "Users can view own level history"
  ON public.training_level_history;
DROP POLICY IF EXISTS "Users can read their own sessions"
  ON public.training_sessions;
DROP POLICY IF EXISTS users_read_own_streaks
  ON public.training_streaks;

-- PostgreSQL does not automatically index a foreign-key child column. The
-- snapshot parent uses ON DELETE RESTRICT, so this leading-column index keeps
-- its referential-integrity check bounded as signed answers grow.
CREATE INDEX IF NOT EXISTS idx_training_answers_snapshot_key
  ON public.training_answers (snapshot_key);

CREATE OR REPLACE FUNCTION public.rpc_training_weekly_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  this_week_start timestamptz := date_trunc('week', now());
  last_week_start timestamptz := date_trunc('week', now()) - interval '7 days';
  last_week_end timestamptz := date_trunc('week', now());
  rolling_30_start timestamptz := now() - interval '30 days';

  this_hands_played integer := 0;
  this_correct_count integer := 0;
  this_total_answers integer := 0;
  this_ev_loss numeric := 0;
  last_hands_played integer := 0;
  last_correct_count integer := 0;
  last_total_answers integer := 0;
  last_ev_loss numeric := 0;
  cur_streak_days integer := 0;
  best_streak_days integer := 0;
  rolling_correct integer := 0;
  rolling_total integer := 0;
  rolling_accuracy numeric := 0;
  cur_grade text;
  next_grade text;
  next_grade_floor numeric;
  delta_correct integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id required';
  END IF;

  -- A JWT-bearing browser can request only itself. The service-role API client
  -- remains compatible through the established engine-caller guard; a NULL
  -- auth.uid() alone is never treated as sufficient browser authorization.
  IF NOT public.fn_caller_is_engine()
     AND ((SELECT auth.uid()) IS NULL OR (SELECT auth.uid()) <> p_user_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- training_sessions is an analytics projection, not independent grading
  -- truth. Every aggregate row must bind to its same-user completed attempt,
  -- and replay/practice attempts must never influence Hub performance.
  SELECT
    coalesce(sum(attempt.answered_hands) FILTER (
      WHERE attempt.completed_at >= this_week_start
    ), 0)::integer,
    coalesce(sum(attempt.correct_hands) FILTER (
      WHERE attempt.completed_at >= this_week_start
    ), 0)::integer,
    coalesce(sum(attempt.answered_hands) FILTER (
      WHERE attempt.completed_at >= this_week_start
    ), 0)::integer,
    coalesce(sum(session.total_ev_loss) FILTER (
      WHERE attempt.completed_at >= this_week_start
    ), 0)::numeric,
    coalesce(sum(attempt.answered_hands) FILTER (
      WHERE attempt.completed_at >= last_week_start
        AND attempt.completed_at < last_week_end
    ), 0)::integer,
    coalesce(sum(attempt.correct_hands) FILTER (
      WHERE attempt.completed_at >= last_week_start
        AND attempt.completed_at < last_week_end
    ), 0)::integer,
    coalesce(sum(attempt.answered_hands) FILTER (
      WHERE attempt.completed_at >= last_week_start
        AND attempt.completed_at < last_week_end
    ), 0)::integer,
    coalesce(sum(session.total_ev_loss) FILTER (
      WHERE attempt.completed_at >= last_week_start
        AND attempt.completed_at < last_week_end
    ), 0)::numeric,
    coalesce(sum(attempt.correct_hands) FILTER (
      WHERE attempt.completed_at >= rolling_30_start
    ), 0)::integer,
    coalesce(sum(attempt.answered_hands) FILTER (
      WHERE attempt.completed_at >= rolling_30_start
    ), 0)::integer
  INTO
    this_hands_played,
    this_correct_count,
    this_total_answers,
    this_ev_loss,
    last_hands_played,
    last_correct_count,
    last_total_answers,
    last_ev_loss,
    rolling_correct,
    rolling_total
  FROM public.training_sessions session
  JOIN public.training_attempts attempt
    ON attempt.id = session.attempt_id
   AND attempt.user_id = session.user_id
  WHERE attempt.user_id = p_user_id
    AND attempt.status = 'completed'
    AND attempt.practice_only IS FALSE
    AND attempt.completed_at IS NOT NULL;

  -- Use only the post-cutover server-authority streak columns. The legacy
  -- columns intentionally remain display snapshots and cannot drive this API.
  SELECT
    coalesce(max(streak.authority_current_streak), 0)::integer,
    coalesce(max(streak.authority_longest_streak), 0)::integer
  INTO cur_streak_days, best_streak_days
  FROM public.training_streaks streak
  WHERE streak.user_id = p_user_id;

  rolling_accuracy := CASE
    WHEN rolling_total > 0
      THEN (rolling_correct::numeric / rolling_total) * 100.0
    ELSE 0
  END;

  cur_grade := CASE
    WHEN rolling_accuracy >= 95 THEN 'A+'
    WHEN rolling_accuracy >= 90 THEN 'A'
    WHEN rolling_accuracy >= 85 THEN 'B+'
    WHEN rolling_accuracy >= 80 THEN 'B'
    WHEN rolling_accuracy >= 75 THEN 'C+'
    WHEN rolling_accuracy >= 70 THEN 'C'
    WHEN rolling_accuracy >= 65 THEN 'D+'
    WHEN rolling_accuracy >= 60 THEN 'D'
    ELSE 'F'
  END;

  next_grade := CASE
    WHEN rolling_accuracy >= 95 THEN NULL
    WHEN rolling_accuracy >= 90 THEN 'A+'
    WHEN rolling_accuracy >= 85 THEN 'A'
    WHEN rolling_accuracy >= 80 THEN 'B+'
    WHEN rolling_accuracy >= 75 THEN 'B'
    WHEN rolling_accuracy >= 70 THEN 'C+'
    WHEN rolling_accuracy >= 65 THEN 'C'
    WHEN rolling_accuracy >= 60 THEN 'D+'
    ELSE 'D'
  END;

  next_grade_floor := CASE
    WHEN rolling_accuracy >= 95 THEN NULL
    WHEN rolling_accuracy >= 90 THEN 95
    WHEN rolling_accuracy >= 85 THEN 90
    WHEN rolling_accuracy >= 80 THEN 85
    WHEN rolling_accuracy >= 75 THEN 80
    WHEN rolling_accuracy >= 70 THEN 75
    WHEN rolling_accuracy >= 65 THEN 70
    WHEN rolling_accuracy >= 60 THEN 65
    ELSE 60
  END;

  delta_correct := CASE
    WHEN next_grade_floor IS NULL OR rolling_total <= 0 THEN NULL
    ELSE greatest(
      ceil((next_grade_floor / 100.0) * rolling_total - rolling_correct)::integer,
      1
    )
  END;

  RETURN jsonb_build_object(
    'hands_this_week', this_hands_played,
    'correct_this_week', this_correct_count,
    'total_this_week', this_total_answers,
    'ev_loss_this_week', this_ev_loss,
    'accuracy_this_week_pct', CASE WHEN this_total_answers > 0
      THEN round(this_correct_count::numeric / this_total_answers * 100, 1)
      ELSE 0 END,
    'ev_saved_this_week_bb', round(-this_ev_loss, 1),
    'hands_last_week', last_hands_played,
    'correct_last_week', last_correct_count,
    'total_last_week', last_total_answers,
    'ev_loss_last_week', last_ev_loss,
    'accuracy_last_week_pct', CASE WHEN last_total_answers > 0
      THEN round(last_correct_count::numeric / last_total_answers * 100, 1)
      ELSE 0 END,
    'ev_saved_last_week_bb', round(-last_ev_loss, 1),
    'current_streak_days', cur_streak_days,
    'personal_best_streak_days', best_streak_days,
    'rolling_accuracy_pct', round(rolling_accuracy, 1),
    'rolling_correct', rolling_correct,
    'rolling_total', rolling_total,
    'current_grade', cur_grade,
    'next_grade', next_grade,
    'delta_correct_to_next', delta_correct,
    'window_this_week_start', this_week_start,
    'window_last_week_start', last_week_start,
    'computed_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_training_weekly_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_training_weekly_stats(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_training_weekly_stats(uuid) IS
  'Self-only weekly Training Hub projection. Aggregates only same-user completed, non-practice server attempts and server-authority streak columns.';

DO $postflight$
DECLARE
  policy_spec record;
  applicable_policy_count bigint;
  function_source text;
BEGIN
  FOR policy_spec IN
    SELECT * FROM (VALUES
      ('memory_game_sessions', 'memory_game_sessions_self_read'),
      ('training_answers', 'training_answers_select_self'),
      ('training_level_history', 'training_level_history_select_self'),
      ('training_sessions', 'training_sessions_select_self_v2'),
      ('training_streaks', 'training_streaks_select_self_v2')
    ) AS expected(table_name, policy_name)
  LOOP
    SELECT count(*) INTO applicable_policy_count
    FROM pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = policy_spec.table_name
      AND policy.permissive = 'PERMISSIVE'
      AND policy.cmd IN ('SELECT', 'ALL')
      AND policy.roles && ARRAY['public', 'authenticated']::name[];

    IF applicable_policy_count <> 1 THEN
      RAISE EXCEPTION
        'POST-APPLY FAILED: public.% has % permissive authenticated SELECT policies',
        policy_spec.table_name,
        applicable_policy_count;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies policy
      WHERE policy.schemaname = 'public'
        AND policy.tablename = policy_spec.table_name
        AND policy.policyname = policy_spec.policy_name
        AND policy.cmd = 'SELECT'
        AND policy.roles @> ARRAY['authenticated']::name[]
        AND position('auth.uid()' IN policy.qual) > 0
        AND position('user_id' IN policy.qual) > 0
    ) THEN
      RAISE EXCEPTION
        'POST-APPLY FAILED: canonical owner-read policy % is missing on public.%',
        policy_spec.policy_name,
        policy_spec.table_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename IN (
        'memory_game_sessions', 'training_answers', 'training_level_history',
        'training_sessions', 'training_streaks'
      )
      AND policy.cmd IN ('SELECT', 'ALL')
      AND policy.roles && ARRAY['public', 'anon']::name[]
  ) THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: a PUBLIC/anon Training read policy remains';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index index_meta
    JOIN pg_attribute column_meta
      ON column_meta.attrelid = index_meta.indrelid
     AND column_meta.attnum = index_meta.indkey[0]
    WHERE index_meta.indrelid = 'public.training_answers'::regclass
      AND index_meta.indisvalid
      AND index_meta.indisready
      AND column_meta.attname = 'snapshot_key'
  ) THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: training_answers_snapshot_fk remains unindexed';
  END IF;

  SELECT lower(pg_get_functiondef('public.rpc_training_weekly_stats(uuid)'::regprocedure))
  INTO function_source;
  IF position('join public.training_attempts attempt' IN function_source) = 0
     OR position('attempt.id = session.attempt_id' IN function_source) = 0
     OR position('attempt.user_id = session.user_id' IN function_source) = 0
     OR position('attempt.status = ''completed''' IN function_source) = 0
     OR position('attempt.practice_only is false' IN function_source) = 0
     OR position('attempt.completed_at is not null' IN function_source) = 0
     OR position('authority_current_streak' IN function_source) = 0
     OR position('authority_longest_streak' IN function_source) = 0 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: weekly stats are not a sealed-attempt projection';
  END IF;

  IF has_function_privilege('anon',
       'public.rpc_training_weekly_stats(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.rpc_training_weekly_stats(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.rpc_training_weekly_stats(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: weekly stats execution grants are unsafe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc procedure
    WHERE procedure.oid = 'public.rpc_training_weekly_stats(uuid)'::regprocedure
      AND procedure.prosecdef
      AND EXISTS (
        SELECT 1 FROM unnest(procedure.proconfig) setting
        WHERE setting LIKE 'search_path=%'
      )
  ) THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: weekly stats SECURITY DEFINER path is not pinned';
  END IF;
END
$postflight$;
