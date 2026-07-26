-- training_streaks: create the columns pages/api/training/streak.js has always read.
--
-- streak.js selects last_training_date, streak_start_date and milestones_claimed,
-- but the table only ever had last_session_date (which has no consumer anywhere in
-- the codebase). Every streak read and write therefore errored against a missing
-- column. Combined with the fact that POST /api/training/streak had no live caller,
-- public.training_streaks contained 0 rows, so streaks, streak milestones,
-- daily-bonus streak multipliers and the challenges streak_days metric all read
-- zero forever.
--
-- The caller is wired in the same change (pages/api/training/save-session.js).
-- Applied to production 2026-07-26 via Supabase MCP apply_migration.

ALTER TABLE public.training_streaks
    ADD COLUMN IF NOT EXISTS last_training_date date,
    ADD COLUMN IF NOT EXISTS streak_start_date date,
    ADD COLUMN IF NOT EXISTS milestones_claimed jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Preserve whatever history exists on the vestigial column.
UPDATE public.training_streaks
SET last_training_date = last_session_date
WHERE last_training_date IS NULL AND last_session_date IS NOT NULL;

UPDATE public.training_streaks
SET streak_start_date = last_training_date
WHERE streak_start_date IS NULL AND last_training_date IS NOT NULL;

-- Post-apply assertions: fail loudly rather than silently half-migrating.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'training_streaks'
          AND column_name = 'last_training_date'
    ) THEN
        RAISE EXCEPTION 'training_streaks.last_training_date missing after migration';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'training_streaks'
          AND column_name = 'streak_start_date'
    ) THEN
        RAISE EXCEPTION 'training_streaks.streak_start_date missing after migration';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'training_streaks'
          AND column_name = 'milestones_claimed'
    ) THEN
        RAISE EXCEPTION 'training_streaks.milestones_claimed missing after migration';
    END IF;
END $$;

-- ROLLBACK (Tier 3 reference; additive migration, safe to leave in place):
--   ALTER TABLE public.training_streaks
--       DROP COLUMN IF EXISTS last_training_date,
--       DROP COLUMN IF EXISTS streak_start_date,
--       DROP COLUMN IF EXISTS milestones_claimed;
