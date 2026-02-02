-- ═══════════════════════════════════════════════════════════════════════════
-- PERSONAL ASSISTANT — DATABASE SCHEMA
-- Virtual Sandbox & Leak Finder
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- I. VILLAIN ARCHETYPES (Reference Table)
-- The 10 canonical villain types for sandbox simulations
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS villain_archetypes (
    id VARCHAR(30) PRIMARY KEY,
    display_name VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,

    -- Statistical tendencies
    vpip_low DECIMAL(5,2),          -- Voluntarily Put In Pot (low end)
    vpip_high DECIMAL(5,2),         -- Voluntarily Put In Pot (high end)
    pfr_low DECIMAL(5,2),           -- Preflop Raise (low end)
    pfr_high DECIMAL(5,2),          -- Preflop Raise (high end)
    aggression_factor DECIMAL(4,2), -- (Bet + Raise) / Call

    -- Postflop tendencies
    fold_to_cbet_low DECIMAL(5,2),
    fold_to_cbet_high DECIMAL(5,2),
    cbet_frequency DECIMAL(5,2),

    -- Bluff classification
    bluff_frequency VARCHAR(20) NOT NULL, -- 'very_low', 'low', 'moderate', 'high', 'very_high', 'balanced'

    -- Display
    icon VARCHAR(10),
    color VARCHAR(7),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert canonical archetypes
INSERT INTO villain_archetypes (id, display_name, description, vpip_low, vpip_high, pfr_low, pfr_high, aggression_factor, bluff_frequency, icon, color) VALUES
('gto_neutral', 'GTO-Neutral', 'Balanced, solver-like play. Mixed frequencies, difficult to exploit.', 22, 28, 18, 24, 2.5, 'balanced', NULL, '#6b7280'),
('tight_passive', 'Tight-Passive', 'Nitty and cautious. Folds often, rarely bluffs, only continues with strong hands.', 12, 18, 8, 12, 1.2, 'low', NULL, '#3b82f6'),
('loose_passive', 'Calling Station', 'Calls too much with a wide range. Passive postflop, hard to bluff.', 35, 50, 8, 15, 0.8, 'very_low', NULL, '#22c55e'),
('tight_aggressive', 'TAG', 'Solid, standard winning player. Selective preflop, aggressive when involved.', 18, 24, 14, 20, 2.8, 'moderate', NULL, '#f59e0b'),
('loose_aggressive', 'LAG', 'Wide range, lots of pressure. Plays many hands aggressively.', 28, 38, 22, 32, 3.2, 'high', NULL, '#ef4444'),
('over_bluffer', 'Over-Bluffer', 'Bluffs too frequently. High aggression but unbalanced toward air.', 25, 35, 18, 28, 3.5, 'very_high', NULL, '#ec4899'),
('under_bluffer', 'Under-Bluffer', 'Not enough bluffs. Value-heavy, straightforward, easy to fold against.', 20, 28, 15, 22, 2.0, 'very_low', NULL, '#8b5cf6'),
('fit_or_fold', 'Fit-or-Fold', 'Binary decisions. Continues only with strong made hands, folds everything else.', 22, 30, 12, 18, 1.5, 'very_low', NULL, '#64748b'),
('icm_scared', 'ICM-Scared', 'Tournament survival focus. Folds marginal spots, very risk-averse near money.', 15, 22, 10, 16, 1.8, 'low', NULL, '#0ea5e9'),
('icm_pressure', 'ICM-Pressure', 'Exploits ICM fear. Applies maximum pressure at bubbles and pay jumps.', 26, 36, 20, 30, 3.0, 'high', NULL, '#dc2626')
ON CONFLICT (id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- II. SOLVER TEMPLATES
-- Pre-computed GTO solutions for fast lookup
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS solver_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_hash VARCHAR(64) UNIQUE NOT NULL,

    -- Scenario configuration
    game_type VARCHAR(20) NOT NULL,        -- 'cash_chipev', 'tournament_chipev', 'tournament_icm'
    stack_depth_bb INTEGER NOT NULL,
    effective_stack_bb INTEGER NOT NULL,

    -- Position configuration
    hero_position VARCHAR(10) NOT NULL,
    villain_positions TEXT[] NOT NULL,
    num_players INTEGER NOT NULL,

    -- Board state
    board_texture VARCHAR(50),             -- 'dry', 'wet', 'monotone', etc.
    street VARCHAR(10) NOT NULL,           -- 'preflop', 'flop', 'turn', 'river'

    -- Solver output
    action_tree JSONB NOT NULL,            -- Full decision tree
    frequencies JSONB NOT NULL,            -- Action frequencies
    ev_data JSONB,                         -- EV for each action

    -- Provenance
    solver_name VARCHAR(30) NOT NULL,      -- 'piosolver', 'gto+', 'monkersolver'
    solver_version VARCHAR(20) NOT NULL,
    solve_date DATE,
    iterations BIGINT,
    exploitability DECIMAL(8,4),           -- Nash distance

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_solver_templates_hash ON solver_templates(template_hash);
CREATE INDEX idx_solver_templates_lookup ON solver_templates(game_type, stack_depth_bb, hero_position, street);


-- ═══════════════════════════════════════════════════════════════════════════
-- III. SANDBOX SESSIONS
-- User sandbox exploration sessions
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sandbox_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,

    -- Hero configuration
    hero_hand VARCHAR(10) NOT NULL,        -- e.g., 'AQo', 'KJs', '77'
    hero_position VARCHAR(10) NOT NULL,    -- 'UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'
    hero_stack_bb INTEGER NOT NULL,

    -- Game configuration
    game_type VARCHAR(20) NOT NULL,        -- 'cash_chipev', 'tournament_icm'
    num_opponents INTEGER NOT NULL,

    -- Board state
    board_flop VARCHAR(10),                -- e.g., 'Qs7h3c'
    board_turn VARCHAR(5),                 -- e.g., 'Ac'
    board_river VARCHAR(5),                -- e.g., 'Kd'

    -- Villain configuration
    villain_config JSONB NOT NULL,         -- [{seat: 1, archetype: 'tag', stack_bb: 100}, ...]

    -- Betting structure
    bet_sizing_preset VARCHAR(20) NOT NULL, -- 'standard', 'wide', 'polar', 'custom'
    custom_bet_sizes JSONB,                -- If custom

    -- Pot context
    pot_type VARCHAR(30),                  -- 'single_raised', '3bet', '4bet', 'limped'
    pot_size_bb DECIMAL(8,2),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sandbox_sessions_user ON sandbox_sessions(user_id);
CREATE INDEX idx_sandbox_sessions_created ON sandbox_sessions(created_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════
-- IV. SANDBOX RESULTS
-- GTO analysis results for sandbox sessions
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sandbox_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sandbox_sessions(id) NOT NULL,

    -- Primary recommendation
    primary_action VARCHAR(50) NOT NULL,   -- 'bet_33', 'check', 'raise_pot', etc.
    primary_frequency DECIMAL(5,2) NOT NULL,
    primary_ev DECIMAL(8,4),

    -- Alternative actions
    alternative_actions JSONB,             -- [{action: 'check', frequency: 20, ev: 1.2}, ...]

    -- Data source (CRITICAL for integrity)
    data_source VARCHAR(30) NOT NULL,      -- 'solver_verified', 'solver_approx', 'ai_approx'
    solver_template_id UUID REFERENCES solver_templates(id),
    approximation_notes TEXT,              -- If approximated, explain why

    -- Confidence & sensitivity
    confidence VARCHAR(20) NOT NULL,       -- 'high', 'medium', 'low'
    sensitivity_flags TEXT[],              -- ['stack_sensitive', 'icm_sensitive', 'position_sensitive']

    -- Why not explanations
    why_not_check TEXT,
    why_not_bet_large TEXT,
    why_not_fold TEXT,

    -- Truth seal for reproducibility
    truth_seal JSONB NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sandbox_results_session ON sandbox_results(session_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- V. USER LEAKS
-- Detected strategic weaknesses over time
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_leaks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,

    -- Leak identification
    leak_type VARCHAR(100) NOT NULL,       -- 'overfolding_to_cbets', 'lack_of_river_bluffs', etc.
    leak_category VARCHAR(50) NOT NULL,    -- 'preflop', 'flop', 'turn', 'river', 'sizing'
    situation_class VARCHAR(100) NOT NULL, -- 'MP_vs_cbet_srp', 'BB_vs_river_bet_srp', etc.

    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'emerging',  -- 'emerging', 'persistent', 'improving', 'resolved'
    confidence VARCHAR(20) NOT NULL,                 -- 'high', 'medium', 'low'

    -- EV impact
    avg_ev_loss_bb DECIMAL(8,4),
    total_ev_loss_bb DECIMAL(10,4),
    occurrence_count INTEGER DEFAULT 1,

    -- Temporal tracking
    first_detected_at TIMESTAMPTZ DEFAULT NOW(),
    last_detected_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,

    -- Trend data for charts
    trend_data JSONB,                      -- [{date: '2024-03', value: 52}, {date: '2024-04', value: 58}, ...]
    optimal_frequency DECIMAL(5,2),        -- What GTO says
    current_frequency DECIMAL(5,2),        -- What user does

    -- Explanation
    explanation TEXT,
    why_leaking_ev TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_leaks_user ON user_leaks(user_id);
CREATE INDEX idx_user_leaks_status ON user_leaks(user_id, status);
CREATE INDEX idx_user_leaks_type ON user_leaks(leak_type);


-- ═══════════════════════════════════════════════════════════════════════════
-- VI. LEAK HAND EXAMPLES
-- Specific hands that demonstrate a leak
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS leak_hand_examples (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    leak_id UUID REFERENCES user_leaks(id) ON DELETE CASCADE NOT NULL,
    hand_history_id UUID,                  -- Reference to actual hand if available

    -- Situation snapshot
    situation_snapshot JSONB NOT NULL,     -- Full hand context

    -- Analysis
    hero_action VARCHAR(50) NOT NULL,      -- What user did
    gto_action VARCHAR(50) NOT NULL,       -- What GTO recommends
    gto_frequency DECIMAL(5,2),            -- How often GTO takes that action
    ev_loss_bb DECIMAL(8,4),               -- EV lost on this specific hand

    -- Board & context
    board VARCHAR(15),
    pot_size_bb DECIMAL(8,2),
    hero_position VARCHAR(10),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leak_examples_leak ON leak_hand_examples(leak_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- VII. LEAK REMEDIATION TRACKING
-- Track user attempts to fix leaks
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS leak_remediation_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    leak_id UUID REFERENCES user_leaks(id) NOT NULL,
    user_id UUID REFERENCES users(id) NOT NULL,

    -- Remediation type
    remediation_type VARCHAR(30) NOT NULL, -- 'sandbox_practice', 'focused_training', 'review_examples'

    -- Reference to activity
    sandbox_session_id UUID REFERENCES sandbox_sessions(id),
    training_game_id UUID,

    -- Outcome
    completed BOOLEAN DEFAULT FALSE,
    result_notes TEXT,

    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_remediation_leak ON leak_remediation_attempts(leak_id);
CREATE INDEX idx_remediation_user ON leak_remediation_attempts(user_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- VIII. SESSION ANALYSIS QUEUE
-- Track analyzed sessions for leak detection
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS session_analysis_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,

    -- Session reference
    session_type VARCHAR(30) NOT NULL,     -- 'arena', 'club', 'external'
    session_id UUID,
    external_session_ref VARCHAR(100),

    -- Analysis status
    status VARCHAR(20) DEFAULT 'pending',  -- 'pending', 'analyzing', 'completed', 'failed'

    -- Stats
    hands_analyzed INTEGER,
    new_leaks_found INTEGER DEFAULT 0,
    existing_leaks_updated INTEGER DEFAULT 0,

    -- Timing
    session_ended_at TIMESTAMPTZ,
    analysis_started_at TIMESTAMPTZ,
    analysis_completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_session_analysis_user ON session_analysis_log(user_id);
CREATE INDEX idx_session_analysis_status ON session_analysis_log(status);


-- ═══════════════════════════════════════════════════════════════════════════
-- IX. CONTEXT VERIFICATION LOG
-- Audit trail for context checks (integrity protection)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS context_verification_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) NOT NULL,

    -- Request context
    request_type VARCHAR(30) NOT NULL,     -- 'sandbox', 'leak_review', 'hand_analysis'
    claimed_context VARCHAR(30) NOT NULL,  -- What user/system claimed
    verified_context VARCHAR(30) NOT NULL, -- What system verified

    -- Verdict
    access_granted BOOLEAN NOT NULL,
    denial_reason TEXT,

    -- Audit
    ip_address INET,
    user_agent TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_context_log_user ON context_verification_log(user_id);
CREATE INDEX idx_context_log_denied ON context_verification_log(access_granted) WHERE access_granted = FALSE;


-- ═══════════════════════════════════════════════════════════════════════════
-- X. USER STATS SUMMARY
-- Aggregated stats for Strategy Hub display
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_assistant_stats (
    user_id UUID PRIMARY KEY REFERENCES users(id),

    -- Session counts
    total_sessions_reviewed INTEGER DEFAULT 0,
    total_hands_analyzed INTEGER DEFAULT 0,

    -- Leak tracking
    active_leaks_count INTEGER DEFAULT 0,
    resolved_leaks_count INTEGER DEFAULT 0,
    total_ev_saved_bb DECIMAL(12,4) DEFAULT 0, -- From fixing leaks

    -- Sandbox usage
    sandbox_sessions_count INTEGER DEFAULT 0,
    last_sandbox_at TIMESTAMPTZ,

    -- Last analysis
    last_leak_scan_at TIMESTAMPTZ,

    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- XI. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE sandbox_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sandbox_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_leaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE leak_hand_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE leak_remediation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_analysis_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_verification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_assistant_stats ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY sandbox_sessions_user_policy ON sandbox_sessions
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY sandbox_results_user_policy ON sandbox_results
    FOR ALL USING (session_id IN (SELECT id FROM sandbox_sessions WHERE user_id = auth.uid()));

CREATE POLICY user_leaks_policy ON user_leaks
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY leak_examples_policy ON leak_hand_examples
    FOR ALL USING (leak_id IN (SELECT id FROM user_leaks WHERE user_id = auth.uid()));

CREATE POLICY remediation_policy ON leak_remediation_attempts
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY session_analysis_policy ON session_analysis_log
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY context_log_policy ON context_verification_log
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY user_stats_policy ON user_assistant_stats
    FOR ALL USING (user_id = auth.uid());

-- Solver templates and archetypes are public read
CREATE POLICY solver_templates_read ON solver_templates
    FOR SELECT USING (true);

CREATE POLICY archetypes_read ON villain_archetypes
    FOR SELECT USING (true);


-- ═══════════════════════════════════════════════════════════════════════════
-- XII. HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Update leak status based on trend
CREATE OR REPLACE FUNCTION update_leak_status()
RETURNS TRIGGER AS $$
BEGIN
    -- If frequency is within 2% of optimal, mark as resolved
    IF ABS(NEW.current_frequency - NEW.optimal_frequency) <= 2 THEN
        NEW.status := 'resolved';
        NEW.resolved_at := NOW();
    -- If trending toward optimal (current closer than before)
    ELSIF NEW.current_frequency IS NOT NULL AND OLD.current_frequency IS NOT NULL THEN
        IF ABS(NEW.current_frequency - NEW.optimal_frequency) < ABS(OLD.current_frequency - OLD.optimal_frequency) THEN
            NEW.status := 'improving';
        ELSIF NEW.occurrence_count >= 10 THEN
            NEW.status := 'persistent';
        END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leak_status_update
    BEFORE UPDATE ON user_leaks
    FOR EACH ROW
    EXECUTE FUNCTION update_leak_status();

-- Update user stats on leak changes
CREATE OR REPLACE FUNCTION update_user_assistant_stats()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_assistant_stats (user_id, active_leaks_count, resolved_leaks_count)
    VALUES (
        COALESCE(NEW.user_id, OLD.user_id),
        (SELECT COUNT(*) FROM user_leaks WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) AND status != 'resolved'),
        (SELECT COUNT(*) FROM user_leaks WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) AND status = 'resolved')
    )
    ON CONFLICT (user_id) DO UPDATE SET
        active_leaks_count = EXCLUDED.active_leaks_count,
        resolved_leaks_count = EXCLUDED.resolved_leaks_count,
        updated_at = NOW();

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_stats_on_leak_change
    AFTER INSERT OR UPDATE OR DELETE ON user_leaks
    FOR EACH ROW
    EXECUTE FUNCTION update_user_assistant_stats();
