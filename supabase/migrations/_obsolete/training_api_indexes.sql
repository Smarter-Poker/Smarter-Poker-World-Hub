-- ═══════════════════════════════════════════════════════════════════════════
-- Training API — Performance Indexes
-- Generated: 2026-03-15
-- Risk: LOW — CREATE INDEX IF NOT EXISTS is additive only
-- ═══════════════════════════════════════════════════════════════════════════

-- Leaderboard: queried by (user_id, period_type, period_key) on every session completion
-- Without this: 4x sequential table scans per leaderboard update (daily, weekly, monthly, alltime)
CREATE INDEX IF NOT EXISTS idx_training_leaderboard_user_period
  ON training_leaderboard (user_id, period_type, period_key);

-- Sessions: queried by (user_id, game_id) with ORDER BY created_at DESC
-- Used by get-sessions.js for session history
CREATE INDEX IF NOT EXISTS idx_training_sessions_user_game
  ON training_sessions (user_id, game_id, created_at DESC);

-- Seen questions: queried by (user_id, game_id, question_id) for no-repeat tracking
-- Used by record-question.js upsert
CREATE INDEX IF NOT EXISTS idx_user_seen_questions_lookup
  ON user_seen_questions (user_id, game_id, question_id);

-- Streaks: queried by (user_id) on every session for streak tracking
CREATE INDEX IF NOT EXISTS idx_training_streaks_user
  ON training_streaks (user_id);

-- Daily bonus: queried by (user_id, bonus_date) to check if already claimed
CREATE INDEX IF NOT EXISTS idx_training_daily_bonus_user_date
  ON training_daily_bonus (user_id, bonus_date);

-- Progress: queried by (user_id, game_id) for game progress
CREATE INDEX IF NOT EXISTS idx_training_progress_user_game
  ON training_progress (user_id, game_id);

-- Explanation cache: queried by (cache_key, was_correct) for GTO explanation caching
CREATE INDEX IF NOT EXISTS idx_grok_explanation_cache_lookup
  ON grok_explanation_cache (cache_key, was_correct);
