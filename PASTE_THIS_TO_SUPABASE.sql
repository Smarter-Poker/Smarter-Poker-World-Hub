-- ============================================================================
-- GOD MODE ENGINE - COMPLETE DATABASE SETUP (FIXED)
-- Copy ALL of this and paste into Supabase SQL Editor, then click "Run"
-- ============================================================================

-- STEP 1: Drop existing tables (if any) to start fresh
-- Drop in reverse dependency order
DROP TABLE IF EXISTS god_mode_leaderboard CASCADE;
DROP TABLE IF EXISTS god_mode_hand_history CASCADE;
DROP TABLE IF EXISTS god_mode_user_session CASCADE;
DROP TABLE IF EXISTS game_registry CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS has_user_seen_hand(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS get_available_rotation(UUID, TEXT);
DROP FUNCTION IF EXISTS update_session_after_hand(UUID, BOOLEAN, INTEGER);
DROP FUNCTION IF EXISTS update_updated_at();

-- ============================================================================
-- TABLE 1: game_registry - Stores the 100 training games
-- ============================================================================
CREATE TABLE game_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    engine_type TEXT NOT NULL CHECK (engine_type IN ('PIO', 'CHART', 'SCENARIO')),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    max_level INTEGER NOT NULL DEFAULT 10,
    hands_per_round INTEGER NOT NULL DEFAULT 20,
    icon_url TEXT,
    category TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_premium BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT game_registry_title_unique UNIQUE (title),
    CONSTRAINT game_registry_slug_unique UNIQUE (slug)
);

CREATE INDEX idx_game_registry_engine ON game_registry(engine_type);
CREATE INDEX idx_game_registry_active ON game_registry(is_active) WHERE is_active = true;
CREATE INDEX idx_game_registry_slug ON game_registry(slug);

-- ============================================================================
-- TABLE 2: god_mode_user_session - Tracks player progress
-- ============================================================================
CREATE TABLE god_mode_user_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES game_registry(id) ON DELETE CASCADE,
    current_level INTEGER NOT NULL DEFAULT 1 CHECK (current_level >= 1 AND current_level <= 10),
    highest_level_unlocked INTEGER NOT NULL DEFAULT 1,
    health_chips INTEGER NOT NULL DEFAULT 100 CHECK (health_chips >= 0 AND health_chips <= 100),
    current_round_hands_played INTEGER NOT NULL DEFAULT 0,
    current_round_correct INTEGER NOT NULL DEFAULT 0,
    current_round_started_at TIMESTAMPTZ,
    total_hands_played INTEGER NOT NULL DEFAULT 0,
    total_correct INTEGER NOT NULL DEFAULT 0,
    total_rounds_completed INTEGER NOT NULL DEFAULT 0,
    total_levels_mastered INTEGER NOT NULL DEFAULT 0,
    last_played_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT god_mode_user_session_unique UNIQUE (user_id, game_id)
);

CREATE INDEX idx_god_mode_session_user ON god_mode_user_session(user_id);
CREATE INDEX idx_god_mode_session_game ON god_mode_user_session(game_id);
CREATE INDEX idx_god_mode_session_recent ON god_mode_user_session(last_played_at DESC);

-- ============================================================================
-- TABLE 3: god_mode_hand_history - Every hand played
-- ============================================================================
CREATE TABLE god_mode_hand_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES game_registry(id) ON DELETE CASCADE,
    session_id UUID REFERENCES god_mode_user_session(id) ON DELETE SET NULL,
    source_file_id TEXT NOT NULL,
    variant_hash TEXT NOT NULL,
    hero_hand TEXT NOT NULL,
    board TEXT,
    level_at_play INTEGER NOT NULL,
    round_hand_number INTEGER NOT NULL,
    user_action TEXT NOT NULL,
    user_sizing NUMERIC,
    gto_action TEXT NOT NULL,
    gto_frequency NUMERIC,
    ev_of_user_action NUMERIC,
    ev_of_gto_action NUMERIC,
    ev_loss NUMERIC GENERATED ALWAYS AS (COALESCE(ev_of_gto_action, 0) - COALESCE(ev_of_user_action, 0)) STORED,
    is_correct BOOLEAN NOT NULL,
    is_indifferent BOOLEAN DEFAULT false,
    chip_penalty INTEGER DEFAULT 0,
    villain_action TEXT,
    villain_sizing NUMERIC,
    played_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT god_mode_hand_history_unique UNIQUE (user_id, source_file_id, variant_hash)
);

