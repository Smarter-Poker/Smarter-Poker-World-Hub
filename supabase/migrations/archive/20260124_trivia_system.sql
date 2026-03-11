-- ═══════════════════════════════════════════════════════════════════════════
-- TRIVIA SYSTEM - AI-Powered Daily Poker Trivia
-- ═══════════════════════════════════════════════════════════════════════════
-- Creates tables for storing AI-generated trivia questions and player scores

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIVIA QUESTIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trivia_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL CHECK (category IN (
        'poker_history',
        'famous_hands',
        'gto_theory',
        'player_profiles',
        'tournament_facts',
        'rule_knowledge'
    )),
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    question TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_index INTEGER NOT NULL CHECK (correct_index >= 0 AND correct_index <= 3),
    explanation TEXT,
    daily_date DATE NOT NULL,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching daily questions
CREATE INDEX IF NOT EXISTS idx_trivia_questions_daily_date
    ON trivia_questions(daily_date);

-- Index for avoiding duplicate questions
CREATE INDEX IF NOT EXISTS idx_trivia_questions_question
    ON trivia_questions USING gin(to_tsvector('english', question));

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIVIA SCORES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trivia_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT,
    score INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    total_questions INTEGER NOT NULL DEFAULT 10,
    xp_earned INTEGER NOT NULL DEFAULT 0,
    play_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_trivia_scores_date_score
    ON trivia_scores(play_date, score DESC);

-- Index for user history
CREATE INDEX IF NOT EXISTS idx_trivia_scores_user_id
    ON trivia_scores(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIVIA STREAKS TABLE (Track daily play streaks)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trivia_streaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    last_play_date DATE,
    total_games_played INTEGER NOT NULL DEFAULT 0,
    total_correct INTEGER NOT NULL DEFAULT 0,
    total_xp_earned INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE trivia_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_streaks ENABLE ROW LEVEL SECURITY;

-- Questions are readable by everyone
CREATE POLICY "Trivia questions are viewable by all"
    ON trivia_questions FOR SELECT
    USING (true);

-- Only service role can insert/update questions
CREATE POLICY "Service role can manage trivia questions"
    ON trivia_questions FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Scores are readable by everyone (for leaderboard)
CREATE POLICY "Trivia scores are viewable by all"
    ON trivia_scores FOR SELECT
    USING (true);

-- Anyone can insert scores (guest and authenticated)
CREATE POLICY "Anyone can submit trivia scores"
    ON trivia_scores FOR INSERT
    WITH CHECK (true);

-- Users can view their own streaks
CREATE POLICY "Users can view their own streaks"
    ON trivia_streaks FOR SELECT
    USING (auth.uid() = user_id);

-- Users can update their own streaks
CREATE POLICY "Users can update their own streaks"
    ON trivia_streaks FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to update user streak after playing
CREATE OR REPLACE FUNCTION update_trivia_streak(
    p_user_id UUID,
    p_score INTEGER,
    p_correct_count INTEGER,
    p_xp_earned INTEGER
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_last_date DATE;
    v_today DATE := CURRENT_DATE;
    v_new_streak INTEGER;
BEGIN
    -- Get current streak info
    SELECT last_play_date, current_streak INTO v_last_date, v_new_streak
    FROM trivia_streaks
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        -- First time playing - create streak record
        INSERT INTO trivia_streaks (
            user_id, current_streak, best_streak, last_play_date,
            total_games_played, total_correct, total_xp_earned
        ) VALUES (
            p_user_id, 1, 1, v_today, 1, p_correct_count, p_xp_earned
        );
        v_new_streak := 1;
    ELSE
        -- Check if streak continues
        IF v_last_date = v_today - 1 THEN
            v_new_streak := v_new_streak + 1;
        ELSIF v_last_date < v_today - 1 THEN
            v_new_streak := 1;
        END IF;
        -- v_last_date = v_today means already played today, keep streak

        UPDATE trivia_streaks SET
            current_streak = v_new_streak,
            best_streak = GREATEST(best_streak, v_new_streak),
            last_play_date = v_today,
            total_games_played = total_games_played + 1,
            total_correct = total_correct + p_correct_count,
            total_xp_earned = total_xp_earned + p_xp_earned,
            updated_at = NOW()
        WHERE user_id = p_user_id;
    END IF;

    v_result := jsonb_build_object(
        'current_streak', v_new_streak,
        'xp_earned', p_xp_earned
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANT PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════════

GRANT SELECT ON trivia_questions TO anon, authenticated;
GRANT SELECT, INSERT ON trivia_scores TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON trivia_streaks TO authenticated;
GRANT EXECUTE ON FUNCTION update_trivia_streak TO authenticated;
