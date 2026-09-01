-- Training exposes twelve mastery levels. The original schema capped several
-- persistence tables at ten, so levels 11 and 12 could render but their cache,
-- progress, history, challenge, and arena-session writes failed at the DB
-- boundary. Align every Training level constraint with the published contract.

DO $$
BEGIN
  IF to_regclass('public.training_question_cache') IS NOT NULL THEN
    ALTER TABLE public.training_question_cache DROP CONSTRAINT IF EXISTS valid_level;
    ALTER TABLE public.training_question_cache
      ADD CONSTRAINT valid_level CHECK (level BETWEEN 1 AND 12);
  END IF;

  IF to_regclass('public.training_progress') IS NOT NULL THEN
    ALTER TABLE public.training_progress DROP CONSTRAINT IF EXISTS training_progress_current_level_check;
    ALTER TABLE public.training_progress DROP CONSTRAINT IF EXISTS training_progress_highest_level_completed_check;
    ALTER TABLE public.training_progress
      ADD CONSTRAINT training_progress_current_level_check
      CHECK (current_level BETWEEN 1 AND 12);
    ALTER TABLE public.training_progress
      ADD CONSTRAINT training_progress_highest_level_completed_check
      CHECK (highest_level_completed BETWEEN 0 AND 12);
  END IF;

  IF to_regclass('public.training_level_history') IS NOT NULL THEN
    ALTER TABLE public.training_level_history DROP CONSTRAINT IF EXISTS training_level_history_level_check;
    ALTER TABLE public.training_level_history
      ADD CONSTRAINT training_level_history_level_check
      CHECK (level BETWEEN 1 AND 12);
  END IF;

  IF to_regclass('public.training_daily_challenges') IS NOT NULL THEN
    ALTER TABLE public.training_daily_challenges DROP CONSTRAINT IF EXISTS training_daily_challenges_level_check;
    ALTER TABLE public.training_daily_challenges
      ADD CONSTRAINT training_daily_challenges_level_check
      CHECK (level BETWEEN 1 AND 12);
  END IF;

  IF to_regclass('public.arena_sessions') IS NOT NULL THEN
    ALTER TABLE public.arena_sessions DROP CONSTRAINT IF EXISTS arena_sessions_level_check;
    ALTER TABLE public.arena_sessions
      ADD CONSTRAINT arena_sessions_level_check
      CHECK (level BETWEEN 1 AND 12);
  END IF;
END;
$$;
