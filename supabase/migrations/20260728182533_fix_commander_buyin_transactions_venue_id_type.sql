-- Mirrored from the live database on 2026-07-28. Applied via MCP as migration 20260728182533_fix_commander_buyin_transactions_venue_id_type.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- `commander_buyin_transactions.venue_id` is typed `uuid`, but every
-- caller passes an integer venue id — `commander_player_sessions.venue_id`
-- is `integer` and `commander_table_sessions.venue_id` is `bigint`.
--
-- PostgREST therefore rejects every insert with 22P02, and the table has
-- never held a row. This is the third instance of the same defect found in
-- this audit (after `commander_time_purchases.venue_id` and
-- `commander_tournament_points.leaderboard_id`): a money ledger that looks
-- wired, reports success, and silently records nothing.
--
-- The atomic buy-in RPC added earlier today works around it by omitting
-- `venue_id` entirely, which lands the row but leaves it unattributable to
-- a venue — no per-venue buy-in reporting is possible. Retyping the column
-- is the real fix and lets that omission be undone.
--
-- This is a destructive-shaped change (ALTER COLUMN TYPE), so it is
-- deliberately guarded: it refuses to run if the table is not empty. On an
-- empty table there is no data to lose and `USING NULL` is exact.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  n bigint;
  t text;
BEGIN
  SELECT count(*) INTO n FROM public.commander_buyin_transactions;
  IF n > 0 THEN
    RAISE EXCEPTION
      'commander_buyin_transactions holds % row(s) — retyping venue_id needs a data migration plan, not this migration', n;
  END IF;

  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='public' AND table_name='commander_buyin_transactions'
     AND column_name='venue_id';
  IF t IS NULL THEN
    RAISE EXCEPTION 'commander_buyin_transactions.venue_id does not exist';
  END IF;
  IF t = 'bigint' THEN
    RAISE NOTICE 'venue_id is already bigint — nothing to do';
  END IF;
END $$;

ALTER TABLE public.commander_buyin_transactions
  ALTER COLUMN venue_id TYPE bigint USING NULL;

CREATE INDEX IF NOT EXISTS idx_commander_buyin_transactions_venue
  ON public.commander_buyin_transactions (venue_id);

DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='public' AND table_name='commander_buyin_transactions'
     AND column_name='venue_id';
  IF t <> 'bigint' THEN
    RAISE EXCEPTION 'venue_id is %, expected bigint', t;
  END IF;
END $$;

COMMIT;
