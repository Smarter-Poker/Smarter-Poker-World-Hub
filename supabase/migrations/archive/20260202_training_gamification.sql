-- Training Gamification Tables
-- Leaderboards, Achievements, Streaks

-- ============================================================================
-- TABLE: training_leaderboard
-- Daily/weekly/all-time rankings
-- ============================================================================

CREATE TABLE IF NOT EXISTS training_leaderboard (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'alltime')),
    period_key TEXT NOT NULL, -- e.g., '2026-02-02' for daily, '2026-W05' for weekly
    
    -- Stats
    sessions_completed INTEGER DEFAULT 0,
    questions_answered INTEGER DEFAULT 0,
    questions_correct INTEGER DEFAULT 0,
    accuracy DECIMAL(5,2) DEFAULT 0,
    total_xp INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(user_id, period_type, period_key)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_period 
    ON training_leaderboard(period_type, period_key);
CREATE INDEX IF NOT EXISTS idx_leaderboard_accuracy 
    ON training_leaderboard(period_type, period_key, accuracy DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_xp 
    ON training_leaderboard(period_type, period_key, total_xp DESC);

-- ============================================================================
-- TABLE: training_achievements
-- Achievement definitions and user progress
-- ============================================================================

CREATE TABLE IF NOT EXISTS training_achievement_definitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    category TEXT NOT NULL, -- 'accuracy', 'streak', 'volume', 'mastery'
    threshold INTEGER NOT NULL,
    diamond_reward INTEGER DEFAULT 0,
    rarity TEXT DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_user_achievements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    achievement_id TEXT REFERENCES training_achievement_definitions(id),
    unlocked_at TIMESTAMPTZ DEFAULT now(),
    progress INTEGER DEFAULT 0,
    
    UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements 
    ON training_user_achievements(user_id);

-- ============================================================================
-- TABLE: training_streaks
-- Daily training streak tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS training_streaks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_training_date DATE,
    streak_start_date DATE,
    
    -- Rewards claimed for milestones
    milestones_claimed JSONB DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- SEED: Achievement Definitions
-- ============================================================================

INSERT INTO training_achievement_definitions (id, name, description, icon, category, threshold, diamond_reward, rarity) VALUES
-- Accuracy achievements
('first_perfect', 'Perfect Round', 'Complete a level with 100% accuracy', '🎯', 'accuracy', 1, 50, 'common'),
('accuracy_master', 'Accuracy Master', 'Achieve 95%+ accuracy across 10 sessions', '🏆', 'accuracy', 10, 200, 'rare'),
('flawless_10', 'Flawless Ten', 'Get 10 perfect rounds', '💎', 'accuracy', 10, 500, 'epic'),
('flawless_50', 'GTO God', 'Get 50 perfect rounds', '👑', 'accuracy', 50, 2000, 'legendary'),

-- Streak achievements  
('streak_3', 'Getting Started', '3 day training streak', '🔥', 'streak', 3, 25, 'common'),
('streak_7', 'Week Warrior', '7 day training streak', '⚡', 'streak', 7, 100, 'rare'),
('streak_30', 'Monthly Master', '30 day training streak', '🌟', 'streak', 30, 500, 'epic'),
('streak_100', 'Century Grinder', '100 day training streak', '🏅', 'streak', 100, 2500, 'legendary'),

-- Volume achievements
('sessions_10', 'Committed', 'Complete 10 training sessions', '📚', 'volume', 10, 50, 'common'),
('sessions_50', 'Dedicated', 'Complete 50 training sessions', '📖', 'volume', 50, 200, 'rare'),
('sessions_100', 'Scholar', 'Complete 100 training sessions', '🎓', 'volume', 100, 500, 'epic'),
('sessions_500', 'Training Legend', 'Complete 500 training sessions', '👨‍🎓', 'volume', 500, 2000, 'legendary'),

-- Mastery achievements
('questions_100', 'Century Club', 'Answer 100 questions correctly', '💯', 'mastery', 100, 50, 'common'),
('questions_500', 'Half K', 'Answer 500 questions correctly', '🎖️', 'mastery', 500, 200, 'rare'),
('questions_1000', 'Thousand Strong', 'Answer 1000 questions correctly', '🏆', 'mastery', 1000, 500, 'epic'),
('questions_5000', 'GTO Grandmaster', 'Answer 5000 questions correctly', '🌟', 'mastery', 5000, 3000, 'legendary')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE training_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_streaks ENABLE ROW LEVEL SECURITY;

-- Public read for leaderboards and achievement defs
CREATE POLICY "Anyone can view leaderboards"
    ON training_leaderboard FOR SELECT USING (true);
CREATE POLICY "Anyone can view achievement definitions"
    ON training_achievement_definitions FOR SELECT USING (true);

-- Users can view their own achievements
CREATE POLICY "Users can view own achievements"
    ON training_user_achievements FOR SELECT
    USING (auth.uid() = user_id);

-- Users can view their own streaks
CREATE POLICY "Users can view own streaks"
    ON training_streaks FOR SELECT
    USING (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service manages leaderboards"
    ON training_leaderboard FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service manages achievements"
    ON training_user_achievements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service manages streaks"
    ON training_streaks FOR ALL USING (true) WITH CHECK (true);
