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
