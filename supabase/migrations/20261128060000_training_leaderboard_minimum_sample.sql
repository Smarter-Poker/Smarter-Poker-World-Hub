-- ═══════════════════════════════════════════════════════════════════════
-- 20261128060000_training_leaderboard_minimum_sample.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      Claude (World Hub #SMARTERDESIGN Training follow-ups)
-- AFFECTS:     functions (new fn_training_verified_leaderboard_rank_v3)
-- IRREVERSIBLE: no (additive; v2 is untouched; rollback below)
--
-- WHY:
--   /api/training/leaderboard and fn_training_verified_leaderboard_rank_v2
--   rank purely by accuracy, so a player with 1 correct answer (100%) ranks
--   above a player with 738 correct answers. Accuracy only means something
--   over a sample. A player is now RANKED by accuracy once they reach the
--   period's minimum answered questions (src/lib/training/
--   leaderboardQualification.mjs: daily 20, weekly 50, monthly 100,
--   all-time 100); below it they are PROVISIONAL, ordered after every ranked
--   player by correct answers, then accuracy, then user id.
--
-- HOW (high level):
--   - fn_training_verified_leaderboard_rank_v3 returns the caller's rank in
--     that two-tier order plus qualified / minQuestions / questionsToQualify
--     and the same myEntry as v2. The API passes the period's minimum.
--   - Same grants as v2: service_role only.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_training_verified_leaderboard_rank_v3(
  p_user_id uuid,
  p_period_type text,
  p_period_key text,
  p_dimension_type text,
  p_dimension_key text,
  p_min_questions integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH params AS (
    SELECT GREATEST(COALESCE(p_min_questions, 1), 1) AS min_q
  ),
  mine AS (
    SELECT *
    FROM public.training_verified_leaderboard
    WHERE user_id = p_user_id
      AND period_type = p_period_type
      AND period_key = p_period_key
      AND dimension_type = p_dimension_type
      AND dimension_key = p_dimension_key
  ),
  board AS (
    SELECT *
    FROM public.training_verified_leaderboard
    WHERE period_type = p_period_type
      AND period_key = p_period_key
      AND dimension_type = p_dimension_type
      AND dimension_key = p_dimension_key
  )
  SELECT jsonb_build_object(
    'myRank', (
      SELECT 1 + (
        SELECT count(*)
        FROM board better, params
        WHERE CASE
          WHEN mine.questions_answered >= params.min_q THEN
            better.questions_answered >= params.min_q
            AND (
              better.accuracy > mine.accuracy
              OR (better.accuracy = mine.accuracy AND better.questions_correct > mine.questions_correct)
              OR (better.accuracy = mine.accuracy AND better.questions_correct = mine.questions_correct
                  AND better.user_id::text < mine.user_id::text)
            )
          ELSE
            better.questions_answered >= params.min_q
            OR (
              better.questions_answered < params.min_q
              AND (
                better.questions_correct > mine.questions_correct
                OR (better.questions_correct = mine.questions_correct AND better.accuracy > mine.accuracy)
                OR (better.questions_correct = mine.questions_correct AND better.accuracy = mine.accuracy
                    AND better.user_id::text < mine.user_id::text)
              )
            )
        END
      )
      FROM mine
    ),
    'qualified', (SELECT mine.questions_answered >= params.min_q FROM mine, params),
    'minQuestions', (SELECT min_q FROM params),
    'questionsToQualify', (SELECT GREATEST(params.min_q - mine.questions_answered, 0) FROM mine, params),
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

REVOKE ALL ON FUNCTION public.fn_training_verified_leaderboard_rank_v3(uuid, text, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_training_verified_leaderboard_rank_v3(uuid, text, text, text, text, integer)
  TO service_role;

-- Post-apply assertion: the function exists with service_role-only execute.
DO $assert$
BEGIN
  IF to_regprocedure('public.fn_training_verified_leaderboard_rank_v3(uuid, text, text, text, text, integer)') IS NULL THEN
    RAISE EXCEPTION 'fn_training_verified_leaderboard_rank_v3 was not created';
  END IF;
  IF has_function_privilege('anon', 'public.fn_training_verified_leaderboard_rank_v3(uuid, text, text, text, text, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute fn_training_verified_leaderboard_rank_v3';
  END IF;
END
$assert$;

COMMIT;

-- ROLLBACK (copy-paste; the API falls back to nothing without v3, so roll
-- the API back first):
--   DROP FUNCTION IF EXISTS public.fn_training_verified_leaderboard_rank_v3(uuid, text, text, text, text, integer);
