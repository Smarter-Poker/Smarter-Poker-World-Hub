-- ============================================================
-- BUG #127 CRITICAL: Drop overly-permissive RLS policies
-- ============================================================
-- Many tables have "FOR ALL USING (true)" or "FOR INSERT WITH
-- CHECK (true)" policies intended for "system" (service_role)
-- access. However, service_role BYPASSES RLS entirely and does
-- not need any policy. These policies actually grant unrestricted
-- access to ALL authenticated users via PostgREST, including:
--   - Inserting fake diamond/XP records
--   - Changing club member roles (making yourself an owner)
--   - Modifying hand history records
--   - Deleting security alerts
--
-- Fix: Drop all "USING (true)" write policies. service_role
-- continues to work (it bypasses RLS). Authenticated users
-- lose direct PostgREST write access to these tables.
-- ============================================================

-- ==========================================
-- TIER 1: CRITICAL — Financial & Membership
-- ==========================================

-- club_members: "System manages members" lets anyone change club roles
DROP POLICY IF EXISTS "System manages members" ON public.club_members;

-- diamond_ledger: "System manages ledger" lets anyone insert diamond records
DROP POLICY IF EXISTS "System manages ledger" ON public.diamond_ledger;

-- social_diamond_rewards: lets anyone insert fake reward claims
DROP POLICY IF EXISTS "System manages rewards" ON public.social_diamond_rewards;

-- social_xp_log: lets anyone insert fake XP entries  
DROP POLICY IF EXISTS "System manages XP" ON public.social_xp_log;

-- game_tables: "System manages tables" lets anyone modify table configs
DROP POLICY IF EXISTS "System manages tables" ON public.game_tables;

-- ==========================================
-- TIER 2: HIGH — Game Integrity
-- ==========================================

-- hand_history: lets anyone modify historical hand records
DROP POLICY IF EXISTS "System can manage hands" ON public.hand_history;

-- user_mastery: lets anyone set their mastery level
DROP POLICY IF EXISTS "System can manage mastery" ON public.user_mastery;

-- xp_security_alerts: lets anyone delete/modify security alerts
DROP POLICY IF EXISTS "System manages alerts" ON public.xp_security_alerts;

-- gto_solve_queue: lets anyone spam the solve queue
DROP POLICY IF EXISTS "System manages solve queue" ON public.gto_solve_queue;

-- ==========================================
-- TIER 3: MODERATE — Social Pages (8 tables)
-- These got FOR ALL USING(true) from a dynamic loop
-- in 20260130_social_pages_tables.sql
-- ==========================================

DROP POLICY IF EXISTS "page_activity_all" ON page_activity;
DROP POLICY IF EXISTS "venue_reviews_all" ON venue_reviews;
DROP POLICY IF EXISTS "venue_checkins_all" ON venue_checkins;
DROP POLICY IF EXISTS "live_games_all" ON live_games;
DROP POLICY IF EXISTS "page_claims_all" ON page_claims;
DROP POLICY IF EXISTS "page_notifications_all" ON page_notifications;
DROP POLICY IF EXISTS "notification_reads_all" ON notification_reads;
DROP POLICY IF EXISTS "tournament_results_all" ON tournament_results;

-- ==========================================
-- TIER 4: Internal/AI Systems
-- ==========================================

-- Horse AI poker tracking
DROP POLICY IF EXISTS "System manages horse sessions" ON public.horse_poker_sessions;
DROP POLICY IF EXISTS "System manages horse decisions" ON public.horse_poker_decisions;
DROP POLICY IF EXISTS "System manages horse stats" ON public.horse_poker_stats;

-- Horse memory system (from 20260113_horse_memory_system.sql)
DROP POLICY IF EXISTS "System manages horse memory" ON horse_memory;
DROP POLICY IF EXISTS "System manages horse personality" ON horse_personality;
DROP POLICY IF EXISTS "System manages horse relationships" ON horse_relationships;
DROP POLICY IF EXISTS "System manages horse cooldowns" ON horse_topic_cooldowns;

-- Orb/gamification
DROP POLICY IF EXISTS "System manages orb log" ON public.orb_activity_log;
DROP POLICY IF EXISTS "System manages orb ledger" ON public.orb_activity_ledger;

