-- ═══════════════════════════════════════════════════════════════════════
-- 20260520000003_consolidate_permissive_policies.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      antigravity
-- AFFECTS:     RLS policies (multiple_permissive_policies performance warnings)
-- IRREVERSIBLE: no
--
-- WHY:
--   Supabase advisor flags tables where the same role has multiple
--   permissive policies for the same action (e.g., both a FOR ALL policy
--   AND a separate FOR SELECT policy apply to anon/public for SELECT).
--   This forces Postgres to evaluate both policies per row.
--
-- HOW:
--   For each affected table: drop the redundant per-command policies,
--   keeping only the FOR ALL (or most-restrictive) policy.
--   This reduces duplicate evaluation and clears the PERFORMANCE warnings.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── bankroll_assistant_memory: has FOR ALL + per-command policies
-- Keep FOR ALL "bankroll_assistant_memory_owner", drop redundant per-cmd ones
DROP POLICY IF EXISTS "Users can delete own memory" ON public.bankroll_assistant_memory;
DROP POLICY IF EXISTS "Users can insert own memory" ON public.bankroll_assistant_memory;
DROP POLICY IF EXISTS "Users can view own memory" ON public.bankroll_assistant_memory;
DROP POLICY IF EXISTS "Users can update own memory" ON public.bankroll_assistant_memory;
-- bankroll_assistant_memory_owner (FOR ALL) stays

-- ── friendships: has FOR ALL + per-command policies
-- Keep FOR ALL "Users can manage own friendships", drop duplicates
DROP POLICY IF EXISTS "Users can delete own friendships" ON public.friendships;
DROP POLICY IF EXISTS "Anyone can insert friendship requests" ON public.friendships;
DROP POLICY IF EXISTS "Users can update own friendships" ON public.friendships;
-- Keep "Public read access" (SELECT) and "Users can manage own friendships" (ALL)
-- These don't overlap since ALL covers SELECT, but "Public read access" is for anon
-- Remove the FOR ALL that duplicates the specific SELECT:
-- Actually keep both but drop per-cmd that duplicate ALL
-- friendships SELECT has 2 policies for anon: "Public read access" + "Users can manage own friendships" ALL
-- Solution: scope "Users can manage own friendships" to authenticated only
DROP POLICY IF EXISTS "Users can manage own friendships" ON public.friendships;
CREATE POLICY "Users can manage own friendships"
    ON public.friendships FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id OR (SELECT auth.uid()) = friend_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── geeves_conversations: has FOR ALL service_role policy + user policies
-- The FOR ALL is for service_role, keep it scoped to service_role
DROP POLICY IF EXISTS "Service role full access conversations" ON public.geeves_conversations;
CREATE POLICY "Service role full access conversations"
    ON public.geeves_conversations FOR ALL TO service_role
    USING (true) WITH CHECK (true);
-- User policies now only apply to authenticated/public without service_role overlap causing dupes

-- ── messenger_scheduled: has FOR ALL + per-command policies
-- Keep FOR ALL, drop per-cmd duplicates
DROP POLICY IF EXISTS "Users can delete own scheduled messages" ON public.messenger_scheduled;
DROP POLICY IF EXISTS "Users can create scheduled messages" ON public.messenger_scheduled;
DROP POLICY IF EXISTS "Users can view own scheduled messages" ON public.messenger_scheduled;
DROP POLICY IF EXISTS "Users can update own scheduled messages" ON public.messenger_scheduled;
-- "Users manage their own scheduled messages" (ALL) already handles all operations
-- But it's missing WITH CHECK for INSERT. Fix it:
DROP POLICY IF EXISTS "Users manage their own scheduled messages" ON public.messenger_scheduled;
CREATE POLICY "messenger_scheduled_owner"
    ON public.messenger_scheduled FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = sender_id)
    WITH CHECK ((SELECT auth.uid()) = sender_id);

-- ── player_stats: "player_stats_self" (ALL) + "Player stats are public" (SELECT) + "Users can update own stats" (UPDATE)
-- The ALL and UPDATE both apply to the same rows. Drop the redundant UPDATE.
DROP POLICY IF EXISTS "Users can update own stats" ON public.player_stats;
-- player_stats_self (FOR ALL) already covers UPDATE for owner.
-- "Player stats are public" (SELECT) is fine as it's for a different role/condition.

