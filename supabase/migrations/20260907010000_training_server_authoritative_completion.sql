-- Phase 6: durable, server-authoritative Training attempts.
--
-- The legacy question cache remains the source from which the API creates an
-- immutable per-attempt snapshot. Browsers cannot write any scoring store and
-- completion accepts only an attempt id: answer totals, streaks, mastery,
-- history, progress and leaderboard rows are derived in one DB transaction.

BEGIN;

-- Fail fast instead of waiting behind gameplay traffic. The altered Training
-- tables are small, so either the complete authority boundary lands promptly
-- or the whole migration rolls back for a later protected retry.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $preflight$
DECLARE
  required_table text;
  required_schema_item text;
  award_function_source text;
  award_advisory_at integer;
  award_profile_at integer;
  award_profile_lock_at integer;
  award_multiplier_at integer;
  award_family_cap_at integer;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
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
    'diamond_transactions'
  ]
  LOOP
    IF to_regclass(format('public.%I', required_table)) IS NULL THEN
      RAISE EXCEPTION 'Required Training table public.% is missing', required_table;
    END IF;
  END LOOP;

  -- PL/pgSQL resolves many column references only on the first function call.
  -- Fail during deployment instead of leaving completion broken for the first
  -- player who reaches Session Review.
  FOREACH required_schema_item IN ARRAY ARRAY[
    'training_question_cache.id',
    'training_question_cache.game_id',
    'training_question_cache.level',
    'training_question_cache.question_data',
    'training_answers.user_id',
    'training_answers.game_id',
    'training_answers.question_id',
    'training_answers.answer_id',
    'training_answers.is_correct',
    'training_answers.level',
    'training_answers.answered_at',
    'training_answers.hero_position',
    'training_answers.villain_position',
    'training_answers.street',
    'training_answers.classification',
    'training_answers.ev_loss',
    'training_answers.spot_type',
    'training_answers.submission_id',
    'training_answers.solver_verified',
    'training_answers.solver_source',
    'training_answers.selected_frequency',
    'training_answers.optimal_frequency',
    'training_answers.ev_loss_measured',
    'training_answers.evidence_metadata',
    'user_seen_questions.user_id',
    'user_seen_questions.game_id',
    'user_seen_questions.question_id',
    'user_seen_questions.seen_at',
    'training_streaks.user_id',
    'training_streaks.current_streak',
    'training_streaks.longest_streak',
    'training_streaks.last_training_date',
    'training_streaks.streak_start_date',
    'training_streaks.milestones_claimed',
    'training_streaks.created_at',
    'training_streaks.updated_at',
    'training_progress.user_id',
    'training_progress.game_id',
    'training_progress.level',
    'training_progress.hands_played',
    'training_progress.correct_answers',
    'training_progress.total_answers',
    'training_progress.current_streak',
    'training_progress.best_streak',
    'training_progress.last_played_at',
    'training_level_history.user_id',
    'training_level_history.game_id',
    'training_level_history.level',
    'training_level_history.questions_answered',
    'training_level_history.questions_correct',
    'training_level_history.accuracy_percentage',
    'training_level_history.passed',
    'training_level_history.time_spent_seconds',
    'training_level_history.best_streak',
    'training_level_history.diamonds_earned',
    'training_leaderboard.user_id',
    'training_leaderboard.period_type',
    'training_leaderboard.period_key',
    'training_daily_challenge.user_id',
    'training_daily_challenge.daily_id',
    'training_daily_challenge.score',
    'training_daily_challenge.ev_loss',
    'training_daily_challenge.selected_action',
    'training_daily_challenge.completed_at',
    'training_questions.id',
    'training_questions.correct_answer',
    'training_hand_replay.id',
    'training_hand_replay.user_id',
    'training_hand_replay.solver_action',
    'training_hand_replay.ev_loss_bb',
    'training_hand_replay.was_correct',
    'training_sessions.user_id',
    'training_sessions.game_id',
    'training_sessions.game_name',
    'training_sessions.gtow_score',
    'training_sessions.score_scale',
    'training_sessions.total_ev_loss',
    'training_sessions.hands_played',
    'training_sessions.mistake_count',
    'training_sessions.accuracy',
    'training_sessions.correct_count',
    'training_sessions.best_streak',
    'training_sessions.level_passed',
    'training_sessions.level',
    'training_sessions.hand_history',
    'training_sessions.position_stats',
    'training_sessions.classification_counts',
    'training_sessions.trainer_config',
    'training_sessions.avg_ev_loss_per_hand',
    'training_sessions.avg_ev_loss_per_mistake',
    'training_sessions.avg_frequency_diff',
    'training_sessions.created_at',
    'diamond_transactions.user_id',
    'diamond_transactions.amount',
    'diamond_transactions.transaction_type',
    'diamond_transactions.reference_id'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = split_part(required_schema_item, '.', 1)
        AND column_name = split_part(required_schema_item, '.', 2)
    ) THEN
      RAISE EXCEPTION 'Required Training column public.% is missing',
        required_schema_item;
    END IF;
  END LOOP;

  IF to_regclass('auth.users') IS NULL
     OR to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'Required auth.users or gen_random_uuid() dependency is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'training_progress'
      AND indexdef ~* 'UNIQUE INDEX .*\(user_id, game_id\)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'training_streaks'
      AND indexdef ~* 'UNIQUE INDEX .*\(user_id\)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'user_seen_questions'
      AND indexdef ~* 'UNIQUE INDEX .*\(user_id, game_id, question_id\)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'training_leaderboard'
      AND indexdef ~* 'UNIQUE INDEX .*\(user_id, period_type, period_key\)'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'training_daily_challenge'
      AND indexdef ~* 'UNIQUE INDEX .*\(user_id, daily_id\)'
  ) THEN
    RAISE EXCEPTION 'Required Training upsert uniqueness contract is missing';
  END IF;

  IF to_regprocedure(
    'public.fn_training_leaderboard_record(uuid,text,text,integer,integer,boolean,integer,numeric,numeric)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Required atomic Training leaderboard writer is missing';
  END IF;
  IF to_regprocedure(
    'public.award_diamonds_v2(uuid,text,text,text,jsonb)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Required atomic Diamond award writer is missing';
  END IF;

  -- The Training RPCs below become callable in this transaction, so merely
  -- finding an older award_diamonds_v2 is insufficient. Refuse to publish
  -- unless the installed implementation already has the shared user lock,
  -- the profile row lock, and family caps after the only multiplier step.
  SELECT procedure.prosrc
  INTO award_function_source
  FROM pg_catalog.pg_proc procedure
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'award_diamonds_v2'
    AND pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      = 'p_user_id uuid, p_action_key text, p_reference_id text, p_target_id text, p_metadata jsonb';

  award_advisory_at := position('pg_advisory_xact_lock' in coalesce(award_function_source, ''));
  award_profile_at := position('FROM public.profiles pr' in coalesce(award_function_source, ''));
  award_profile_lock_at := position('FOR UPDATE' in coalesce(award_function_source, ''));
  award_multiplier_at := position(
    'v_requested := GREATEST(ROUND(v_requested * v_multiplier)' in coalesce(award_function_source, '')
  );
  award_family_cap_at := position(
    'IF v_family_monthly_cap IS NOT NULL THEN' in coalesce(award_function_source, '')
  );

  IF award_function_source IS NULL
     OR award_advisory_at = 0
     OR award_profile_at <= award_advisory_at
     OR award_profile_lock_at <= award_profile_at
     OR award_multiplier_at <= award_profile_lock_at
     OR award_family_cap_at <= award_multiplier_at
     OR has_function_privilege('authenticated',
       'public.award_diamonds_v2(uuid,text,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.award_diamonds_v2(uuid,text,text,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.award_diamonds_v2(uuid,text,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Required safe Diamond award writer is not installed';
  END IF;
END
$preflight$;

-- Older production histories are inconsistent: some Training tables point
-- only at profiles, while training_daily_challenge has an auth.users foreign
-- key without account-erasure cascade. Normalize those three known variants
-- before adding sealed attempt state. NOT VALID keeps lock duration bounded;
-- validation is explicit and the transaction fails before publication if an
-- orphan exists.
ALTER TABLE public.training_progress
  DROP CONSTRAINT IF EXISTS training_progress_user_id_fkey;
ALTER TABLE public.training_progress
  ADD CONSTRAINT training_progress_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE CASCADE NOT VALID;
ALTER TABLE public.training_progress
  VALIDATE CONSTRAINT training_progress_user_id_fkey;

ALTER TABLE public.training_level_history
  DROP CONSTRAINT IF EXISTS training_level_history_user_id_fkey;
ALTER TABLE public.training_level_history
  ADD CONSTRAINT training_level_history_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE CASCADE NOT VALID;
ALTER TABLE public.training_level_history
  VALIDATE CONSTRAINT training_level_history_user_id_fkey;

ALTER TABLE public.training_daily_challenge
  DROP CONSTRAINT IF EXISTS training_daily_challenge_user_id_fkey;
ALTER TABLE public.training_daily_challenge
  ADD CONSTRAINT training_daily_challenge_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id)
  ON DELETE CASCADE NOT VALID;
ALTER TABLE public.training_daily_challenge
  VALIDATE CONSTRAINT training_daily_challenge_user_id_fkey;

-- Legacy streak/progression columns were browser-writable. Keep those values
-- in place for display continuity and snapshot them on the same user-owned row,
-- but give every reward/unlock decision a separate zero-based authority state.
-- Existing rows are snapshotted once; rows created after the cutover receive an
-- empty legacy snapshot and can never be mistaken for pre-authority evidence.
ALTER TABLE public.training_streaks
  ADD COLUMN IF NOT EXISTS legacy_authority_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS authority_epoch timestamptz,
  ADD COLUMN IF NOT EXISTS authority_version text,
  ADD COLUMN IF NOT EXISTS authority_current_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS authority_longest_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS authority_last_training_date date,
  ADD COLUMN IF NOT EXISTS authority_streak_start_date date,
  ADD COLUMN IF NOT EXISTS authority_milestones_claimed jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.training_progress
  ADD COLUMN IF NOT EXISTS legacy_authority_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS authority_epoch timestamptz,
  ADD COLUMN IF NOT EXISTS authority_version text,
  ADD COLUMN IF NOT EXISTS authority_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS authority_hands_played integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS authority_correct_answers integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS authority_total_answers integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS authority_current_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS authority_best_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS authority_last_played_at timestamptz;

UPDATE public.training_streaks
SET legacy_authority_snapshot = jsonb_build_object(
      'current_streak', current_streak,
      'longest_streak', longest_streak,
      'last_training_date', last_training_date,
      'streak_start_date', streak_start_date,
      'milestones_claimed', milestones_claimed
    ),
    authority_epoch = now(),
    authority_version = 'server_attempts_v2'
WHERE legacy_authority_snapshot IS NULL;

UPDATE public.training_progress
SET legacy_authority_snapshot = jsonb_build_object(
      'level', level,
      'hands_played', hands_played,
      'correct_answers', correct_answers,
      'total_answers', total_answers,
      'current_streak', current_streak,
      'best_streak', best_streak,
      'last_played_at', last_played_at
    ),
    authority_epoch = now(),
    authority_version = 'server_attempts_v2'
WHERE legacy_authority_snapshot IS NULL;

ALTER TABLE public.training_streaks
  ALTER COLUMN legacy_authority_snapshot SET DEFAULT '{}'::jsonb,
  ALTER COLUMN legacy_authority_snapshot SET NOT NULL,
  ALTER COLUMN authority_epoch SET DEFAULT now(),
  ALTER COLUMN authority_epoch SET NOT NULL,
  ALTER COLUMN authority_version SET DEFAULT 'server_attempts_v2',
  ALTER COLUMN authority_version SET NOT NULL;
ALTER TABLE public.training_progress
  ALTER COLUMN legacy_authority_snapshot SET DEFAULT '{}'::jsonb,
  ALTER COLUMN legacy_authority_snapshot SET NOT NULL,
  ALTER COLUMN authority_epoch SET DEFAULT now(),
  ALTER COLUMN authority_epoch SET NOT NULL,
  ALTER COLUMN authority_version SET DEFAULT 'server_attempts_v2',
  ALTER COLUMN authority_version SET NOT NULL;

ALTER TABLE public.training_streaks
  DROP CONSTRAINT IF EXISTS training_streaks_authority_values_check;
ALTER TABLE public.training_streaks
  ADD CONSTRAINT training_streaks_authority_values_check CHECK (
    authority_current_streak >= 0
    AND authority_longest_streak >= authority_current_streak
    AND jsonb_typeof(authority_milestones_claimed) = 'array'
    AND jsonb_typeof(legacy_authority_snapshot) = 'object'
  ) NOT VALID;
ALTER TABLE public.training_streaks
  VALIDATE CONSTRAINT training_streaks_authority_values_check;

ALTER TABLE public.training_progress
  DROP CONSTRAINT IF EXISTS training_progress_authority_values_check;
ALTER TABLE public.training_progress
  ADD CONSTRAINT training_progress_authority_values_check CHECK (
    authority_level BETWEEN 1 AND 12
    AND authority_hands_played >= 0
    AND authority_correct_answers BETWEEN 0 AND authority_total_answers
    AND authority_total_answers >= 0
    AND authority_current_streak >= 0
    AND authority_best_streak >= authority_current_streak
    AND jsonb_typeof(legacy_authority_snapshot) = 'object'
  ) NOT VALID;
ALTER TABLE public.training_progress
  VALIDATE CONSTRAINT training_progress_authority_values_check;

CREATE OR REPLACE FUNCTION public.fn_training_authority_snapshot_immutable_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.legacy_authority_snapshot IS DISTINCT FROM OLD.legacy_authority_snapshot
    OR NEW.authority_epoch IS DISTINCT FROM OLD.authority_epoch
    OR NEW.authority_version IS DISTINCT FROM OLD.authority_version
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TRAINING_LEGACY_AUTHORITY_SNAPSHOT_IMMUTABLE';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS training_streaks_authority_snapshot_immutable_v2
  ON public.training_streaks;
CREATE TRIGGER training_streaks_authority_snapshot_immutable_v2
  BEFORE UPDATE OR DELETE ON public.training_streaks
  FOR EACH ROW EXECUTE FUNCTION public.fn_training_authority_snapshot_immutable_v2();
DROP TRIGGER IF EXISTS training_progress_authority_snapshot_immutable_v2
  ON public.training_progress;
CREATE TRIGGER training_progress_authority_snapshot_immutable_v2
  BEFORE UPDATE OR DELETE ON public.training_progress
  FOR EACH ROW EXECUTE FUNCTION public.fn_training_authority_snapshot_immutable_v2();

CREATE TABLE IF NOT EXISTS public.training_question_snapshots (
  snapshot_key text PRIMARY KEY,
  source_question_id text NOT NULL,
  game_id text NOT NULL,
  level integer NOT NULL,
  content_digest text NOT NULL,
  question_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_question_snapshots_key_format
    CHECK (snapshot_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT training_question_snapshots_source_length
    CHECK (char_length(source_question_id) BETWEEN 1 AND 180),
  CONSTRAINT training_question_snapshots_game_length
    CHECK (char_length(game_id) BETWEEN 1 AND 100),
  CONSTRAINT training_question_snapshots_level_check
    CHECK (level BETWEEN 1 AND 12),
  CONSTRAINT training_question_snapshots_digest_format
    CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT training_question_snapshots_payload_object
    CHECK (jsonb_typeof(question_data) = 'object'),
  CONSTRAINT training_question_snapshots_source_version_key
    UNIQUE (game_id, level, source_question_id, content_digest)
);

COMMENT ON TABLE public.training_question_snapshots IS
  'Immutable canonical question bodies sealed before delivery. The mutable legacy training_question_cache is their source, never their completion authority.';

-- Legacy training_leaderboard rows were writable by authenticated browsers.
-- Preserve that table as non-authoritative history, but never mix its totals
-- into verified competition state. Only sealed completion RPCs may write this
-- clean aggregate and the public leaderboard API reads it through service_role.
CREATE TABLE IF NOT EXISTS public.training_verified_leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type text NOT NULL,
  period_key text NOT NULL,
  dimension_type text NOT NULL,
  dimension_key text NOT NULL,
  game_id text,
  category text,
  sessions_completed integer NOT NULL DEFAULT 0,
  questions_answered integer NOT NULL DEFAULT 0,
  questions_correct integer NOT NULL DEFAULT 0,
  accuracy numeric(5,2) NOT NULL DEFAULT 0,
  perfect_rounds integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  gtow_score_avg numeric,
  gtow_score_sum numeric NOT NULL DEFAULT 0,
  gtow_score_samples integer NOT NULL DEFAULT 0,
  ev_loss_total numeric NOT NULL DEFAULT 0,
  score_scale smallint NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_verified_leaderboard_period_check
    CHECK (period_type IN ('daily', 'weekly', 'monthly', 'alltime')),
  CONSTRAINT training_verified_leaderboard_period_key_length
    CHECK (char_length(period_key) BETWEEN 1 AND 32),
  CONSTRAINT training_verified_leaderboard_dimension_check CHECK (
    (
      dimension_type = 'overall'
      AND dimension_key = 'overall'
      AND game_id IS NULL
      AND category IS NULL
    )
    OR (
      dimension_type = 'game'
      AND dimension_key = game_id
      AND char_length(game_id) BETWEEN 1 AND 100
      AND category IS NULL
    )
    OR (
      dimension_type = 'category'
      AND dimension_key = category
      AND game_id IS NULL
      AND category IN ('mtt', 'cash', 'spins', 'psychology', 'advanced')
    )
  ),
  CONSTRAINT training_verified_leaderboard_totals_check CHECK (
    sessions_completed >= 0
    AND questions_answered >= 0
    AND questions_correct BETWEEN 0 AND questions_answered
    AND accuracy BETWEEN 0 AND 100
    AND perfect_rounds BETWEEN 0 AND sessions_completed
    AND best_streak >= 0
    AND score_scale = 2
  ),
  CONSTRAINT training_verified_leaderboard_user_period_dimension_key
    UNIQUE (user_id, period_type, period_key, dimension_type, dimension_key)
);

-- CREATE TABLE IF NOT EXISTS is intentionally rerunnable. Add the score
-- accumulator columns explicitly as well so a partially applied preview
-- cannot keep the old denominator bug.
ALTER TABLE public.training_verified_leaderboard
  ADD COLUMN IF NOT EXISTS gtow_score_sum numeric NOT NULL DEFAULT 0;
ALTER TABLE public.training_verified_leaderboard
  ADD COLUMN IF NOT EXISTS gtow_score_samples integer NOT NULL DEFAULT 0;
UPDATE public.training_verified_leaderboard
SET gtow_score_samples = greatest(sessions_completed, 1),
    gtow_score_sum = gtow_score_avg * greatest(sessions_completed, 1)
WHERE gtow_score_avg IS NOT NULL
  AND gtow_score_samples = 0;
UPDATE public.training_verified_leaderboard
SET gtow_score_sum = 0
WHERE gtow_score_samples = 0
  AND gtow_score_avg IS NULL
  AND gtow_score_sum <> 0;
ALTER TABLE public.training_verified_leaderboard
  DROP CONSTRAINT IF EXISTS training_verified_leaderboard_score_samples_check;
ALTER TABLE public.training_verified_leaderboard
  ADD CONSTRAINT training_verified_leaderboard_score_samples_check CHECK (
    gtow_score_samples BETWEEN 0 AND sessions_completed
    AND (
      (gtow_score_samples = 0 AND gtow_score_avg IS NULL AND gtow_score_sum = 0)
      OR (gtow_score_samples > 0 AND gtow_score_avg IS NOT NULL)
    )
  );

CREATE INDEX IF NOT EXISTS idx_training_verified_leaderboard_period
  ON public.training_verified_leaderboard (
    period_type, period_key, dimension_type, dimension_key,
    accuracy DESC, questions_correct DESC
  );

CREATE OR REPLACE FUNCTION public.fn_training_verified_leaderboard_record_v2(
  p_user_id uuid,
  p_game_id text,
  p_period_type text,
  p_period_key text,
  p_answered integer,
  p_correct integer,
  p_is_perfect boolean,
  p_best_streak integer DEFAULT NULL,
  p_gtow_score numeric DEFAULT NULL,
  p_ev_loss numeric DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH normalized AS (
    SELECT
      lower(btrim(p_game_id)) AS game_id,
      CASE
        WHEN lower(btrim(p_game_id)) ~ '^mtt-[0-9]{3}$'
          OR lower(btrim(p_game_id)) IN ('tournament-prep', 'final-table-sim')
          THEN 'mtt'
        WHEN lower(btrim(p_game_id)) ~ '^cash-[0-9]{3}$' THEN 'cash'
        WHEN lower(btrim(p_game_id)) ~ '^spins-[0-9]{3}$' THEN 'spins'
        WHEN lower(btrim(p_game_id)) ~ '^psy-[0-9]{3}$' THEN 'psychology'
        WHEN lower(btrim(p_game_id)) ~ '^adv-[0-9]{3}$'
          OR lower(btrim(p_game_id)) IN (
            'quiz-gauntlet', 'hand-lab', 'bluff-catcher',
            'mixed-strategy-lab', 'study-group'
          ) THEN 'advanced'
        ELSE NULL
      END AS category
  ), dimensions AS (
    SELECT 'overall'::text AS dimension_type, 'overall'::text AS dimension_key,
      NULL::text AS game_id, NULL::text AS category
    FROM normalized
    UNION ALL
    SELECT 'game', game_id, game_id, NULL::text
    FROM normalized
    WHERE game_id IS NOT NULL AND game_id <> ''
    UNION ALL
    SELECT 'category', category, NULL::text, category
    FROM normalized
    WHERE category IS NOT NULL
  )
  INSERT INTO public.training_verified_leaderboard AS verified (
    user_id, period_type, period_key,
    dimension_type, dimension_key, game_id, category,
    sessions_completed, questions_answered, questions_correct,
    accuracy, perfect_rounds, best_streak,
    gtow_score_avg, gtow_score_sum, gtow_score_samples,
    ev_loss_total, score_scale, updated_at
  ) SELECT
    p_user_id, p_period_type, p_period_key,
    dimensions.dimension_type, dimensions.dimension_key,
    dimensions.game_id, dimensions.category,
    1, greatest(p_answered, 0), least(greatest(p_correct, 0), greatest(p_answered, 0)),
    CASE WHEN p_answered > 0
      THEN round((least(greatest(p_correct, 0), p_answered)::numeric / p_answered) * 100, 2)
      ELSE 0 END,
    CASE WHEN p_is_perfect THEN 1 ELSE 0 END,
    greatest(coalesce(p_best_streak, 0), 0),
    p_gtow_score, coalesce(p_gtow_score, 0),
    CASE WHEN p_gtow_score IS NULL THEN 0 ELSE 1 END,
    coalesce(p_ev_loss, 0), 2, now()
  FROM dimensions
  ON CONFLICT (user_id, period_type, period_key, dimension_type, dimension_key)
  DO UPDATE SET
    sessions_completed = verified.sessions_completed + 1,
    questions_answered = verified.questions_answered + greatest(p_answered, 0),
    questions_correct = verified.questions_correct
      + least(greatest(p_correct, 0), greatest(p_answered, 0)),
    accuracy = CASE
      WHEN verified.questions_answered + greatest(p_answered, 0) > 0 THEN round((
        (verified.questions_correct
          + least(greatest(p_correct, 0), greatest(p_answered, 0)))::numeric
        / (verified.questions_answered + greatest(p_answered, 0))
      ) * 100, 2)
      ELSE 0 END,
    perfect_rounds = verified.perfect_rounds
      + CASE WHEN p_is_perfect THEN 1 ELSE 0 END,
    best_streak = greatest(verified.best_streak, coalesce(p_best_streak, 0)),
    gtow_score_avg = CASE
      WHEN p_gtow_score IS NULL THEN verified.gtow_score_avg
      ELSE round((verified.gtow_score_sum + p_gtow_score)
        / (verified.gtow_score_samples + 1), 2)
      END,
    gtow_score_sum = verified.gtow_score_sum + coalesce(p_gtow_score, 0),
    gtow_score_samples = verified.gtow_score_samples
      + CASE WHEN p_gtow_score IS NULL THEN 0 ELSE 1 END,
    ev_loss_total = verified.ev_loss_total + coalesce(p_ev_loss, 0),
    score_scale = 2,
    updated_at = now();
$function$;

CREATE OR REPLACE FUNCTION public.fn_training_verified_leaderboard_rank_v2(
  p_user_id uuid,
  p_period_type text,
  p_period_key text,
  p_dimension_type text,
  p_dimension_key text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH mine AS (
    SELECT *
    FROM public.training_verified_leaderboard
    WHERE user_id = p_user_id
      AND period_type = p_period_type
      AND period_key = p_period_key
      AND dimension_type = p_dimension_type
      AND dimension_key = p_dimension_key
  )
  SELECT jsonb_build_object(
    'myRank', (
      SELECT 1 + (
        SELECT count(*)
        FROM public.training_verified_leaderboard better
        WHERE better.period_type = mine.period_type
          AND better.period_key = mine.period_key
          AND better.dimension_type = mine.dimension_type
          AND better.dimension_key = mine.dimension_key
          AND (
            better.accuracy > mine.accuracy
            OR (
              better.accuracy = mine.accuracy
              AND better.questions_correct > mine.questions_correct
            )
            OR (
              better.accuracy = mine.accuracy
              AND better.questions_correct = mine.questions_correct
              AND better.user_id::text < mine.user_id::text
            )
          )
      )
      FROM mine
    ),
    'myEntry', (
      SELECT jsonb_build_object(
        'userId', mine.user_id,
        'accuracy', mine.accuracy,
        'sessionsCompleted', mine.sessions_completed,
        'questionsAnswered', mine.questions_answered,
        'questionsCorrect', mine.questions_correct,
        'gtowScoreAvg', mine.gtow_score_avg,
        'bestStreak', mine.best_streak
      )
      FROM mine
    )
  );
$function$;

COMMENT ON TABLE public.training_verified_leaderboard IS
  'Competition totals derived exclusively from sealed server-authoritative Training attempts.';

CREATE TABLE IF NOT EXISTS public.training_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_nonce text NOT NULL,
  game_id text NOT NULL,
  level integer NOT NULL,
  session_kind text NOT NULL,
  difficulty text NOT NULL,
  expected_hands integer NOT NULL,
  config_hash text NOT NULL,
  parent_attempt_id uuid REFERENCES public.training_attempts(id) ON DELETE SET NULL,
  practice_only boolean NOT NULL,
  status text NOT NULL DEFAULT 'open',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  completed_at timestamptz,
  answered_hands integer,
  correct_hands integer,
  accuracy_percentage integer,
  passed boolean,
  best_streak integer,
  reward_diamonds integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_attempts_session_nonce_key
    UNIQUE (user_id, client_nonce, game_id, level, session_kind),
  CONSTRAINT training_attempts_nonce_length
    CHECK (char_length(client_nonce) BETWEEN 1 AND 180),
  CONSTRAINT training_attempts_game_length
    CHECK (char_length(game_id) BETWEEN 1 AND 100),
  CONSTRAINT training_attempts_level_check
    CHECK (level BETWEEN 1 AND 12),
  CONSTRAINT training_attempts_kind_check
    CHECK (session_kind IN ('campaign', 'custom', 'daily', 'replay')),
  CONSTRAINT training_attempts_difficulty_check
    CHECK (difficulty IN ('simple', 'grouped', 'exact')),
  CONSTRAINT training_attempts_config_hash_format
    CHECK (config_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT training_attempts_practice_kind_check
    CHECK (practice_only = (session_kind = 'replay')),
  CONSTRAINT training_attempts_hand_contract_check CHECK (
    (
      session_kind = 'campaign'
      AND expected_hands = CASE WHEN level = 12 THEN 30 WHEN level = 11 THEN 25 ELSE 20 END
    )
    OR (session_kind = 'custom' AND expected_hands IN (10, 25, 50, 100))
    OR (session_kind = 'daily' AND expected_hands = 1 AND level = 1)
    OR (session_kind = 'replay' AND expected_hands BETWEEN 1 AND 100)
  ),
  CONSTRAINT training_attempts_status_check
    CHECK (status IN ('open', 'completed', 'abandoned', 'expired')),
  CONSTRAINT training_attempts_expiry_check
    CHECK (expires_at > started_at),
  CONSTRAINT training_attempts_result_check CHECK (
    (
      status = 'completed'
      AND completed_at IS NOT NULL
      AND answered_hands IS NOT NULL
      AND correct_hands IS NOT NULL
      AND accuracy_percentage IS NOT NULL
      AND passed IS NOT NULL
      AND best_streak IS NOT NULL
      AND reward_diamonds IS NOT NULL
    )
    OR (
      status <> 'completed'
      AND completed_at IS NULL
      AND answered_hands IS NULL
      AND correct_hands IS NULL
      AND accuracy_percentage IS NULL
      AND passed IS NULL
      AND best_streak IS NULL
      AND reward_diamonds IS NULL
    )
  ),
  CONSTRAINT training_attempts_result_range_check CHECK (
    answered_hands IS NULL
    OR (
      answered_hands = expected_hands
      AND correct_hands BETWEEN 0 AND answered_hands
      AND accuracy_percentage BETWEEN 0 AND 100
      AND best_streak BETWEEN 0 AND answered_hands
      AND reward_diamonds >= 0
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_training_attempts_user_status
  ON public.training_attempts (user_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_attempts_parent
  ON public.training_attempts (parent_attempt_id)
  WHERE parent_attempt_id IS NOT NULL;

ALTER TABLE public.training_daily_challenge
  ADD COLUMN IF NOT EXISTS attempt_id uuid;
ALTER TABLE public.training_daily_challenge
  DROP CONSTRAINT IF EXISTS training_daily_challenge_attempt_fkey;
ALTER TABLE public.training_daily_challenge
  ADD CONSTRAINT training_daily_challenge_attempt_fkey
  FOREIGN KEY (attempt_id) REFERENCES public.training_attempts(id)
  ON DELETE SET NULL NOT VALID;
ALTER TABLE public.training_daily_challenge
  VALIDATE CONSTRAINT training_daily_challenge_attempt_fkey;
CREATE UNIQUE INDEX IF NOT EXISTS training_daily_challenge_attempt_key
  ON public.training_daily_challenge (attempt_id)
  WHERE attempt_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.training_attempt_hands (
  attempt_id uuid NOT NULL
    REFERENCES public.training_attempts(id) ON DELETE CASCADE,
  hand_ordinal smallint NOT NULL,
  snapshot_key text NOT NULL
    REFERENCES public.training_question_snapshots(snapshot_key) ON DELETE RESTRICT,
  scoring_rule text NOT NULL DEFAULT 'initial_decision',
  status text NOT NULL DEFAULT 'allocated',
  result_is_correct boolean,
  scored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, hand_ordinal),
  CONSTRAINT training_attempt_hands_ordinal_check
    CHECK (hand_ordinal BETWEEN 1 AND 100),
  CONSTRAINT training_attempt_hands_scoring_rule_check
    CHECK (scoring_rule = 'initial_decision'),
  CONSTRAINT training_attempt_hands_status_check
    CHECK (status IN ('allocated', 'scored')),
  CONSTRAINT training_attempt_hands_result_check CHECK (
    (status = 'allocated' AND result_is_correct IS NULL AND scored_at IS NULL)
    OR (status = 'scored' AND result_is_correct IS NOT NULL AND scored_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_training_attempt_hands_snapshot
  ON public.training_attempt_hands (snapshot_key);

ALTER TABLE public.training_answers
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS attempt_id uuid,
  ADD COLUMN IF NOT EXISTS hand_ordinal smallint,
  ADD COLUMN IF NOT EXISTS decision_ordinal smallint,
  ADD COLUMN IF NOT EXISTS snapshot_key text;

ALTER TABLE public.training_level_history
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS attempt_id uuid,
  ADD COLUMN IF NOT EXISTS practice_only boolean NOT NULL DEFAULT false;

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS attempt_id uuid;

ALTER TABLE public.training_answers
  DROP CONSTRAINT IF EXISTS training_answers_session_id_length;
ALTER TABLE public.training_answers
  ADD CONSTRAINT training_answers_session_id_length
  CHECK (session_id IS NULL OR char_length(session_id) BETWEEN 1 AND 180)
  NOT VALID;
ALTER TABLE public.training_answers
  VALIDATE CONSTRAINT training_answers_session_id_length;

ALTER TABLE public.training_answers
  DROP CONSTRAINT IF EXISTS training_answers_attempt_fk;
ALTER TABLE public.training_answers
  ADD CONSTRAINT training_answers_attempt_fk
  FOREIGN KEY (attempt_id) REFERENCES public.training_attempts(id)
  ON DELETE CASCADE NOT VALID;
ALTER TABLE public.training_answers
  VALIDATE CONSTRAINT training_answers_attempt_fk;

ALTER TABLE public.training_answers
  DROP CONSTRAINT IF EXISTS training_answers_attempt_hand_fk;
ALTER TABLE public.training_answers
  ADD CONSTRAINT training_answers_attempt_hand_fk
  FOREIGN KEY (attempt_id, hand_ordinal)
  REFERENCES public.training_attempt_hands(attempt_id, hand_ordinal)
  ON DELETE CASCADE NOT VALID;
ALTER TABLE public.training_answers
  VALIDATE CONSTRAINT training_answers_attempt_hand_fk;

ALTER TABLE public.training_answers
  DROP CONSTRAINT IF EXISTS training_answers_snapshot_fk;
ALTER TABLE public.training_answers
  ADD CONSTRAINT training_answers_snapshot_fk
  FOREIGN KEY (snapshot_key)
  REFERENCES public.training_question_snapshots(snapshot_key)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.training_answers
  VALIDATE CONSTRAINT training_answers_snapshot_fk;

ALTER TABLE public.training_answers
  DROP CONSTRAINT IF EXISTS training_answers_v2_binding_check;
ALTER TABLE public.training_answers
  ADD CONSTRAINT training_answers_v2_binding_check CHECK (
    (
      attempt_id IS NULL
      AND hand_ordinal IS NULL
      AND decision_ordinal IS NULL
      AND snapshot_key IS NULL
    )
    OR (
      attempt_id IS NOT NULL
      AND hand_ordinal BETWEEN 1 AND 100
      AND decision_ordinal BETWEEN 1 AND 8
      AND snapshot_key IS NOT NULL
      AND session_id IS NOT NULL
      AND submission_id IS NOT NULL
    )
  ) NOT VALID;
ALTER TABLE public.training_answers
  VALIDATE CONSTRAINT training_answers_v2_binding_check;

ALTER TABLE public.training_level_history
  DROP CONSTRAINT IF EXISTS training_level_history_session_id_length;
ALTER TABLE public.training_level_history
  ADD CONSTRAINT training_level_history_session_id_length
  CHECK (session_id IS NULL OR char_length(session_id) BETWEEN 1 AND 180)
  NOT VALID;
ALTER TABLE public.training_level_history
  VALIDATE CONSTRAINT training_level_history_session_id_length;

ALTER TABLE public.training_level_history
  DROP CONSTRAINT IF EXISTS training_level_history_attempt_fk;
ALTER TABLE public.training_level_history
  ADD CONSTRAINT training_level_history_attempt_fk
  FOREIGN KEY (attempt_id) REFERENCES public.training_attempts(id)
  ON DELETE CASCADE NOT VALID;
ALTER TABLE public.training_level_history
  VALIDATE CONSTRAINT training_level_history_attempt_fk;

ALTER TABLE public.training_sessions
  DROP CONSTRAINT IF EXISTS training_sessions_attempt_fk;
ALTER TABLE public.training_sessions
  ADD CONSTRAINT training_sessions_attempt_fk
  FOREIGN KEY (attempt_id) REFERENCES public.training_attempts(id)
  ON DELETE CASCADE NOT VALID;
ALTER TABLE public.training_sessions
  VALIDATE CONSTRAINT training_sessions_attempt_fk;

CREATE UNIQUE INDEX IF NOT EXISTS training_answers_attempt_decision_key
  ON public.training_answers (attempt_id, hand_ordinal, decision_ordinal)
  WHERE attempt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_answers_attempt_completion
  ON public.training_answers (attempt_id, decision_ordinal, hand_ordinal)
  INCLUDE (is_correct, answered_at, ev_loss, ev_loss_measured)
  WHERE attempt_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS training_level_history_attempt_key
  ON public.training_level_history (attempt_id)
  WHERE attempt_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS training_sessions_attempt_key
  ON public.training_sessions (attempt_id)
  WHERE attempt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_level_history_session
  ON public.training_level_history (user_id, game_id, session_id, level)
  WHERE session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_training_snapshot_immutable_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23514',
    MESSAGE = 'TRAINING_QUESTION_SNAPSHOT_IMMUTABLE';
END;
$function$;

DROP TRIGGER IF EXISTS training_question_snapshots_immutable_v2
  ON public.training_question_snapshots;
CREATE TRIGGER training_question_snapshots_immutable_v2
  BEFORE UPDATE OR DELETE ON public.training_question_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.fn_training_snapshot_immutable_v2();

CREATE OR REPLACE FUNCTION public.fn_validate_training_attempt_hand_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  attempt_row public.training_attempts%ROWTYPE;
  snapshot_row public.training_question_snapshots%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
       OR NEW.hand_ordinal IS DISTINCT FROM OLD.hand_ordinal
       OR NEW.snapshot_key IS DISTINCT FROM OLD.snapshot_key
       OR NEW.scoring_rule IS DISTINCT FROM OLD.scoring_rule
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'TRAINING_ATTEMPT_HAND_IDENTITY_IMMUTABLE';
    END IF;
    IF OLD.status = 'scored'
       AND (
         NEW.status IS DISTINCT FROM OLD.status
         OR NEW.result_is_correct IS DISTINCT FROM OLD.result_is_correct
         OR NEW.scored_at IS DISTINCT FROM OLD.scored_at
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'TRAINING_ATTEMPT_HAND_RESULT_IMMUTABLE';
    END IF;
  END IF;

  SELECT * INTO attempt_row
  FROM public.training_attempts
  WHERE id = NEW.attempt_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'TRAINING_ATTEMPT_NOT_FOUND';
  END IF;
  IF attempt_row.status <> 'open' OR attempt_row.expires_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_NOT_OPEN';
  END IF;
  IF NEW.hand_ordinal > attempt_row.expected_hands THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_HAND_OUT_OF_RANGE';
  END IF;

  SELECT * INTO snapshot_row
  FROM public.training_question_snapshots
  WHERE snapshot_key = NEW.snapshot_key;

  IF NOT FOUND
     OR snapshot_row.game_id <> attempt_row.game_id
     OR snapshot_row.level <> attempt_row.level THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_SNAPSHOT_MISMATCH';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS training_attempt_hands_validate_v2 ON public.training_attempt_hands;
CREATE TRIGGER training_attempt_hands_validate_v2
  BEFORE INSERT OR UPDATE ON public.training_attempt_hands
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_training_attempt_hand_v2();

CREATE OR REPLACE FUNCTION public.fn_validate_training_answer_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  attempt_row public.training_attempts%ROWTYPE;
  hand_row public.training_attempt_hands%ROWTYPE;
  snapshot_row public.training_question_snapshots%ROWTYPE;
  exact_replay_exists boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.attempt_id IS NULL AND NEW.attempt_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_LEGACY_ANSWER_CANNOT_BE_REBOUND';
    END IF;
    IF OLD.attempt_id IS NOT NULL AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_ANSWER_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;

  -- Nullable v2 columns preserve legacy rows during the staged API rollout.
  IF NEW.attempt_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Let an exact receipt replay reach the unique constraint even after the
  -- attempt completed; the API then returns the already-persisted answer.
  SELECT EXISTS (
    SELECT 1
    FROM public.training_answers existing
    WHERE existing.user_id = NEW.user_id
      AND existing.submission_id = NEW.submission_id
      AND existing.attempt_id = NEW.attempt_id
      AND existing.hand_ordinal = NEW.hand_ordinal
      AND existing.decision_ordinal = NEW.decision_ordinal
      AND existing.snapshot_key = NEW.snapshot_key
      AND existing.question_id = NEW.question_id
      AND lower(existing.answer_id) = lower(NEW.answer_id)
  ) INTO exact_replay_exists;
  IF exact_replay_exists THEN
    RETURN NEW;
  END IF;

  SELECT * INTO attempt_row
  FROM public.training_attempts
  WHERE id = NEW.attempt_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'TRAINING_ATTEMPT_NOT_FOUND';
  END IF;
  IF attempt_row.status <> 'open' OR attempt_row.expires_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_NOT_OPEN';
  END IF;
  IF NEW.user_id <> attempt_row.user_id
     OR NEW.game_id <> attempt_row.game_id
     OR NEW.level <> attempt_row.level
     OR NEW.session_id <> attempt_row.client_nonce THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_ANSWER_OWNER_MISMATCH';
  END IF;
  IF coalesce(NEW.evidence_metadata ->> 'difficultyMode', '') <> attempt_row.difficulty THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_DIFFICULTY_MISMATCH';
  END IF;

  SELECT * INTO hand_row
  FROM public.training_attempt_hands
  WHERE attempt_id = NEW.attempt_id
    AND hand_ordinal = NEW.hand_ordinal;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_HAND_MISMATCH';
  END IF;
  IF NEW.decision_ordinal = 1 AND hand_row.snapshot_key <> NEW.snapshot_key THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_INITIAL_SNAPSHOT_MISMATCH';
  END IF;
  IF NEW.decision_ordinal > 1 AND NOT EXISTS (
    SELECT 1
    FROM public.training_answers prior
    WHERE prior.attempt_id = NEW.attempt_id
      AND prior.hand_ordinal = NEW.hand_ordinal
      AND prior.decision_ordinal = NEW.decision_ordinal - 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_DECISION_SEQUENCE_GAP';
  END IF;

  SELECT * INTO snapshot_row
  FROM public.training_question_snapshots
  WHERE snapshot_key = NEW.snapshot_key;
  IF NOT FOUND
     OR snapshot_row.game_id <> NEW.game_id
     OR snapshot_row.level <> NEW.level
     OR NOT (
       snapshot_row.source_question_id = NEW.question_id
       OR snapshot_row.question_data ->> 'id' = NEW.question_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_QUESTION_MISMATCH';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS training_answers_validate_v2 ON public.training_answers;
CREATE TRIGGER training_answers_validate_v2
  BEFORE INSERT OR UPDATE ON public.training_answers
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_training_answer_v2();

CREATE OR REPLACE FUNCTION public.fn_reject_training_answer_delete_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.attempt_id IS NOT NULL THEN
    -- The only permitted removal is an auth.users parent cascade. Direct row,
    -- attempt, or service deletion still sees the owning auth user and remains
    -- forbidden, preserving sealed-answer immutability during normal use.
    IF EXISTS (SELECT 1 FROM auth.users users WHERE users.id = OLD.user_id) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_ANSWER_IMMUTABLE';
    END IF;
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS training_answers_reject_v2_delete ON public.training_answers;
CREATE TRIGGER training_answers_reject_v2_delete
  BEFORE DELETE ON public.training_answers
  FOR EACH ROW EXECUTE FUNCTION public.fn_reject_training_answer_delete_v2();

CREATE OR REPLACE FUNCTION public.fn_score_training_attempt_hand_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.attempt_id IS NOT NULL AND NEW.decision_ordinal = 1 THEN
    UPDATE public.training_attempt_hands
    SET status = 'scored',
        result_is_correct = NEW.is_correct,
        scored_at = NEW.answered_at
    WHERE attempt_id = NEW.attempt_id
      AND hand_ordinal = NEW.hand_ordinal
      AND status = 'allocated';
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_HAND_ALREADY_SCORED';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS training_answers_score_hand_v2 ON public.training_answers;
CREATE TRIGGER training_answers_score_hand_v2
  AFTER INSERT ON public.training_answers
  FOR EACH ROW EXECUTE FUNCTION public.fn_score_training_attempt_hand_v2();

CREATE OR REPLACE FUNCTION public.fn_start_training_attempt_v2(
  p_user_id uuid,
  p_client_nonce text,
  p_game_id text,
  p_level integer,
  p_session_kind text,
  p_difficulty text,
  p_expected_hands integer,
  p_config_hash text,
  p_parent_attempt_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  normalized_nonce text := btrim(p_client_nonce);
  normalized_game text := btrim(p_game_id);
  normalized_kind text := lower(btrim(p_session_kind));
  normalized_difficulty text := lower(btrim(p_difficulty));
  attempt_row public.training_attempts%ROWTYPE;
  parent_row public.training_attempts%ROWTYPE;
  unlocked_level integer := 1;
  expected_campaign_hands integer;
  today_chicago date := timezone('America/Chicago', now())::date;
  inserted boolean := false;
BEGIN
  IF p_user_id IS NULL
     OR normalized_nonce IS NULL
     OR char_length(normalized_nonce) NOT BETWEEN 1 AND 180
     OR normalized_game IS NULL
     OR char_length(normalized_game) NOT BETWEEN 1 AND 100
     OR p_level IS NULL
     OR p_level NOT BETWEEN 1 AND 12
     OR normalized_kind IS NULL
     OR normalized_kind NOT IN ('campaign', 'custom', 'daily', 'replay')
     OR normalized_difficulty IS NULL
     OR normalized_difficulty NOT IN ('simple', 'grouped', 'exact')
     OR p_expected_hands IS NULL
     OR p_config_hash IS NULL
     OR p_config_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'status', 400,
      'code', 'TRAINING_ATTEMPT_INPUT_INVALID',
      'error', 'The Training attempt contract is invalid.');
  END IF;

  expected_campaign_hands := CASE
    WHEN p_level = 12 THEN 30 WHEN p_level = 11 THEN 25 ELSE 20
  END;
  IF (normalized_kind = 'campaign' AND p_expected_hands <> expected_campaign_hands)
     OR (normalized_kind = 'custom' AND p_expected_hands NOT IN (10, 25, 50, 100))
     OR (normalized_kind = 'daily' AND (
       p_expected_hands <> 1
       OR p_level <> 1
       OR normalized_game <> 'daily-challenge'
       OR normalized_nonce <> 'daily-' || today_chicago::text
       OR p_parent_attempt_id IS NOT NULL
     ))
     OR (normalized_kind = 'replay' AND (p_expected_hands IS NULL OR p_expected_hands NOT BETWEEN 1 AND 100)) THEN
    RETURN jsonb_build_object('success', false, 'status', 400,
      'code', 'TRAINING_ATTEMPT_HAND_COUNT_INVALID',
      'error', 'The hand count does not match the selected session kind and level.');
  END IF;

  IF p_parent_attempt_id IS NOT NULL THEN
    SELECT * INTO parent_row
    FROM public.training_attempts
    WHERE id = p_parent_attempt_id
    FOR KEY SHARE;
    IF NOT FOUND
       OR parent_row.user_id <> p_user_id
       OR parent_row.game_id <> normalized_game
       OR parent_row.level <> p_level
       OR parent_row.status <> 'completed' THEN
      RETURN jsonb_build_object('success', false, 'status', 409,
        'code', 'TRAINING_ATTEMPT_PARENT_INVALID',
        'error', 'The retry or replay source attempt is not eligible.');
    END IF;
  ELSIF normalized_kind = 'replay' THEN
    RETURN jsonb_build_object('success', false, 'status', 400,
      'code', 'TRAINING_ATTEMPT_REPLAY_PARENT_REQUIRED',
      'error', 'Mistake replay must reference a completed attempt.');
  ELSE
    SELECT greatest(1, coalesce(progress.authority_level, 1))
    INTO unlocked_level
    FROM public.training_progress progress
    WHERE progress.user_id = p_user_id
      AND progress.game_id = normalized_game;
    unlocked_level := coalesce(unlocked_level, 1);
    IF p_level > unlocked_level THEN
      RETURN jsonb_build_object('success', false, 'status', 403,
        'code', 'TRAINING_ATTEMPT_LEVEL_LOCKED',
        'error', 'This Training level has not been unlocked.');
    END IF;
  END IF;

  INSERT INTO public.training_attempts (
    user_id, client_nonce, game_id, level, session_kind, difficulty,
    expected_hands, config_hash, parent_attempt_id, practice_only
  ) VALUES (
    p_user_id, normalized_nonce, normalized_game, p_level, normalized_kind,
    normalized_difficulty, p_expected_hands, p_config_hash,
    p_parent_attempt_id, normalized_kind = 'replay'
  )
  ON CONFLICT (user_id, client_nonce, game_id, level, session_kind) DO NOTHING
  RETURNING * INTO attempt_row;
  inserted := FOUND;

  IF NOT inserted THEN
    SELECT * INTO attempt_row
    FROM public.training_attempts
    WHERE user_id = p_user_id
      AND client_nonce = normalized_nonce
      AND game_id = normalized_game
      AND level = p_level
      AND session_kind = normalized_kind
    FOR UPDATE;

    IF NOT FOUND
       OR attempt_row.game_id <> normalized_game
       OR attempt_row.level <> p_level
       OR attempt_row.session_kind <> normalized_kind
       OR attempt_row.difficulty <> normalized_difficulty
       OR attempt_row.expected_hands <> p_expected_hands
       OR attempt_row.config_hash <> p_config_hash
       OR attempt_row.parent_attempt_id IS DISTINCT FROM p_parent_attempt_id THEN
      RETURN jsonb_build_object('success', false, 'status', 409,
        'code', 'TRAINING_ATTEMPT_NONCE_CONFLICT',
        'error', 'This client session id already belongs to a different Training attempt.');
    END IF;

    IF attempt_row.status = 'open' AND attempt_row.expires_at <= now() THEN
      UPDATE public.training_attempts
      SET status = 'expired', updated_at = now()
      WHERE id = attempt_row.id;
      RETURN jsonb_build_object('success', false, 'status', 409,
        'code', 'TRAINING_ATTEMPT_EXPIRED',
        'error', 'This Training attempt expired. Start a fresh session.');
    END IF;

    IF attempt_row.status = 'expired' THEN
      RETURN jsonb_build_object('success', false, 'status', 409,
        'code', 'TRAINING_ATTEMPT_EXPIRED',
        'error', 'This Training attempt expired. Start a fresh session.');
    END IF;

    IF attempt_row.status <> 'open' THEN
      RETURN jsonb_build_object('success', false, 'status', 409,
        'code', 'TRAINING_ATTEMPT_NOT_OPEN',
        'error', 'This Training attempt is already closed. Start a fresh session.');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'newAttempt', inserted, 'attemptId', attempt_row.id,
    'clientSessionId', attempt_row.client_nonce, 'gameId', attempt_row.game_id,
    'level', attempt_row.level, 'sessionKind', attempt_row.session_kind,
    'difficulty', attempt_row.difficulty, 'targetHands', attempt_row.expected_hands,
    'practiceOnly', attempt_row.practice_only, 'status', attempt_row.status,
    'expiresAt', attempt_row.expires_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_complete_training_attempt_v2(
  p_user_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
<<complete_attempt>>
DECLARE
  attempt_row public.training_attempts%ROWTYPE;
  answer_row record;
  progress_row public.training_progress%ROWTYPE;
  history_row public.training_level_history%ROWTYPE;
  streak_row public.training_streaks%ROWTYPE;
  daily_row public.training_daily_challenge%ROWTYPE;
  manifest_hands integer := 0;
  scored_hands integer := 0;
  answered integer := 0;
  correct integer := 0;
  current_streak integer := 0;
  best_streak integer := 0;
  accuracy integer := 0;
  required_correct integer := 0;
  reward_request integer := 0;
  reward_awarded integer := 0;
  reward_reason text := NULL;
  reward_reference text;
  reconciled_reward_rows integer := 0;
  reward_multiplier numeric := 1.0;
  award_result jsonb := '{}'::jsonb;
  total_ev_loss numeric := 0;
  has_measured_ev boolean := false;
  passed boolean := false;
  first_answer_at timestamptz := NULL;
  last_answer_at timestamptz := NULL;
  elapsed_seconds integer := 0;
  now_utc timestamp := timezone('UTC', now());
  today_chicago date := timezone('America/Chicago', now())::date;
  daily_key text;
  weekly_key text;
  monthly_key text;
  daily_already_completed boolean := false;
  daily_selected_action text := NULL;
BEGIN
  IF p_user_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 400,
      'code', 'TRAINING_COMPLETION_INPUT_INVALID',
      'error', 'A valid user and attempt are required.');
  END IF;

  SELECT * INTO attempt_row
  FROM public.training_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND OR attempt_row.user_id <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'status', 404,
      'code', 'TRAINING_ATTEMPT_NOT_FOUND',
      'error', 'The Training attempt was not found.');
  END IF;

  IF attempt_row.status = 'completed' THEN
    SELECT * INTO history_row FROM public.training_level_history WHERE attempt_id = attempt_row.id;
    SELECT * INTO streak_row FROM public.training_streaks
    WHERE user_id = attempt_row.user_id;
    SELECT * INTO progress_row FROM public.training_progress
    WHERE user_id = attempt_row.user_id AND game_id = attempt_row.game_id;
    IF attempt_row.session_kind = 'daily' THEN
      SELECT * INTO daily_row FROM public.training_daily_challenge
      WHERE user_id = attempt_row.user_id
        AND daily_id = attempt_row.client_nonce;
    END IF;
    RETURN jsonb_build_object(
      'success', true, 'newCompletion', false, 'attemptId', attempt_row.id,
      'practiceOnly', attempt_row.practice_only, 'answered', attempt_row.answered_hands,
      'correct', attempt_row.correct_hands, 'accuracy', attempt_row.accuracy_percentage,
      'passed', attempt_row.passed, 'bestStreak', attempt_row.best_streak,
      'diamondsEarned', attempt_row.reward_diamonds,
      'rewardReference', 'training_attempt:' || attempt_row.id::text,
      'requiredQuestions', attempt_row.expected_hands,
      'requiredCorrect', ceil(attempt_row.expected_hands * CASE WHEN attempt_row.level = 12 THEN 0.90 ELSE 0.85 END)::integer,
      'history', to_jsonb(history_row), 'progress', to_jsonb(progress_row),
      'trainingStreak', to_jsonb(streak_row),
      'dailyChallenge', to_jsonb(daily_row)
    );
  END IF;

  IF attempt_row.status <> 'open' THEN
    RETURN jsonb_build_object('success', false, 'status', 409,
      'code', 'TRAINING_ATTEMPT_NOT_OPEN',
      'error', 'This Training attempt cannot be completed.');
  END IF;
  IF attempt_row.session_kind = 'daily'
     AND attempt_row.client_nonce <> 'daily-' || today_chicago::text THEN
    UPDATE public.training_attempts SET status = 'expired', updated_at = now()
    WHERE id = attempt_row.id;
    RETURN jsonb_build_object('success', false, 'status', 409,
      'code', 'TRAINING_DAILY_ATTEMPT_EXPIRED',
      'error', 'This Daily Challenge has expired. Load today''s challenge.');
  END IF;
  IF attempt_row.expires_at <= now() THEN
    UPDATE public.training_attempts SET status = 'expired', updated_at = now()
    WHERE id = attempt_row.id;
    RETURN jsonb_build_object('success', false, 'status', 409,
      'code', 'TRAINING_ATTEMPT_EXPIRED',
      'error', 'This Training attempt expired before completion.');
  END IF;

  IF attempt_row.session_kind = 'daily' THEN
    SELECT * INTO daily_row
    FROM public.training_daily_challenge
    WHERE user_id = attempt_row.user_id
      AND daily_id = attempt_row.client_nonce
    FOR UPDATE;
    -- A legacy row with no attempt binding still proves today's challenge was
    -- already consumed. It may be bound to this sealed recovery attempt below,
    -- but must never receive a second 25-Diamond payout.
    daily_already_completed := FOUND;
    IF daily_already_completed AND daily_row.attempt_id <> attempt_row.id THEN
      RETURN jsonb_build_object('success', false, 'status', 409,
        'code', 'TRAINING_DAILY_ALREADY_COMPLETED',
        'error', 'This Daily Challenge was already completed by another sealed attempt.');
    END IF;
  END IF;

  SELECT count(*)::integer,
    count(*) FILTER (WHERE status = 'scored' AND result_is_correct IS NOT NULL AND scored_at IS NOT NULL)::integer
  INTO manifest_hands, scored_hands
  FROM public.training_attempt_hands WHERE attempt_id = attempt_row.id;

  IF manifest_hands <> attempt_row.expected_hands OR scored_hands <> attempt_row.expected_hands THEN
    RETURN jsonb_build_object('success', false, 'status', 409,
      'code', 'TRAINING_ATTEMPT_INCOMPLETE',
      'error', format('This attempt has %s of %s scored hands.', scored_hands, attempt_row.expected_hands),
      'answered', scored_hands, 'requiredQuestions', attempt_row.expected_hands);
  END IF;

  FOR answer_row IN
    SELECT hands.hand_ordinal, answers.answer_id, answers.is_correct, answers.answered_at,
      answers.ev_loss, answers.ev_loss_measured
    FROM public.training_attempt_hands hands
    JOIN public.training_answers answers
      ON answers.attempt_id = hands.attempt_id
     AND answers.hand_ordinal = hands.hand_ordinal
     AND answers.decision_ordinal = 1
     AND answers.snapshot_key = hands.snapshot_key
    WHERE hands.attempt_id = attempt_row.id
    ORDER BY hands.hand_ordinal
  LOOP
    answered := answered + 1;
    IF attempt_row.session_kind = 'daily' THEN
      daily_selected_action := answer_row.answer_id;
    END IF;
    first_answer_at := coalesce(first_answer_at, answer_row.answered_at);
    last_answer_at := answer_row.answered_at;
    IF answer_row.is_correct THEN
      correct := correct + 1;
      current_streak := current_streak + 1;
      best_streak := greatest(best_streak, current_streak);
    ELSE
      current_streak := 0;
    END IF;
    IF answer_row.ev_loss_measured THEN
      has_measured_ev := true;
      total_ev_loss := total_ev_loss + coalesce(answer_row.ev_loss, 0);
    END IF;
  END LOOP;

  IF answered <> attempt_row.expected_hands THEN
    RETURN jsonb_build_object('success', false, 'status', 409,
      'code', 'TRAINING_ATTEMPT_DECISIONS_INCOMPLETE',
      'error', 'Every manifested hand requires exactly one persisted first decision.',
      'answered', answered, 'requiredQuestions', attempt_row.expected_hands);
  END IF;

  required_correct := ceil(attempt_row.expected_hands * CASE WHEN attempt_row.level = 12 THEN 0.90 ELSE 0.85 END)::integer;
  accuracy := round((correct::numeric / attempt_row.expected_hands::numeric) * 100)::integer;
  passed := correct >= required_correct;
  elapsed_seconds := greatest(0, least(86400,
    coalesce(extract(epoch FROM (last_answer_at - first_answer_at))::integer, 0)));
  reward_multiplier := CASE attempt_row.level
    WHEN 1 THEN 1.00 WHEN 2 THEN 1.00 WHEN 3 THEN 1.00 WHEN 4 THEN 1.10
    WHEN 5 THEN 1.15 WHEN 6 THEN 1.25 WHEN 7 THEN 1.35 WHEN 8 THEN 1.40
    WHEN 9 THEN 1.50 WHEN 10 THEN 1.60 WHEN 11 THEN 1.75 WHEN 12 THEN 2.00
    ELSE 1.00 END;
  reward_request := CASE
    WHEN attempt_row.session_kind = 'daily' THEN
      CASE WHEN daily_already_completed THEN 0 ELSE 25 END
    WHEN attempt_row.practice_only THEN 0
    ELSE round((
      5 + CASE WHEN accuracy = 100 THEN 10 WHEN accuracy >= 90 THEN 5 WHEN accuracy >= 85 THEN 3 ELSE 0 END
        + CASE WHEN best_streak > 5 THEN 2 ELSE 0 END
      ) * reward_multiplier)::integer
    END;

  reward_reference := 'training_attempt:' || attempt_row.id::text;

  IF NOT attempt_row.practice_only AND reward_request > 0 THEN
    award_result := public.award_diamonds_v2(
      attempt_row.user_id,
      'training_reward',
      reward_reference,
      NULL,
      jsonb_build_object(
        'reward_diamonds', reward_request,
        'game_id', attempt_row.game_id,
        'level', attempt_row.level,
        'attempt_id', attempt_row.id,
        '_source', 'fn_complete_training_attempt_v2'
      )
    );

    -- A malformed economy response is an integrity failure, not a zero-value
    -- completion. Raising here rolls the entire transaction back and leaves
    -- the attempt open for a clean retry.
    IF jsonb_typeof(award_result) IS DISTINCT FROM 'object'
       OR jsonb_typeof(award_result -> 'success') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(award_result -> 'awarded') IS DISTINCT FROM 'number'
       OR jsonb_typeof(award_result -> 'reason') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'TRAINING_REWARD_RESPONSE_INVALID';
    END IF;

    BEGIN
      reward_awarded := greatest(0, (award_result ->> 'awarded')::integer);
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'TRAINING_REWARD_RESPONSE_INVALID';
    END;
    reward_reason := lower(award_result ->> 'reason');

    IF award_result @> '{"success": true}'::jsonb AND reward_awarded > 0 THEN
      NULL;
    ELSIF NOT (award_result @> '{"success": true}'::jsonb)
          AND reward_awarded = 0
          AND reward_reason IN ('action_limit', 'daily_cap', 'monthly_cap', 'budget_exhausted') THEN
      -- Explicit economy ceilings are settled zero-award completions. The
      -- verified training result still persists, but no reward is invented.
      NULL;
    ELSIF NOT (award_result @> '{"success": true}'::jsonb)
          AND reward_reason IN ('duplicate', 'already_claimed') THEN
      SELECT count(*)::integer, coalesce(max(transactions.amount), 0)::integer
      INTO reconciled_reward_rows, reward_awarded
      FROM public.diamond_transactions transactions
      WHERE transactions.user_id = attempt_row.user_id
        AND transactions.reference_id = reward_reference
        AND transactions.transaction_type = 'training_reward'
        AND transactions.amount > 0;

      IF reconciled_reward_rows <> 1 OR reward_awarded <= 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'status', 409,
          'code', 'TRAINING_REWARD_DUPLICATE_UNVERIFIED',
          'error', 'The existing Training reward could not be verified. Retry this completion.',
          'attemptId', attempt_row.id,
          'rewardVerdict', award_result
        );
      END IF;
      award_result := award_result || jsonb_build_object(
        'success', true,
        'awarded', reward_awarded,
        'reconciled', true
      );
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'status', 503,
        'code', 'TRAINING_REWARD_NOT_SETTLED',
        'error', 'The Training reward could not be settled. Retry this completion.',
        'attemptId', attempt_row.id,
        'rewardVerdict', award_result
      );
    END IF;
  END IF;

  INSERT INTO public.training_level_history (
    user_id, game_id, session_id, attempt_id, practice_only, level,
    questions_answered, questions_correct, accuracy_percentage, passed,
    time_spent_seconds, best_streak, diamonds_earned
  ) VALUES (
    attempt_row.user_id, attempt_row.game_id, attempt_row.client_nonce,
    attempt_row.id, attempt_row.practice_only, attempt_row.level,
    attempt_row.expected_hands, correct, accuracy, passed, elapsed_seconds,
    best_streak, reward_awarded
  ) RETURNING * INTO history_row;

  IF attempt_row.session_kind = 'daily' THEN
    INSERT INTO public.training_daily_challenge (
      user_id, daily_id, score, ev_loss, selected_action, completed_at, attempt_id
    ) VALUES (
      attempt_row.user_id, attempt_row.client_nonce, accuracy,
      CASE WHEN has_measured_ev THEN total_ev_loss ELSE 0 END,
      daily_selected_action, now(), attempt_row.id
    )
    ON CONFLICT (user_id, daily_id) DO UPDATE SET
      score = excluded.score,
      ev_loss = excluded.ev_loss,
      selected_action = excluded.selected_action,
      completed_at = excluded.completed_at,
      attempt_id = excluded.attempt_id
    WHERE public.training_daily_challenge.attempt_id IS NULL
       OR public.training_daily_challenge.attempt_id = excluded.attempt_id;
    SELECT * INTO daily_row
    FROM public.training_daily_challenge
    WHERE user_id = attempt_row.user_id
      AND daily_id = attempt_row.client_nonce;
    IF daily_row.attempt_id IS DISTINCT FROM attempt_row.id THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'TRAINING_DAILY_COMPLETION_BINDING_MISMATCH';
    END IF;
  END IF;

  IF NOT attempt_row.practice_only THEN
    -- A real completed Training attempt is the only source of daily streak
    -- movement. The atomic upsert makes concurrent completions idempotent for
    -- the America/Chicago product day and preserves the original streak start.
    INSERT INTO public.training_streaks AS streaks (
    user_id, current_streak, longest_streak, last_training_date,
    streak_start_date, milestones_claimed,
    authority_current_streak, authority_longest_streak,
    authority_last_training_date, authority_streak_start_date,
    authority_milestones_claimed, created_at, updated_at
  ) VALUES (
    attempt_row.user_id, 1, 1, today_chicago,
    today_chicago, '[]'::jsonb,
    1, 1, today_chicago, today_chicago, '[]'::jsonb, now(), now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    authority_current_streak = CASE
      WHEN streaks.authority_last_training_date = today_chicago
        THEN streaks.authority_current_streak
      WHEN streaks.authority_last_training_date = today_chicago - 1
        THEN streaks.authority_current_streak + 1
      ELSE 1
    END,
    authority_longest_streak = greatest(
      streaks.authority_longest_streak,
      CASE
        WHEN streaks.authority_last_training_date = today_chicago
          THEN streaks.authority_current_streak
        WHEN streaks.authority_last_training_date = today_chicago - 1
          THEN streaks.authority_current_streak + 1
        ELSE 1
      END
    ),
    authority_last_training_date = today_chicago,
    authority_streak_start_date = CASE
      WHEN streaks.authority_last_training_date = today_chicago
        THEN coalesce(streaks.authority_streak_start_date, today_chicago)
      WHEN streaks.authority_last_training_date = today_chicago - 1
        THEN coalesce(streaks.authority_streak_start_date, today_chicago)
      ELSE today_chicago
    END,
    current_streak = CASE
      WHEN streaks.authority_last_training_date = today_chicago
        THEN streaks.authority_current_streak
      WHEN streaks.authority_last_training_date = today_chicago - 1
        THEN streaks.authority_current_streak + 1
      ELSE 1
    END,
    longest_streak = greatest(
      streaks.authority_longest_streak,
      CASE
        WHEN streaks.authority_last_training_date = today_chicago
          THEN streaks.authority_current_streak
        WHEN streaks.authority_last_training_date = today_chicago - 1
          THEN streaks.authority_current_streak + 1
        ELSE 1
      END
    ),
    last_training_date = today_chicago,
    streak_start_date = CASE
      WHEN streaks.authority_last_training_date = today_chicago
        THEN coalesce(streaks.authority_streak_start_date, today_chicago)
      WHEN streaks.authority_last_training_date = today_chicago - 1
        THEN coalesce(streaks.authority_streak_start_date, today_chicago)
      ELSE today_chicago
    END,
    milestones_claimed = streaks.authority_milestones_claimed,
    updated_at = now()
    RETURNING * INTO streak_row;

    INSERT INTO public.training_progress AS progress (
      user_id, game_id, level, hands_played, correct_answers, total_answers,
      current_streak, best_streak, last_played_at,
      authority_level, authority_hands_played, authority_correct_answers,
      authority_total_answers, authority_current_streak,
      authority_best_streak, authority_last_played_at
    ) VALUES (
      attempt_row.user_id, attempt_row.game_id,
      CASE WHEN passed THEN least(attempt_row.level + 1, 12) ELSE attempt_row.level END,
      attempt_row.expected_hands, correct, attempt_row.expected_hands,
      current_streak, best_streak, now(),
      CASE WHEN passed THEN least(attempt_row.level + 1, 12) ELSE attempt_row.level END,
      attempt_row.expected_hands, correct, attempt_row.expected_hands,
      current_streak, best_streak, now()
    )
    ON CONFLICT (user_id, game_id) DO UPDATE SET
      authority_level = greatest(progress.authority_level, excluded.authority_level),
      authority_hands_played = progress.authority_hands_played
        + excluded.authority_hands_played,
      authority_correct_answers = progress.authority_correct_answers
        + excluded.authority_correct_answers,
      authority_total_answers = progress.authority_total_answers
        + excluded.authority_total_answers,
      authority_current_streak = excluded.authority_current_streak,
      authority_best_streak = greatest(
        progress.authority_best_streak, excluded.authority_best_streak
      ),
      authority_last_played_at = excluded.authority_last_played_at,
      level = greatest(progress.authority_level, excluded.authority_level),
      hands_played = progress.authority_hands_played + excluded.authority_hands_played,
      correct_answers = progress.authority_correct_answers
        + excluded.authority_correct_answers,
      total_answers = progress.authority_total_answers
        + excluded.authority_total_answers,
      current_streak = excluded.authority_current_streak,
      best_streak = greatest(
        progress.authority_best_streak, excluded.authority_best_streak
      ),
      last_played_at = excluded.authority_last_played_at
    RETURNING * INTO progress_row;

    daily_key := to_char(now_utc, 'YYYY-MM-DD');
    weekly_key := to_char(now_utc, 'IYYY-"W"IW');
    monthly_key := to_char(now_utc, 'YYYY-MM');

    PERFORM public.fn_training_verified_leaderboard_record_v2(
      attempt_row.user_id, attempt_row.game_id, 'daily', daily_key,
      answered, correct, correct = answered, best_streak, NULL,
      CASE WHEN has_measured_ev THEN total_ev_loss ELSE NULL END);
    PERFORM public.fn_training_verified_leaderboard_record_v2(
      attempt_row.user_id, attempt_row.game_id, 'weekly', weekly_key,
      answered, correct, correct = answered, best_streak, NULL,
      CASE WHEN has_measured_ev THEN total_ev_loss ELSE NULL END);
    PERFORM public.fn_training_verified_leaderboard_record_v2(
      attempt_row.user_id, attempt_row.game_id, 'monthly', monthly_key,
      answered, correct, correct = answered, best_streak, NULL,
      CASE WHEN has_measured_ev THEN total_ev_loss ELSE NULL END);
    PERFORM public.fn_training_verified_leaderboard_record_v2(
      attempt_row.user_id, attempt_row.game_id, 'alltime', 'alltime',
      answered, correct, correct = answered, best_streak, NULL,
      CASE WHEN has_measured_ev THEN total_ev_loss ELSE NULL END);
  ELSE
    SELECT * INTO progress_row FROM public.training_progress
    WHERE user_id = attempt_row.user_id AND game_id = attempt_row.game_id;
    SELECT * INTO streak_row FROM public.training_streaks
    WHERE user_id = attempt_row.user_id;
  END IF;

  UPDATE public.training_attempts
  SET status = 'completed', completed_at = now(), answered_hands = answered,
      correct_hands = correct, accuracy_percentage = accuracy,
      passed = complete_attempt.passed,
      best_streak = complete_attempt.best_streak,
      reward_diamonds = complete_attempt.reward_awarded,
      updated_at = now()
  WHERE id = attempt_row.id
  RETURNING * INTO attempt_row;

  RETURN jsonb_build_object(
    'success', true, 'newCompletion', true, 'attemptId', attempt_row.id,
    'practiceOnly', attempt_row.practice_only, 'answered', answered,
    'correct', correct, 'accuracy', accuracy, 'passed', passed,
    'bestStreak', best_streak, 'diamondsEarned', reward_awarded,
    'rewardVerdict', award_result,
    'rewardReference', reward_reference,
    'requiredQuestions', attempt_row.expected_hands,
    'requiredCorrect', required_correct, 'history', to_jsonb(history_row),
    'progress', to_jsonb(progress_row),
    'trainingStreak', to_jsonb(streak_row),
    'dailyChallenge', to_jsonb(daily_row)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_save_training_session_v2(
  p_user_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  attempt_row public.training_attempts%ROWTYPE;
  session_row public.training_sessions%ROWTYPE;
  hand_history jsonb := '[]'::jsonb;
  position_stats jsonb := '{}'::jsonb;
  classification_counts jsonb := '{}'::jsonb;
  total_ev_loss numeric := 0;
  mistake_count integer := 0;
  measured_count integer := 0;
  decision_count integer := 0;
  continuation_decision_count integer := 0;
  avg_frequency_diff numeric := 0;
  inserted boolean := false;
BEGIN
  SELECT * INTO attempt_row
  FROM public.training_attempts
  WHERE id = p_attempt_id
  FOR KEY SHARE;

  IF p_user_id IS NULL OR NOT FOUND OR attempt_row.user_id <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'status', 404,
      'code', 'TRAINING_ATTEMPT_NOT_FOUND',
      'error', 'The completed Training attempt was not found.');
  END IF;
  IF attempt_row.status <> 'completed' THEN
    RETURN jsonb_build_object('success', false, 'status', 409,
      'code', 'TRAINING_ATTEMPT_NOT_COMPLETED',
      'error', 'Only a completed Training attempt can become an analytics session.');
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'handNumber', answer.hand_ordinal,
      'decisionOrdinal', answer.decision_ordinal,
      'questionId', answer.question_id,
      'snapshotKey', answer.snapshot_key,
      'selectedAnswer', answer.answer_id,
      'isCorrect', answer.is_correct,
      'classification', answer.classification,
      'street', answer.street,
      'heroPosition', answer.hero_position,
      'villainPosition', answer.villain_position,
      'spotType', answer.spot_type,
      'solverVerified', answer.solver_verified,
      'evLossMeasured', answer.ev_loss_measured,
      'evLoss', CASE WHEN answer.ev_loss_measured THEN answer.ev_loss ELSE NULL END,
      'answeredAt', answer.answered_at
    ) ORDER BY answer.hand_ordinal, answer.decision_ordinal), '[]'::jsonb),
    coalesce(sum(answer.ev_loss) FILTER (WHERE answer.ev_loss_measured), 0),
    count(*) FILTER (WHERE NOT answer.is_correct)::integer,
    count(*) FILTER (WHERE answer.ev_loss_measured)::integer,
    count(*)::integer,
    count(*) FILTER (WHERE answer.decision_ordinal > 1)::integer,
    coalesce(avg(abs(answer.optimal_frequency - answer.selected_frequency))
      FILTER (WHERE answer.solver_verified), 0)
  INTO hand_history, total_ev_loss, mistake_count, measured_count,
    decision_count, continuation_decision_count, avg_frequency_diff
  FROM public.training_answers answer
  WHERE answer.attempt_id = attempt_row.id;

  SELECT coalesce(jsonb_object_agg(bucket.position, jsonb_build_object(
      'total', bucket.total,
      'correct', bucket.correct,
      'accuracy', round(bucket.correct::numeric / bucket.total * 100, 2),
      'evLoss', bucket.ev_loss
    )), '{}'::jsonb)
  INTO position_stats
  FROM (
    SELECT coalesce(nullif(hero_position, ''), 'unknown') AS position,
      count(*)::integer AS total,
      count(*) FILTER (WHERE is_correct)::integer AS correct,
      coalesce(sum(ev_loss) FILTER (WHERE ev_loss_measured), 0) AS ev_loss
    FROM public.training_answers
    WHERE attempt_id = attempt_row.id
    GROUP BY coalesce(nullif(hero_position, ''), 'unknown')
  ) bucket;

  SELECT coalesce(jsonb_object_agg(bucket.classification, bucket.total), '{}'::jsonb)
  INTO classification_counts
  FROM (
    SELECT coalesce(nullif(classification, ''), 'unknown') AS classification,
      count(*)::integer AS total
    FROM public.training_answers
    WHERE attempt_id = attempt_row.id
    GROUP BY coalesce(nullif(classification, ''), 'unknown')
  ) bucket;

  INSERT INTO public.training_sessions (
    user_id, game_id, game_name, gtow_score, score_scale, total_ev_loss,
    hands_played, mistake_count, accuracy, correct_count, best_streak,
    level_passed, level, hand_history, position_stats, classification_counts,
    trainer_config, avg_ev_loss_per_hand, avg_ev_loss_per_mistake,
    avg_frequency_diff, attempt_id, created_at
  ) VALUES (
    attempt_row.user_id, attempt_row.game_id, attempt_row.game_id,
    attempt_row.accuracy_percentage * 2 - 100, 2, total_ev_loss,
    attempt_row.answered_hands, mistake_count, attempt_row.accuracy_percentage,
    attempt_row.correct_hands, attempt_row.best_streak, attempt_row.passed,
    attempt_row.level, hand_history, position_stats, classification_counts,
    jsonb_build_object(
      'sessionKind', attempt_row.session_kind,
      'difficulty', attempt_row.difficulty,
      'targetHands', attempt_row.expected_hands,
      'decisionCount', decision_count,
      'continuationDecisionCount', continuation_decision_count,
      'practiceOnly', attempt_row.practice_only,
      'configHash', attempt_row.config_hash
    ),
    CASE WHEN measured_count > 0 THEN round(total_ev_loss / attempt_row.answered_hands, 4) ELSE 0 END,
    CASE WHEN measured_count > 0 AND mistake_count > 0 THEN round(total_ev_loss / mistake_count, 4) ELSE 0 END,
    round(avg_frequency_diff, 4), attempt_row.id, attempt_row.completed_at
  )
  ON CONFLICT (attempt_id) WHERE attempt_id IS NOT NULL DO NOTHING
  RETURNING * INTO session_row;
  inserted := FOUND;

  IF NOT inserted THEN
    SELECT * INTO session_row FROM public.training_sessions
    WHERE attempt_id = attempt_row.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'newSession', inserted,
    'attemptId', attempt_row.id,
    'practiceOnly', attempt_row.practice_only,
    'session', to_jsonb(session_row),
    'diamondsEarned', 0
  );
END;
$function$;

CREATE TABLE IF NOT EXISTS public.training_streak_milestone_claims (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_days smallint NOT NULL,
  diamonds_awarded integer NOT NULL DEFAULT 0,
  entitlement_diamonds integer,
  reward_multiplier numeric(12,6),
  claim_count integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, milestone_days),
  CONSTRAINT training_streak_milestone_claims_days_check
    CHECK (milestone_days IN (3, 7, 14, 30, 60, 100, 365)),
  CONSTRAINT training_streak_milestone_claims_amount_check
    CHECK (diamonds_awarded >= 0),
  CONSTRAINT training_streak_milestone_claims_entitlement_check
    CHECK (
      entitlement_diamonds IS NULL
      OR entitlement_diamonds >= diamonds_awarded
    ),
  CONSTRAINT training_streak_milestone_claims_multiplier_check
    CHECK (
      reward_multiplier IS NULL
      OR reward_multiplier > 0 AND reward_multiplier <= 10
    ),
  CONSTRAINT training_streak_milestone_claims_count_check
    CHECK (claim_count >= 0)
);

COMMENT ON TABLE public.training_streak_milestone_claims IS
  'Server-owned payout ledger for capped Training streak milestones. Large rewards remain claimable across cap windows until fully paid.';

-- A legacy milestone marker was client-writable and the old API wrote it
-- before attempting the award. It therefore proves neither eligibility nor
-- full payment. Only exact positive canonical ledger references are credited;
-- the marker itself remains preserved solely in the same-row legacy authority
-- snapshot created at this migration's one-time provenance cutover.
-- Entitlement deliberately stays NULL until post-epoch verified completions
-- rebuild the milestone, at which point the current server multiplier is
-- snapshotted and this historical credit is subtracted without re-multiplying.
INSERT INTO public.training_streak_milestone_claims(
  user_id, milestone_days, diamonds_awarded, entitlement_diamonds,
  reward_multiplier, claim_count, completed_at, created_at, updated_at
)
SELECT
  transactions.user_id,
  milestones.days,
  sum(transactions.amount)::integer,
  NULL,
  NULL,
  0,
  NULL,
  min(transactions.created_at),
  now()
FROM public.diamond_transactions transactions
CROSS JOIN (VALUES (3), (7), (14), (30), (60), (100), (365)) milestones(days)
WHERE transactions.transaction_type = 'streak_reward'
  AND transactions.amount > 0
  AND transactions.reference_id = 'streak_' || transactions.user_id::text
    || '_' || milestones.days::text
GROUP BY transactions.user_id, milestones.days
ON CONFLICT (user_id, milestone_days) DO NOTHING;

-- A streak milestone is claimed as one transaction: lock the authoritative
-- streak row, prove the server-owned threshold, award through the canonical
-- capped/idempotent economy RPC, and only then persist payout progress. The
-- separate ledger prevents a partial capped award from consuming a 2,000 or
-- 10,000 Diamond milestone forever. Browsers can name an allowed milestone
-- but cannot choose its reward or payout progress.
CREATE OR REPLACE FUNCTION public.fn_claim_training_streak_milestone_v2(
  p_user_id uuid,
  p_milestone_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  streak_row public.training_streaks%ROWTYPE;
  claim_row public.training_streak_milestone_claims%ROWTYPE;
  milestone_diamonds integer;
  milestone_name text;
  award_result jsonb := '{}'::jsonb;
  award_amount integer := 0;
  award_requested integer := 0;
  award_total integer := 0;
  award_entitlement integer := 0;
  award_response_entitlement integer := 0;
  award_remaining integer := 0;
  award_multiplier numeric(12,6) := 1.00;
  milestone_completed boolean := false;
  claim_row_exists boolean := false;
  claim_reference text;
BEGIN
  IF p_user_id IS NULL OR p_milestone_days IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 400,
      'code', 'TRAINING_STREAK_MILESTONE_INPUT_INVALID',
      'error', 'A valid user and streak milestone are required.'
    );
  END IF;

  SELECT milestone.diamonds, milestone.name
  INTO milestone_diamonds, milestone_name
  FROM (VALUES
    (3, 25, '3-Day Streak'::text),
    (7, 75, 'Week Warrior'::text),
    (14, 150, 'Two Week Champion'::text),
    (30, 400, 'Monthly Master'::text),
    (60, 800, 'Double Month Legend'::text),
    (100, 2000, 'Century Grinder'::text),
    (365, 10000, 'Year of Dedication'::text)
  ) AS milestone(days, diamonds, name)
  WHERE milestone.days = p_milestone_days;

  IF milestone_diamonds IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 400,
      'code', 'TRAINING_STREAK_MILESTONE_INVALID',
      'error', 'This Training streak milestone does not exist.'
    );
  END IF;

  -- Use the same cross-RPC lock order as award_diamonds_v2 before touching
  -- training_streaks. Without this boundary a milestone claim can hold the
  -- streak row while completion holds the award lock, leaving each RPC
  -- waiting for the other for the same user.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    1799876946,
    pg_catalog.hashtext(p_user_id::text)
  );

  SELECT * INTO streak_row
  FROM public.training_streaks
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 404,
      'code', 'TRAINING_STREAK_NOT_FOUND',
      'error', 'No verified Training streak exists for this user.'
    );
  END IF;

  IF greatest(
      streak_row.authority_current_streak,
      streak_row.authority_longest_streak
    ) < p_milestone_days THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 409,
      'code', 'TRAINING_STREAK_MILESTONE_NOT_REACHED',
      'error', 'This Training streak milestone has not been reached.',
      'currentStreak', streak_row.authority_current_streak,
      'milestoneDays', p_milestone_days
    );
  END IF;

  -- Read the payout ledger while the same per-user lock and streak row lock
  -- are held. A completed ledger is the source of the exact credited total;
  -- the legacy milestone JSON alone can only fall back to the base amount.
  SELECT * INTO claim_row
  FROM public.training_streak_milestone_claims
  WHERE user_id = p_user_id AND milestone_days = p_milestone_days
  FOR UPDATE;
  claim_row_exists := FOUND;

  IF streak_row.authority_milestones_claimed
      @> jsonb_build_array(p_milestone_days) THEN
    award_total := CASE
      WHEN claim_row_exists THEN claim_row.diamonds_awarded
      ELSE milestone_diamonds
    END;
    award_multiplier := CASE
      WHEN claim_row_exists THEN coalesce(claim_row.reward_multiplier, 1.00)
      ELSE 1.00
    END;
    RETURN jsonb_build_object(
      'success', true,
      'newClaim', false,
      'awardApplied', false,
      'milestoneCompleted', true,
      'milestoneDays', p_milestone_days,
      'diamondsAwarded', 0,
      'diamondsAwardedTotal', award_total,
      'diamondsRemaining', 0,
      'entitlementDiamonds', award_total,
      'rewardMultiplier', award_multiplier
    );
  END IF;

  IF NOT claim_row_exists THEN
    INSERT INTO public.training_streak_milestone_claims(
      user_id, milestone_days, diamonds_awarded, claim_count
    ) VALUES (p_user_id, p_milestone_days, 0, 0)
    ON CONFLICT (user_id, milestone_days) DO NOTHING;

    SELECT * INTO claim_row
    FROM public.training_streak_milestone_claims
    WHERE user_id = p_user_id AND milestone_days = p_milestone_days
    FOR UPDATE;
  END IF;

  IF claim_row.completed_at IS NOT NULL
     OR (
       claim_row.entitlement_diamonds IS NOT NULL
       AND claim_row.diamonds_awarded >= claim_row.entitlement_diamonds
     ) THEN
    UPDATE public.training_streaks
    SET authority_milestones_claimed = CASE
          WHEN authority_milestones_claimed
              @> jsonb_build_array(p_milestone_days)
            THEN authority_milestones_claimed
          ELSE authority_milestones_claimed
            || jsonb_build_array(p_milestone_days)
        END,
        milestones_claimed = CASE
          WHEN authority_milestones_claimed
              @> jsonb_build_array(p_milestone_days)
            THEN authority_milestones_claimed
          ELSE authority_milestones_claimed
            || jsonb_build_array(p_milestone_days)
        END,
        updated_at = now()
    WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'success', true,
      'newClaim', false,
      'awardApplied', false,
      'milestoneCompleted', true,
      'milestoneDays', p_milestone_days,
      'diamondsAwarded', 0,
      'diamondsAwardedTotal', claim_row.diamonds_awarded,
      'diamondsRemaining', 0,
      'entitlementDiamonds', coalesce(
        claim_row.entitlement_diamonds,
        claim_row.diamonds_awarded
      ),
      'rewardMultiplier', coalesce(claim_row.reward_multiplier, 1.00)
    );
  END IF;

  award_entitlement := coalesce(claim_row.entitlement_diamonds, 0);
  award_remaining := CASE
    WHEN award_entitlement > 0
      THEN award_entitlement - claim_row.diamonds_awarded
    ELSE milestone_diamonds
  END;
  claim_reference := 'streak_' || p_user_id::text || '_'
    || p_milestone_days::text || '_part_' || (claim_row.claim_count + 1)::text;
  award_result := public.award_diamonds_v2(
    p_user_id,
    'streak_reward',
    claim_reference,
    claim_reference,
    jsonb_build_object(
      'streak_diamonds', award_remaining,
      'milestone_name', milestone_name,
      'milestone_days', p_milestone_days,
      'post_multiplier_entitlement', award_entitlement > 0,
      '_source', 'fn_claim_training_streak_milestone_v2'
    )
  );

  BEGIN
    award_amount := greatest(0, coalesce(nullif(award_result ->> 'awarded', '')::integer, 0));
    award_requested := greatest(0, coalesce(nullif(award_result ->> 'requested', '')::integer, 0));
    award_response_entitlement := greatest(0, coalesce(
      nullif(award_result ->> 'entitlement', '')::integer,
      claim_row.diamonds_awarded + award_requested
    ));
    award_multiplier := coalesce(nullif(award_result ->> 'multiplier', '')::numeric, 1.00);
    IF award_multiplier <= 0 OR award_multiplier > 10 THEN
      award_multiplier := 1.00;
    END IF;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 502,
      'code', 'TRAINING_STREAK_AWARD_INVALID_RESPONSE',
      'error', 'The streak reward response was invalid.'
    );
  END;

  IF award_response_entitlement < claim_row.diamonds_awarded
     OR award_response_entitlement > milestone_diamonds * 10 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'TRAINING_STREAK_ENTITLEMENT_OUT_OF_RANGE';
  END IF;

  IF NOT (award_result @> '{"success": true}'::jsonb) THEN
    -- Even a cap/budget deferral is an authoritative multiplier snapshot.
    -- Persist it without advancing claim_count so the same exact part can be
    -- retried in a later allowance window without repricing the milestone.
    IF award_entitlement <= 0 AND award_response_entitlement > 0 THEN
      UPDATE public.training_streak_milestone_claims
      SET entitlement_diamonds = award_response_entitlement,
          reward_multiplier = award_multiplier,
          updated_at = now()
      WHERE user_id = p_user_id AND milestone_days = p_milestone_days;
    END IF;
    RETURN jsonb_build_object(
      'success', false,
      'status', 409,
      'code', 'TRAINING_STREAK_AWARD_NOT_APPLIED',
      'error', 'The streak reward could not be applied yet.',
      'rewardVerdict', award_result
    );
  END IF;

  IF award_amount > milestone_diamonds * 10 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'TRAINING_STREAK_AWARD_OUT_OF_RANGE';
  END IF;

  IF award_entitlement <= 0 THEN
    -- The award RPC returns its final post-multiplier request before family
    -- and platform caps. Snapshot it once so later cap-window installments do
    -- not reapply a changed profile multiplier.
    award_entitlement := award_response_entitlement;
  ELSE
    award_multiplier := coalesce(claim_row.reward_multiplier, award_multiplier);
  END IF;
  IF award_entitlement <= 0
     OR award_entitlement < claim_row.diamonds_awarded + award_amount THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'TRAINING_STREAK_ENTITLEMENT_OUT_OF_RANGE';
  END IF;

  award_total := claim_row.diamonds_awarded + award_amount;
  milestone_completed := award_total >= award_entitlement;

  UPDATE public.training_streak_milestone_claims
  SET diamonds_awarded = award_total,
      entitlement_diamonds = award_entitlement,
      reward_multiplier = award_multiplier,
      claim_count = claim_count + 1,
      completed_at = CASE WHEN milestone_completed THEN now() ELSE completed_at END,
      updated_at = now()
  WHERE user_id = p_user_id AND milestone_days = p_milestone_days;

  IF milestone_completed THEN
    UPDATE public.training_streaks
    SET authority_milestones_claimed = authority_milestones_claimed
          || jsonb_build_array(p_milestone_days),
        milestones_claimed = authority_milestones_claimed
          || jsonb_build_array(p_milestone_days),
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'newClaim', milestone_completed,
    'awardApplied', true,
    'milestoneCompleted', milestone_completed,
    'milestoneDays', p_milestone_days,
    'diamondsAwarded', award_amount,
    'diamondsAwardedTotal', award_total,
    'diamondsRemaining', greatest(award_entitlement - award_total, 0),
    'entitlementDiamonds', award_entitlement,
    'rewardMultiplier', award_multiplier,
    'rewardVerdict', award_result
  );
