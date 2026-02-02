-- ═══════════════════════════════════════════════════════════════════════════
-- 💎 MEMORY MATRIX - DIAMOND ECONOMY TABLES
-- Real diamond tracking with Supabase instead of localStorage
-- ═══════════════════════════════════════════════════════════════════════════

-- User Diamond Balances
CREATE TABLE IF NOT EXISTS user_diamonds (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 100,
    lifetime_earned INTEGER NOT NULL DEFAULT 0,
    lifetime_spent INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Diamond Transaction Log
CREATE TABLE IF NOT EXISTS diamond_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('earn', 'spend', 'purchase', 'bonus', 'refund')),
    source TEXT NOT NULL,
    -- Source examples: 'game_reward', 'streak_bonus', 'iap', 'game_cost', 'level_complete', 'daily_challenge'
    metadata JSONB,
    -- Metadata can include: game_mode, level, score, accuracy, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VIP Subscriptions (Stripe integration)
CREATE TABLE IF NOT EXISTS vip_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT UNIQUE,
    stripe_customer_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid', 'trialing')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Memory Game Sessions (for analytics and rewards)
CREATE TABLE IF NOT EXISTS memory_game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_mode TEXT NOT NULL CHECK (game_mode IN ('range', 'speed', 'pressure', 'pattern', 'mixed', 'spot', 'tournament')),
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 10),
    scenario_id TEXT,
    score INTEGER,
    accuracy DECIMAL(5,2),
    time_taken INTEGER, -- seconds
    diamonds_spent INTEGER DEFAULT 0,
    diamonds_earned INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily Streaks
