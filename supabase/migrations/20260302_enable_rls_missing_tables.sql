-- ============================================================
-- BUG #126: Enable RLS on 25 tables that were missing it
-- ============================================================
-- Without RLS, any authenticated user can read/write these
-- tables directly via PostgREST (Supabase REST API), bypassing
-- all API-layer authentication and authorization checks.
--
-- Fix: Enable RLS with NO SELECT/INSERT/UPDATE/DELETE policies.
-- This blocks all anon/authenticated PostgREST access while
-- service_role (used by all our API routes) bypasses RLS entirely.
-- ============================================================

-- ==========================================
-- FINANCIAL / SETTLEMENT (CRITICAL)
-- ==========================================

-- Settlement invoices contain financial records between unions/clubs/agents
ALTER TABLE IF EXISTS settlement_invoices ENABLE ROW LEVEL SECURITY;

-- Settlement locks control chip freeze windows during weekly settlement
ALTER TABLE IF EXISTS settlement_locks ENABLE ROW LEVEL SECURITY;

-- Rakeback distribution records
ALTER TABLE IF EXISTS rakeback_distributions ENABLE ROW LEVEL SECURITY;

-- Union bad beat jackpot ledger
ALTER TABLE IF EXISTS union_bbj_ledger ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- CLUB ARENA GAME STATE (HIGH)
-- ==========================================

-- Active game seats — who's sitting where with how many chips
ALTER TABLE IF EXISTS club_game_seats ENABLE ROW LEVEL SECURITY;

-- Live game instances — stakes, status, player counts
ALTER TABLE IF EXISTS club_live_games ENABLE ROW LEVEL SECURITY;

-- Club announcements
ALTER TABLE IF EXISTS club_announcements ENABLE ROW LEVEL SECURITY;

-- Club tournament definitions
ALTER TABLE IF EXISTS club_tournaments ENABLE ROW LEVEL SECURITY;

-- Tournament registration records
ALTER TABLE IF EXISTS tournament_registrations ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- BAD BEAT JACKPOT (MODERATE)
-- ==========================================

-- BBJ qualifying hand records
ALTER TABLE IF EXISTS bbj_qualifying_hands ENABLE ROW LEVEL SECURITY;

-- BBJ stakes tier configuration
ALTER TABLE IF EXISTS bbj_stakes_tiers ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- COMMANDER (Lower risk — physical room only)
-- But still should not be exposed via PostgREST
-- ==========================================

ALTER TABLE IF EXISTS commander_game_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS commander_member_comp_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS commander_membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS commander_player_reputation ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS commander_player_reputation_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS commander_room_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS commander_seat_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS commander_shift_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS commander_system_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS commander_table_ratings ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- OTHER
-- ==========================================

-- AI Horse analytics (internal)
ALTER TABLE IF EXISTS horse_analytics ENABLE ROW LEVEL SECURITY;

-- AI Horse error logs (internal)
ALTER TABLE IF EXISTS horse_error_log ENABLE ROW LEVEL SECURITY;

-- Page followers (venue/tour/series follows)
ALTER TABLE IF EXISTS page_followers ENABLE ROW LEVEL SECURITY;

-- Training achievement definitions
ALTER TABLE IF EXISTS training_achievements ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- VERIFICATION: All 25 tables now have RLS enabled.
-- With no policies defined, only service_role can access them.
-- If client-side access is ever needed, add explicit policies.
-- ============================================================