END;
$function$;

-- All scoring stores are API-only for writes. The snapshot table is also
-- API-only for reads because question_data contains canonical answer keys.
ALTER TABLE public.training_question_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_question_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_verified_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_attempt_hands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_seen_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_level_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_streak_milestone_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_hand_replay ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_daily_challenge ENABLE ROW LEVEL SECURITY;

DO $policy_cleanup$
DECLARE candidate record;
BEGIN
  FOR candidate IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (
          tablename IN (
            'training_question_snapshots', 'training_attempts', 'training_attempt_hands',
            'training_answers', 'user_seen_questions', 'training_streaks', 'training_progress',
            'training_level_history', 'training_leaderboard',
            'training_verified_leaderboard', 'training_sessions',
            'training_streak_milestone_claims', 'training_hand_replay',
            'training_spaced_repetition', 'jarvis_training_sessions',
            'jarvis_user_training_profile', 'user_question_history',
            'user_level_progress', 'training_user_achievements',
            'training_user_challenges', 'training_tournament_entries',
            'training_daily_bonus'
          )
          AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
        )
        OR (
          tablename IN ('training_question_cache', 'training_questions', 'training_daily_challenge')
          AND cmd IN ('ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE')
        )
      )
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
      candidate.policyname, candidate.tablename);
  END LOOP;
