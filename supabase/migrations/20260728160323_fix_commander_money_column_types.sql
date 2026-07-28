-- Mirrored from the live database on 2026-07-28. Applied via MCP as migration 20260728160323_fix_commander_money_column_types.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Three column-type defects, each of which silently discards data that
-- shipping code believes it has written.
--
-- 1. commander_tournament_entries.payout_amount is `integer`.
--    Every ICM chop and chip-chop produces cents. src/lib/commander/
--    icm-utils.js goes to real trouble to reconcile a pool to the cent —
--    and then PostgREST rejects `1234.56` for an integer column with
--    22P02, the caller in pages/api/tournaments/[id]/payout.js does not
--    destructure the error, and the handler still writes final_payouts to
--    the tournament row and returns success:true. The tournament record
--    shows the deal; not one entry carries the money. The room pays from
--    a screen that disagrees with the database.
--
-- 2. commander_time_purchases.venue_id is `uuid`, but every caller passes
--    an integer venue id (commander_members.venue_id is integer,
--    commander_table_sessions.venue_id is bigint). Both writers —
--    pages/api/kiosk/buy-time.js and dealer/sessions/[id]/add-time.js —
--    discard the result entirely. The table has 0 rows against 284 table
--    sessions and 107 members: it has never accepted a single insert.
--    Cash goes in the drawer with no record that it was collected.
--
-- 3. commander_tournament_points has no leaderboard_id, but
--    pages/api/tournaments/[id]/payout.js both filters on it and inserts
--    it. Both statements 400. The surrounding catch swallows the failure —
--    and that catch itself references an out-of-scope `req`, so it throws
--    a ReferenceError inside its own error handler, which a nested catch
--    then eats. The table has 0 rows: no player has ever earned a
--    leaderboard point.
--
-- All three are widening or additive. No existing value can be lost:
-- integer→numeric is lossless, and both retyped/extended tables are empty
-- or verified compatible below.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. payout_amount: integer → numeric(12,2) ──────────────────────────
DO $$
DECLARE
  bad int;
BEGIN
  -- refuse to widen if any existing row is negative; that would bake a
  -- bad value in behind the CHECK added below.
  SELECT count(*) INTO bad
  FROM public.commander_tournament_entries
  WHERE payout_amount IS NOT NULL AND payout_amount < 0;
  IF bad > 0 THEN
    RAISE EXCEPTION 'refusing to widen payout_amount: % existing negative row(s)', bad;
  END IF;
END $$;

ALTER TABLE public.commander_tournament_entries
  ALTER COLUMN payout_amount TYPE numeric(12,2) USING payout_amount::numeric(12,2);

-- A payout is money handed to a player. It is never negative. This also
-- closes the JS-side gap where `if (!amount)` accepts amount = -5000.
ALTER TABLE public.commander_tournament_entries
  DROP CONSTRAINT IF EXISTS commander_tournament_entries_payout_amount_nonneg;
ALTER TABLE public.commander_tournament_entries
  ADD CONSTRAINT commander_tournament_entries_payout_amount_nonneg
  CHECK (payout_amount IS NULL OR payout_amount >= 0);

-- ── 2. commander_time_purchases.venue_id: uuid → bigint ────────────────
DO $$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.commander_time_purchases;
  IF n > 0 THEN
    RAISE EXCEPTION 'commander_time_purchases is not empty (% rows) — retype needs a data plan', n;
  END IF;
END $$;

ALTER TABLE public.commander_time_purchases
  ALTER COLUMN venue_id TYPE bigint USING NULL;

-- ── 3. commander_tournament_points.leaderboard_id ──────────────────────
ALTER TABLE public.commander_tournament_points
  ADD COLUMN IF NOT EXISTS leaderboard_id uuid
    REFERENCES public.commander_leaderboards(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_commander_tournament_points_leaderboard
  ON public.commander_tournament_points (leaderboard_id);

-- The payout route's existence check reads (leaderboard_id, tournament_id,
-- player_id) before inserting. Back that read with a real constraint so a
-- double-submitted payout cannot award the same points twice — the JS
-- check-then-insert is a race on its own.
CREATE UNIQUE INDEX IF NOT EXISTS uq_commander_tournament_points_entry
  ON public.commander_tournament_points (leaderboard_id, tournament_id, player_id)
  WHERE leaderboard_id IS NOT NULL AND player_id IS NOT NULL;

-- ── Post-conditions ────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='public' AND table_name='commander_tournament_entries'
     AND column_name='payout_amount';
  IF t <> 'numeric' THEN
    RAISE EXCEPTION 'payout_amount is %, expected numeric', t;
  END IF;

  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema='public' AND table_name='commander_time_purchases'
     AND column_name='venue_id';
  IF t <> 'bigint' THEN
    RAISE EXCEPTION 'commander_time_purchases.venue_id is %, expected bigint', t;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='commander_tournament_points'
       AND column_name='leaderboard_id') THEN
    RAISE EXCEPTION 'leaderboard_id was not added';
  END IF;
END $$;

COMMIT;
