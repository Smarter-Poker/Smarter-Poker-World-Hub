-- ============================================================================
-- GOD MODE ENGINE - Database Schema
-- Smarter.Poker Training RPG System
-- ============================================================================

-- ============================================================================
-- TABLE 1: game_registry
-- Stores the 100 Game Titles with engine routing configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Game Identity
    title TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    
    -- Engine Routing (CRITICAL)
    engine_type TEXT NOT NULL CHECK (engine_type IN ('PIO', 'CHART', 'SCENARIO')),
    
    -- Game Configuration (JSON)
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Example config structure:
    -- {
    --   "stack_depth": 100,
    --   "position_filter": ["BTN", "CO"],
    --   "street_filter": "flop",
    --   "difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100]
    -- }
    
    -- Progression Settings
    max_level INTEGER NOT NULL DEFAULT 10,
    hands_per_round INTEGER NOT NULL DEFAULT 20,
    
    -- UI/Display
    icon_url TEXT,
    category TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_premium BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast engine routing
CREATE INDEX IF NOT EXISTS idx_game_registry_engine ON game_registry(engine_type);
CREATE INDEX IF NOT EXISTS idx_game_registry_active ON game_registry(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_game_registry_slug ON game_registry(slug);

-- ============================================================================
-- TABLE 2: user_session
-- Tracks user's current Level (1-10) and Health Bar status per game
-- ============================================================================
CREATE TABLE IF NOT EXISTS god_mode_user_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign Keys
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES game_registry(id) ON DELETE CASCADE,
    
    -- Progression State
    current_level INTEGER NOT NULL DEFAULT 1 CHECK (current_level >= 1 AND current_level <= 10),
    highest_level_unlocked INTEGER NOT NULL DEFAULT 1,
    
    -- Health Bar (Current Round)
    health_chips INTEGER NOT NULL DEFAULT 100 CHECK (health_chips >= 0 AND health_chips <= 100),
    
    -- Round Progress
    current_round_hands_played INTEGER NOT NULL DEFAULT 0,
    current_round_correct INTEGER NOT NULL DEFAULT 0,
    current_round_started_at TIMESTAMPTZ,
    
    -- Lifetime Stats
    total_hands_played INTEGER NOT NULL DEFAULT 0,
    total_correct INTEGER NOT NULL DEFAULT 0,
    total_rounds_completed INTEGER NOT NULL DEFAULT 0,
    total_levels_mastered INTEGER NOT NULL DEFAULT 0,
    
    -- Session Metadata
    last_played_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint: one session per user per game
    UNIQUE(user_id, game_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_god_mode_session_user ON god_mode_user_session(user_id);
CREATE INDEX IF NOT EXISTS idx_god_mode_session_game ON god_mode_user_session(game_id);
CREATE INDEX IF NOT EXISTS idx_god_mode_session_recent ON god_mode_user_session(last_played_at DESC);

-- ============================================================================
-- TABLE 3: user_hand_history
-- Tracks every hand played with variant_hash for unique visual enforcement
-- ============================================================================
CREATE TABLE IF NOT EXISTS god_mode_hand_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Foreign Keys
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES game_registry(id) ON DELETE CASCADE,
    session_id UUID REFERENCES god_mode_user_session(id) ON DELETE SET NULL,
    
    -- Source Reference (which hand from solver/chart)
    source_file_id TEXT NOT NULL,  -- References solved_spots_gold.id or chart key
    
    -- CRITICAL: Suit Rotation Hash
    -- Format: "0" | "1" | "2" | "3" (rotation index)
    -- Or detailed: "s=h,h=d,d=c,c=s" for audit trail
    variant_hash TEXT NOT NULL,
    
    -- Unique visual hand enforcement
    -- User cannot see same file_id + variant combination twice
    UNIQUE(user_id, source_file_id, variant_hash),
    
    -- Hand State (as shown to user after isomorphism)
    hero_hand TEXT NOT NULL,      -- e.g., "AhKd" (post-rotation)
    board TEXT,                   -- e.g., "Qh7h2c" (post-rotation)
    
    -- Game Context
    level_at_play INTEGER NOT NULL,
    round_hand_number INTEGER NOT NULL,  -- 1-20 within the round
    
    -- User Decision
    user_action TEXT NOT NULL,    -- 'fold', 'call', 'raise', 'check', 'bet'
    user_sizing NUMERIC,          -- bet/raise size if applicable
    
    -- GTO Solution
    gto_action TEXT NOT NULL,
    gto_frequency NUMERIC,        -- 0.0 to 1.0
    ev_of_user_action NUMERIC,
    ev_of_gto_action NUMERIC,
    ev_loss NUMERIC GENERATED ALWAYS AS (COALESCE(ev_of_gto_action, 0) - COALESCE(ev_of_user_action, 0)) STORED,
    
    -- Scoring
    is_correct BOOLEAN NOT NULL,
    is_indifferent BOOLEAN DEFAULT false,  -- True if GTO was mixed (50/50)
    chip_penalty INTEGER DEFAULT 0,
    
    -- Active Villain (Engine A only)
    villain_action TEXT,
    villain_sizing NUMERIC,
    
    -- Timestamps
    played_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for history queries and unique enforcement
CREATE INDEX IF NOT EXISTS idx_god_mode_history_user ON god_mode_hand_history(user_id);
CREATE INDEX IF NOT EXISTS idx_god_mode_history_user_file ON god_mode_hand_history(user_id, source_file_id);
CREATE INDEX IF NOT EXISTS idx_god_mode_history_session ON god_mode_hand_history(session_id);
CREATE INDEX IF NOT EXISTS idx_god_mode_history_game ON god_mode_hand_history(game_id);
CREATE INDEX IF NOT EXISTS idx_god_mode_history_played ON god_mode_hand_history(played_at DESC);

-- ============================================================================
-- TABLE 4: god_mode_leaderboard (Bonus: Competitive Rankings)
-- ============================================================================
CREATE TABLE IF NOT EXISTS god_mode_leaderboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES game_registry(id) ON DELETE CASCADE,
    
    -- Best Performance
    highest_level INTEGER NOT NULL DEFAULT 1,
    best_accuracy NUMERIC NOT NULL DEFAULT 0,  -- 0.00 to 1.00
    fastest_level_10_ms BIGINT,  -- Time to complete level 10
    
    -- Aggregate Stats
    total_hands INTEGER NOT NULL DEFAULT 0,
    total_correct INTEGER NOT NULL DEFAULT 0,
    
    -- Rankings
    global_rank INTEGER,
    
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_god_mode_leaderboard_rank ON god_mode_leaderboard(game_id, highest_level DESC, best_accuracy DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE game_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE god_mode_user_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE god_mode_hand_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE god_mode_leaderboard ENABLE ROW LEVEL SECURITY;

-- game_registry: Public read, admin write
CREATE POLICY "game_registry_read" ON game_registry FOR SELECT USING (true);

-- user_session: Users can only access their own sessions
CREATE POLICY "session_select_own" ON god_mode_user_session 
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "session_insert_own" ON god_mode_user_session 
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "session_update_own" ON god_mode_user_session 
    FOR UPDATE USING (auth.uid() = user_id);

-- hand_history: Users can only access their own history
CREATE POLICY "history_select_own" ON god_mode_hand_history 
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "history_insert_own" ON god_mode_hand_history 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- leaderboard: Public read, user write own
CREATE POLICY "leaderboard_read" ON god_mode_leaderboard FOR SELECT USING (true);
CREATE POLICY "leaderboard_upsert_own" ON god_mode_leaderboard 
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if user has seen this exact visual hand
CREATE OR REPLACE FUNCTION has_user_seen_hand(
    p_user_id UUID,
    p_file_id TEXT,
    p_variant_hash TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM god_mode_hand_history
        WHERE user_id = p_user_id
          AND source_file_id = p_file_id
          AND variant_hash = p_variant_hash
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get next available suit rotation for a file
CREATE OR REPLACE FUNCTION get_available_rotation(
    p_user_id UUID,
    p_file_id TEXT
) RETURNS TEXT AS $$
DECLARE
    used_rotations TEXT[];
    available TEXT;
BEGIN
    -- Get all rotations user has seen for this file
    SELECT ARRAY_AGG(variant_hash) INTO used_rotations
    FROM god_mode_hand_history
    WHERE user_id = p_user_id AND source_file_id = p_file_id;
    
    -- Find first available rotation (0-3)
    IF used_rotations IS NULL OR NOT ('0' = ANY(used_rotations)) THEN
        RETURN '0';
    ELSIF NOT ('1' = ANY(used_rotations)) THEN
        RETURN '1';
    ELSIF NOT ('2' = ANY(used_rotations)) THEN
        RETURN '2';
    ELSIF NOT ('3' = ANY(used_rotations)) THEN
        RETURN '3';
    ELSE
        RETURN NULL;  -- All rotations exhausted for this file
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update session after hand completion
CREATE OR REPLACE FUNCTION update_session_after_hand(
    p_session_id UUID,
    p_is_correct BOOLEAN,
    p_chip_penalty INTEGER
) RETURNS void AS $$
BEGIN
    UPDATE god_mode_user_session
    SET 
        current_round_hands_played = current_round_hands_played + 1,
        current_round_correct = current_round_correct + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
        health_chips = GREATEST(0, health_chips - p_chip_penalty),
        total_hands_played = total_hands_played + 1,
        total_correct = total_correct + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
        last_played_at = NOW(),
        updated_at = NOW()
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER game_registry_updated_at
    BEFORE UPDATE ON game_registry
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER god_mode_session_updated_at
    BEFORE UPDATE ON god_mode_user_session
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SAMPLE DATA: Seed a few example games
-- ============================================================================
INSERT INTO game_registry (title, slug, engine_type, category, config, description) VALUES
    ('Short Stack Ninja', 'short-stack-ninja', 'CHART', 'Preflop', 
     '{"stack_depth": 15, "position_filter": ["BTN", "SB", "BB"], "difficulty_curve": [85,87,89,91,93,95,97,98,99,100]}',
     'Master push/fold decisions with 15BB stacks'),
    ('Tilt Control', 'tilt-control', 'SCENARIO', 'Mental Game',
     '{"scenario_type": "bad_beat", "difficulty_curve": [85,87,89,91,93,95,97,98,99,100]}',
     'Stay focused after brutal coolers and bad beats'),
    ('Flop Texture Master', 'flop-texture-master', 'PIO', 'Postflop',
     '{"street": "flop", "stack_depth": 100, "difficulty_curve": [85,87,89,91,93,95,97,98,99,100]}',
     'Learn optimal c-bet frequencies on every flop texture')
ON CONFLICT (slug) DO NOTHING;
