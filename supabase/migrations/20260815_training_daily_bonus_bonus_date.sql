-- training_daily_bonus.bonus_date — CHECK 13 phantom-column finding.
-- The daily-bonus API keys every read/insert/rollback on bonus_date, which
-- never existed: the claim insert 42703'd before diamonds were awarded, so
-- the training daily bonus was UNCLAIMABLE since it shipped (0 rows). The
-- claim-once-per-day design depends on unique (user_id, bonus_date) — added.
-- Applied to production 2026-08-15 via Supabase MCP (this file is the mirror).
DO $$
DECLARE v_rows integer;
BEGIN
  SELECT count(*) INTO v_rows FROM public.training_daily_bonus;
  IF v_rows > 0 THEN
    RAISE EXCEPTION 'ABORT: training_daily_bonus has % rows — backfill bonus_date first', v_rows;
  END IF;
END $$;
ALTER TABLE public.training_daily_bonus ADD COLUMN IF NOT EXISTS bonus_date date;
CREATE UNIQUE INDEX IF NOT EXISTS uq_training_daily_bonus_user_day
  ON public.training_daily_bonus (user_id, bonus_date);
-- ROLLBACK: DROP INDEX uq_training_daily_bonus_user_day; ALTER TABLE ... DROP COLUMN bonus_date;
