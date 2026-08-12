-- Mirrored from the live database on 2026-08-08. Applied via MCP as migration 20260808214237_add_tournament_leaderboard_id_and_final_payouts.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Restore a suppressed IRS W-2G compliance record.
--
-- pages/api/tournaments/[id]/payout.js reads
--   select('venue_id, buyin_amount, buyin_fee, leaderboard_id')
-- from commander_tournaments. `leaderboard_id` does not exist, so the read
-- fails with 42703, and because the error is discarded, `tournament`
-- becomes null. The very next block is:
--   if (amount >= 5000 && tournament) { insert commander_tax_events ... }
-- With tournament null, the tax event is NEVER written. Every tournament
-- payout of $5,000 or more — the exact threshold at which a U.S. card room
-- must file a W-2G — has silently produced no tax record.
--
-- The tax_events insert itself is sound: all seven columns it writes
-- (venue_id, player_id, event_type, gross_amount, buy_in, net_amount,
-- withholding_required) exist, and the table already holds 8 rows from
-- other paths. Only the phantom `leaderboard_id` on the READ was breaking
-- the chain.
--
-- Adding the column (nullable) makes the read succeed and the tax event
-- fire. `leaderboard_id` stays NULL until a product decision wires
-- tournaments to leaderboards, so the auto-award path (guarded by
-- `if (tournament?.leaderboard_id)`) simply stays a no-op — no new
-- behaviour, strictly less breakage.
--
-- `final_payouts` (jsonb) is the second phantom: the bulk/chop payout
-- handler does `update({ final_payouts: payouts })`, which 42703s and
-- returns 500, so deal-and-chop final tables cannot save their splits.
-- Additive and nullable.
--
-- Both columns are additive; all 162 existing tournament rows stay valid.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.commander_tournaments
  ADD COLUMN IF NOT EXISTS leaderboard_id uuid
    REFERENCES public.commander_tournament_leaderboards(id) ON DELETE SET NULL;

ALTER TABLE public.commander_tournaments
  ADD COLUMN IF NOT EXISTS final_payouts jsonb;

CREATE INDEX IF NOT EXISTS idx_commander_tournaments_leaderboard
  ON public.commander_tournaments (leaderboard_id)
  WHERE leaderboard_id IS NOT NULL;

DO $$
DECLARE missing text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commander_tournaments' AND column_name='leaderboard_id')
    THEN missing := missing || 'leaderboard_id '; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commander_tournaments' AND column_name='final_payouts')
    THEN missing := missing || 'final_payouts '; END IF;
  IF missing <> '' THEN RAISE EXCEPTION 'not applied: %', missing; END IF;
END $$;

COMMIT;