CREATE INDEX idx_god_mode_history_user ON god_mode_hand_history(user_id);
CREATE INDEX idx_god_mode_history_user_file ON god_mode_hand_history(user_id, source_file_id);
CREATE INDEX idx_god_mode_history_session ON god_mode_hand_history(session_id);
CREATE INDEX idx_god_mode_history_game ON god_mode_hand_history(game_id);
CREATE INDEX idx_god_mode_history_played ON god_mode_hand_history(played_at DESC);

-- ============================================================================
-- TABLE 4: god_mode_leaderboard - Competitive Rankings
-- ============================================================================
CREATE TABLE god_mode_leaderboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES game_registry(id) ON DELETE CASCADE,
    highest_level INTEGER NOT NULL DEFAULT 1,
    best_accuracy NUMERIC NOT NULL DEFAULT 0,
    fastest_level_10_ms BIGINT,
    total_hands INTEGER NOT NULL DEFAULT 0,
    total_correct INTEGER NOT NULL DEFAULT 0,
    global_rank INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT god_mode_leaderboard_unique UNIQUE (user_id, game_id)
);

CREATE INDEX idx_god_mode_leaderboard_rank ON god_mode_leaderboard(game_id, highest_level DESC, best_accuracy DESC);

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE game_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE god_mode_user_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE god_mode_hand_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE god_mode_leaderboard ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- game_registry: Anyone can read
CREATE POLICY "game_registry_read" ON game_registry FOR SELECT USING (true);

-- god_mode_user_session: Users can only access their own
CREATE POLICY "session_select_own" ON god_mode_user_session FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "session_insert_own" ON god_mode_user_session FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "session_update_own" ON god_mode_user_session FOR UPDATE USING (auth.uid() = user_id);

-- god_mode_hand_history: Users can only access their own
CREATE POLICY "history_select_own" ON god_mode_hand_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "history_insert_own" ON god_mode_hand_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- god_mode_leaderboard: Anyone can read, users can write their own
CREATE POLICY "leaderboard_read" ON god_mode_leaderboard FOR SELECT USING (true);
CREATE POLICY "leaderboard_upsert_own" ON god_mode_leaderboard FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION has_user_seen_hand(p_user_id UUID, p_file_id TEXT, p_variant_hash TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM god_mode_hand_history
        WHERE user_id = p_user_id
        AND source_file_id = p_file_id
        AND variant_hash = p_variant_hash
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_available_rotation(p_user_id UUID, p_file_id TEXT)
RETURNS TEXT AS $$
DECLARE
    used_rotations TEXT[];
BEGIN
    SELECT ARRAY_AGG(variant_hash) INTO used_rotations
    FROM god_mode_hand_history
    WHERE user_id = p_user_id AND source_file_id = p_file_id;

    IF used_rotations IS NULL OR NOT ('0' = ANY(used_rotations)) THEN
        RETURN '0';
    ELSIF NOT ('1' = ANY(used_rotations)) THEN
        RETURN '1';
    ELSIF NOT ('2' = ANY(used_rotations)) THEN
        RETURN '2';
    ELSIF NOT ('3' = ANY(used_rotations)) THEN
        RETURN '3';
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_session_after_hand(p_session_id UUID, p_is_correct BOOLEAN, p_chip_penalty INTEGER)
RETURNS void AS $$
BEGIN
    UPDATE god_mode_user_session
    SET current_round_hands_played = current_round_hands_played + 1,
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
-- SUCCESS! Your God Mode tables are now ready.
-- Next: Add the 100 training games using COMPLETE_SUPABASE_SETUP.sql
-- ============================================================================
