-- ═══════════════════════════════════════════════════════════════════════════
-- Fix trivia_streaks RLS — Allow public read for daily leaderboard
-- ═══════════════════════════════════════════════════════════════════════════
-- Status: trivia_scores has "SELECT USING (true)" for leaderboard access,
-- but trivia_streaks only allows "auth.uid() = user_id" on SELECT.
-- This breaks the daily leaderboard which queries top 10 streaks across
-- all users. Fix: add a public SELECT policy for leaderboard visibility.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view their own streaks" ON trivia_streaks;

-- Add public SELECT policy (matching trivia_scores pattern)
CREATE POLICY "Trivia streaks are viewable by all"
    ON trivia_streaks FOR SELECT USING (true);

-- Note: The "Users can manage their own streaks" (FOR ALL) policy remains
-- unchanged — users can still only INSERT/UPDATE their own streaks.