END
$policy_cleanup$;

REVOKE ALL ON public.training_question_snapshots FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.training_question_cache FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.training_verified_leaderboard FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.training_streak_milestone_claims FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.training_questions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.training_daily_challenge FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.training_attempts, public.training_attempt_hands,
     public.training_answers, public.user_seen_questions, public.training_streaks,
     public.training_progress, public.training_leaderboard,
     public.training_level_history, public.training_sessions,
     public.training_hand_replay
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.training_attempts, public.training_attempt_hands TO authenticated;
GRANT SELECT ON public.training_answers, public.user_seen_questions,
  public.training_streaks, public.training_progress,
  public.training_level_history, public.training_sessions,
  public.training_hand_replay
  TO authenticated;

DROP POLICY IF EXISTS training_attempts_select_self ON public.training_attempts;
CREATE POLICY training_attempts_select_self ON public.training_attempts
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS training_attempt_hands_select_self ON public.training_attempt_hands;
CREATE POLICY training_attempt_hands_select_self ON public.training_attempt_hands
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.training_attempts attempts
    WHERE attempts.id = training_attempt_hands.attempt_id
      AND attempts.user_id = (SELECT auth.uid())
  ));
DROP POLICY IF EXISTS training_answers_select_self ON public.training_answers;
CREATE POLICY training_answers_select_self ON public.training_answers
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS user_seen_questions_select_self ON public.user_seen_questions;
CREATE POLICY user_seen_questions_select_self ON public.user_seen_questions
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS training_streaks_select_self_v2 ON public.training_streaks;
CREATE POLICY training_streaks_select_self_v2 ON public.training_streaks
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS training_progress_select_self ON public.training_progress;
CREATE POLICY training_progress_select_self ON public.training_progress
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS training_level_history_select_self ON public.training_level_history;
CREATE POLICY training_level_history_select_self ON public.training_level_history
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS training_sessions_select_self_v2 ON public.training_sessions;
CREATE POLICY training_sessions_select_self_v2 ON public.training_sessions
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS thr_self_read ON public.training_hand_replay;
DROP POLICY IF EXISTS training_hand_replay_select_self_v2 ON public.training_hand_replay;
CREATE POLICY training_hand_replay_select_self_v2 ON public.training_hand_replay
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT ON public.training_question_snapshots TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.training_question_snapshots FROM service_role;
GRANT SELECT ON public.training_question_cache TO service_role;
GRANT SELECT ON public.training_verified_leaderboard TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.training_verified_leaderboard FROM service_role;
GRANT SELECT ON public.training_streak_milestone_claims TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.training_streak_milestone_claims FROM service_role;
GRANT SELECT ON public.training_questions, public.training_hand_replay TO service_role;
GRANT SELECT ON public.training_daily_challenge TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.training_questions, public.training_hand_replay,
     public.training_daily_challenge FROM service_role;
