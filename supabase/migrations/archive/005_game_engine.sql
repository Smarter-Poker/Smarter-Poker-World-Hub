-- ═══════════════════════════════════════════════════════════════════════════
-- GAME ENGINE MIGRATION - Training Levels & History Tracking
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- Creates the progression system that sits on top of God Mode GTO data.
-- Defines levels, tracks user history, prevents question repetition.
-- 
-- ═══════════════════════════════════════════════════════════════════════════

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE 1: THE RECIPE BOOK (Defines what makes Level 1 vs Level 10)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS training_levels (
    level_id INT PRIMARY KEY,
    game_mode TEXT NOT NULL, -- 'Cash', 'MTT', 'Spin'
    street_filter TEXT, -- 'Flop', 'Turn', 'River', or 'All'
    stack_filter INT[], -- e.g. [100], or [20, 40, 60]
    difficulty_rating TEXT, -- 'Easy' (Pure strategies), 'Hard' (Mixed strategies)
    questions_per_round INT DEFAULT 20,
    passing_threshold INT DEFAULT 85, -- % accuracy required to pass
    level_name TEXT, -- Display name for UI
    description TEXT, -- What this level teaches
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE 2: THE USER MEMORY (Ensures we NEVER repeat a question)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS user_question_history (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    scenario_hash TEXT NOT NULL, -- References solved_spots_gold(scenario_hash)
    level_id INT REFERENCES training_levels(level_id),
    result TEXT NOT NULL CHECK (result IN ('Correct', 'Incorrect')),
    user_action TEXT, -- 'Fold', 'Call', 'Raise'
    gto_action TEXT, -- What GTO recommended
    ev_loss DECIMAL(10, 2), -- EV loss in bb
    played_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, scenario_hash)
);

-- Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_history_user ON user_question_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_history_level ON user_question_history(level_id);
CREATE INDEX IF NOT EXISTS idx_user_history_result ON user_question_history(result);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE 3: USER LEVEL PROGRESS (Track which levels user has completed)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS user_level_progress (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    level_id INT REFERENCES training_levels(level_id),
    status TEXT NOT NULL CHECK (status IN ('locked', 'in_progress', 'passed', 'mastered')),
    accuracy DECIMAL(5, 2), -- Best accuracy % achieved
    attempts INT DEFAULT 0,
    best_score INT, -- Best raw score (# correct)
    last_played_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, level_id)
);

