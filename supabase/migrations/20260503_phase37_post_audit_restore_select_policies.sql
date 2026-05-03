-- ═══════════════════════════════════════════════════════════════════════
-- 20260503_phase37_post_audit_restore_select_policies.sql
-- TIER 3 — bug-hunt corrective for over-aggressive Tier-B drops
-- Restores SELECT for anon/authenticated on tables whose sole policy
-- (USING true ALL) was dropped, leaving even reads blocked.
-- Applied to production via Supabase MCP on 2026-05-03.
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