GRANT SELECT ON public.training_attempts TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.training_attempts FROM service_role;
GRANT SELECT, INSERT ON public.training_attempt_hands TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.training_attempt_hands FROM service_role;
GRANT SELECT, INSERT ON public.training_answers TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.training_answers FROM service_role;

-- Older feature tables carried owner-write policies that let a browser forge
-- coaching, achievements, challenge, review, or tournament truth even after
-- their unsafe HTTP writers were retired. Keep any established self-read
-- policies, but remove every browser mutation privilege and mutation policy.
DO $legacy_training_table_lockdown$
DECLARE
  truth_table text;
BEGIN
  FOREACH truth_table IN ARRAY ARRAY[
    'training_spaced_repetition', 'jarvis_training_sessions',
    'jarvis_user_training_profile', 'user_question_history',
    'user_level_progress', 'training_user_achievements',
    'training_user_challenges', 'training_tournament_entries',
    'training_daily_bonus'
  ]
  LOOP
    IF to_regclass(format('public.%I', truth_table)) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        truth_table
      );
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role', truth_table);
    END IF;
  END LOOP;
END
$legacy_training_table_lockdown$;

REVOKE ALL ON FUNCTION public.fn_training_snapshot_immutable_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_authority_snapshot_immutable_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_authority_snapshot_immutable_v2() FROM service_role;
REVOKE ALL ON FUNCTION public.fn_validate_training_attempt_hand_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_validate_training_answer_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_reject_training_answer_delete_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_score_training_attempt_hand_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_start_training_attempt_v2(uuid, text, text, integer, text, text, integer, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_complete_training_attempt_v2(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_save_training_session_v2(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_claim_training_streak_milestone_v2(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_leaderboard_record(uuid, text, text, integer, integer, boolean, integer, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_verified_leaderboard_record_v2(uuid, text, text, text, integer, integer, boolean, integer, numeric, numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_verified_leaderboard_rank_v2(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_start_training_attempt_v2(uuid, text, text, integer, text, text, integer, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_complete_training_attempt_v2(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_save_training_session_v2(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_claim_training_streak_milestone_v2(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_training_leaderboard_record(uuid, text, text, integer, integer, boolean, integer, numeric, numeric)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_training_verified_leaderboard_record_v2(uuid, text, text, text, integer, integer, boolean, integer, numeric, numeric)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_training_verified_leaderboard_rank_v2(uuid, text, text, text, text)
  TO service_role;

-- The Session Setup modal still calls these established browser-readable
-- dashboard RPCs. Replace their legacy all-row implementations in this new
-- migration so an old browser-authored training_sessions row can never appear
-- as verified performance. Editing the already-applied 202605 migration would
-- not repair production, so the authoritative replacement belongs here.
CREATE OR REPLACE FUNCTION public.training_dashboard_30day_stats(
  p_user_id uuid,
  p_game_id text
)
RETURNS TABLE (
  avg_score numeric,
  sessions_count bigint,
  hands_played bigint,
  best_score numeric,
  total_ev_loss numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'unauthorized: can only query your own stats'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    round(
      100 * sum(s.correct_count)::numeric
      / nullif(sum(s.hands_played), 0),
      2
    ),
    count(*)::bigint,
    coalesce(sum(s.hands_played), 0)::bigint,
    round(max(
      CASE WHEN s.hands_played > 0
             AND s.correct_count BETWEEN 0 AND s.hands_played
        THEN 100 * s.correct_count::numeric / s.hands_played
        ELSE NULL
      END
    ), 2),
    (
      SELECT CASE WHEN count(*) > 0 THEN round(sum(answer.ev_loss), 2) ELSE NULL END
      FROM public.training_answers answer
      WHERE answer.attempt_id IN (
        SELECT scoped.attempt_id
        FROM public.training_sessions scoped
        JOIN public.training_attempts scoped_attempt
          ON scoped_attempt.id = scoped.attempt_id
         AND scoped_attempt.user_id = scoped.user_id
         AND scoped_attempt.practice_only IS FALSE
         AND scoped_attempt.status = 'completed'
        WHERE scoped.user_id = p_user_id
          AND scoped.game_id = p_game_id
          AND scoped.created_at >= now() - interval '30 days'
      )
        AND answer.solver_verified IS TRUE
        AND answer.ev_loss_measured IS TRUE
    )
  FROM public.training_sessions s
  JOIN public.training_attempts attempt
    ON attempt.id = s.attempt_id
   AND attempt.user_id = s.user_id
   AND attempt.practice_only IS FALSE
   AND attempt.status = 'completed'
  WHERE s.user_id = p_user_id
    AND s.game_id = p_game_id
    AND s.created_at >= now() - interval '30 days';
END;
$function$;

CREATE OR REPLACE FUNCTION public.training_dashboard_last_session(
  p_user_id uuid,
  p_game_id text
)
RETURNS TABLE (
  session_id uuid,
  gtow_score numeric,
  accuracy numeric,
  hands_played integer,
  level integer,
  level_passed boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'unauthorized: can only query your own stats'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    CASE WHEN s.score_scale = 2 AND s.gtow_score BETWEEN -100 AND 100
      THEN s.gtow_score ELSE NULL END,
    CASE WHEN s.hands_played > 0
           AND s.correct_count BETWEEN 0 AND s.hands_played
      THEN round(100 * s.correct_count::numeric / s.hands_played, 2)
      ELSE NULL
    END,
    s.hands_played,
    s.level,
    s.level_passed,
    s.created_at
  FROM public.training_sessions s
  JOIN public.training_attempts attempt
    ON attempt.id = s.attempt_id
   AND attempt.user_id = s.user_id
   AND attempt.practice_only IS FALSE
   AND attempt.status = 'completed'
  WHERE s.user_id = p_user_id
    AND s.game_id = p_game_id
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.training_dashboard_lifetime_stats(
  p_user_id uuid,
  p_game_id text
)
RETURNS TABLE (
  total_sessions bigint,
  total_hands bigint,
  best_score numeric,
  avg_score numeric,
  highest_level_passed integer,
  total_diamonds_est bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'unauthorized: can only query your own stats'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    count(*)::bigint,
    coalesce(sum(s.hands_played), 0)::bigint,
    round(max(
      CASE WHEN s.hands_played > 0
             AND s.correct_count BETWEEN 0 AND s.hands_played
        THEN 100 * s.correct_count::numeric / s.hands_played
        ELSE NULL
      END
    ), 2),
    round(
      100 * sum(s.correct_count)::numeric
      / nullif(sum(s.hands_played), 0),
      2
    ),
    coalesce(max(s.level) FILTER (WHERE s.level_passed), 0)::integer,
    coalesce(sum(attempt.reward_diamonds), 0)::bigint
  FROM public.training_sessions s
  JOIN public.training_attempts attempt
    ON attempt.id = s.attempt_id
   AND attempt.user_id = s.user_id
   AND attempt.practice_only IS FALSE
   AND attempt.status = 'completed'
  WHERE s.user_id = p_user_id
    AND s.game_id = p_game_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.training_dashboard_30day_stats(uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_dashboard_last_session(uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_dashboard_lifetime_stats(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_dashboard_30day_stats(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.training_dashboard_last_session(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.training_dashboard_lifetime_stats(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.training_dashboard_30day_stats(uuid, text) IS
  'Verified non-practice Training 30-day session projection.';
COMMENT ON FUNCTION public.training_dashboard_last_session(uuid, text) IS
  'Most recent verified non-practice Training session.';
COMMENT ON FUNCTION public.training_dashboard_lifetime_stats(uuid, text) IS
  'Verified non-practice lifetime Training session projection.';

-- Retire legacy direct-answer and maintenance surfaces from browser roles.
-- These SECURITY DEFINER functions either expose canonical answer keys or run
-- privileged maintenance and therefore may only be reached by trusted APIs.
DO $legacy_training_function_lockdown$
BEGIN
  IF to_regprocedure('public.get_random_cached_question(text,integer,text,uuid,text[])') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_random_cached_question(text, integer, text, uuid, text[])
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_random_cached_question(text, integer, text, uuid, text[])
      TO service_role;
  END IF;
  IF to_regprocedure('public.get_next_training_question(uuid,integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_next_training_question(uuid, integer)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_next_training_question(uuid, integer)
      TO service_role;
  END IF;
  IF to_regprocedure('public.training_leaderboard_refresh()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.training_leaderboard_refresh()
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.training_leaderboard_refresh()
      TO service_role;
  END IF;
  IF to_regprocedure('public.fn_add_xp(uuid,integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.fn_add_xp(uuid, integer)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.fn_add_xp(uuid, integer) TO service_role;
  END IF;
  IF to_regprocedure('public.unlock_achievement(uuid,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.unlock_achievement(uuid, text)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.unlock_achievement(uuid, text) TO service_role;
  END IF;
  IF to_regprocedure('public.claim_reward(uuid,uuid)') IS NOT NULL THEN
    DROP FUNCTION public.claim_reward(uuid, uuid);
  END IF;
  IF to_regprocedure('public.complete_daily_challenge(uuid,text)') IS NOT NULL THEN
    DROP FUNCTION public.complete_daily_challenge(uuid, text);
  END IF;
END
$legacy_training_function_lockdown$;

DO $assertions$
DECLARE
  required_column text;
  required_trigger text;
  truth_table text;
  erasure_table text;
  attempt_child text;
BEGIN
  IF to_regclass('public.training_question_snapshots') IS NULL
     OR to_regclass('public.training_attempts') IS NULL
     OR to_regclass('public.training_attempt_hands') IS NULL
     OR to_regclass('public.training_streak_milestone_claims') IS NULL
     OR to_regclass('public.training_verified_leaderboard') IS NULL
     OR to_regclass('public.training_daily_challenge') IS NULL THEN
    RAISE EXCEPTION 'Server-authoritative Training attempt tables are missing';
  END IF;

  IF position(
       'join public.training_attempts' IN lower(pg_get_functiondef(
         'public.training_dashboard_30day_stats(uuid,text)'::regprocedure
       ))
     ) = 0
     OR position(
       'attempt.practice_only is false' IN lower(pg_get_functiondef(
         'public.training_dashboard_30day_stats(uuid,text)'::regprocedure
       ))
     ) = 0
     OR position(
       'attempt.practice_only is false' IN lower(pg_get_functiondef(
         'public.training_dashboard_last_session(uuid,text)'::regprocedure
       ))
     ) = 0
     OR position(
       'attempt.practice_only is false' IN lower(pg_get_functiondef(
         'public.training_dashboard_lifetime_stats(uuid,text)'::regprocedure
       ))
     ) = 0 THEN
    RAISE EXCEPTION 'Training dashboard RPCs are not sealed-attempt projections';
  END IF;

  FOREACH required_column IN ARRAY ARRAY[
    'session_id', 'attempt_id', 'hand_ordinal', 'decision_ordinal', 'snapshot_key'
  ]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'training_answers'
        AND column_name = required_column) THEN
      RAISE EXCEPTION 'training_answers.% is missing', required_column;
    END IF;
  END LOOP;

  IF to_regprocedure('public.fn_start_training_attempt_v2(uuid,text,text,integer,text,text,integer,text,uuid)') IS NULL
     OR to_regprocedure('public.fn_complete_training_attempt_v2(uuid,uuid)') IS NULL
     OR to_regprocedure('public.fn_save_training_session_v2(uuid,uuid)') IS NULL
     OR to_regprocedure('public.fn_claim_training_streak_milestone_v2(uuid,integer)') IS NULL
     OR to_regprocedure('public.fn_training_verified_leaderboard_record_v2(uuid,text,text,text,integer,integer,boolean,integer,numeric,numeric)') IS NULL
     OR to_regprocedure('public.fn_training_verified_leaderboard_rank_v2(uuid,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Training attempt RPC contract is missing';
  END IF;

  FOREACH required_trigger IN ARRAY ARRAY[
    'training_question_snapshots_immutable_v2',
    'training_streaks_authority_snapshot_immutable_v2',
    'training_progress_authority_snapshot_immutable_v2',
    'training_attempt_hands_validate_v2',
    'training_answers_validate_v2', 'training_answers_reject_v2_delete',
    'training_answers_score_hand_v2'
  ]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger
      WHERE tgname = required_trigger AND NOT tgisinternal) THEN
      RAISE EXCEPTION 'Required Training trigger % is missing', required_trigger;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 'training_answers_attempt_decision_key')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 'training_level_history_attempt_key')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 'training_sessions_attempt_key')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
      AND indexname = 'training_daily_challenge_attempt_key') THEN
    RAISE EXCEPTION 'Training attempt idempotency indexes are missing';
  END IF;

  -- Personal Training state must remain erasable through the real auth.users
  -- parent. This also proves the same-row legacy snapshots introduced above
  -- did not create an undeletable shadow archive.
  FOREACH erasure_table IN ARRAY ARRAY[
    'user_seen_questions', 'training_answers', 'training_streaks',
    'training_progress', 'training_level_history', 'training_sessions',
    'training_leaderboard', 'training_hand_replay',
    'training_daily_challenge', 'training_attempts',
    'training_streak_milestone_claims', 'training_verified_leaderboard'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint fk
      JOIN pg_class relation ON relation.oid = fk.conrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      JOIN pg_attribute attribute
        ON attribute.attrelid = relation.oid
       AND attribute.attname = 'user_id'
       AND attribute.attnum = ANY(fk.conkey)
      WHERE namespace.nspname = 'public'
        AND relation.relname = erasure_table
        AND fk.contype = 'f'
        AND fk.confrelid = 'auth.users'::regclass
        AND fk.confdeltype = 'c'
    ) THEN
      RAISE EXCEPTION 'Account erasure cascade is missing for public.%', erasure_table;
    END IF;
  END LOOP;

  FOREACH attempt_child IN ARRAY ARRAY[
    'training_attempt_hands', 'training_answers',
    'training_level_history', 'training_sessions'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint fk
      JOIN pg_class relation ON relation.oid = fk.conrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      JOIN pg_attribute attribute
        ON attribute.attrelid = relation.oid
       AND attribute.attname = 'attempt_id'
       AND attribute.attnum = ANY(fk.conkey)
      WHERE namespace.nspname = 'public'
        AND relation.relname = attempt_child
        AND fk.contype = 'f'
        AND fk.confrelid = 'public.training_attempts'::regclass
        AND fk.confdeltype = 'c'
    ) THEN
      RAISE EXCEPTION 'Attempt erasure cascade is missing for public.%', attempt_child;
    END IF;
  END LOOP;

  IF has_table_privilege('authenticated', 'public.training_question_snapshots', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_question_cache', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_verified_leaderboard', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_verified_leaderboard', 'INSERT')
     OR has_table_privilege('anon', 'public.training_question_cache', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_attempts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.training_attempt_hands', 'INSERT')
     OR has_table_privilege('authenticated', 'public.training_answers', 'INSERT')
     OR has_table_privilege('authenticated', 'public.user_seen_questions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.training_streaks', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.training_progress', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.training_level_history', 'INSERT')
     OR has_table_privilege('authenticated', 'public.training_leaderboard', 'INSERT')
     OR has_table_privilege('authenticated', 'public.training_leaderboard', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.training_questions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_daily_challenge', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_daily_challenge', 'INSERT')
     OR has_table_privilege('authenticated', 'public.training_daily_challenge', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.training_hand_replay', 'INSERT')
     OR has_table_privilege('authenticated', 'public.training_hand_replay', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.training_hand_replay', 'DELETE')
     OR has_table_privilege('authenticated', 'public.training_streak_milestone_claims', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_streak_milestone_claims', 'INSERT')
     OR has_table_privilege('authenticated', 'public.training_streak_milestone_claims', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.training_sessions', 'INSERT') THEN
    RAISE EXCEPTION 'A browser-facing role retains forbidden Training authority';
  END IF;

  FOREACH truth_table IN ARRAY ARRAY[
    'training_spaced_repetition', 'jarvis_training_sessions',
    'jarvis_user_training_profile', 'user_question_history',
    'user_level_progress', 'training_user_achievements',
    'training_user_challenges', 'training_tournament_entries',
    'training_daily_bonus'
  ]
  LOOP
    IF to_regclass(format('public.%I', truth_table)) IS NOT NULL
       AND (
         has_table_privilege('authenticated', format('public.%I', truth_table), 'INSERT')
         OR has_table_privilege('authenticated', format('public.%I', truth_table), 'UPDATE')
         OR has_table_privilege('authenticated', format('public.%I', truth_table), 'DELETE')
       ) THEN
      RAISE EXCEPTION 'Browser mutation authority remains on public.%', truth_table;
    END IF;
  END LOOP;

  IF has_function_privilege('authenticated',
       'public.fn_start_training_attempt_v2(uuid,text,text,integer,text,text,integer,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.fn_complete_training_attempt_v2(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.fn_save_training_session_v2(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.fn_claim_training_streak_milestone_v2(uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.fn_training_leaderboard_record(uuid,text,text,integer,integer,boolean,integer,numeric,numeric)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.fn_training_verified_leaderboard_record_v2(uuid,text,text,text,integer,integer,boolean,integer,numeric,numeric)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.fn_training_verified_leaderboard_rank_v2(uuid,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.fn_training_authority_snapshot_immutable_v2()', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.fn_training_authority_snapshot_immutable_v2()', 'EXECUTE')
     OR has_function_privilege('service_role',
       'public.fn_training_authority_snapshot_immutable_v2()', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.fn_training_leaderboard_record(uuid,text,text,integer,integer,boolean,integer,numeric,numeric)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.fn_training_verified_leaderboard_record_v2(uuid,text,text,text,integer,integer,boolean,integer,numeric,numeric)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.fn_training_verified_leaderboard_rank_v2(uuid,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.award_diamonds_v2(uuid,text,text,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.award_diamonds_v2(uuid,text,text,text,jsonb)', 'EXECUTE')
     OR (to_regprocedure('public.get_random_cached_question(text,integer,text,uuid,text[])') IS NOT NULL
       AND has_function_privilege('authenticated',
         'public.get_random_cached_question(text,integer,text,uuid,text[])', 'EXECUTE'))
     OR (to_regprocedure('public.get_next_training_question(uuid,integer)') IS NOT NULL
       AND has_function_privilege('authenticated',
         'public.get_next_training_question(uuid,integer)', 'EXECUTE'))
     OR (to_regprocedure('public.training_leaderboard_refresh()') IS NOT NULL
       AND has_function_privilege('authenticated',
         'public.training_leaderboard_refresh()', 'EXECUTE'))
     OR (to_regprocedure('public.fn_add_xp(uuid,integer)') IS NOT NULL
       AND has_function_privilege('authenticated',
         'public.fn_add_xp(uuid,integer)', 'EXECUTE'))
     OR (to_regprocedure('public.unlock_achievement(uuid,text)') IS NOT NULL
       AND has_function_privilege('authenticated',
         'public.unlock_achievement(uuid,text)', 'EXECUTE'))
     OR to_regprocedure('public.claim_reward(uuid,uuid)') IS NOT NULL
     OR to_regprocedure('public.complete_daily_challenge(uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'A browser-facing role can execute a service-only Training RPC';
  END IF;

  IF NOT has_function_privilege('service_role',
       'public.fn_start_training_attempt_v2(uuid,text,text,integer,text,text,integer,text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.fn_complete_training_attempt_v2(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.fn_save_training_session_v2(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.fn_claim_training_streak_milestone_v2(uuid,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.fn_training_leaderboard_record(uuid,text,text,integer,integer,boolean,integer,numeric,numeric)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.fn_training_verified_leaderboard_record_v2(uuid,text,text,text,integer,integer,boolean,integer,numeric,numeric)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.fn_training_verified_leaderboard_rank_v2(uuid,text,text,text,text)', 'EXECUTE')
     OR NOT has_table_privilege('service_role',
       'public.training_verified_leaderboard', 'SELECT')
     OR has_table_privilege('service_role',
       'public.training_verified_leaderboard', 'INSERT')
     OR NOT has_function_privilege('service_role',
       'public.award_diamonds_v2(uuid,text,text,text,jsonb)', 'EXECUTE')
     OR (to_regprocedure('public.get_random_cached_question(text,integer,text,uuid,text[])') IS NOT NULL
       AND NOT has_function_privilege('service_role',
         'public.get_random_cached_question(text,integer,text,uuid,text[])', 'EXECUTE'))
     OR (to_regprocedure('public.get_next_training_question(uuid,integer)') IS NOT NULL
       AND NOT has_function_privilege('service_role',
         'public.get_next_training_question(uuid,integer)', 'EXECUTE'))
     OR (to_regprocedure('public.training_leaderboard_refresh()') IS NOT NULL
       AND NOT has_function_privilege('service_role',
         'public.training_leaderboard_refresh()', 'EXECUTE'))
     OR (to_regprocedure('public.fn_add_xp(uuid,integer)') IS NOT NULL
       AND NOT has_function_privilege('service_role',
         'public.fn_add_xp(uuid,integer)', 'EXECUTE'))
     OR (to_regprocedure('public.unlock_achievement(uuid,text)') IS NOT NULL
       AND NOT has_function_privilege('service_role',
         'public.unlock_achievement(uuid,text)', 'EXECUTE')) THEN
    RAISE EXCEPTION 'The API service role cannot execute the Training attempt RPCs';
  END IF;
END
$assertions$;

COMMIT;