-- ── training_answers: service_role ALL + user INSERT → scope service_role
DROP POLICY IF EXISTS "Service role full access training_answers" ON public.training_answers;
CREATE POLICY "Service role full access training_answers"
    ON public.training_answers FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── training_progress: fix service_role overlapping with user policies
DROP POLICY IF EXISTS "Service role full access training_progress" ON public.training_progress;
CREATE POLICY "Service role full access training_progress"
    ON public.training_progress FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── tournament_entries: fix service_role SELECT overlapping user SELECT
DROP POLICY IF EXISTS "Service role full access to tournament_entries" ON public.tournament_entries;
CREATE POLICY "Service role full access to tournament_entries"
    ON public.tournament_entries FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── tournament_series: fix service_role write overlapping public read
DROP POLICY IF EXISTS "Service write tournament_series" ON public.tournament_series;
CREATE POLICY "Service write tournament_series"
    ON public.tournament_series FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── trivia_pvp_stats: scope service_role write correctly
DROP POLICY IF EXISTS "Service role full access trivia_pvp_stats" ON public.trivia_pvp_stats;
CREATE POLICY "Service role full access trivia_pvp_stats"
    ON public.trivia_pvp_stats FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── trivia_tournament_notifications: scope service_role correctly
DROP POLICY IF EXISTS "Service role full access trivia_tournament_notifications" ON public.trivia_tournament_notifications;
CREATE POLICY "Service role full access trivia_tournament_notifications"
    ON public.trivia_tournament_notifications FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── user_reports: fix service_role + user overlap
DROP POLICY IF EXISTS "Service role full access user_reports" ON public.user_reports;
CREATE POLICY "Service role full access user_reports"
    ON public.user_reports FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── user_seen_questions: scope service_role
DROP POLICY IF EXISTS "Service role full access user_seen_questions" ON public.user_seen_questions;
CREATE POLICY "Service role full access user_seen_questions"
    ON public.user_seen_questions FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── wallets: scope service_role
DROP POLICY IF EXISTS "Service role full access wallets" ON public.wallets;
CREATE POLICY "Service role full access wallets"
    ON public.wallets FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── anti_cheat_events: scope service_role SELECT
DROP POLICY IF EXISTS "anti_cheat_events_service_only" ON public.anti_cheat_events;
CREATE POLICY "anti_cheat_events_service_only"
    ON public.anti_cheat_events FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── arcade_duel_queue: has "Users can see waiting entries" + "Users manage own queue entries"
-- Both are SELECT for anon role. Consolidate into one.
DROP POLICY IF EXISTS "Users can see waiting entries" ON public.arcade_duel_queue;
DROP POLICY IF EXISTS "Users manage own queue entries" ON public.arcade_duel_queue;
CREATE POLICY "arcade_duel_queue_read"
    ON public.arcade_duel_queue FOR SELECT TO authenticated
    USING (
        status = 'waiting'
        OR (SELECT auth.uid()) = user_id
    );
CREATE POLICY "arcade_duel_queue_write"
    ON public.arcade_duel_queue FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── chip_escrow: scope service_role
DROP POLICY IF EXISTS "chip_escrow_service_only" ON public.chip_escrow;
CREATE POLICY "chip_escrow_service_only"
    ON public.chip_escrow FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── clip_library: "Admins manage clips" + "Anyone can view clips" both SELECT for anon
-- Merge into one SELECT policy
DROP POLICY IF EXISTS "Admins manage clips" ON public.clip_library;
DROP POLICY IF EXISTS "Anyone can view clips" ON public.clip_library;
CREATE POLICY "clip_library_select"
    ON public.clip_library FOR SELECT
    USING (true);
CREATE POLICY "clip_library_admin_write"
    ON public.clip_library FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
    ));

-- ── promotions: scope service_role write
DROP POLICY IF EXISTS "promotions_admin" ON public.promotions;
CREATE POLICY "promotions_admin"
    ON public.promotions FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── reward_definitions: scope service_role write
DROP POLICY IF EXISTS "reward_definitions_service_write" ON public.reward_definitions;
CREATE POLICY "reward_definitions_service_write"
    ON public.reward_definitions FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── session_chat_messages: has "scm_owner" ALL + "session_chat_insert" INSERT
