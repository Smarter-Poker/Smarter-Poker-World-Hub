-- Jarvis Training Integration Tables
-- Run this migration to enable Jarvis training data collection

-- ============================================================================
-- TABLE: jarvis_training_sessions
-- Stores individual training session data for analysis
-- ============================================================================

CREATE TABLE IF NOT EXISTS jarvis_training_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT UNIQUE NOT NULL,
    game_id TEXT NOT NULL,
    game_name TEXT NOT NULL,
    category TEXT,
    level INTEGER DEFAULT 1,
    
    -- Performance metrics
    questions_answered INTEGER DEFAULT 0,
    questions_correct INTEGER DEFAULT 0,
    accuracy DECIMAL(5,2) DEFAULT 0,
    streak INTEGER DEFAULT 0,
    time_spent_seconds INTEGER DEFAULT 0,
    
    -- Detailed data
    answers JSONB DEFAULT '[]'::jsonb,
    leaks_detected JSONB DEFAULT '[]'::jsonb,
    recommendations JSONB DEFAULT '[]'::jsonb,
    
    -- Timestamps
    session_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_jarvis_sessions_user 
    ON jarvis_training_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_jarvis_sessions_game 
    ON jarvis_training_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_jarvis_sessions_timestamp 
    ON jarvis_training_sessions(session_timestamp DESC);

-- ============================================================================
-- TABLE: jarvis_user_training_profile  
-- Aggregated training profile for each user
-- ============================================================================

CREATE TABLE IF NOT EXISTS jarvis_user_training_profile (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Aggregate stats
    total_sessions INTEGER DEFAULT 0,
    total_questions INTEGER DEFAULT 0,
    total_correct INTEGER DEFAULT 0,
    overall_accuracy DECIMAL(5,2) DEFAULT 0,
    total_time_spent_seconds INTEGER DEFAULT 0,
    
    -- Leak analysis (aggregated)
    common_leaks JSONB DEFAULT '[]'::jsonb,
    strong_categories JSONB DEFAULT '[]'::jsonb,
    weak_categories JSONB DEFAULT '[]'::jsonb,
    
    -- Progress tracking
    games_played JSONB DEFAULT '{}'::jsonb,
    highest_levels JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps  
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE jarvis_training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jarvis_user_training_profile ENABLE ROW LEVEL SECURITY;

-- Users can view their own sessions
CREATE POLICY "Users can view own training sessions" 
    ON jarvis_training_sessions FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can insert/update sessions
CREATE POLICY "Service can manage training sessions"
    ON jarvis_training_sessions FOR ALL
    USING (true)
    WITH CHECK (true);

-- Users can view their own profile
CREATE POLICY "Users can view own training profile"
    ON jarvis_user_training_profile FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can manage profiles
CREATE POLICY "Service can manage training profiles"
    ON jarvis_user_training_profile FOR ALL
    USING (true)
    WITH CHECK (true);
