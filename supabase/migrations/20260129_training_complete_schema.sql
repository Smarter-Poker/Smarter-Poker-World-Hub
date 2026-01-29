-- ═══════════════════════════════════════════════════════════════════════════
-- GTO TRAINING ENGINE — COMPLETE DATABASE SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════
-- Creates all missing tables for full training system functionality
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. TRAINING PROGRESS — User progress per game
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL,
    
    -- Level Progress
    current_level INTEGER DEFAULT 1 CHECK (current_level >= 1 AND current_level <= 10),
    highest_level_completed INTEGER DEFAULT 0 CHECK (highest_level_completed >= 0 AND highest_level_completed <= 10),
    mastery_percentage INTEGER DEFAULT 0 CHECK (mastery_percentage >= 0 AND mastery_percentage <= 100),
    
    -- Question Stats
    total_questions_answered INTEGER DEFAULT 0,
    total_correct INTEGER DEFAULT 0,
    total_incorrect INTEGER DEFAULT 0,
    
    -- Streaks
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    
    -- XP & Rewards
    total_xp_earned INTEGER DEFAULT 0,
    total_diamonds_earned INTEGER DEFAULT 0,
    
    -- Timestamps
    last_played_at TIMESTAMP WITH TIME ZONE,
    first_played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, game_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_training_progress_user_id ON training_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_training_progress_game_id ON training_progress(game_id);
CREATE INDEX IF NOT EXISTS idx_training_progress_mastery ON training_progress(mastery_percentage DESC);
CREATE INDEX IF NOT EXISTS idx_training_progress_last_played ON training_progress(last_played_at DESC);

-- RLS Policies
ALTER TABLE training_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own progress"
    ON training_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
    ON training_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
    ON training_progress FOR UPDATE
    USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. TRAINING LEVEL HISTORY — Track completion of individual levels
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_level_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL,
    level INTEGER NOT NULL CHECK (level >= 1 AND level <= 10),
    
    -- Completion Stats
    questions_answered INTEGER NOT NULL,
    questions_correct INTEGER NOT NULL,
    accuracy_percentage INTEGER NOT NULL,
    passed BOOLEAN NOT NULL,
    
    -- Performance
    time_spent_seconds INTEGER,
    best_streak INTEGER DEFAULT 0,
    
    -- Rewards
    xp_earned INTEGER DEFAULT 0,
    diamonds_earned INTEGER DEFAULT 0,
    
    -- Timestamps
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, game_id, level, completed_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_level_history_user_id ON training_level_history(user_id);
CREATE INDEX IF NOT EXISTS idx_level_history_game_id ON training_level_history(game_id);
CREATE INDEX IF NOT EXISTS idx_level_history_completed ON training_level_history(completed_at DESC);

-- RLS Policies
ALTER TABLE training_level_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own level history"
    ON training_level_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own level history"
    ON training_level_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. TRAINING ACHIEVEMENTS — Achievement definitions and user unlocks
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_achievements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL, -- 'COMPLETION', 'MASTERY', 'STREAK', 'SPEED', 'ACCURACY'
    tier TEXT NOT NULL, -- 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'
    
    -- Requirements
    requirement_type TEXT NOT NULL, -- 'GAMES_COMPLETED', 'MASTERY_LEVEL', 'STREAK', 'ACCURACY', etc.
    requirement_value INTEGER NOT NULL,
    
    -- Rewards
    xp_reward INTEGER DEFAULT 0,
    diamond_reward INTEGER DEFAULT 0,
    
    -- Metadata
    icon TEXT,
    color TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default achievements
INSERT INTO training_achievements (id, name, description, category, tier, requirement_type, requirement_value, xp_reward, diamond_reward) VALUES
    ('first_game', 'First Steps', 'Complete your first training game', 'COMPLETION', 'BRONZE', 'GAMES_COMPLETED', 1, 100, 10),
    ('ten_games', 'Getting Started', 'Complete 10 different training games', 'COMPLETION', 'SILVER', 'GAMES_COMPLETED', 10, 500, 50),
    ('fifty_games', 'Dedicated Student', 'Complete 50 different training games', 'COMPLETION', 'GOLD', 'GAMES_COMPLETED', 50, 2500, 250),
    ('all_games', 'Master of All', 'Complete all 100 training games', 'COMPLETION', 'PLATINUM', 'GAMES_COMPLETED', 100, 10000, 1000),
    ('first_mastery', 'First Mastery', 'Achieve 100% mastery in any game', 'MASTERY', 'BRONZE', 'MASTERY_LEVEL', 100, 200, 20),
    ('ten_mastery', 'Mastery Expert', 'Achieve 100% mastery in 10 games', 'MASTERY', 'SILVER', 'MASTERY_LEVEL', 10, 1000, 100),
    ('streak_10', 'Hot Streak', 'Get a 10-question streak', 'STREAK', 'BRONZE', 'STREAK', 10, 100, 10),
    ('streak_25', 'Perfect Session', 'Get a 25-question streak (perfect level)', 'STREAK', 'GOLD', 'STREAK', 25, 500, 50),
    ('accuracy_90', 'Sharp Shooter', 'Complete a level with 90%+ accuracy', 'ACCURACY', 'SILVER', 'ACCURACY', 90, 200, 20),
    ('accuracy_100', 'Perfection', 'Complete a level with 100% accuracy', 'ACCURACY', 'GOLD', 'ACCURACY', 100, 500, 50)