CREATE INDEX IF NOT EXISTS idx_user_progress_user ON user_level_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_status ON user_level_progress(status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SEED DATA: THE FIRST 10 LEVELS (Example Recipes)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO training_levels (
    level_id, 
    game_mode, 
    street_filter, 
    stack_filter, 
    difficulty_rating,
    questions_per_round,
    passing_threshold,
    level_name,
    description
)
VALUES 
    -- BEGINNER: Cash Game Flops
    (1, 'Cash', 'Flop', '{100}', 'Easy', 20, 85, 
     'Flop Fundamentals', 
     'Master basic flop play at 100bb in cash games. Pure strategies only.'),
    
    (2, 'Cash', 'Turn', '{100}', 'Easy', 20, 85,
     'Turn Tactics',
     'Learn optimal turn play at 100bb. Pure strategies only.'),
    
    (3, 'Cash', 'River', '{100}', 'Easy', 20, 85,
     'River Mastery',
     'Perfect your river decisions at 100bb. Pure strategies only.'),
    
    -- INTERMEDIATE: All Streets
    (4, 'Cash', 'All', '{100}', 'Easy', 25, 85,
     'Full Street Mix',
     'Test your skills across all streets at 100bb. Pure strategies.'),
    
    -- ADVANCED: Mixed Strategies
    (5, 'Cash', 'Flop', '{100}', 'Hard', 20, 80,
     'Advanced Flops',
     'Handle complex flop spots with mixed strategies at 100bb.'),
    
    (6, 'Cash', 'Turn', '{100}', 'Hard', 20, 80,
     'Advanced Turns',
     'Navigate tricky turn decisions with mixed frequencies.'),
    
    -- TOURNAMENT: ICM Basics
    (7, 'MTT', 'Flop', '{40}', 'Easy', 20, 85,
     'MTT Fundamentals',
     'Learn ICM-adjusted play on flops at 40bb.'),
    
    (8, 'MTT', 'Turn', '{40}', 'Easy', 20, 85,
     'MTT Turn Play',
     'Master turn decisions under ICM pressure at 40bb.'),
    
    -- SHORT STACK: Push/Fold Territory
    (9, 'MTT', 'All', '{20}', 'Easy', 25, 85,
     'Short Stack Survival',
     'Perfect your 20bb push/fold game in tournaments.'),
    
    -- MASTERY: All Combined
    (10, 'Cash', 'All', '{60, 80, 100}', 'Hard', 30, 90,
     'Cash Game Mastery',
     'Ultimate test: all streets, multiple stacks, mixed strategies.')
ON CONFLICT (level_id) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ROW LEVEL SECURITY (RLS)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Enable RLS on user tables
ALTER TABLE user_question_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_level_progress ENABLE ROW LEVEL SECURITY;

-- Policies for user_question_history
CREATE POLICY "Users see own history" 
    ON user_question_history 
    FOR ALL 
    USING (auth.uid() = user_id);

-- Policies for user_level_progress
CREATE POLICY "Users see own progress" 
    ON user_level_progress 
    FOR ALL 
    USING (auth.uid() = user_id);

-- Public read access to training levels
CREATE POLICY "Public can view levels" 
    ON training_levels 
    FOR SELECT 
    USING (true);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- HELPER FUNCTIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Function to get next question for user (excludes already played)
CREATE OR REPLACE FUNCTION get_next_training_question(
    p_user_id UUID,
    p_level_id INT
)
RETURNS TABLE (
    scenario_hash TEXT,
    street TEXT,
    stack_depth INT,
    game_type TEXT,
    board_cards TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ssg.scenario_hash,
        ssg.street,
        ssg.stack_depth,
        ssg.game_type,
        ssg.board_cards
    FROM solved_spots_gold ssg
    INNER JOIN training_levels tl ON tl.level_id = p_level_id
    WHERE 
        -- Match level criteria
        ssg.game_type = tl.game_mode
        AND (tl.street_filter = 'All' OR ssg.street = tl.street_filter)
        AND (tl.stack_filter IS NULL OR ssg.stack_depth = ANY(tl.stack_filter))
        -- Exclude already played
        AND NOT EXISTS (
            SELECT 1 FROM user_question_history
            WHERE user_id = p_user_id
              AND scenario_hash = ssg.scenario_hash
        )
        -- Filter by difficulty (Easy = pure strategies only)
        AND (
            tl.difficulty_rating = 'Hard'
            OR NOT EXISTS (
                SELECT 1 FROM jsonb_each(ssg.strategy_matrix)
                WHERE value->>'is_mixed' = 'true'
            )
        )
    ORDER BY RANDOM()
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate user level stats
CREATE OR REPLACE FUNCTION get_user_level_stats(p_user_id UUID, p_level_id INT)
RETURNS TABLE (
    total_questions INT,
    correct_answers INT,
    accuracy DECIMAL(5, 2),
    avg_ev_loss DECIMAL(10, 2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INT as total_questions,
        SUM(CASE WHEN result = 'Correct' THEN 1 ELSE 0 END)::INT as correct_answers,
        ROUND(
            (SUM(CASE WHEN result = 'Correct' THEN 1 ELSE 0 END)::DECIMAL / 
             NULLIF(COUNT(*), 0)) * 100,
            2
        ) as accuracy,
        ROUND(AVG(ev_loss), 2) as avg_ev_loss
    FROM user_question_history
    WHERE user_id = p_user_id
      AND level_id = p_level_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- Tables Created:
-- 1. training_levels - Level definitions and requirements
-- 2. user_question_history - Track all questions user has seen
-- 3. user_level_progress - Track user progress through levels
--
-- Functions Created:
-- 1. get_next_training_question - Get fresh question for level
-- 2. get_user_level_stats - Calculate accuracy and stats
--
-- Security: RLS enabled on all user data tables
-- ═══════════════════════════════════════════════════════════════════════════
