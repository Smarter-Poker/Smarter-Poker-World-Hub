-- =============================================================================
-- JARVIS TRAINING INTEGRATION SCHEMA
-- =============================================================================
-- Stores training session data for Jarvis (Personal Assistant) analysis
-- Enables personalized coaching insights and leak detection
-- =============================================================================

-- 1. Training Sessions Table (Raw session data)
CREATE TABLE IF NOT EXISTS jarvis_training_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    session_id TEXT UNIQUE NOT NULL,
    game_id TEXT NOT NULL,
    game_name TEXT,
    category TEXT,
    level INTEGER DEFAULT 1,
    questions_answered INTEGER DEFAULT 0,
    questions_correct INTEGER DEFAULT 0,
    accuracy DECIMAL(5,2) DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    time_spent_seconds INTEGER DEFAULT 0,
    answers_data JSONB DEFAULT '[]'::jsonb,
    leaks_detected JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. User Training Profile (Aggregated analysis for Jarvis)
CREATE TABLE IF NOT EXISTS jarvis_user_training_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    total_sessions INTEGER DEFAULT 0,
    total_questions INTEGER DEFAULT 0,
    overall_accuracy DECIMAL(5,2) DEFAULT 0,
    last_session_date TIMESTAMPTZ,
    favorite_games JSONB DEFAULT '{}'::jsonb,
    identified_leaks JSONB DEFAULT '[]'::jsonb,
    identified_strengths JSONB DEFAULT '[]'::jsonb,
    skill_assessment TEXT DEFAULT 'Beginner',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Weekly Leak Reports (Scheduled analysis)
CREATE TABLE IF NOT EXISTS jarvis_weekly_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    report_week TEXT NOT NULL, -- Format: YYYY-WW
    sessions_count INTEGER DEFAULT 0,
    questions_count INTEGER DEFAULT 0,
    accuracy DECIMAL(5,2) DEFAULT 0,
    primary_leaks JSONB DEFAULT '[]'::jsonb,
    improvements JSONB DEFAULT '[]'::jsonb,
    recommendations JSONB DEFAULT '[]'::jsonb,
    grok_analysis TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, report_week)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jarvis_training_sessions_user_id 
    ON jarvis_training_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_jarvis_training_sessions_created_at 
    ON jarvis_training_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jarvis_training_sessions_game_id 
    ON jarvis_training_sessions(game_id);

CREATE INDEX IF NOT EXISTS idx_jarvis_user_training_profile_user_id 
    ON jarvis_user_training_profile(user_id);

CREATE INDEX IF NOT EXISTS idx_jarvis_weekly_reports_user_id 
    ON jarvis_weekly_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_jarvis_weekly_reports_week 
    ON jarvis_weekly_reports(report_week);

-- Enable RLS
ALTER TABLE jarvis_training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jarvis_user_training_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE jarvis_weekly_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
CREATE POLICY "Users can view own training sessions"
    ON jarvis_training_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own training sessions"
    ON jarvis_training_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own training profile"
    ON jarvis_user_training_profile FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own training profile"
    ON jarvis_user_training_profile FOR ALL
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own weekly reports"
    ON jarvis_weekly_reports FOR SELECT
    USING (auth.uid() = user_id);

-- Service role access for cron jobs
GRANT ALL ON jarvis_training_sessions TO service_role;
GRANT ALL ON jarvis_user_training_profile TO service_role;
GRANT ALL ON jarvis_weekly_reports TO service_role;

GRANT ALL ON jarvis_training_sessions TO authenticated;
GRANT ALL ON jarvis_user_training_profile TO authenticated;
GRANT ALL ON jarvis_weekly_reports TO authenticated;
