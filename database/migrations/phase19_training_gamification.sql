-- ═══════════════════════════════════════════════════════════════════════════
-- 🚀 PHASE 19: GTOW TRAINING & GAMIFICATION SCHEMA MIGRATION                 
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. ADD GTOW SCORE METRICS TO LEADERBOARD
ALTER TABLE training_leaderboard 
ADD COLUMN IF NOT EXISTS gtow_score_avg numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS ev_loss_total numeric DEFAULT 0;

-- 2. CREATE GTOW SCORES TABLE (for granular session tracking)
CREATE TABLE IF NOT EXISTS gtow_scores (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    game_id text NOT NULL,
    gtow_score integer NOT NULL,
    ev_loss numeric NOT NULL,
    accuracy integer NOT NULL,
    mistakes integer DEFAULT 0,
    hands_played integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- RLS for gtow_scores
ALTER TABLE gtow_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert their own scores" ON gtow_scores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read their own scores" ON gtow_scores FOR SELECT USING (auth.uid() = user_id);

-- 3. CREATE TRAINING SESSIONS TABLE (for deep hand replays)
CREATE TABLE IF NOT EXISTS training_sessions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    game_id text NOT NULL,
    session_data jsonb NOT NULL,
    completed_at timestamp with time zone DEFAULT now()
);

-- RLS for training_sessions
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert their own sessions" ON training_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read their own sessions" ON training_sessions FOR SELECT USING (auth.uid() = user_id);

-- Verify script completed
SELECT 'Phase 19 Migration Complete. Please verify new columns in Supabase.' as status;
