-- Mirrored from the live database on 2026-08-08. Applied via MCP as migration 20260808214051_add_missing_streams_updated_at_and_rotation_game_id.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Two more tables missing a column their own shipping writer supplies —
-- the same silent-write-rejection class already found five times in this
-- audit (time_purchases.venue_id, buyin_transactions.venue_id,
-- tournament_points.leaderboard_id, comp_log.notes/comp_category).
--
-- 1. commander_streams has no `updated_at`, but
--    pages/api/streaming/[tableId]/config.js writes it on every config
--    save. PostgREST rejects the whole update with 42703, so stream
--    overlay/platform settings could never be changed after creation.
--
-- 2. commander_dealer_rotations has no `game_id`, but
--    pages/api/dealers/rotations.js inserts it when a dealer is pushed to
--    or assigned at a table (lines 184, 273). Those two writes 42703 and
--    fail. The table already holds 1,963 rows from OTHER write paths that
--    do not set game_id, so the column is supplementary — nullable is
--    correct, and every existing row stays valid.
--
-- Both additive. `updated_at` reuses the existing fn_touch_updated_at
-- trigger function so the column stays honest without every caller
-- remembering to set it.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. commander_streams.updated_at + maintenance trigger
ALTER TABLE public.commander_streams
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_commander_streams_touch ON public.commander_streams;
CREATE TRIGGER trg_commander_streams_touch
  BEFORE UPDATE ON public.commander_streams
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

-- 2. commander_dealer_rotations.game_id (nullable FK, supplementary)
ALTER TABLE public.commander_dealer_rotations
  ADD COLUMN IF NOT EXISTS game_id uuid
    REFERENCES public.commander_games(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_commander_dealer_rotations_game
  ON public.commander_dealer_rotations (game_id)
  WHERE game_id IS NOT NULL;

-- Post-condition
DO $$
DECLARE missing text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commander_streams' AND column_name='updated_at')
    THEN missing := missing || 'streams.updated_at '; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.commander_streams'::regclass AND tgname='trg_commander_streams_touch' AND NOT tgisinternal)
    THEN missing := missing || 'streams.touch_trigger '; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='commander_dealer_rotations' AND column_name='game_id')
    THEN missing := missing || 'rotations.game_id '; END IF;
  IF missing <> '' THEN RAISE EXCEPTION 'not applied: %', missing; END IF;
END $$;

COMMIT;