ON CONFLICT (id) DO NOTHING;

-- User Achievement Unlocks
CREATE TABLE IF NOT EXISTS user_training_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL REFERENCES training_achievements(id),
    
    -- Unlock Info
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    progress INTEGER DEFAULT 0, -- For tracking partial progress
    
    -- Constraints
    UNIQUE(user_id, achievement_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_training_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked ON user_training_achievements(unlocked_at DESC);

-- RLS Policies
ALTER TABLE user_training_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own achievements"
    ON user_training_achievements FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own achievements"
    ON user_training_achievements FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. TRAINING LEADERBOARD — Global and game-specific rankings
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_leaderboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Leaderboard Type
    leaderboard_type TEXT NOT NULL, -- 'GLOBAL', 'GAME_SPECIFIC', 'WEEKLY', 'MONTHLY'
    game_id TEXT, -- NULL for global leaderboards
    
    -- Stats
    total_xp INTEGER DEFAULT 0,
    total_games_completed INTEGER DEFAULT 0,
    total_mastery_points INTEGER DEFAULT 0,
    average_accuracy INTEGER DEFAULT 0,
    
    -- Rankings
    rank INTEGER,
    
    -- Time Period (for weekly/monthly)
    period_start TIMESTAMP WITH TIME ZONE,
    period_end TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, leaderboard_type, game_id, period_start)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leaderboard_type ON training_leaderboard(leaderboard_type);
CREATE INDEX IF NOT EXISTS idx_leaderboard_game_id ON training_leaderboard(game_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_rank ON training_leaderboard(rank);
CREATE INDEX IF NOT EXISTS idx_leaderboard_xp ON training_leaderboard(total_xp DESC);

-- RLS Policies
ALTER TABLE training_leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view leaderboards"
    ON training_leaderboard FOR SELECT
    USING (true);

CREATE POLICY "Users can insert own leaderboard entries"
    ON training_leaderboard FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own leaderboard entries"
    ON training_leaderboard FOR UPDATE
    USING (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. TRAINING DAILY CHALLENGES — Daily challenge system
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_daily_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Challenge Info
    challenge_date DATE NOT NULL UNIQUE,
    game_id TEXT NOT NULL,
    level INTEGER NOT NULL CHECK (level >= 1 AND level <= 10),
    
    -- Requirements
    required_accuracy INTEGER DEFAULT 85,
    bonus_xp_multiplier DECIMAL DEFAULT 2.0,
    bonus_diamonds INTEGER DEFAULT 50,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Challenge Completions
CREATE TABLE IF NOT EXISTS user_daily_challenge_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    challenge_id UUID NOT NULL REFERENCES training_daily_challenges(id) ON DELETE CASCADE,
    
    -- Completion Stats
    accuracy_achieved INTEGER NOT NULL,
    xp_earned INTEGER NOT NULL,
    diamonds_earned INTEGER NOT NULL,
    
    -- Timestamps
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, challenge_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_daily_challenges_date ON training_daily_challenges(challenge_date DESC);
CREATE INDEX IF NOT EXISTS idx_user_challenge_completions_user_id ON user_daily_challenge_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_challenge_completions_completed ON user_daily_challenge_completions(completed_at DESC);

-- RLS Policies
ALTER TABLE training_daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_daily_challenge_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view daily challenges"
    ON training_daily_challenges FOR SELECT
    USING (true);

CREATE POLICY "Users can view own challenge completions"
    ON user_daily_challenge_completions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own challenge completions"
    ON user_daily_challenge_completions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. HELPER FUNCTIONS
-- ───────────────────────────────────────────────────────────────────────────

-- Function to update training_progress.updated_at on row update
CREATE OR REPLACE FUNCTION update_training_progress_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for training_progress
DROP TRIGGER IF EXISTS training_progress_updated_at ON training_progress;
CREATE TRIGGER training_progress_updated_at
    BEFORE UPDATE ON training_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_training_progress_timestamp();

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════
