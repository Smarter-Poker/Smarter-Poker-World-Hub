-- Training Challenges System
-- Weekly and Monthly rotating challenges with rewards

-- ============================================================================
-- TABLE: training_challenge_definitions
-- Challenge templates that rotate weekly/monthly
-- ============================================================================

CREATE TABLE IF NOT EXISTS training_challenge_definitions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    challenge_type TEXT NOT NULL CHECK (challenge_type IN ('weekly', 'monthly')),
    target_type TEXT NOT NULL, -- 'sessions', 'accuracy_avg', 'category_sessions', 'perfect_rounds', 'streak_days'
    target_value INTEGER NOT NULL,
    target_category TEXT, -- optional: specific category requirement
    diamond_reward INTEGER DEFAULT 100,
    icon TEXT DEFAULT '🎯',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- TABLE: training_user_challenges
-- User progress on active challenges
-- ============================================================================

CREATE TABLE IF NOT EXISTS training_user_challenges (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    challenge_id TEXT REFERENCES training_challenge_definitions(id) ON DELETE CASCADE,
    period_key TEXT NOT NULL, -- '2026-W05' for weekly, '2026-02' for monthly
    progress INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT false,
    claimed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    claimed_at TIMESTAMPTZ,
    
    UNIQUE(user_id, challenge_id, period_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_challenges_user 
    ON training_user_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_challenges_period 
    ON training_user_challenges(period_key);
CREATE INDEX IF NOT EXISTS idx_challenge_defs_type 
    ON training_challenge_definitions(challenge_type);

-- ============================================================================
-- SEED: Challenge Definitions
-- ============================================================================

INSERT INTO training_challenge_definitions (id, name, description, challenge_type, target_type, target_value, target_category, diamond_reward, icon) VALUES
-- Weekly Challenges
('weekly_sessions_5', 'Training Warrior', 'Complete 5 training sessions this week', 'weekly', 'sessions', 5, NULL, 75, '⚔️'),
('weekly_sessions_10', 'Training Master', 'Complete 10 training sessions this week', 'weekly', 'sessions', 10, NULL, 150, '🏆'),
('weekly_perfect_3', 'Flawless Week', 'Get 3 perfect rounds this week', 'weekly', 'perfect_rounds', 3, NULL, 200, '💎'),
('weekly_accuracy_80', 'Accuracy Focus', 'Maintain 80%+ average accuracy this week', 'weekly', 'accuracy_avg', 80, NULL, 100, '🎯'),
('weekly_preflop_5', 'Preflop Grinder', 'Complete 5 preflop training games', 'weekly', 'category_sessions', 5, 'preflop', 100, '🃏'),
('weekly_postflop_5', 'Postflop Pro', 'Complete 5 postflop training games', 'weekly', 'category_sessions', 5, 'postflop', 100, '🔥'),

-- Monthly Challenges
('monthly_sessions_30', 'Monthly Dedication', 'Complete 30 training sessions this month', 'monthly', 'sessions', 30, NULL, 500, '📅'),
('monthly_perfect_10', 'Perfect Month', 'Get 10 perfect rounds this month', 'monthly', 'perfect_rounds', 10, NULL, 750, '👑'),
('monthly_streak_14', 'Two Week Streak', 'Reach a 14-day training streak', 'monthly', 'streak_days', 14, NULL, 400, '🔥'),
('monthly_accuracy_85', 'Elite Accuracy', 'Maintain 85%+ average accuracy this month', 'monthly', 'accuracy_avg', 85, NULL, 300, '🎯'),
('monthly_all_categories', 'Well Rounded', 'Train in at least 5 different categories', 'monthly', 'unique_categories', 5, NULL, 350, '🌟')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE training_challenge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_user_challenges ENABLE ROW LEVEL SECURITY;

-- Anyone can view challenge definitions
CREATE POLICY "Anyone can view challenges"
    ON training_challenge_definitions FOR SELECT USING (true);

-- Users can view their own challenge progress
CREATE POLICY "Users can view own challenge progress"
    ON training_user_challenges FOR SELECT
    USING (auth.uid() = user_id);

-- Service role manages all
CREATE POLICY "Service manages challenge definitions"
    ON training_challenge_definitions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service manages user challenges"
    ON training_user_challenges FOR ALL USING (true) WITH CHECK (true);
