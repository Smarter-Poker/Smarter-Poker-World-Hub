-- ============================================================================
-- WEB PUSH HARDENING -- quiet hours, per-user daily cap, index cleanup.
-- Applied to production 2026-08-19 via Supabase MCP apply_migration.
-- Additive. Safe to re-run.
--
-- WHY:
--  * Quiet hours -- a poker product pushes around the clock. A seat alert at
--    4am is the reason a user turns notifications off entirely and never comes
--    back. Urgent types (incoming_call, seat_open, tournament_starting) pierce
--    the window; everything else waits.
--  * Daily cap -- a runaway loop or a chatty feature must not be able to send
--    a user 400 pushes. 0 = unlimited, which is the default, so nothing changes
--    for existing users unless they opt in.
--  * Index cleanup -- notification_preferences_user_uniq was a PARTIAL unique
--    index on (user_id) added alongside the push stack. It was redundant:
--    notification_preferences_user_id_key already enforces UNIQUE(user_id)
--    non-partially, which is what PostgREST's ON CONFLICT (user_id) requires.
--    (A partial index alone would have broken every upsert -- verified against
--    production that the non-partial one exists before dropping the duplicate.)
-- ============================================================================

-- 1. Quiet hours + daily cap on notification_preferences ---------------------
-- Quiet hours are stored as local wall-clock hours (0-23) plus an IANA zone.
-- A NULL start or end means "no quiet hours". Windows may wrap midnight
-- (start=22, end=7 means 22:00 -> 07:00), which is the common case.
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_hours_start SMALLINT
    CHECK (quiet_hours_start IS NULL OR (quiet_hours_start >= 0 AND quiet_hours_start <= 23));
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_hours_end SMALLINT
    CHECK (quiet_hours_end IS NULL OR (quiet_hours_end >= 0 AND quiet_hours_end <= 23));
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_hours_tz TEXT;
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS daily_push_cap INTEGER NOT NULL DEFAULT 0
    CHECK (daily_push_cap >= 0);

COMMENT ON COLUMN public.notification_preferences.quiet_hours_start IS
  'Local hour 0-23 when quiet hours begin. NULL = disabled. Window may wrap midnight.';
COMMENT ON COLUMN public.notification_preferences.daily_push_cap IS
  '0 = unlimited. Otherwise the max non-urgent pushes delivered to this user per rolling 24h.';

-- 2. Drop the redundant partial unique index --------------------------------
DROP INDEX IF EXISTS public.notification_preferences_user_uniq;

-- 3. Support the daily-cap lookup -------------------------------------------
CREATE INDEX IF NOT EXISTS push_outbox_recipient_sent_idx
  ON public.push_outbox (recipient_user_id, sent_at DESC)
  WHERE status = 'sent';

-- 4. Assertions --------------------------------------------------------------
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO v_missing
  FROM unnest(ARRAY['quiet_hours_start','quiet_hours_end','quiet_hours_tz','daily_push_cap']) c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notification_preferences' AND column_name=c
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'quiet-hours columns missing: %', v_missing;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes
             WHERE schemaname='public' AND indexname='notification_preferences_user_uniq') THEN
    RAISE EXCEPTION 'redundant partial index was not dropped';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname='public' AND indexname='notification_preferences_user_id_key') THEN
    RAISE EXCEPTION 'the real UNIQUE(user_id) index is missing -- ON CONFLICT would break';
  END IF;
END $$;

-- ROLLBACK
-- ALTER TABLE public.notification_preferences
--   DROP COLUMN IF EXISTS quiet_hours_start, DROP COLUMN IF EXISTS quiet_hours_end,
--   DROP COLUMN IF EXISTS quiet_hours_tz,    DROP COLUMN IF EXISTS daily_push_cap;
-- DROP INDEX IF EXISTS public.push_outbox_recipient_sent_idx;
