-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3 of the club_tournaments retirement (Dan-approved 2026-07-20)
-- Audit: .agent/audits/2026-07-20-club_tournaments-split-brain.md
-- Phases 1-2 (code retirement) deployed + verified: WH SHA 420a0c2d.
--
-- Drops the legacy club_tournaments table (dead since 2026-03-10; the only 6
-- rows were E2E test tournaments named "E2E Tourn <ts>" in test club
-- a0000000-...-0001, incl. the stale 'running' zombie), plus its two empty
-- companion tables, and repoints rake_records.tournament_id to the canonical
-- tournaments table (the engine writes canonical ids there; every existing
-- row is NULL so validation is trivial).
-- ═══════════════════════════════════════════════════════════════════════════

-- Pre-flight assertions: abort if reality differs from what was audited.
DO $$
DECLARE
  v_ct_rows int;
  v_te_rows int;
  v_md_rows int;
  v_rr_tid  int;
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'club_tournaments') THEN
    EXECUTE 'SELECT count(*) FROM public.club_tournaments' INTO v_ct_rows;
    IF v_ct_rows > 6 THEN
      RAISE EXCEPTION 'club_tournaments has % rows (expected <= 6 E2E test rows) — aborting', v_ct_rows;
    END IF;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tournament_entries') THEN
    EXECUTE 'SELECT count(*) FROM public.tournament_entries' INTO v_te_rows;
    IF v_te_rows > 0 THEN
      RAISE EXCEPTION 'tournament_entries is not empty (% rows) — aborting', v_te_rows;
    END IF;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tournament_mystery_draws') THEN
    EXECUTE 'SELECT count(*) FROM public.tournament_mystery_draws' INTO v_md_rows;
    IF v_md_rows > 0 THEN
      RAISE EXCEPTION 'tournament_mystery_draws is not empty (% rows) — aborting', v_md_rows;
    END IF;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rake_records') THEN
    EXECUTE 'SELECT count(*) FROM public.rake_records WHERE tournament_id IS NOT NULL' INTO v_rr_tid;
    IF v_rr_tid > 0 THEN
      RAISE EXCEPTION 'rake_records has % rows with non-null tournament_id (expected 0) — aborting', v_rr_tid;
    END IF;
  END IF;
END $$;

-- 1. Repoint rake_records.tournament_id: legacy FK -> canonical tournaments.
ALTER TABLE public.rake_records DROP CONSTRAINT IF EXISTS rake_records_tournament_id_fkey;
ALTER TABLE public.rake_records
  ADD CONSTRAINT rake_records_tournament_id_fkey
  FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE SET NULL;

-- 2. Drop the empty legacy companion tables (0 rows, zero code references —
--    the live commander_tournament_entries table is unrelated).
DROP TABLE IF EXISTS public.tournament_mystery_draws;
DROP TABLE IF EXISTS public.tournament_entries;

-- 3. Drop the legacy table itself.
DROP TABLE IF EXISTS public.club_tournaments;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste-run only if this migration must be reverted)
-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER TABLE public.rake_records DROP CONSTRAINT IF EXISTS rake_records_tournament_id_fkey;
-- CREATE TABLE public.club_tournaments (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   club_id uuid, created_by uuid, name text, type text, variant text,
--   buy_in numeric, starting_chips integer, max_players integer,
--   blind_structure jsonb, late_reg_levels integer,
--   rebuy_enabled boolean, rebuy_levels integer, rebuy_cost numeric,
--   addon_enabled boolean, addon_cost numeric, addon_chips integer,
--   guaranteed_prize numeric, prize_pool numeric,
--   scheduled_start timestamptz, started_at timestamptz, finished_at timestamptz,
--   status text, registered_count integer, current_level integer,
--   engine_id text, results jsonb, settings jsonb,
--   created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
--   current_small_blind numeric, current_big_blind numeric, current_ante numeric,
--   players_remaining integer, tables_active integer, hands_played integer,
--   spin_multiplier numeric, completed_at timestamptz, cancelled_at timestamptz,
--   reminder_sent boolean DEFAULT false
-- );
-- ALTER TABLE public.rake_records
--   ADD CONSTRAINT rake_records_tournament_id_fkey
--   FOREIGN KEY (tournament_id) REFERENCES public.club_tournaments(id);
-- -- tournament_entries / tournament_mystery_draws DDL: see
-- -- supabase/migrations archive (20260415_bugs_014_015_missing_tables.sql and
-- -- 20260308_tournament_bounties_and_columns.sql in the club-arena repo).
-- -- The 6 dropped rows were E2E test data (club a0000000-0000-0000-0000-000000000001,
-- -- names 'E2E Tourn 17731652-17731658*', 2026-03-10) — no user data to restore.
