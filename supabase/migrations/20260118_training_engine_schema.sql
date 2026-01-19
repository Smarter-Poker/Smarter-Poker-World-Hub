-- ═══════════════════════════════════════════════════════════════════════════
-- GTO TRAINING ENGINE DATABASE SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════
-- Creates tables for:
-- 1. training_clinics (28 clinic metadata)
-- 2. user_leaks (leak detection tracking)
-- 3. xp_logs (XP award history)
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing tables if they exist
DROP TABLE IF EXISTS public.xp_logs CASCADE;
DROP TABLE IF EXISTS public.user_leaks CASCADE;
DROP TABLE IF EXISTS public.training_clinics CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: training_clinics
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.training_clinics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subtitle TEXT,
    category TEXT NOT NULL,
    target_leak TEXT,
    description TEXT,
    icon TEXT,
    badge TEXT,
    xp_multiplier DECIMAL(3,1) DEFAULT 1.0,
    laws INTEGER[],
    difficulty INTEGER DEFAULT 3,
    levels INTEGER DEFAULT 10,
    pass_threshold INTEGER DEFAULT 85,
    villain_archetype TEXT,
    visual_effects TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast category lookups
CREATE INDEX idx_clinics_category ON public.training_clinics(category);
CREATE INDEX idx_clinics_target_leak ON public.training_clinics(target_leak);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: user_leaks
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.user_leaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    leak_category TEXT NOT NULL,
    leak_name TEXT NOT NULL,
    error_rate DECIMAL(5,4) NOT NULL,
    confidence DECIMAL(5,4) NOT NULL,
    total_samples INTEGER NOT NULL,
    mistake_count INTEGER NOT NULL,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    remediation_started_at TIMESTAMPTZ,
    remediation_completed_at TIMESTAMPTZ,
    clinic_id TEXT REFERENCES public.training_clinics(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast user lookups
CREATE INDEX idx_user_leaks_user_id ON public.user_leaks(user_id);
CREATE INDEX idx_user_leaks_category ON public.user_leaks(leak_category);
CREATE INDEX idx_user_leaks_active ON public.user_leaks(user_id, is_active);
CREATE INDEX idx_user_leaks_detected_at ON public.user_leaks(detected_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- TABLE: xp_logs
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.xp_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL,
    session_type TEXT NOT NULL, -- 'game' | 'clinic' | 'remediation'
    xp_awarded INTEGER NOT NULL,
    base_xp INTEGER NOT NULL,
    streak_multiplier DECIMAL(3,2) DEFAULT 1.0,
    speed_multiplier DECIMAL(3,2) DEFAULT 1.0,
    remediation_multiplier DECIMAL(3,2) DEFAULT 1.0,
    streak_count INTEGER DEFAULT 0,
    is_correct BOOLEAN NOT NULL,
    question_number INTEGER,
    time_taken_ms INTEGER,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for analytics
CREATE INDEX idx_xp_logs_user_id ON public.xp_logs(user_id);
CREATE INDEX idx_xp_logs_game_id ON public.xp_logs(game_id);
CREATE INDEX idx_xp_logs_session_type ON public.xp_logs(session_type);
CREATE INDEX idx_xp_logs_created_at ON public.xp_logs(created_at DESC);
CREATE INDEX idx_xp_logs_user_created ON public.xp_logs(user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS
ALTER TABLE public.training_clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_leaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_logs ENABLE ROW LEVEL SECURITY;

-- training_clinics: Public read, admin write
CREATE POLICY "Clinics are viewable by everyone"
    ON public.training_clinics FOR SELECT
    USING (true);

CREATE POLICY "Clinics are insertable by service role"
    ON public.training_clinics FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

-- user_leaks: Users can only see their own leaks
CREATE POLICY "Users can view their own leaks"
    ON public.user_leaks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own leaks"
    ON public.user_leaks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own leaks"
    ON public.user_leaks FOR UPDATE
    USING (auth.uid() = user_id);

-- xp_logs: Users can only see their own XP
CREATE POLICY "Users can view their own XP logs"
    ON public.xp_logs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own XP logs"
    ON public.xp_logs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to get active leaks for a user
CREATE OR REPLACE FUNCTION get_active_leaks(p_user_id UUID)
RETURNS TABLE (
    leak_category TEXT,
    leak_name TEXT,
    error_rate DECIMAL,
    confidence DECIMAL,
    clinic_id TEXT,
    clinic_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ul.leak_category,
        ul.leak_name,
        ul.error_rate,
        ul.confidence,
        ul.clinic_id,
        tc.name as clinic_name
    FROM public.user_leaks ul
    LEFT JOIN public.training_clinics tc ON ul.clinic_id = tc.id
    WHERE ul.user_id = p_user_id
      AND ul.is_active = true
      AND ul.confidence >= 0.75
    ORDER BY ul.confidence DESC, ul.detected_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate total XP for a user
CREATE OR REPLACE FUNCTION get_user_total_xp(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(xp_awarded) FROM public.xp_logs WHERE user_id = p_user_id),
        0
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DATA: Insert all 28 clinics
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.training_clinics (id, name, subtitle, category, target_leak, description, icon, badge, xp_multiplier, laws, difficulty, levels, pass_threshold) VALUES
('clinic-01', 'The Iron Wall', 'Clinic #1: Defense', 'DEFENSE', 'FOLD_TO_AGGRESSION', 'Stop folding bottom-of-range winners against aggressive opponents', '🛡️', 'Iron Wall Master', 1.5, ARRAY[8,9], 3, 10, 85),
('clinic-02', 'The Value Extractor', 'Clinic #2: Sizing', 'SIZING', 'THIN_VALUE', 'Maximize EV with strong holdings through precise bet sizing', '💎', 'Value Assassin', 1.0, ARRAY[6], 4, 10, 85),
('clinic-03', 'The Indifference', 'Clinic #3: Defense Math', 'DEFENSE', 'BLUFF_FREQUENCY', 'Master Minimum Defense Frequency (MDF) to prevent profitable villain bluffs', '⚖️', 'MDF Master', 1.0, ARRAY[9], 4, 10, 85),
('clinic-04', 'The Positional Blitz', 'Clinic #4: Seat Mastery', 'POSITION', 'POSITION_AWARENESS', 'Train seat-relative range mastery through rapid-fire drills', '🔄', 'Position Master', 1.0, ARRAY[2,3], 3, 10, 85),
('clinic-05', 'The C-Bet Clinic', 'Clinic #5: Strategic Logic', 'STRATEGY', 'CBET_DEFENSE', 'Master continuation betting logic by identifying Range vs Nut advantage', '💥', 'C-Bet Pro', 1.0, ARRAY[10], 3, 10, 85),
('clinic-06', 'The Metronome', 'Clinic #6: Timing Discipline', 'PSYCHOLOGY', 'TIMING_TELLS', 'Eliminate timing tells by enforcing consistent action-rhythm', '⏱️', 'Rhythm Master', 1.0, ARRAY[9], 2, 10, 85),
('clinic-07', 'The Cooler Cage', 'Clinic #7: Tilt Resistance', 'PSYCHOLOGY', 'TILT_PLAY', 'Test emotional discipline through deliberate bad-beat sequences', '🧊', 'Ice Master', 2.0, ARRAY[9], 5, 10, 85),
('clinic-08', 'The Reviewer', 'Clinic #8: Result Bias', 'PSYCHOLOGY', 'RESULT_BIAS', 'Separate decision quality from outcome through self-assessment', '🔍', 'Clear Thinker', 1.0, ARRAY[10], 3, 10, 85),
('clinic-09', 'Context Switcher', 'Clinic #9: Agility', 'ADVANCED', 'CONTEXT_ADAPTATION', 'Adapt to switching table types and stack depths mid-session', '⚡', 'Agility Master', 1.5, ARRAY[2], 5, 10, 100),
('clinic-10', 'Exploitative Deviation', 'Clinic #10: Exploit', 'ADVANCED', 'MISSED_EXPLOIT', 'Punish non-GTO opponents by identifying villain leaks', '🎣', 'Exploit Hunter', 1.5, ARRAY[9], 5, 10, 85),
('clinic-11', 'Capped Range Defense', 'Clinic #11: Capped', 'ADVANCED', 'CAPPED_FOLDING', 'Stop folding when your range is condensed due to pre-flop calling', '📦', 'Range Defender', 1.0, ARRAY[9], 4, 10, 85),
('clinic-12', 'Asymmetric Stack', 'Clinic #12: Stack Math', 'ADVANCED', 'EFFECTIVE_STACK', 'Master effective stack math and price-commitment thresholds', '📐', 'Stack Mathematician', 1.0, ARRAY[8], 4, 10, 85),
('clinic-13', 'Tournament World', 'Clinic #13: MTT', 'MTT', 'ICM_AWARENESS', 'Comprehensive 150-level tournament engine: Push/Fold, ICM, ChipEV', '🏆', 'Tournament Master', 1.5, ARRAY[3,8,9], 4, 150, 85),
('clinic-14', 'PKO Bounty Engine', 'Clinic #14: PKO', 'MTT', 'BOUNTY_MATH', 'Adjust calling ranges based on bounty chip equivalents', '💰', 'Bounty Hunter', 1.5, ARRAY[8,9], 4, 10, 85),
('clinic-15', 'Satellite Bubble', 'Clinic #15: Satellites', 'MTT', 'SATELLITE_ICM', 'Absolute survival GTO for tournament ticket bubbles', '🎫', 'Ticket Master', 2.0, ARRAY[9,10], 5, 10, 85),
('clinic-16', 'Bubble Bully', 'Clinic #16: Big Stack', 'MTT', 'BIG_STACK_PRESSURE', 'Exploit ICM pressure when playing as a big stack', '🦈', 'Shark', 1.5, ARRAY[8,9], 4, 10, 85),
('clinic-17', 'BB Ante Defense', 'Clinic #17: Large Pot', 'MTT', 'ANTE_DEFENSE', 'Correct defense frequencies for BB Ante formats (67% larger pots)', '🎰', 'Ante Master', 1.0, ARRAY[9,12], 3, 10, 85),
('clinic-18', 'Ladder Jump Patience', 'Clinic #18: Discipline', 'MTT', 'PAY_JUMP_PATIENCE', 'Extreme discipline for pay-jump maximization', '🪜', 'Ladder Master', 2.0, ARRAY[9,10], 5, 10, 85),
('clinic-19', 'Final Table Pressure', 'Clinic #19: Final Table', 'MTT', 'FINAL_TABLE_ICM', 'Master pay-jump optimization at the final table', '👑', 'Final Table Champion', 2.0, ARRAY[8,9], 5, 10, 85),
('clinic-20', 'Heads-Up Mastery', 'Clinic #20: 1v1', 'MTT', 'HEADS_UP_PLAY', 'Specialized training for heads-up tournament finales', '⚔️', 'Duel Champion', 1.5, ARRAY[2,3], 5, 10, 85),
('clinic-21', 'Short Stack Ninja', 'Clinic #21: 10-20BB', 'MTT', 'SHORT_STACK', 'Master push/fold ranges with 10-20BB stacks', '🥷', 'Short Stack Ninja', 1.0, ARRAY[8], 3, 10, 85),
('clinic-22', 'Deep Stack Strategy', 'Clinic #22: 100BB+', 'CASH', 'DEEP_STACK', 'Master deep-stack play with 100BB+ effective stacks', '📚', 'Deep Stack Pro', 1.0, ARRAY[8], 4, 10, 85),
('clinic-23', 'Blind vs Blind', 'Clinic #23: SB vs BB', 'CASH', 'BVB_RANGES', 'Master blind vs blind battles with wide ranges', '🥊', 'Blind Warrior', 1.0, ARRAY[2,3], 3, 10, 85),
('clinic-24', 'Multi-Way Pots', 'Clinic #24: 3+ Players', 'CASH', 'MULTI_WAY', 'Adjust strategy for multi-way pot dynamics', '👥', 'Multi-Way Master', 1.0, ARRAY[6,8], 4, 10, 85),
('clinic-25', 'River Decision', 'Clinic #25: Final Street', 'STRATEGY', 'RIVER_PLAY', 'Master the final street where decisions are most critical', '🌊', 'River Pro', 1.5, ARRAY[9,10], 5, 10, 85),
('clinic-26', 'Overbetting', 'Clinic #26: Polarized Bets', 'ADVANCED', 'OVERBET_FREQUENCY', 'Master polarized overbetting for maximum EV extraction', '💣', 'Overbet Master', 1.5, ARRAY[6], 5, 10, 85),
('clinic-27', 'Check-Raise Clinic', 'Clinic #27: Aggression', 'STRATEGY', 'CHECK_RAISE_FREQUENCY', 'Master the check-raise for both value and bluffs', '📈', 'Check-Raise Artist', 1.0, ARRAY[9], 4, 10, 85),
('clinic-28', 'Frequency Execution', 'Clinic #28: Mixed Strategy', 'ADVANCED', 'MIXED_FREQUENCY', 'Execute mixed strategies with precise solver frequencies', '🎲', 'Frequency Master', 2.0, ARRAY[6], 5, 10, 90);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════

-- Verify tables exist
SELECT 
    'training_clinics' as table_name, 
    COUNT(*) as row_count 
FROM public.training_clinics
UNION ALL
SELECT 
    'user_leaks' as table_name, 
    COUNT(*) as row_count 
FROM public.user_leaks
UNION ALL
SELECT 
    'xp_logs' as table_name, 
    COUNT(*) as row_count 
FROM public.xp_logs;
