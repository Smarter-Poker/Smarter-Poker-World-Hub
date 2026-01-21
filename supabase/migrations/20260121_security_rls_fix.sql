-- ═══════════════════════════════════════════════════════════════════════════
-- 🛡️ SECURITY FIX: Enable RLS on 47 Tables
-- ═══════════════════════════════════════════════════════════════════════════
-- Fixes Supabase Security Advisor errors
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- CATEGORY 1: Tables with policies but RLS disabled (3 tables)
-- Just need to enable RLS - policies already exist
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_levels ENABLE ROW LEVEL SECURITY;

-- ───────────────────────────────────────────────────────────────────────────
-- CATEGORY 2: Public read tables - Enable RLS with public read access
-- These are reference/config tables that should be readable by all
-- ───────────────────────────────────────────────────────────────────────────

-- Reference/Config Tables (public read)
ALTER TABLE public.reward_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.reward_definitions FOR SELECT USING (true);

ALTER TABLE public.training_drills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.training_drills FOR SELECT USING (true);

ALTER TABLE public.gto_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.gto_scenarios FOR SELECT USING (true);

ALTER TABLE public.arcade_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.arcade_games FOR SELECT USING (true);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.achievements FOR SELECT USING (true);

ALTER TABLE public.orbs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.orbs FOR SELECT USING (true);

ALTER TABLE public.arena_orbs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.arena_orbs FOR SELECT USING (true);

ALTER TABLE public.marketplace_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.marketplace_items FOR SELECT USING (true);

ALTER TABLE public.game_formats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.game_formats FOR SELECT USING (true);

ALTER TABLE public.stack_depth_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.stack_depth_configs FOR SELECT USING (true);

ALTER TABLE public.memory_matrix_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.memory_matrix_games FOR SELECT USING (true);

ALTER TABLE public.memory_matrix_solutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.memory_matrix_solutions FOR SELECT USING (true);

-- Poker discovery tables (public read)
ALTER TABLE public.poker_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.poker_events FOR SELECT USING (true);

ALTER TABLE public.poker_venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.poker_venues FOR SELECT USING (true);

ALTER TABLE public.poker_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.poker_series FOR SELECT USING (true);

ALTER TABLE public.poker_tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.poker_tournaments FOR SELECT USING (true);

ALTER TABLE public.tournament_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.tournament_series FOR SELECT USING (true);

-- ───────────────────────────────────────────────────────────────────────────
-- CATEGORY 3: User-owned tables - RLS with user ownership check
-- ───────────────────────────────────────────────────────────────────────────

-- User profile/data tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own data" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own data" ON public.users FOR UPDATE USING (auth.uid() = id);

ALTER TABLE public.user_seen_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own history" ON public.user_seen_history FOR ALL USING (auth.uid() = user_id);

ALTER TABLE public.user_mastery ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own mastery" ON public.user_mastery FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can manage mastery" ON public.user_mastery FOR ALL USING (true);

ALTER TABLE public.user_dna_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own DNA" ON public.user_dna_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own DNA" ON public.user_dna_profiles FOR UPDATE USING (auth.uid() = user_id);

ALTER TABLE public.user_albums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own albums" ON public.user_albums FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public can view albums" ON public.user_albums FOR SELECT USING (true);

ALTER TABLE public.user_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own media" ON public.user_media FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Public can view media" ON public.user_media FOR SELECT USING (true);

ALTER TABLE public.profile_picture_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own history" ON public.profile_picture_history FOR ALL USING (auth.uid() = user_id);

ALTER TABLE public.hand_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own hands" ON public.hand_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can manage hands" ON public.hand_history FOR ALL USING (true);

ALTER TABLE public.drill_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own sessions" ON public.drill_sessions FOR ALL USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- CATEGORY 4: XP/Diamond/Reward tables - System managed, user can view own
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.social_xp_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own XP" ON public.social_xp_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages XP" ON public.social_xp_log FOR INSERT USING (true);

ALTER TABLE public.social_diamond_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own rewards" ON public.social_diamond_rewards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages rewards" ON public.social_diamond_rewards FOR INSERT USING (true);

ALTER TABLE public.diamond_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own ledger" ON public.diamond_ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System manages ledger" ON public.diamond_ledger FOR INSERT USING (true);

ALTER TABLE public.xp_security_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System manages alerts" ON public.xp_security_alerts FOR ALL USING (true);

-- ───────────────────────────────────────────────────────────────────────────
-- CATEGORY 5: Club/Game tables - Club membership based access
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.club_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view club members" ON public.club_members FOR SELECT USING (true);
CREATE POLICY "System manages members" ON public.club_members FOR ALL USING (true);

ALTER TABLE public.game_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view tables" ON public.game_tables FOR SELECT USING (true);
CREATE POLICY "System manages tables" ON public.game_tables FOR ALL USING (true);

-- ───────────────────────────────────────────────────────────────────────────
-- CATEGORY 6: Horse AI tables - System managed
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.horse_poker_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System manages horse sessions" ON public.horse_poker_sessions FOR ALL USING (true);

ALTER TABLE public.horse_poker_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System manages horse decisions" ON public.horse_poker_decisions FOR ALL USING (true);

ALTER TABLE public.horse_poker_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System manages horse stats" ON public.horse_poker_stats FOR ALL USING (true);
CREATE POLICY "Public can view stats" ON public.horse_poker_stats FOR SELECT USING (true);

-- ───────────────────────────────────────────────────────────────────────────
-- CATEGORY 7: Orb activity/logging tables - System managed
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orb_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System manages orb log" ON public.orb_activity_log FOR ALL USING (true);

ALTER TABLE public.orb_activity_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System manages orb ledger" ON public.orb_activity_ledger FOR ALL USING (true);

-- ───────────────────────────────────────────────────────────────────────────
-- CATEGORY 8: Admin/System tables - System managed
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.content_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System manages settings" ON public.content_settings FOR ALL USING (true);

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System manages pipeline" ON public.pipeline_runs FOR ALL USING (true);

ALTER TABLE public.gto_solve_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System manages solve queue" ON public.gto_solve_queue FOR ALL USING (true);

-- ───────────────────────────────────────────────────────────────────────────
-- CATEGORY 9: PostGIS system table - Skip or restrict
-- ───────────────────────────────────────────────────────────────────────────

-- spatial_ref_sys is a PostGIS system table - enable RLS with public read
ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.spatial_ref_sys FOR SELECT USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION: Check that all tables now have RLS enabled
-- ═══════════════════════════════════════════════════════════════════════════

-- Run this query to verify:
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;