CREATE TABLE IF NOT EXISTS user_daily_streaks (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_streak INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    last_completed_date DATE,
    total_days_played INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES for performance
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_diamond_transactions_user_id ON diamond_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_diamond_transactions_created_at ON diamond_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diamond_transactions_type ON diamond_transactions(type);

CREATE INDEX IF NOT EXISTS idx_vip_subscriptions_user_id ON vip_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_vip_subscriptions_status ON vip_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_vip_subscriptions_stripe_sub_id ON vip_subscriptions(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_memory_sessions_user_id ON memory_game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_sessions_created_at ON memory_game_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_sessions_game_mode ON memory_game_sessions(game_mode);
CREATE INDEX IF NOT EXISTS idx_memory_sessions_level ON memory_game_sessions(level);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE user_diamonds ENABLE ROW LEVEL SECURITY;
ALTER TABLE diamond_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_daily_streaks ENABLE ROW LEVEL SECURITY;

-- Users can read their own diamond balance
CREATE POLICY "Users can view own diamonds"
    ON user_diamonds FOR SELECT
    USING (auth.uid() = user_id);

-- Users can view their own transactions
CREATE POLICY "Users can view own transactions"
    ON diamond_transactions FOR SELECT
    USING (auth.uid() = user_id);

-- Users can view their own VIP status
CREATE POLICY "Users can view own VIP status"
    ON vip_subscriptions FOR SELECT
    USING (auth.uid() = user_id);

-- Users can view their own game sessions
CREATE POLICY "Users can view own sessions"
    ON memory_game_sessions FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own game sessions
CREATE POLICY "Users can create own sessions"
    ON memory_game_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can view their own streaks
CREATE POLICY "Users can view own streaks"
    ON user_daily_streaks FOR SELECT
    USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS for diamond operations
-- ═══════════════════════════════════════════════════════════════════════════

-- Initialize diamonds for new user
CREATE OR REPLACE FUNCTION initialize_user_diamonds()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_diamonds (user_id, balance, lifetime_earned)
    VALUES (NEW.id, 100, 100)
    ON CONFLICT (user_id) DO NOTHING;
    
    INSERT INTO user_daily_streaks (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to initialize diamonds on user creation
DROP TRIGGER IF EXISTS on_auth_user_created_diamonds ON auth.users;
CREATE TRIGGER on_auth_user_created_diamonds
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION initialize_user_diamonds();

-- Deduct diamonds (for game cost)
CREATE OR REPLACE FUNCTION deduct_diamonds(
    p_user_id UUID,
    p_amount INTEGER,
    p_source TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_current_balance INTEGER;
    v_new_balance INTEGER;
BEGIN
    -- Get current balance
    SELECT balance INTO v_current_balance
    FROM user_diamonds
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    -- Check if user exists
    IF v_current_balance IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;
    
    -- Check if sufficient balance
    IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient diamonds',
            'balance', v_current_balance,
            'required', p_amount
        );
    END IF;
    
    -- Deduct diamonds
    v_new_balance := v_current_balance - p_amount;
    
    UPDATE user_diamonds
    SET balance = v_new_balance,
        lifetime_spent = lifetime_spent + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Log transaction
    INSERT INTO diamond_transactions (user_id, amount, type, source, metadata)
    VALUES (p_user_id, -p_amount, 'spend', p_source, p_metadata);
    
    RETURN jsonb_build_object(
        'success', true,
        'balance', v_new_balance,
        'charged', p_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Award diamonds (for rewards)
CREATE OR REPLACE FUNCTION award_diamonds(
    p_user_id UUID,
    p_amount INTEGER,
    p_source TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    v_new_balance INTEGER;
BEGIN
    -- Award diamonds
    UPDATE user_diamonds
    SET balance = balance + p_amount,
        lifetime_earned = lifetime_earned + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_new_balance;
    
    -- Check if user exists
    IF v_new_balance IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;
    
    -- Log transaction
    INSERT INTO diamond_transactions (user_id, amount, type, source, metadata)
    VALUES (p_user_id, p_amount, 'earn', p_source, p_metadata);
    
    RETURN jsonb_build_object(
        'success', true,
        'balance', v_new_balance,
        'awarded', p_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check VIP status
CREATE OR REPLACE FUNCTION is_vip(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_vip BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1
        FROM vip_subscriptions
        WHERE user_id = p_user_id
        AND status = 'active'
        AND current_period_end > NOW()
    ) INTO v_is_vip;
    
    RETURN COALESCE(v_is_vip, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get diamond balance
CREATE OR REPLACE FUNCTION get_diamond_balance(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_balance INTEGER;
BEGIN
    SELECT balance INTO v_balance
    FROM user_diamonds
    WHERE user_id = p_user_id;
    
    RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANT PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION deduct_diamonds TO authenticated;
GRANT EXECUTE ON FUNCTION award_diamonds TO authenticated;
GRANT EXECUTE ON FUNCTION is_vip TO authenticated;
GRANT EXECUTE ON FUNCTION get_diamond_balance TO authenticated;
-- ═══════════════════════════════════════════════════════════════════════════
-- 💎 MEMORY MATRIX - LEADERBOARDS & DAILY CHALLENGES
-- Additional tables for competitive features
-- ═══════════════════════════════════════════════════════════════════════════

-- Leaderboards (global and level-specific)
CREATE TABLE IF NOT EXISTS memory_leaderboards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_mode TEXT NOT NULL CHECK (game_mode IN ('range', 'speed', 'pressure', 'pattern', 'mixed', 'spot', 'tournament')),
    level INTEGER CHECK (level BETWEEN 1 AND 10), -- NULL for global leaderboard
    score INTEGER NOT NULL,
    accuracy DECIMAL(5,2) NOT NULL,
    time_taken INTEGER NOT NULL, -- seconds
    perfect_game BOOLEAN DEFAULT FALSE, -- 100% accuracy
    session_id UUID REFERENCES memory_game_sessions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, game_mode, level) -- One entry per user per mode/level
);

-- Daily Challenges
CREATE TABLE IF NOT EXISTS memory_daily_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    challenge_date DATE NOT NULL UNIQUE,
    game_mode TEXT NOT NULL CHECK (game_mode IN ('range', 'speed', 'pressure', 'pattern', 'mixed')),
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 10),
    scenario_id TEXT NOT NULL,
    target_accuracy DECIMAL(5,2) NOT NULL, -- e.g., 90.00
    target_time INTEGER, -- seconds, NULL for no time limit
    diamond_reward INTEGER NOT NULL DEFAULT 50,
    bonus_reward INTEGER NOT NULL DEFAULT 100, -- for perfect completion
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily Challenge Completions
CREATE TABLE IF NOT EXISTS memory_challenge_completions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    challenge_id UUID NOT NULL REFERENCES memory_daily_challenges(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    accuracy DECIMAL(5,2) NOT NULL,
    time_taken INTEGER NOT NULL,
    perfect_completion BOOLEAN DEFAULT FALSE,
    diamonds_earned INTEGER NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, challenge_id) -- One completion per user per challenge
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES for performance
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_leaderboards_game_mode ON memory_leaderboards(game_mode);
CREATE INDEX IF NOT EXISTS idx_leaderboards_level ON memory_leaderboards(level);
CREATE INDEX IF NOT EXISTS idx_leaderboards_score ON memory_leaderboards(score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboards_created_at ON memory_leaderboards(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_challenges_date ON memory_daily_challenges(challenge_date DESC);
CREATE INDEX IF NOT EXISTS idx_challenge_completions_user_id ON memory_challenge_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_completions_challenge_id ON memory_challenge_completions(challenge_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE memory_leaderboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_challenge_completions ENABLE ROW LEVEL SECURITY;

-- Everyone can view leaderboards
DROP POLICY IF EXISTS "Anyone can view leaderboards" ON memory_leaderboards;
CREATE POLICY "Anyone can view leaderboards"
    ON memory_leaderboards FOR SELECT
    USING (true);

-- Users can insert/update their own leaderboard entries
DROP POLICY IF EXISTS "Users can manage own leaderboard entries" ON memory_leaderboards;
CREATE POLICY "Users can manage own leaderboard entries"
    ON memory_leaderboards FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Everyone can view daily challenges
DROP POLICY IF EXISTS "Anyone can view daily challenges" ON memory_daily_challenges;
CREATE POLICY "Anyone can view daily challenges"
    ON memory_daily_challenges FOR SELECT
    USING (true);

-- Users can view their own challenge completions
DROP POLICY IF EXISTS "Users can view own completions" ON memory_challenge_completions;
CREATE POLICY "Users can view own completions"
    ON memory_challenge_completions FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own challenge completions
DROP POLICY IF EXISTS "Users can create own completions" ON memory_challenge_completions;
CREATE POLICY "Users can create own completions"
    ON memory_challenge_completions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS for leaderboards and challenges
-- ═══════════════════════════════════════════════════════════════════════════

-- Update leaderboard entry
CREATE OR REPLACE FUNCTION update_leaderboard(
    p_user_id UUID,
    p_game_mode TEXT,
    p_level INTEGER,
    p_score INTEGER,
    p_accuracy DECIMAL(5,2),
    p_time_taken INTEGER,
    p_session_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_current_score INTEGER;
    v_perfect_game BOOLEAN;
BEGIN
    v_perfect_game := (p_accuracy >= 100.00);
    
    -- Get current best score
    SELECT score INTO v_current_score
    FROM memory_leaderboards
    WHERE user_id = p_user_id
    AND game_mode = p_game_mode
    AND (level = p_level OR (level IS NULL AND p_level IS NULL));
    
    -- Only update if new score is better
    IF v_current_score IS NULL OR p_score > v_current_score THEN
        INSERT INTO memory_leaderboards (
            user_id, game_mode, level, score, accuracy, time_taken, perfect_game, session_id
        ) VALUES (
            p_user_id, p_game_mode, p_level, p_score, p_accuracy, p_time_taken, v_perfect_game, p_session_id
        )
        ON CONFLICT (user_id, game_mode, level)
        DO UPDATE SET
            score = EXCLUDED.score,
            accuracy = EXCLUDED.accuracy,
            time_taken = EXCLUDED.time_taken,
            perfect_game = EXCLUDED.perfect_game,
            session_id = EXCLUDED.session_id,
            created_at = NOW();
        
        RETURN jsonb_build_object(
            'success', true,
            'new_record', true,
            'score', p_score
        );
    ELSE
        RETURN jsonb_build_object(
            'success', true,
            'new_record', false,
            'score', v_current_score
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get today's daily challenge
CREATE OR REPLACE FUNCTION get_daily_challenge()
RETURNS JSONB AS $$
DECLARE
    v_challenge RECORD;
    v_user_completed BOOLEAN;
BEGIN
    -- Get today's challenge
    SELECT * INTO v_challenge
    FROM memory_daily_challenges
    WHERE challenge_date = CURRENT_DATE;
    
    -- Check if current user has completed it
    IF auth.uid() IS NOT NULL THEN
        SELECT EXISTS(
            SELECT 1 FROM memory_challenge_completions
            WHERE user_id = auth.uid()
            AND challenge_id = v_challenge.id
        ) INTO v_user_completed;
    ELSE
        v_user_completed := false;
    END IF;
    
    IF v_challenge IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No challenge for today'
        );
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'challenge', row_to_json(v_challenge),
        'completed', v_user_completed
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Complete daily challenge
CREATE OR REPLACE FUNCTION complete_daily_challenge(
    p_user_id UUID,
    p_challenge_id UUID,
    p_score INTEGER,
    p_accuracy DECIMAL(5,2),
    p_time_taken INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_challenge RECORD;
    v_perfect BOOLEAN;
    v_diamonds_earned INTEGER;
BEGIN
    -- Get challenge details
    SELECT * INTO v_challenge
    FROM memory_daily_challenges
    WHERE id = p_challenge_id;
    
    IF v_challenge IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Challenge not found'
        );
    END IF;
    
    -- Check if already completed
    IF EXISTS(
        SELECT 1 FROM memory_challenge_completions
        WHERE user_id = p_user_id AND challenge_id = p_challenge_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Challenge already completed'
        );
    END IF;
    
    -- Check if perfect completion
    v_perfect := (
        p_accuracy >= v_challenge.target_accuracy
        AND (v_challenge.target_time IS NULL OR p_time_taken <= v_challenge.target_time)
    );
    
    -- Calculate diamonds
    v_diamonds_earned := v_challenge.diamond_reward;
    IF v_perfect THEN
        v_diamonds_earned := v_diamonds_earned + v_challenge.bonus_reward;
    END IF;
    
    -- Record completion
    INSERT INTO memory_challenge_completions (
        user_id, challenge_id, score, accuracy, time_taken, perfect_completion, diamonds_earned
    ) VALUES (
        p_user_id, p_challenge_id, p_score, p_accuracy, p_time_taken, v_perfect, v_diamonds_earned
    );
    
    -- Award diamonds
    PERFORM award_diamonds(
        p_user_id,
        v_diamonds_earned,
        'daily_challenge',
        jsonb_build_object(
            'challenge_id', p_challenge_id,
            'perfect', v_perfect
        )
    );
    
    -- Update streak
    UPDATE user_daily_streaks
    SET
        current_streak = CASE
            WHEN last_completed_date = CURRENT_DATE - INTERVAL '1 day' THEN current_streak + 1
            WHEN last_completed_date = CURRENT_DATE THEN current_streak
            ELSE 1
        END,
        longest_streak = GREATEST(
            longest_streak,
            CASE
                WHEN last_completed_date = CURRENT_DATE - INTERVAL '1 day' THEN current_streak + 1
                WHEN last_completed_date = CURRENT_DATE THEN current_streak
                ELSE 1
            END
        ),
        last_completed_date = CURRENT_DATE,
        total_days_played = CASE
            WHEN last_completed_date != CURRENT_DATE THEN total_days_played + 1
            ELSE total_days_played
        END,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'perfect', v_perfect,
        'diamonds_earned', v_diamonds_earned
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANT PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION update_leaderboard TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_challenge TO authenticated;
GRANT EXECUTE ON FUNCTION get_daily_challenge TO anon;
GRANT EXECUTE ON FUNCTION complete_daily_challenge TO authenticated;
-- ═══════════════════════════════════════════════════════════════════════════
-- 💎 MEMORY MATRIX - ACHIEVEMENTS SYSTEM
-- Track user achievements and badges
-- ═══════════════════════════════════════════════════════════════════════════

-- Achievements table
CREATE TABLE IF NOT EXISTS memory_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    achievement_key TEXT NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    UNIQUE(user_id, achievement_key)
);

-- Achievement definitions (reference table)
CREATE TABLE IF NOT EXISTS memory_achievement_definitions (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '🏆',
    category TEXT NOT NULL DEFAULT 'general',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert achievement definitions
INSERT INTO memory_achievement_definitions (key, name, description, icon, category, sort_order) VALUES
    ('first_game', 'First Match', 'Complete your first memory game', '⭐', 'basics', 1),
    ('perfect_memory', 'Perfect Memory', 'Complete a game with 100% accuracy', '💯', 'mastery', 2),
    ('speed_demon', 'Speed Demon', 'Complete a game in under 60 seconds', '⚡', 'speed', 3),
    ('level_5', 'Halfway There', 'Reach Level 5', '📈', 'progress', 4),
    ('level_10', 'Level Master', 'Complete Level 10', '🎯', 'progress', 5),
    ('streak_3', '3-Day Streak', 'Play 3 days in a row', '🔥', 'consistency', 6),
    ('streak_7', 'Week Warrior', 'Play 7 days in a row', '💪', 'consistency', 7),
    ('streak_30', 'Monthly Master', 'Play 30 days in a row', '👑', 'consistency', 8),
    ('diamond_100', 'Diamond Starter', 'Earn 100 diamonds', '💎', 'economy', 9),
    ('diamond_1000', 'Diamond Hunter', 'Earn 1,000 diamonds', '💰', 'economy', 10),
    ('games_10', 'Getting Started', 'Complete 10 games', '🎮', 'games', 11),
    ('games_50', 'Dedicated Player', 'Complete 50 games', '🕹️', 'games', 12),
    ('games_100', 'Memory Veteran', 'Complete 100 games', '🏅', 'games', 13),
    ('grok_5', 'AI Explorer', 'Complete 5 AI-generated scenarios', '🤖', 'ai', 14),
    ('grok_25', 'Grok Genius', 'Complete 25 AI-generated scenarios', '🧠', 'ai', 15),
    ('daily_10', 'Daily Challenger', 'Complete 10 daily challenges', '📅', 'challenges', 16),
    ('perfect_daily', 'Perfect Day', 'Complete a daily challenge with 100% accuracy', '🌟', 'challenges', 17)
ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    category = EXCLUDED.category,
    sort_order = EXCLUDED.sort_order;

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON memory_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_key ON memory_achievements(achievement_key);
CREATE INDEX IF NOT EXISTS idx_achievement_defs_category ON memory_achievement_definitions(category);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE memory_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_achievement_definitions ENABLE ROW LEVEL SECURITY;

-- Users can view their own achievements
DROP POLICY IF EXISTS "Users can view own achievements" ON memory_achievements;
CREATE POLICY "Users can view own achievements"
    ON memory_achievements FOR SELECT
    USING (auth.uid() = user_id);

-- Users can earn achievements (insert)
DROP POLICY IF EXISTS "Users can earn achievements" ON memory_achievements;
CREATE POLICY "Users can earn achievements"
    ON memory_achievements FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Everyone can view achievement definitions
DROP POLICY IF EXISTS "Everyone can view achievement definitions" ON memory_achievement_definitions;
CREATE POLICY "Everyone can view achievement definitions"
    ON memory_achievement_definitions FOR SELECT
    USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Unlock achievement
CREATE OR REPLACE FUNCTION unlock_achievement(
    p_user_id UUID,
    p_achievement_key TEXT,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB AS $$
DECLARE
    v_already_unlocked BOOLEAN;
    v_achievement RECORD;
BEGIN
    -- Check if already unlocked
    SELECT EXISTS(
        SELECT 1 FROM memory_achievements
        WHERE user_id = p_user_id AND achievement_key = p_achievement_key
    ) INTO v_already_unlocked;
    
    IF v_already_unlocked THEN
        RETURN jsonb_build_object(
            'success', false,
            'already_unlocked', true
        );
    END IF;
    
    -- Get achievement definition
    SELECT * INTO v_achievement
    FROM memory_achievement_definitions
    WHERE key = p_achievement_key;
    
    IF v_achievement IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Achievement not found'
        );
    END IF;
    
    -- Unlock the achievement
    INSERT INTO memory_achievements (user_id, achievement_key, metadata)
    VALUES (p_user_id, p_achievement_key, p_metadata);
    
    RETURN jsonb_build_object(
        'success', true,
        'achievement', jsonb_build_object(
            'key', v_achievement.key,
            'name', v_achievement.name,
            'description', v_achievement.description,
            'icon', v_achievement.icon
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user achievements with definitions
CREATE OR REPLACE FUNCTION get_user_achievements(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'key', d.key,
            'name', d.name,
            'description', d.description,
            'icon', d.icon,
            'category', d.category,
            'unlocked', a.unlocked_at IS NOT NULL,
            'unlocked_at', a.unlocked_at
        ) ORDER BY d.sort_order
    )
    INTO v_result
    FROM memory_achievement_definitions d
    LEFT JOIN memory_achievements a ON a.achievement_key = d.key AND a.user_id = p_user_id;
    
    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANT PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION unlock_achievement TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_achievements TO authenticated;
-- ═══════════════════════════════════════════════════════════════════════════
-- 💎 MEMORY MATRIX - ELO RATING COLUMN
-- Add memory_elo column to profiles table
-- ═══════════════════════════════════════════════════════════════════════════

-- Add ELO column to profiles if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'memory_elo'
    ) THEN
        ALTER TABLE profiles ADD COLUMN memory_elo INTEGER DEFAULT 1200;
    END IF;
END $$;

-- Create index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_memory_elo ON profiles(memory_elo DESC);

-- Create view for ELO leaderboard
CREATE OR REPLACE VIEW memory_elo_leaderboard AS
SELECT 
    p.id,
    p.username,
    p.avatar_url,
    p.memory_elo,
    CASE 
        WHEN p.memory_elo >= 2000 THEN 'GTO Master'
        WHEN p.memory_elo >= 1800 THEN 'Diamond'
        WHEN p.memory_elo >= 1600 THEN 'Platinum'
        WHEN p.memory_elo >= 1400 THEN 'Gold'
        WHEN p.memory_elo >= 1200 THEN 'Silver'
        WHEN p.memory_elo >= 1000 THEN 'Bronze'
        ELSE 'Novice'
    END as rank_title,
    RANK() OVER (ORDER BY p.memory_elo DESC) as global_rank
FROM profiles p
WHERE p.memory_elo IS NOT NULL
ORDER BY p.memory_elo DESC;

-- Grant access to the view
GRANT SELECT ON memory_elo_leaderboard TO authenticated;
GRANT SELECT ON memory_elo_leaderboard TO anon;
