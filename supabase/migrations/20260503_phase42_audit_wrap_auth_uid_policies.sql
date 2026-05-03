-- ═══════════════════════════════════════════════════════════════════════
-- Phase 42 deep-audit fix: wrap bare auth.uid() in 26 RLS policies
-- (perf — was per-row eval, now per-query eval via (SELECT ...) idiom).
-- Most were policies I created in earlier Phase 37 + post-audit migrations
-- with the unwrapped form. Caught by Supabase advisor lint 0025 (rls_init_plan).
-- Applied to production via Supabase MCP on 2026-05-03.
-- ═══════════════════════════════════════════════════════════════════════

-- live_bans / live_gifts / live_pins / live_reactions
DROP POLICY IF EXISTS "lb_ins" ON public.live_bans;
CREATE POLICY "lb_ins" ON public.live_bans FOR INSERT
    WITH CHECK (((SELECT auth.uid()) = banned_by) AND ((SELECT auth.uid()) IN (
        SELECT live_streams.broadcaster_id FROM live_streams
        WHERE live_streams.id = live_bans.stream_id
    )));
DROP POLICY IF EXISTS "lg_ins" ON public.live_gifts;
CREATE POLICY "lg_ins" ON public.live_gifts FOR INSERT
    WITH CHECK (sender_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "lp_all" ON public.live_pins;
CREATE POLICY "lp_all" ON public.live_pins FOR ALL
    USING (((SELECT auth.uid()) = pinned_by) AND ((SELECT auth.uid()) IN (
        SELECT live_streams.broadcaster_id FROM live_streams
        WHERE live_streams.id = live_pins.stream_id
    )));
DROP POLICY IF EXISTS "live_reactions_insert" ON public.live_reactions;
CREATE POLICY "live_reactions_insert" ON public.live_reactions FOR INSERT
    WITH CHECK (sender_id = (SELECT auth.uid()));

-- messenger_*, profiles, sandbox_* (Phase 37 Tier U)
DROP POLICY IF EXISTS "messenger_labels_insert_self" ON public.messenger_labels;
CREATE POLICY "messenger_labels_insert_self" ON public.messenger_labels
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "messenger_themes_insert_self" ON public.messenger_themes;
CREATE POLICY "messenger_themes_insert_self" ON public.messenger_themes
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = id);
DROP POLICY IF EXISTS "sandbox_bookmarks_insert_self" ON public.sandbox_bookmarks;
CREATE POLICY "sandbox_bookmarks_insert_self" ON public.sandbox_bookmarks
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "sandbox_saved_hands_insert_self" ON public.sandbox_saved_hands;
CREATE POLICY "sandbox_saved_hands_insert_self" ON public.sandbox_saved_hands
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "sandbox_shared_scenarios_delete_self" ON public.sandbox_shared_scenarios;
CREATE POLICY "sandbox_shared_scenarios_delete_self" ON public.sandbox_shared_scenarios
    FOR DELETE TO authenticated USING ((SELECT auth.uid()) = creator_id);
DROP POLICY IF EXISTS "sandbox_shared_scenarios_insert_self" ON public.sandbox_shared_scenarios;
CREATE POLICY "sandbox_shared_scenarios_insert_self" ON public.sandbox_shared_scenarios
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = creator_id);
DROP POLICY IF EXISTS "sandbox_shared_scenarios_update_self" ON public.sandbox_shared_scenarios;
CREATE POLICY "sandbox_shared_scenarios_update_self" ON public.sandbox_shared_scenarios
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = creator_id) WITH CHECK ((SELECT auth.uid()) = creator_id);

-- profile_picture_history, share_*, social_*
DROP POLICY IF EXISTS "pph_insert" ON public.profile_picture_history;
CREATE POLICY "pph_insert" ON public.profile_picture_history FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "share_events_insert_own" ON public.share_events;
CREATE POLICY "share_events_insert_own" ON public.share_events FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "share_streak_rewards_select_own" ON public.share_streak_rewards;
CREATE POLICY "share_streak_rewards_select_own" ON public.share_streak_rewards FOR SELECT
    USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "social_comment_likes_delete_self" ON public.social_comment_likes;
CREATE POLICY "social_comment_likes_delete_self" ON public.social_comment_likes
    FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "social_comment_likes_insert_self" ON public.social_comment_likes;
CREATE POLICY "social_comment_likes_insert_self" ON public.social_comment_likes
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "social_comment_likes_update_self" ON public.social_comment_likes;
CREATE POLICY "social_comment_likes_update_self" ON public.social_comment_likes
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "sml_delete" ON public.social_media_library;
CREATE POLICY "sml_delete" ON public.social_media_library FOR DELETE
    USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "sml_insert" ON public.social_media_library;
CREATE POLICY "sml_insert" ON public.social_media_library FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "sml_update" ON public.social_media_library;
CREATE POLICY "sml_update" ON public.social_media_library FOR UPDATE
    USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "social_page_reports_insert_self" ON public.social_page_reports;
CREATE POLICY "social_page_reports_insert_self" ON public.social_page_reports
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = reporter_id);
DROP POLICY IF EXISTS "social_post_comments_insert_self" ON public.social_post_comments;
CREATE POLICY "social_post_comments_insert_self" ON public.social_post_comments
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

-- training_events / trivia_tournament_entries
DROP POLICY IF EXISTS "training_events_insert_self" ON public.training_events;
CREATE POLICY "training_events_insert_self" ON public.training_events
    FOR INSERT TO authenticated
    WITH CHECK (((SELECT auth.uid()) = user_id) OR (user_id IS NULL));
DROP POLICY IF EXISTS "trivia_tournament_entries_select_self" ON public.trivia_tournament_entries;
CREATE POLICY "trivia_tournament_entries_select_self" ON public.trivia_tournament_entries
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "trivia_tournament_entries_update_self" ON public.trivia_tournament_entries;
CREATE POLICY "trivia_tournament_entries_update_self" ON public.trivia_tournament_entries
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
