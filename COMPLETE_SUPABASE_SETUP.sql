-- ============================================================================
-- GOD MODE ENGINE - COMPLETE DATABASE SETUP
-- Copy ALL of this and paste into Supabase SQL Editor, then click "Run"
-- ============================================================================

-- TABLE 1: game_registry - Stores the 100 training games
CREATE TABLE IF NOT EXISTS game_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
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
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_game_registry_engine ON game_registry(engine_type);
CREATE INDEX IF NOT EXISTS idx_game_registry_active ON game_registry(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_game_registry_slug ON game_registry(slug);

-- TABLE 2: user_session - Tracks player progress
CREATE TABLE IF NOT EXISTS god_mode_user_session (
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
    UNIQUE(user_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_god_mode_session_user ON god_mode_user_session(user_id);
CREATE INDEX IF NOT EXISTS idx_god_mode_session_game ON god_mode_user_session(game_id);
CREATE INDEX IF NOT EXISTS idx_god_mode_session_recent ON god_mode_user_session(last_played_at DESC);

-- TABLE 3: hand_history - Every hand played
CREATE TABLE IF NOT EXISTS god_mode_hand_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES game_registry(id) ON DELETE CASCADE,
    session_id UUID REFERENCES god_mode_user_session(id) ON DELETE SET NULL,
    source_file_id TEXT NOT NULL,
    variant_hash TEXT NOT NULL,
    UNIQUE(user_id, source_file_id, variant_hash),
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
    played_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_god_mode_history_user ON god_mode_hand_history(user_id);
CREATE INDEX IF NOT EXISTS idx_god_mode_history_user_file ON god_mode_hand_history(user_id, source_file_id);
CREATE INDEX IF NOT EXISTS idx_god_mode_history_session ON god_mode_hand_history(session_id);
CREATE INDEX IF NOT EXISTS idx_god_mode_history_game ON god_mode_hand_history(game_id);
CREATE INDEX IF NOT EXISTS idx_god_mode_history_played ON god_mode_hand_history(played_at DESC);

-- TABLE 4: leaderboard
CREATE TABLE IF NOT EXISTS god_mode_leaderboard (
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
    UNIQUE(user_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_god_mode_leaderboard_rank ON god_mode_leaderboard(game_id, highest_level DESC, best_accuracy DESC);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE game_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE god_mode_user_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE god_mode_hand_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE god_mode_leaderboard ENABLE ROW LEVEL SECURITY;

-- POLICIES
DROP POLICY IF EXISTS "game_registry_read" ON game_registry;
CREATE POLICY "game_registry_read" ON game_registry FOR SELECT USING (true);

DROP POLICY IF EXISTS "session_select_own" ON god_mode_user_session;
DROP POLICY IF EXISTS "session_insert_own" ON god_mode_user_session;
DROP POLICY IF EXISTS "session_update_own" ON god_mode_user_session;
CREATE POLICY "session_select_own" ON god_mode_user_session FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "session_insert_own" ON god_mode_user_session FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "session_update_own" ON god_mode_user_session FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "history_select_own" ON god_mode_hand_history;
DROP POLICY IF EXISTS "history_insert_own" ON god_mode_hand_history;
CREATE POLICY "history_select_own" ON god_mode_hand_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "history_insert_own" ON god_mode_hand_history FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "leaderboard_read" ON god_mode_leaderboard;
DROP POLICY IF EXISTS "leaderboard_upsert_own" ON god_mode_leaderboard;
CREATE POLICY "leaderboard_read" ON god_mode_leaderboard FOR SELECT USING (true);
CREATE POLICY "leaderboard_upsert_own" ON god_mode_leaderboard FOR ALL USING (auth.uid() = user_id);

-- HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION has_user_seen_hand(p_user_id UUID, p_file_id TEXT, p_variant_hash TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM god_mode_hand_history WHERE user_id = p_user_id AND source_file_id = p_file_id AND variant_hash = p_variant_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_available_rotation(p_user_id UUID, p_file_id TEXT)
RETURNS TEXT AS $$
DECLARE
    used_rotations TEXT[];
BEGIN
    SELECT ARRAY_AGG(variant_hash) INTO used_rotations FROM god_mode_hand_history WHERE user_id = p_user_id AND source_file_id = p_file_id;
    IF used_rotations IS NULL OR NOT ('0' = ANY(used_rotations)) THEN RETURN '0';
    ELSIF NOT ('1' = ANY(used_rotations)) THEN RETURN '1';
    ELSIF NOT ('2' = ANY(used_rotations)) THEN RETURN '2';
    ELSIF NOT ('3' = ANY(used_rotations)) THEN RETURN '3';
    ELSE RETURN NULL;
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

-- TRIGGERS
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS game_registry_updated_at ON game_registry;
CREATE TRIGGER game_registry_updated_at BEFORE UPDATE ON game_registry FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS god_mode_session_updated_at ON god_mode_user_session;
CREATE TRIGGER god_mode_session_updated_at BEFORE UPDATE ON god_mode_user_session FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SUCCESS! Your God Mode tables are now ready.
-- ============================================================================
-- ════════════════════════════════════════════════════════════════════════════
-- GOD MODE ENGINE — Game Registry Seed
-- Auto-generated by seed_games.py
-- 100 Games with auto-assigned engine types and configs
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO game_registry (title, slug, engine_type, category, config, description, icon_url)
VALUES
    ('Push/Fold Mastery', 'pushfold-mastery', 'CHART', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 20, "format": "MTT", "ante": true}'::jsonb, 'Short stack all-in ranges', '🎯'),
    ('ICM Fundamentals', 'icm-fundamentals', 'CHART', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true}'::jsonb, 'Independent chip model basics', '📊'),
    ('Bubble Pressure', 'bubble-pressure', 'CHART', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true}'::jsonb, 'Pre-money survival tactics', '🫧'),
    ('Final Table ICM', 'final-table-icm', 'CHART', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Pay jump optimization', '🏆'),
    ('PKO Bounty Hunter', 'pko-bounty-hunter', 'PIO', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true}'::jsonb, 'Bounty chip calculations', '💰'),
    ('Satellite Survival', 'satellite-survival', 'CHART', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Extreme ICM discipline', '🎫'),
    ('Deep Stack MTT', 'deep-stack-mtt', 'PIO', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 200, "format": "MTT", "ante": true}'::jsonb, 'Early tournament strategy', '📚'),
    ('Short Stack Ninja', 'short-stack-ninja', 'CHART', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 20, "format": "MTT", "ante": true}'::jsonb, '10-20BB mastery', '⚡'),
    ('Resteal Wars', 'resteal-wars', 'CHART', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true}'::jsonb, '3-bet shove defense', '🔄'),
    ('Squeeze Master', 'squeeze-master', 'CHART', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Multi-way pressure plays', '🤏'),
    ('Ante Theft', 'ante-theft', 'CHART', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true}'::jsonb, 'BB ante exploitation', '💸'),
    ('Big Stack Bully', 'big-stack-bully', 'SCENARIO', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true}'::jsonb, 'Covering stack pressure', '🦈'),
    ('Ladder Jump', 'ladder-jump', 'SCENARIO', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Pay jump patience', '🪜'),
    ('3-Max Blitz', '3-max-blitz', 'PIO', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Final 3 aggression', '⚔️'),
    ('Heads Up Duel', 'heads-up-duel', 'PIO', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true, "time_pressure": true, "shot_clock_seconds": 10}'::jsonb, '1v1 tournament finale', '👑'),
    ('Chip & Chair', 'chip-chair', 'CHART', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true}'::jsonb, 'Micro-stack comeback', '🪑'),
    ('Blind Defense MTT', 'blind-defense-mtt', 'CHART', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true}'::jsonb, 'Tournament BB play', '🛡️'),
    ('Button Warfare', 'button-warfare', 'PIO', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true}'::jsonb, 'BTN open/defend ranges', '🔘'),
    ('Stop & Go', 'stop-go', 'CHART', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true}'::jsonb, 'Delayed shove tactics', '🚦'),
    ('Multi-way Bounty', 'multi-way-bounty', 'PIO', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'PKO pot odds overlay', '💎'),
    ('Check-Shove Power', 'check-shove-power', 'CHART', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Postflop aggression', '💪'),
    ('Clock Management', 'clock-management', 'PIO', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true}'::jsonb, 'Time bank strategy', '⏰'),
    ('Registration Edge', 'registration-edge', 'PIO', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true}'::jsonb, 'Late reg advantages', '📝'),
    ('Triple Barrel', 'triple-barrel', 'PIO', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'MTT bluff sequences', '🎰'),
    ('Level 10: MTT Champion', 'level-10-mtt-champion', 'PIO', 'MTT', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "MTT", "ante": true, "time_pressure": true, "shot_clock_seconds": 10}'::jsonb, 'Full tourney simulation', '🏅'),
    ('Preflop Blueprint', 'preflop-blueprint', 'CHART', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, '6-Max RFI ranges', '♠️'),
    ('C-Bet Academy', 'c-bet-academy', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, 'Continuation bet sizing', '💥'),
    ('Defense Matrix', 'defense-matrix', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, 'Facing aggression', '🛡️'),
    ('Value Extractor', 'value-extractor', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, 'Thin value betting', '💎'),
    ('Bluff Catcher', 'bluff-catcher', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Hero call decisions', '🃏'),
    ('Position Power', 'position-power', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, 'IP vs OOP dynamics', '🪑'),
    ('3-Bet Pots', '3-bet-pots', 'CHART', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, 'Elevated pot strategy', '🔺'),
    ('4-Bet Wars', '4-bet-wars', 'CHART', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Pre-flop escalation', '⚔️'),
    ('Deep Stack Cash', 'deep-stack-cash', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 200, "format": "CASH", "ante": false, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, '200BB+ strategy', '📚'),
    ('Short Stack Rat', 'short-stack-rat', 'CHART', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 20, "format": "CASH", "ante": false}'::jsonb, '40BB hit-and-run', '🐀'),
    ('Donk Defense', 'donk-defense', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, 'Facing lead bets', '🫏'),
    ('River Decisions', 'river-decisions', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Final street mastery', '🌊'),
    ('Probe Betting', 'probe-betting', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, 'Taking the initiative', '🔍'),
    ('Check-Raise Art', 'check-raise-art', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Aggression tactics', '📈'),
    ('Overbetting', 'overbetting', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Polarized big bets', '💣'),
    ('Multi-way Pots', 'multi-way-pots', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, '3+ player dynamics', '👥'),
    ('Rake Awareness', 'rake-awareness', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, 'Rake-adjusted strategy', '🧮'),
    ('Blind vs Blind', 'blind-vs-blind', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, 'SB vs BB warfare', '🥊'),
    ('Straddle Games', 'straddle-games', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, 'Extended pot dynamics', '🦶'),
    ('Table Selection', 'table-selection', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, 'Finding soft spots', '🎯'),
    ('Mixed Strategies', 'mixed-strategies', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Frequency execution', '🎲'),
    ('Texture Reading', 'texture-reading', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, 'Board analysis', '🔬'),
    ('Equity Denial', 'equity-denial', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, 'Protection betting', '🚫'),
    ('Pot Control', 'pot-control', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false}'::jsonb, 'Medium strength hands', '⚖️'),
    ('Level 10: Cash King', 'level-10-cash-king', 'PIO', 'CASH', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "CASH", "ante": false, "time_pressure": true, "shot_clock_seconds": 10}'::jsonb, 'Full session grind', '👑'),
    ('Hyper Opener', 'hyper-opener', 'CHART', 'SPINS', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SPIN", "players": 3}'::jsonb, '3-Max early game', '⚡'),
    ('Jackpot Pressure', 'jackpot-pressure', 'SCENARIO', 'SPINS', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SPIN", "players": 3, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'High multiplier play', '🎰'),
    ('Button Limp', 'button-limp', 'PIO', 'SPINS', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SPIN", "players": 3}'::jsonb, 'Trap strategies', '🪤'),
    ('SNG Endgame', 'sng-endgame', 'PIO', 'SPINS', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SPIN", "players": 3}'::jsonb, 'Final 2 battles', '🏁'),
    ('Phase Shifting', 'phase-shifting', 'CHART', 'SPINS', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SPIN", "players": 3}'::jsonb, 'Stack depth transitions', '🔄'),
    ('Limb Trap', 'limb-trap', 'PIO', 'SPINS', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SPIN", "players": 3}'::jsonb, 'Limp-call lines', '🕳️'),
    ('50/50 Survival', '5050-survival', 'CHART', 'SPINS', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SPIN", "players": 3, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Extreme ICM', '⚖️'),
    ('Aggression Mode', 'aggression-mode', 'SCENARIO', 'SPINS', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SPIN", "players": 3}'::jsonb, 'Constant pressure', '🔥'),
    ('Chip Lead Lock', 'chip-lead-lock', 'PIO', 'SPINS', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SPIN", "players": 3}'::jsonb, 'Protecting the lead', '🔒'),
    ('Level 10: Spin Master', 'level-10-spin-master', 'PIO', 'SPINS', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SPIN", "players": 3, "time_pressure": true, "shot_clock_seconds": 10}'::jsonb, 'Full spin simulation', '🌀'),
    ('Tilt Control', 'tilt-control', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true}'::jsonb, 'Emotional regulation', '😤'),
    ('Timing Discipline', 'timing-discipline', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true}'::jsonb, 'Consistent action speed', '⏱️'),
    ('Cooler Cage', 'cooler-cage', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Bad beat resilience', '🥶'),
    ('Pressure Chamber', 'pressure-chamber', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'High stakes decisions', '🔥'),
    ('Patience Master', 'patience-master', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true}'::jsonb, 'Waiting for spots', '🐢'),
    ('Focus Flow', 'focus-flow', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true}'::jsonb, 'Concentration drills', '🎯'),
    ('Result Detachment', 'result-detachment', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Process over outcome', '🧘'),
    ('Confidence Builder', 'confidence-builder', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true}'::jsonb, 'Trust your reads', '💪'),
    ('Fear Eraser', 'fear-eraser', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true}'::jsonb, 'Bold decision making', '🦁'),
    ('Ego Killer', 'ego-killer', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true}'::jsonb, 'Humble learning', '🪞'),
    ('Session Stamina', 'session-stamina', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true}'::jsonb, 'Long session focus', '🏃'),
    ('Snap Decision', 'snap-decision', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true}'::jsonb, 'Instinct training', '⚡'),
    ('Tell Blindness', 'tell-blindness', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true}'::jsonb, 'Ignoring false reads', '🙈'),
    ('Bankroll Mind', 'bankroll-mind', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true}'::jsonb, 'Money management', '💰'),
    ('Winners Tilt', 'winners-tilt', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true}'::jsonb, 'Staying sharp ahead', '🎢'),
    ('Variance Zen', 'variance-zen', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Accepting swings', '☯️'),
    ('Study Habits', 'study-habits', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true}'::jsonb, 'Effective learning', '📖'),
    ('Table Image', 'table-image', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true}'::jsonb, 'Perception awareness', '🎭'),
    ('Autopilot Escape', 'autopilot-escape', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true}'::jsonb, 'Staying present', '✈️'),
    ('Level 10: Mind Master', 'level-10-mind-master', 'SCENARIO', 'PSYCHOLOGY', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SCENARIO", "rigged_rng": true, "time_pressure": true, "shot_clock_seconds": 10}'::jsonb, 'Full mental game', '🧠'),
    ('Solver Mimicry', 'solver-mimicry', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'GTO execution', '🤖'),
    ('Blocker Logic', 'blocker-logic', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Card removal effects', '🚫'),
    ('Node Locking', 'node-locking', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 10}'::jsonb, 'Exploitative trees', '🔒'),
    ('Range Construction', 'range-construction', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Building strategies', '🏗️'),
    ('Frequency Math', 'frequency-math', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Mixed strategy %', '📊'),
    ('EV Calculations', 'ev-calculations', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Expected value math', '🧮'),
    ('Indifference Theory', 'indifference-theory', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 10}'::jsonb, 'Making villains neutral', '⚖️'),
    ('Range Advantage', 'range-advantage', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Equity distribution', '📈'),
    ('Nut Advantage', 'nut-advantage', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Polarization spots', '🥜'),
    ('Board Coverage', 'board-coverage', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Range composition', '🎨'),
    ('SPR Mastery', 'spr-mastery', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true}'::jsonb, 'Stack-to-pot ratios', '📐'),
    ('MDF Defender', 'mdf-defender', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Minimum defense', '🛡️'),
    ('Combo Counting', 'combo-counting', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true}'::jsonb, 'Hand combinations', '🔢'),
    ('Bet Sizing Theory', 'bet-sizing-theory', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Geometric sizing', '📏'),
    ('Population Reads', 'population-reads', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true}'::jsonb, 'Pool tendencies', '👥'),
    ('Exploit Ladder', 'exploit-ladder', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Deviation strategy', '🪜'),
    ('Capped Ranges', 'capped-ranges', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 15}'::jsonb, 'Playing condensed', '📦'),
    ('Polarity Index', 'polarity-index', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 10}'::jsonb, 'Range splitting', '🧲'),
    ('Solver Scripts', 'solver-scripts', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 10}'::jsonb, 'Sim interpretation', '💻'),
    ('Level 10: GTO Apex', 'level-10-gto-apex', 'PIO', 'ADVANCED', '{"difficulty_curve": [85, 87, 89, 91, 93, 95, 97, 98, 99, 100], "hands_per_round": 20, "max_level": 10, "stack_depth": 100, "format": "SOLVER", "show_frequencies": true, "time_pressure": true, "shot_clock_seconds": 10}'::jsonb, 'Ultimate theory test', '🏛️')
ON CONFLICT (slug) DO UPDATE SET
    engine_type = EXCLUDED.engine_type,
    config = EXCLUDED.config,
    description = EXCLUDED.description,
    icon_url = EXCLUDED.icon_url,
    updated_at = NOW();

-- ════════════════════════════════════════════════════════════════════════════
-- Engine Distribution: PIO=56, CHART=20, SCENARIO=24
-- ════════════════════════════════════════════════════════════════════════════