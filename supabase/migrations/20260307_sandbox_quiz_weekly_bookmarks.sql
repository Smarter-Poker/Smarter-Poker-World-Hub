-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Create 3 missing tables for Sandbox Quiz + Weekly Spots + GTO Bookmarks
-- Date: March 7, 2026
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. sandbox_quiz_results — "What Would You Do?" quiz answers for leaderboard
CREATE TABLE IF NOT EXISTS sandbox_quiz_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scenario_hash TEXT NOT NULL,
    user_action TEXT NOT NULL,
    correct_action TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sandbox_quiz_results_user ON sandbox_quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_quiz_results_created ON sandbox_quiz_results(created_at DESC);

ALTER TABLE sandbox_quiz_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own quiz results" ON sandbox_quiz_results
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own quiz results" ON sandbox_quiz_results
    FOR SELECT USING (auth.uid() = user_id);

-- Service role can read all for leaderboard aggregation
CREATE POLICY "Service role reads all quiz results" ON sandbox_quiz_results
    FOR SELECT USING (auth.role() = 'service_role');


-- 2. sandbox_weekly_spots — Admin-curated weekly challenge scenarios
CREATE TABLE IF NOT EXISTS sandbox_weekly_spots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    week_start DATE NOT NULL,
    scenario_json JSONB NOT NULL,
    correct_action TEXT,
    description TEXT,
    difficulty TEXT DEFAULT 'intermediate',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sandbox_weekly_spots_week ON sandbox_weekly_spots(week_start DESC);

ALTER TABLE sandbox_weekly_spots ENABLE ROW LEVEL SECURITY;

-- Everyone can read weekly spots (public content)
CREATE POLICY "Public read weekly spots" ON sandbox_weekly_spots
    FOR SELECT USING (true);

-- Only service role can manage weekly spots
CREATE POLICY "Service role manages weekly spots" ON sandbox_weekly_spots
    FOR ALL USING (auth.role() = 'service_role');


-- 3. solution_bookmarks — GTO Solutions bookmarks
CREATE TABLE IF NOT EXISTS solution_bookmarks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    spot_id TEXT,
    scenario_hash TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solution_bookmarks_user ON solution_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_solution_bookmarks_hash ON solution_bookmarks(user_id, scenario_hash);

ALTER TABLE solution_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own bookmarks" ON solution_bookmarks
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role manages all bookmarks" ON solution_bookmarks
    FOR ALL USING (auth.role() = 'service_role');


-- ═══════════════════════════════════════════════════════════════════════════
-- Verification: Count tables to confirm creation
-- ═══════════════════════════════════════════════════════════════════════════
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('sandbox_quiz_results', 'sandbox_weekly_spots', 'solution_bookmarks');
