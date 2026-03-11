-- ═══════════════════════════════════════════════════════════════════════════
-- COMPREHENSIVE RLS FIX: Ensure new users have full platform access
-- ═══════════════════════════════════════════════════════════════════════════
-- This fixes all tables where new authenticated users should be able to READ
-- public/social content. Private data (own rewards, own messages) stays private.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. SOCIAL POSTS - Everyone can read public posts
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Public posts are viewable by anyone" ON public.social_posts;
CREATE POLICY "Public posts are viewable by anyone" ON public.social_posts
    FOR SELECT TO authenticated
    USING (visibility = 'public' OR visibility IS NULL OR author_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. SOCIAL COMMENTS - Everyone can read comments on posts they can see
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Comments are publicly readable" ON public.social_comments;
CREATE POLICY "Comments are publicly readable" ON public.social_comments
    FOR SELECT TO authenticated
    USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. SOCIAL LIKES - Everyone can see likes
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Likes are publicly readable" ON public.social_likes;
CREATE POLICY "Likes are publicly readable" ON public.social_likes
    FOR SELECT TO authenticated
    USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. STORIES - Public stories readable by all authenticated users
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Stories are publicly viewable" ON public.social_stories;
CREATE POLICY "Stories are publicly viewable" ON public.social_stories
    FOR SELECT TO authenticated
    USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. REELS - Public reels readable by all
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Reels are publicly viewable" ON public.social_reels;
CREATE POLICY "Reels are publicly viewable" ON public.social_reels
    FOR SELECT TO authenticated
    USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. LIVE STREAMS - Everyone can see active streams
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Live streams are publicly viewable" ON public.live_streams;
CREATE POLICY "Live streams are publicly viewable" ON public.live_streams
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Live viewers are publicly viewable" ON public.live_viewers;
CREATE POLICY "Live viewers are publicly viewable" ON public.live_viewers
    FOR SELECT TO authenticated
    USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. TRAINING CONTENT - All training should be accessible
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Training clinics are public" ON public.training_clinics;
CREATE POLICY "Training clinics are public" ON public.training_clinics
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Training games are public" ON public.training_games;
CREATE POLICY "Training games are public" ON public.training_games
    FOR SELECT TO authenticated
    USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. ARCADE/TRIVIA - Games should be accessible
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Arcade games are public" ON public.arcade_games;
CREATE POLICY "Arcade games are public" ON public.arcade_games
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Trivia questions are public" ON public.trivia_questions;
CREATE POLICY "Trivia questions are public" ON public.trivia_questions
    FOR SELECT TO authenticated
    USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. LEADERBOARDS - Everyone should see leaderboard data
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Leaderboards are public" ON public.leaderboards;
CREATE POLICY "Leaderboards are public" ON public.leaderboards
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "XP leaderboard is public" ON public.xp_leaderboard;
CREATE POLICY "XP leaderboard is public" ON public.xp_leaderboard
    FOR SELECT TO authenticated
    USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. NEWS/ARTICLES - All published content should be accessible
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Published news is public" ON public.poker_news;
CREATE POLICY "Published news is public" ON public.poker_news
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Published articles are public" ON public.articles;
CREATE POLICY "Published articles are public" ON public.articles
    FOR SELECT TO authenticated
    USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. TOURNAMENTS - Tournament schedules are public
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Tournaments are public" ON public.tournaments;
CREATE POLICY "Tournaments are public" ON public.tournaments
    FOR SELECT TO authenticated
    USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTE: The following CORRECTLY remain private to the user:
-- - user_mastery, user_dna_profiles, hand_history (personal training data)
-- - diamond_ledger, social_diamond_rewards (personal economy)
-- - notifications (personal alerts)
-- - social_messages (private messages)
-- - arcade_sessions, arcade_streaks (personal game progress)
-- ═══════════════════════════════════════════════════════════════════════════
