-- ═══════════════════════════════════════════════════════════════════════════
-- Training API — Composite Indexes for Query Performance
-- ═══════════════════════════════════════════════════════════════════════════
-- All indexes use IF NOT EXISTS — safe to re-run
-- Targets the most frequently queried patterns across 40 API endpoints

-- 1. training_progress — queried by (user_id, game_id) on every save/load
CREATE INDEX IF NOT EXISTS idx_training_progress_user_game
ON training_progress (user_id, game_id);

-- 2. training_level_history — queried by (user_id, game_id) on save-progress
CREATE INDEX IF NOT EXISTS idx_training_level_history_user_game
ON training_level_history (user_id, game_id);

-- 3. training_sessions — queried by (user_id) with ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_training_sessions_user_created
ON training_sessions (user_id, created_at DESC);

-- 4. training_streaks — queried by (user_id) on every streak check
CREATE INDEX IF NOT EXISTS idx_training_streaks_user
ON training_streaks (user_id);

-- 5. training_leaderboard — queried by (game_id) sorted by mastery points
CREATE INDEX IF NOT EXISTS idx_training_leaderboard_game_mastery
ON training_leaderboard (game_id, total_mastery_points DESC);

-- 6. training_user_achievements — queried by (user_id) on achievements page
CREATE INDEX IF NOT EXISTS idx_training_user_achievements_user
ON training_user_achievements (user_id);

-- 7. training_user_challenges — queried by (user_id) on challenges page
CREATE INDEX IF NOT EXISTS idx_training_user_challenges_user
ON training_user_challenges (user_id);

-- 8. solved_spots_gold — queried by (game_type, stack_depth) for GTO training
-- This is the heaviest table (187k+ rows) — index is critical
CREATE INDEX IF NOT EXISTS idx_solved_spots_gold_gametype_stack
ON solved_spots_gold (game_type, stack_depth);

-- 9. training_daily_bonus — queried by (user_id, bonus_date)
CREATE INDEX IF NOT EXISTS idx_training_daily_bonus_user_date
ON training_daily_bonus (user_id, bonus_date);

-- 10. jarvis_training_sessions — queried by (user_id) with ORDER BY
CREATE INDEX IF NOT EXISTS idx_jarvis_training_sessions_user
ON jarvis_training_sessions (user_id, created_at DESC);
