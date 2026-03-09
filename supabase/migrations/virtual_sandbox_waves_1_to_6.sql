-- =================================================================================
-- VIRTUAL SANDBOX - WAVES 1 TO 6 - CUMULATIVE SQL MIGRATION
-- Generated: March 2026
-- =================================================================================

-- 1. exec_sql RPC (Required for dynamic table generation via Admin APIs)
CREATE OR REPLACE FUNCTION public.exec_sql(query text) 
RETURNS void AS $$
BEGIN
  EXECUTE query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Wave 3: Sandbox Sessions Logger (Persists session history locally or to DB)
CREATE TABLE IF NOT EXISTS public.sandbox_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL,
    session_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_sessions_user ON public.sandbox_sessions(user_id);

-- 3. Wave 4: Quiz & Drill Results (Stores outcomes of the Quick-Spot Drill)
CREATE TABLE IF NOT EXISTS public.sandbox_quiz_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL,
    question_id UUID REFERENCES public.training_questions(id),
    is_correct BOOLEAN NOT NULL,
    ev_delta NUMERIC DEFAULT 0,
    time_taken_ms INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_quiz_user ON public.sandbox_quiz_results(user_id);

-- 4. Wave 4/5: Coach Results Log (Stores real-time decision deltas for Leaderboards & Macro Leaks)
CREATE TABLE IF NOT EXISTS public.sandbox_coach_results (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL,
    scenario_hash TEXT NOT NULL,
    hero_action TEXT NOT NULL,
    optimal_action TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    ev_delta NUMERIC DEFAULT 0,
    position TEXT,
    street TEXT,
    board_texture TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_coach_user ON public.sandbox_coach_results(user_id);

-- 5. Wave 6: Study Folders & Tagging (Persists custom scenario setups)
CREATE TABLE IF NOT EXISTS public.sandbox_saved_hands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL,
    folder_name TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    state_json JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sandbox_saved_hands_user ON public.sandbox_saved_hands(user_id);

-- 6. Wave 6: Global Scenario Sharing (Generates unique short-links for exact setups)
CREATE TABLE IF NOT EXISTS public.sandbox_shared_scenarios (
    id TEXT PRIMARY KEY,
    creator_id UUID REFERENCES auth.users,
    state_json JSONB NOT NULL,
    views INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS & Security setup (Optional: Assumes restrictive defaults unless configured elsewhere)
ALTER TABLE public.sandbox_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sandbox_quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sandbox_coach_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sandbox_saved_hands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sandbox_shared_scenarios ENABLE ROW LEVEL SECURITY;

-- Note: Ensure write/read policies align with your current auth definitions. 
-- Most API routes access these via the Service Role Key bypassing RLS, but client calls require policies.
