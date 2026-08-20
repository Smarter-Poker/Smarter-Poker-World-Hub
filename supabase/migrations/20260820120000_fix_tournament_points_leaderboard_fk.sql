-- ============================================================================
-- Fix commander_tournament_points So Tournament Leaderboard Points Can Exist
-- ----------------------------------------------------------------------------
-- Tier 3 (constraint change). Applied 2026-08-20.
--
-- WHY
-- ---
-- The tournament leaderboard system has produced ZERO rows in production since
-- it was written. Two schema faults made that impossible:
--
--   1. commander_tournament_points.leaderboard_id carried a FOREIGN KEY to
--      commander_leaderboards (the TV-display board table), but every writer
--      and reader in the codebase resolves ids from
--      commander_tournament_leaderboards (the season points table with
--      point_for_entry / point_structure / is_active). Any insert carrying a
--      resolved leaderboard id would have failed 23503 every single time.
--
--   2. commander_tournament_points.player_id was NOT NULL, while 164 of the
--      337 rows in commander_tournament_entries are walk-in registrations that
--      carry only player_name. Roughly half of every field could never be
--      scored, and awardTournamentPoints() inserts player_id: null for them.
--
-- Both are corrected here, plus the unique indexes the upsert path needs so a
-- re-finalize updates a player's row instead of duplicating it. The existing
-- uq_commander_tournament_points_entry index only covers rows where BOTH
-- leaderboard_id and player_id are set, which excludes the default-points
-- (no leaderboard) and walk-in (no player_id) cases.
--
-- SAFETY: the table is empty, so no row can violate the new constraints.
-- ============================================================================

-- ── Pre-flight assertions ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'commander_tournament_points'
  ) THEN
    RAISE EXCEPTION 'Aborting: public.commander_tournament_points does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'commander_tournament_leaderboards'
  ) THEN
    RAISE EXCEPTION 'Aborting: public.commander_tournament_leaderboards does not exist';
  END IF;

  IF (SELECT count(*) FROM public.commander_tournament_points) <> 0 THEN
    RAISE EXCEPTION
      'Aborting: commander_tournament_points holds % row(s). Repointing the FK is only safe while it is empty.',
      (SELECT count(*) FROM public.commander_tournament_points);
  END IF;
END $$;

-- ── 1. Repoint leaderboard_id at the season table ──────────────────────────
ALTER TABLE public.commander_tournament_points
  DROP CONSTRAINT IF EXISTS commander_tournament_points_leaderboard_id_fkey;

ALTER TABLE public.commander_tournament_points
  ADD CONSTRAINT commander_tournament_points_leaderboard_id_fkey
  FOREIGN KEY (leaderboard_id)
  REFERENCES public.commander_tournament_leaderboards (id)
  ON DELETE SET NULL;

-- ── 2. Allow walk-in (name only) finishers to be scored ────────────────────
ALTER TABLE public.commander_tournament_points
  ALTER COLUMN player_id DROP NOT NULL;

-- ── 3. Dedupe keys for the award upsert ────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_ctp_tournament_player
  ON public.commander_tournament_points (tournament_id, player_id)
  WHERE player_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ctp_tournament_player_name
  ON public.commander_tournament_points (tournament_id, lower(player_name))
  WHERE player_id IS NULL AND player_name IS NOT NULL;

-- ── Post-apply assertions ──────────────────────────────────────────────────
DO $$
DECLARE
  v_ref_table text;
  v_notnull   boolean;
BEGIN
  SELECT confrelid::regclass::text INTO v_ref_table
  FROM pg_constraint
  WHERE conrelid = 'public.commander_tournament_points'::regclass
    AND conname  = 'commander_tournament_points_leaderboard_id_fkey';

  IF v_ref_table IS DISTINCT FROM 'commander_tournament_leaderboards' THEN
    RAISE EXCEPTION 'Post-check failed: leaderboard_id FK references % (expected commander_tournament_leaderboards)', coalesce(v_ref_table, 'nothing');
  END IF;

  SELECT attnotnull INTO v_notnull
  FROM pg_attribute
  WHERE attrelid = 'public.commander_tournament_points'::regclass
    AND attname  = 'player_id';

  IF v_notnull THEN
    RAISE EXCEPTION 'Post-check failed: player_id is still NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_ctp_tournament_player'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: uq_ctp_tournament_player missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uq_ctp_tournament_player_name'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: uq_ctp_tournament_player_name missing';
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK (paste and run to undo; only valid while the table is still empty)
-- ============================================================================
-- DROP INDEX IF EXISTS public.uq_ctp_tournament_player_name;
-- DROP INDEX IF EXISTS public.uq_ctp_tournament_player;
--
-- DELETE FROM public.commander_tournament_points WHERE player_id IS NULL;
-- ALTER TABLE public.commander_tournament_points
--   ALTER COLUMN player_id SET NOT NULL;
--
-- UPDATE public.commander_tournament_points SET leaderboard_id = NULL;
-- ALTER TABLE public.commander_tournament_points
--   DROP CONSTRAINT IF EXISTS commander_tournament_points_leaderboard_id_fkey;
-- ALTER TABLE public.commander_tournament_points
--   ADD CONSTRAINT commander_tournament_points_leaderboard_id_fkey
--   FOREIGN KEY (leaderboard_id)
--   REFERENCES public.commander_leaderboards (id)
--   ON DELETE CASCADE;
-- ============================================================================