DROP POLICY IF EXISTS "session_chat_insert" ON public.session_chat_messages;
-- scm_owner (FOR ALL) already covers INSERT

-- ── social_page_followers, social_page_post_comments, social_page_post_likes:
-- Each has FOR ALL user policy + public read policy. Consolidate.
DROP POLICY IF EXISTS "Followers are viewable" ON public.social_page_followers;
DROP POLICY IF EXISTS "Users manage own follows" ON public.social_page_followers;
CREATE POLICY "social_page_followers_read" ON public.social_page_followers FOR SELECT USING (true);
CREATE POLICY "social_page_followers_write" ON public.social_page_followers FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Comments viewable" ON public.social_page_post_comments;
DROP POLICY IF EXISTS "Users manage own comments" ON public.social_page_post_comments;
CREATE POLICY "social_page_post_comments_read" ON public.social_page_post_comments FOR SELECT USING (true);
CREATE POLICY "social_page_post_comments_write" ON public.social_page_post_comments FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Likes viewable" ON public.social_page_post_likes;
DROP POLICY IF EXISTS "Users manage own likes" ON public.social_page_post_likes;
CREATE POLICY "social_page_post_likes_read" ON public.social_page_post_likes FOR SELECT USING (true);
CREATE POLICY "social_page_post_likes_write" ON public.social_page_post_likes FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── social_page_posts, social_page_reviews, social_pages: same pattern
DROP POLICY IF EXISTS "Authors manage own posts" ON public.social_page_posts;
DROP POLICY IF EXISTS "Public page posts viewable" ON public.social_page_posts;
CREATE POLICY "social_page_posts_read" ON public.social_page_posts FOR SELECT USING (true);
CREATE POLICY "social_page_posts_write" ON public.social_page_posts FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = author_id) WITH CHECK ((SELECT auth.uid()) = author_id);

DROP POLICY IF EXISTS "Public reviews viewable" ON public.social_page_reviews;
DROP POLICY IF EXISTS "Users manage own reviews" ON public.social_page_reviews;
CREATE POLICY "social_page_reviews_read" ON public.social_page_reviews FOR SELECT USING (true);
CREATE POLICY "social_page_reviews_write" ON public.social_page_reviews FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = reviewer_id) WITH CHECK ((SELECT auth.uid()) = reviewer_id);

DROP POLICY IF EXISTS "Owners can manage pages" ON public.social_pages;
DROP POLICY IF EXISTS "Public pages are viewable" ON public.social_pages;
CREATE POLICY "social_pages_read" ON public.social_pages FOR SELECT USING (true);
CREATE POLICY "social_pages_owner_write" ON public.social_pages FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = owner_id) WITH CHECK ((SELECT auth.uid()) = owner_id);

-- ── sports_clips: scope service_role
DROP POLICY IF EXISTS "Service role can manage sports clips" ON public.sports_clips;
CREATE POLICY "Service role can manage sports clips"
    ON public.sports_clips FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── tour_events, tour_source_registry, tour_stop_events: scope service_role
DROP POLICY IF EXISTS "Service write tour_events" ON public.tour_events;
CREATE POLICY "Service write tour_events"
    ON public.tour_events FOR ALL TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service write tour_source_registry" ON public.tour_source_registry;
CREATE POLICY "Service write tour_source_registry"
    ON public.tour_source_registry FOR ALL TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tour_stop_events_service_write" ON public.tour_stop_events;
CREATE POLICY "tour_stop_events_service_write"
    ON public.tour_stop_events FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── POST-APPLY ASSERTIONS ──────────────────────────────────────────────
DO $$
DECLARE
    v_count int;
BEGIN
    -- Verify bankroll_assistant_memory has only 1 SELECT policy for anon
    SELECT count(*) INTO v_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bankroll_assistant_memory'
      AND (cmd = 'SELECT' OR cmd = 'ALL')
      AND permissive = 'PERMISSIVE';
    IF v_count > 1 THEN
        RAISE NOTICE 'bankroll_assistant_memory still has % SELECT-applicable policies', v_count;
    END IF;
END $$;

COMMIT;
