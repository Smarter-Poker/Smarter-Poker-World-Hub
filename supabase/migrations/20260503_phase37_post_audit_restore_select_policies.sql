-- ═══════════════════════════════════════════════════════════════════════
-- 20260503_phase37_post_audit_restore_select_policies.sql
-- TIER 3 (RLS policy CREATE — bug-hunt corrective)
--
-- Bug-hunt after Phase 37+B+U lockdown found that I dropped some
-- ALL-cmd policies (USING true / WITH CHECK true) that were the
-- sole policy on the table — leaving anon AND authenticated unable
-- to even SELECT. This broke pages that read these tables from
-- anon-context client code:
--
--   • pages/hub/trivia/tournaments.js — 5 anon SELECTs on
--     trivia_tournaments + trivia_tournament_entries (page is dead)
--   • pages/hub/trivia/mixed.js — SELECT on trivia_category_mastery
--   • src/lib/jarvisCache.js — SELECT on jarvis_response_cache (cache dead)
--   • src/engine/CentralBus.js — INSERT on training_events
--
-- This migration restores:
--   - SELECT TO anon, authenticated USING true on 12 public-display tables
--   - SELECT + UPDATE TO authenticated USING (auth.uid() = user_id) on
--     trivia_tournament_entries (INSERT still goes through API)
--   - jarvis_response_cache + training_events handled in companion
--     migration phase37_post_audit_restore_jarvis_cache_and_training_events
--
-- Server-only tables (commander_*, horse_*, tour_schedule_*, etc.)
-- intentionally remain at 0 policies — service_role bypasses RLS.
--
-- Already applied to production via Supabase MCP apply_migration on 2026-05-03;
-- this file is the audit-trail / reproduction copy.
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "trivia_tournaments_public_select" ON public.trivia_tournaments
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "trivia_category_mastery_public_select" ON public.trivia_category_mastery
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "video_clips_public_select" ON public.video_clips
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "posted_sports_clips_public_select" ON public.posted_sports_clips
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "poker_videos_public_select" ON public.poker_videos
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "poker_reels_public_select" ON public.poker_reels
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "vip_pricing_public_select" ON public.vip_pricing
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "feature_pricing_public_select" ON public.feature_pricing
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "spin_tournaments_public_select" ON public.spin_tournaments
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "daily_spins_public_select" ON public.daily_spins
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "training_achievements_public_select" ON public.training_achievements
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "villain_archetypes_public_select" ON public.villain_archetypes
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "trivia_tournament_entries_select_self" ON public.trivia_tournament_entries
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "trivia_tournament_entries_update_self" ON public.trivia_tournament_entries
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
