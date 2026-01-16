-- ═══════════════════════════════════════════════════════════════════════════
-- MANUAL GOD MODE DEPLOYMENT
-- Copy and paste this entire file into Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 1: GOD MODE LIBRARY (from 004_build_god_mode_library.sql)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Drop legacy tables if they exist
DROP TABLE IF EXISTS solved_hands CASCADE;
DROP TABLE IF EXISTS solved_hands_v2 CASCADE;
DROP TABLE IF EXISTS solved_hands_final CASCADE;
DROP TABLE IF EXISTS gto_solutions CASCADE;
DROP TABLE IF EXISTS preflop_charts CASCADE;

-- Table 1: solved_spots_gold (Postflop Engine)
CREATE TABLE IF NOT EXISTS solved_spots_gold (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_hash TEXT UNIQUE NOT NULL,
    street TEXT NOT NULL CHECK (street IN ('Flop', 'Turn', 'River')),
    stack_depth INTEGER NOT NULL CHECK (stack_depth IN (20, 40, 60, 80, 100, 200)),
    game_type TEXT NOT NULL CHECK (game_type IN ('Cash', 'MTT', 'Spin')),
    topology TEXT NOT NULL CHECK (topology IN ('HU', '3-Max', '6-Max', '9-Max')),
    mode TEXT NOT NULL CHECK (mode IN ('ChipEV', 'ICM', 'PKO')),
    board_cards TEXT[] NOT NULL,
    macro_metrics JSONB DEFAULT '{}'::jsonb,
    strategy_matrix JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ssg_street ON solved_spots_gold(street);
CREATE INDEX IF NOT EXISTS idx_ssg_stack ON solved_spots_gold(stack_depth);
CREATE INDEX IF NOT EXISTS idx_ssg_game ON solved_spots_gold(game_type);
CREATE INDEX IF NOT EXISTS idx_ssg_topology ON solved_spots_gold(topology);
CREATE INDEX IF NOT EXISTS idx_ssg_mode ON solved_spots_gold(mode);
CREATE INDEX IF NOT EXISTS idx_ssg_board ON solved_spots_gold USING GIN(board_cards);
CREATE INDEX IF NOT EXISTS idx_ssg_macro ON solved_spots_gold USING GIN(macro_metrics);

-- Table 2: memory_charts_gold (Preflop Engine)
CREATE TABLE IF NOT EXISTS memory_charts_gold (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chart_name TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Preflop', 'PushFold', 'Nash')),
    chart_grid JSONB NOT NULL DEFAULT '{}'::jsonb,
    stack_depth TEXT,
    topology TEXT,
    position TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcg_category ON memory_charts_gold(category);
CREATE INDEX IF NOT EXISTS idx_mcg_chart_grid ON memory_charts_gold USING GIN(chart_grid);

-- Auto-update triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_ssg_updated ON solved_spots_gold;
CREATE TRIGGER tr_ssg_updated
    BEFORE UPDATE ON solved_spots_gold
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS tr_mcg_updated ON memory_charts_gold;
CREATE TRIGGER tr_mcg_updated
    BEFORE UPDATE ON memory_charts_gold
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON solved_spots_gold TO authenticated;
GRANT SELECT ON solved_spots_gold TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON memory_charts_gold TO authenticated;
GRANT SELECT ON memory_charts_gold TO anon;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 2: GAME ENGINE (from 005_game_engine.sql)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Table 1: training_levels
CREATE TABLE IF NOT EXISTS training_levels (
    level_id INT PRIMARY KEY,
    game_mode TEXT NOT NULL,
    street_filter TEXT,
    stack_filter INT[],
    difficulty_rating TEXT,
    questions_per_round INT DEFAULT 20,
    passing_threshold INT DEFAULT 85,
    level_name TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 2: user_question_history
CREATE TABLE IF NOT EXISTS user_question_history (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    scenario_hash TEXT NOT NULL,
    level_id INT REFERENCES training_levels(level_id),
    result TEXT NOT NULL CHECK (result IN ('Correct', 'Incorrect')),
    user_action TEXT,
    gto_action TEXT,
    ev_loss DECIMAL(10, 2),
    played_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, scenario_hash)
);

CREATE INDEX IF NOT EXISTS idx_uqh_user ON user_question_history(user_id);
CREATE INDEX IF NOT EXISTS idx_uqh_level ON user_question_history(level_id);
CREATE INDEX IF NOT EXISTS idx_uqh_result ON user_question_history(result);

-- Table 3: user_level_progress
CREATE TABLE IF NOT EXISTS user_level_progress (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    level_id INT REFERENCES training_levels(level_id),
    status TEXT NOT NULL CHECK (status IN ('locked', 'in_progress', 'passed', 'mastered')),
    accuracy DECIMAL(5, 2),
    attempts INT DEFAULT 0,
    best_score INT,
    last_played_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, level_id)
);

CREATE INDEX IF NOT EXISTS idx_ulp_user ON user_level_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_ulp_status ON user_level_progress(status);

-- Seed the 10 levels
INSERT INTO training_levels (
    level_id, game_mode, street_filter, stack_filter, difficulty_rating,
    questions_per_round, passing_threshold, level_name, description
)
VALUES 
    (1, 'Cash', 'Flop', '{100}', 'Easy', 20, 85, 
     'Flop Fundamentals', 
     'Master basic flop play at 100bb in cash games. Pure strategies only.'),
    
    (2, 'Cash', 'Turn', '{100}', 'Easy', 20, 85,
     'Turn Tactics',
     'Learn optimal turn play at 100bb. Pure strategies only.'),
    
    (3, 'Cash', 'River', '{100}', 'Easy', 20, 85,
     'River Mastery',
     'Perfect your river decisions at 100bb. Pure strategies only.'),
    
    (4, 'Cash', 'All', '{100}', 'Easy', 25, 85,
     'Full Street Mix',
     'Test your skills across all streets at 100bb. Pure strategies.'),
    
    (5, 'Cash', 'Flop', '{100}', 'Hard', 20, 80,
     'Advanced Flops',
     'Handle complex flop spots with mixed strategies at 100bb.'),
    
    (6, 'Cash', 'Turn', '{100}', 'Hard', 20, 80,
     'Advanced Turns',
     'Navigate tricky turn decisions with mixed frequencies.'),
    
    (7, 'MTT', 'Flop', '{40}', 'Easy', 20, 85,
     'MTT Fundamentals',
     'Learn ICM-adjusted play on flops at 40bb.'),
    
    (8, 'MTT', 'Turn', '{40}', 'Easy', 20, 85,
     'MTT Turn Play',
     'Master turn decisions under ICM pressure at 40bb.'),
    
    (9, 'MTT', 'All', '{20}', 'Easy', 25, 85,
     'Short Stack Survival',
     'Perfect your 20bb push/fold game in tournaments.'),
    
    (10, 'Cash', 'All', '{60, 80, 100}', 'Hard', 30, 90,
     'Cash Game Mastery',
     'Ultimate test: all streets, multiple stacks, mixed strategies.')
ON CONFLICT (level_id) DO NOTHING;

-- RLS Policies
ALTER TABLE user_question_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_level_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own history" ON user_question_history;
CREATE POLICY "Users see own history" 
    ON user_question_history 
    FOR ALL 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own progress" ON user_level_progress;
CREATE POLICY "Users see own progress" 
    ON user_level_progress 
    FOR ALL 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public can view levels" ON training_levels;
CREATE POLICY "Public can view levels" 
    ON training_levels 
    FOR SELECT 
    USING (true);

-- Helper Functions
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
        ssg.game_type = tl.game_mode
        AND (tl.street_filter = 'All' OR ssg.street = tl.street_filter)
        AND (tl.stack_filter IS NULL OR ssg.stack_depth = ANY(tl.stack_filter))
        AND NOT EXISTS (
            SELECT 1 FROM user_question_history
            WHERE user_id = p_user_id
              AND scenario_hash = ssg.scenario_hash
        )
    ORDER BY RANDOM()
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════

-- Check tables created
SELECT 
    'Tables Created:' as status,
    COUNT(*) as count
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'solved_spots_gold',
    'memory_charts_gold',
    'training_levels',
    'user_question_history',
    'user_level_progress'
  );

-- Check levels seeded
SELECT 
    'Levels Seeded:' as status,
    COUNT(*) as count
FROM training_levels;

-- Show all levels
SELECT level_id, level_name, game_mode, difficulty_rating
FROM training_levels
ORDER BY level_id;
