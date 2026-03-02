-- ============================================================
-- BUG #132 CRITICAL: Drop 24 MORE permissive USING(true) policies
-- missed in the BUG #127 round-1 migration
-- ============================================================
-- These were created in:
--   20260301_missing_tables_and_rpcs.sql (9 financial tables)
--   20260202_training_*.sql (7 training tables)
--   20260211_commander_phase7.sql (9 Commander tables)
--   20260113_register_horses.sql (bot_profiles)
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- TIER 1 CRITICAL: Financial/Settlement tables from 20260301
-- Any authenticated user can read/write ALL records via PostgREST
-- ══════════════════════════════════════════════════════════════

DO $$ BEGIN DROP POLICY IF EXISTS "chip_transactions_all" ON chip_transactions; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "club_transactions_all" ON club_transactions; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "commission_records_all" ON commission_records; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "commission_history_all" ON commission_history; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- TIER 2 HIGH: Anti-cheat & BBJ
-- ══════════════════════════════════════════════════════════════

DO $$ BEGIN DROP POLICY IF EXISTS "anti_cheat_events_all" ON anti_cheat_events; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "bbj_contributions_all" ON bbj_contributions; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "bbj_pools_all" ON bbj_pools; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "bbj_winners_all" ON bbj_winners; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "table_sessions_all" ON table_sessions; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- TIER 3: Training tables (lower risk but unnecessary)
-- ══════════════════════════════════════════════════════════════

DO $$ BEGIN DROP POLICY IF EXISTS "Service manages challenges" ON training_challenge_definitions; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service manages user challenges" ON training_user_challenges; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service manages leaderboard" ON training_leaderboard; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service manages user achievements" ON training_user_achievements; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service manages streaks" ON training_streaks; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service manages tournaments" ON training_tournaments; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service manages entries" ON training_tournament_entries; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- TIER 4: Commander Phase 7 tables
-- ══════════════════════════════════════════════════════════════

DO $$ BEGIN DROP POLICY IF EXISTS "Service role full access on commander_comp_balances" ON commander_comp_balances; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service role full access on commander_comp_transactions" ON commander_comp_transactions; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service role full access on commander_comp_rates" ON commander_comp_rates; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service role full access on commander_activity_log" ON commander_activity_log; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service role full access on commander_day_closes" ON commander_day_closes; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service role full access on commander_dealer_rotations" ON commander_dealer_rotations; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service role full access on commander_display_devices" ON commander_display_devices; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service role full access on commander_member_imports" ON commander_member_imports; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service role full access on commander_floor_calls" ON commander_floor_calls; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- TIER 5: Bot profiles
-- ══════════════════════════════════════════════════════════════

DO $$ BEGIN DROP POLICY IF EXISTS "Service can manage bots" ON public.bot_profiles; EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ============================================================
-- DONE. All exception-wrapped. Cannot crash.
-- service_role bypasses RLS — unaffected.
-- ============================================================