-- Content management
DROP POLICY IF EXISTS "System manages settings" ON public.content_settings;
DROP POLICY IF EXISTS "System manages pipeline" ON public.pipeline_runs;

-- ==========================================
-- Commander tables (controlled environment, lower risk)
-- ==========================================

DROP POLICY IF EXISTS "Service role full access" ON commander_time_sessions;
DROP POLICY IF EXISTS "Service role full access" ON commander_table_seats;
DROP POLICY IF EXISTS "Service role full access" ON commander_venue_settings;
DROP POLICY IF EXISTS "Service role full access" ON commander_incidents;
DROP POLICY IF EXISTS "Service role full access" ON commander_checkins;
DROP POLICY IF EXISTS "service_role_all_time_clock" ON commander_time_clock;
DROP POLICY IF EXISTS "Service role full access" ON commander_cash_transactions;
DROP POLICY IF EXISTS "home_posts_update" ON commander_home_posts;
DROP POLICY IF EXISTS "home_posts_delete" ON commander_home_posts;

-- Commander table_sessions & time_purchases (006_dealer_time_system.sql)
DROP POLICY IF EXISTS "Service role full access" ON commander_table_sessions;
DROP POLICY IF EXISTS "Service role full access" ON commander_time_purchases;

-- ==========================================
-- Other dangerous INSERT WITH CHECK(true) policies
-- ==========================================

-- reward_claims: anyone can insert fake reward claims
DROP POLICY IF EXISTS "System can insert claims" ON reward_claims;

-- celebration_queue: anyone can insert celebrations (low risk but unnecessary)
DROP POLICY IF EXISTS "System can insert celebrations" ON celebration_queue;

-- clip_usage_log: anyone can insert clip usage (low risk)
DROP POLICY IF EXISTS "Service can log clip usage" ON clip_usage_log;

-- notifications: anyone can insert notifications to any user
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- diamond_reward_claims: anyone can insert fake diamond claims
DROP POLICY IF EXISTS "Service role can insert claims" ON diamond_reward_claims;

-- commander_home_posts: open insert (Commander environment, lower risk)
DROP POLICY IF EXISTS "home_posts_insert" ON commander_home_posts;

-- NOTE: These INSERT WITH CHECK(true) policies are INTENTIONALLY permissive
-- and should NOT be dropped:
--   "Anyone can subscribe" ON newsletter_subscribers (public signup)
--   "Allow signup profile creation" ON profiles (needed for auth flow)
--   "QR scans insertable by anyone" ON qr_code_scans (public QR scanning)
--   commander_waitlist_history_insert (Commander kiosk)
--   commander_notifications_insert (Commander internal)

-- ==========================================
-- ADD BACK: Proper restrictive policies where
-- client-side access is needed
-- ==========================================

-- club_members: users can read members of clubs they belong to
-- (The cm_select_own, cm_insert_self, cm_update_admin policies
-- from baseline_core_tables.sql still exist and are properly scoped)

-- page_activity: users can insert their own activity
DO $$ BEGIN
  CREATE POLICY "page_activity_insert_own" ON page_activity
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- venue_reviews: users can insert their own reviews  
DO $$ BEGIN
  CREATE POLICY "venue_reviews_insert_own" ON venue_reviews
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- venue_checkins: users can insert their own checkins
DO $$ BEGIN
  CREATE POLICY "venue_checkins_insert_own" ON venue_checkins
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- notification_reads: users can mark their own as read
DO $$ BEGIN
  CREATE POLICY "notification_reads_insert_own" ON notification_reads
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- page_activity, venue_reviews, venue_checkins, live_games,
-- page_claims, page_notifications, tournament_results:
-- Add SELECT for authenticated users (public read data)
DO $$ BEGIN
  CREATE POLICY "page_activity_select" ON page_activity FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "venue_reviews_select" ON venue_reviews FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "venue_checkins_select" ON venue_checkins FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "live_games_select" ON live_games FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "page_claims_select" ON page_claims FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "page_notifications_select" ON page_notifications
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "tournament_results_select" ON tournament_results FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- NOTE: service_role bypasses RLS entirely and is unaffected.
-- All API routes use supabaseAdmin (service_role) for writes.
-- These changes only block direct PostgREST authenticated access.
-- ============================================================
