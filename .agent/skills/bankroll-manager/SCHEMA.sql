-- ═══════════════════════════════════════════════════════════════════════════
-- BANKROLL MANAGER — DATABASE SCHEMA
-- Military-Grade Immutable Ledger System
-- Version: 1.0
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- EXTENSION REQUIREMENTS
-- ═══════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════════════════
-- I. LOCATIONS TABLE
-- Tracks all gambling venues with GPS coordinates
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bankroll_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'USA',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    venue_type TEXT CHECK (venue_type IN ('casino', 'card_room', 'home_game', 'online', 'sportsbook', 'other')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bankroll_locations_user ON bankroll_locations(user_id);
CREATE INDEX idx_bankroll_locations_name ON bankroll_locations(user_id, name);

-- ═══════════════════════════════════════════════════════════════════════════
-- II. TRIPS TABLE
-- Groups sessions and expenses under travel events
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bankroll_trips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    location_id UUID REFERENCES bankroll_locations(id),
    start_date DATE NOT NULL,
    end_date DATE,
    purpose TEXT, -- 'cash_grind', 'tournament_series', 'mixed', 'vacation'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bankroll_trips_user ON bankroll_trips(user_id);
CREATE INDEX idx_bankroll_trips_dates ON bankroll_trips(user_id, start_date, end_date);

-- ═══════════════════════════════════════════════════════════════════════════
-- III. MAIN LEDGER TABLE (IMMUTABLE APPEND-ONLY)
-- The core financial truth engine - NO DELETES ALLOWED
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bankroll_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- CATEGORY (Hard Separation per Master Plan)
    category TEXT NOT NULL CHECK (category IN (
        'poker_cash',      -- Cash game sessions
        'poker_mtt',       -- Tournament entries
        'casino_table',    -- Blackjack, Roulette, Craps, etc.
        'slots',           -- Slot machines (enhanced scrutiny)
        'sports',          -- Sports betting
        'expense'          -- Travel/life costs
    )),

    -- UNIVERSAL FIELDS (All Entries)
    location_id UUID REFERENCES bankroll_locations(id),
    trip_id UUID REFERENCES bankroll_trips(id),
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,

    -- FINANCIAL DATA
    gross_in DECIMAL(12, 2) NOT NULL DEFAULT 0,    -- Money put in
    gross_out DECIMAL(12, 2) NOT NULL DEFAULT 0,   -- Money taken out
    net_result DECIMAL(12, 2) GENERATED ALWAYS AS (gross_out - gross_in) STORED,

    -- METADATA
    notes TEXT,
    emotional_tag TEXT CHECK (emotional_tag IN ('neutral', 'tilted', 'confident', 'exhausted', 'rushed', 'revenge')),
    assistant_flagged BOOLEAN DEFAULT FALSE,
    flag_reason TEXT,

    -- POKER-SPECIFIC FIELDS
    stakes TEXT,                    -- e.g., '2/5 NL', '5/10 PLO'
    game_type TEXT,                 -- 'nlhe', 'plo', 'mixed', etc.
    table_count INTEGER DEFAULT 1,  -- For multi-tabling
    buy_in_count INTEGER DEFAULT 1, -- Number of buy-ins
    seat_type TEXT,                 -- 'direct', 'list', 'must_move'
    table_texture TEXT CHECK (table_texture IN ('soft', 'medium', 'tough', 'unknown')),

    -- TOURNAMENT-SPECIFIC FIELDS
    tournament_name TEXT,
    buy_in_amount DECIMAL(10, 2),
    rake_amount DECIMAL(10, 2),
    reentry_count INTEGER DEFAULT 0,
    addon_count INTEGER DEFAULT 0,
    finish_position INTEGER,
    field_size INTEGER,
    payout_amount DECIMAL(12, 2),
    format_tags TEXT[], -- ['turbo', 'bounty', 'satellite', 'deepstack']

    -- CASINO TABLE SPECIFIC
    casino_game TEXT, -- 'blackjack', 'roulette', 'craps', 'baccarat', 'other'
    betting_style TEXT CHECK (betting_style IN ('conservative', 'moderate', 'aggressive', 'martingale')),

    -- SLOTS SPECIFIC (Enhanced Scrutiny)
    slot_machine TEXT,
    slot_theme TEXT,

    -- SPORTS BETTING SPECIFIC
    sport TEXT,
    bet_type TEXT, -- 'moneyline', 'spread', 'over_under', 'parlay', 'prop', 'live'
    odds TEXT,
    parlay_legs INTEGER,
    bet_result TEXT CHECK (bet_result IN ('win', 'loss', 'push', 'pending')),

    -- EXPENSE SPECIFIC
    expense_type TEXT CHECK (expense_type IN (
        'flight', 'hotel', 'airbnb', 'gas', 'rental_car', 'rideshare',
        'meals', 'tips', 'tournament_fee', 'series_fee', 'visa', 'other'
    )),
    expense_vendor TEXT,

    -- AUDIT TRAIL (IMMUTABLE)
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    is_revision BOOLEAN DEFAULT FALSE,
    original_entry_id UUID REFERENCES bankroll_ledger(id),
    revision_reason TEXT,

    -- Constraint: Revisions must reference original
    CONSTRAINT valid_revision CHECK (
        (is_revision = FALSE AND original_entry_id IS NULL) OR
        (is_revision = TRUE AND original_entry_id IS NOT NULL)
    )
);

-- Performance Indexes
CREATE INDEX idx_bankroll_ledger_user ON bankroll_ledger(user_id);
CREATE INDEX idx_bankroll_ledger_category ON bankroll_ledger(user_id, category);
CREATE INDEX idx_bankroll_ledger_date ON bankroll_ledger(user_id, entry_date DESC);
CREATE INDEX idx_bankroll_ledger_location ON bankroll_ledger(user_id, location_id);
CREATE INDEX idx_bankroll_ledger_trip ON bankroll_ledger(trip_id);
CREATE INDEX idx_bankroll_ledger_net ON bankroll_ledger(user_id, net_result);

-- ═══════════════════════════════════════════════════════════════════════════
-- IV. BANKROLL SEGMENTS
-- Logical separation of funds (Poker, Casino, Sports, Life)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bankroll_segments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    segment_type TEXT NOT NULL CHECK (segment_type IN ('poker', 'casino', 'sports', 'life')),
    current_balance DECIMAL(12, 2) DEFAULT 0,
    initial_deposit DECIMAL(12, 2) DEFAULT 0,
    is_read_only BOOLEAN DEFAULT FALSE, -- Life bankroll can be read-only
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, segment_type)
);

CREATE INDEX idx_bankroll_segments_user ON bankroll_segments(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- V. SEGMENT TRANSFERS (Logged Explicitly)
-- Track money movement between bankroll segments
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bankroll_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    from_segment TEXT NOT NULL CHECK (from_segment IN ('poker', 'casino', 'sports', 'life', 'external')),
    to_segment TEXT NOT NULL CHECK (to_segment IN ('poker', 'casino', 'sports', 'life', 'external')),
    amount DECIMAL(12, 2) NOT NULL,
    reason TEXT,
    assistant_flagged BOOLEAN DEFAULT FALSE,
    flag_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_bankroll_transfers_user ON bankroll_transfers(user_id);
CREATE INDEX idx_bankroll_transfers_date ON bankroll_transfers(user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- VI. USER RULES (Stop-Loss, Max Buy-in, etc.)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bankroll_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rule_type TEXT NOT NULL CHECK (rule_type IN (
        'stop_loss_session',    -- Max loss per session
        'stop_loss_day',        -- Max loss per day
        'stop_loss_month',      -- Max loss per month
        'max_buyin_percent',    -- Max buy-in as % of bankroll
        'max_mtt_percent',      -- Max tournament buy-in as %
        'shot_take_threshold',  -- When to take shots at higher stakes
        'win_goal_session',     -- Session win goal
        'time_limit_session'    -- Max hours per session
    )),
    value DECIMAL(12, 2) NOT NULL,
    is_strict BOOLEAN DEFAULT FALSE, -- Strict mode = hard enforcement
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, rule_type)
);

CREATE INDEX idx_bankroll_rules_user ON bankroll_rules(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- VII. RULE VIOLATIONS (Permanent Log)
-- Track when user breaks their own rules
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bankroll_rule_violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rule_id UUID NOT NULL REFERENCES bankroll_rules(id),
    ledger_entry_id UUID REFERENCES bankroll_ledger(id),
    violation_type TEXT NOT NULL,
    rule_value DECIMAL(12, 2),
    actual_value DECIMAL(12, 2),
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_bankroll_violations_user ON bankroll_rule_violations(user_id);
CREATE INDEX idx_bankroll_violations_date ON bankroll_rule_violations(user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- VIII. ASSISTANT MEMORY
-- Personal Assistant remembers user patterns, warnings, promises
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bankroll_assistant_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    memory_type TEXT NOT NULL CHECK (memory_type IN (
        'goal',           -- User-stated goals
        'warning',        -- Past warnings given
        'promise',        -- User promises to self
        'pattern',        -- Detected patterns
        'justification',  -- User's past justifications
        'intervention'    -- Past intervention events
    )),
    content TEXT NOT NULL,
    location_id UUID REFERENCES bankroll_locations(id),
    category TEXT,
    severity INTEGER DEFAULT 1, -- 1-5 scale
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ -- Some memories can expire
);

CREATE INDEX idx_bankroll_memory_user ON bankroll_assistant_memory(user_id);
CREATE INDEX idx_bankroll_memory_type ON bankroll_assistant_memory(user_id, memory_type);
CREATE INDEX idx_bankroll_memory_location ON bankroll_assistant_memory(user_id, location_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- IX. ASSISTANT ALERTS
-- Generated alerts based on analysis
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bankroll_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL CHECK (alert_type IN (
        'venue_warning',      -- Location has bad history
        'leak_detected',      -- Category leak (e.g., slots)
        'stake_risk',         -- Losing at specific stake
        'pattern_alert',      -- Behavioral pattern detected
        'rule_reminder',      -- Upcoming rule threshold
        'streak_alert',       -- Losing/winning streak
        'tilt_warning',       -- Possible tilt detected
        'expense_warning'     -- Trip expenses exceeding profit
    )),
    severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB, -- Additional context
    location_id UUID REFERENCES bankroll_locations(id),
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bankroll_alerts_user ON bankroll_alerts(user_id);
CREATE INDEX idx_bankroll_alerts_unread ON bankroll_alerts(user_id, is_read) WHERE is_read = FALSE;

-- ═══════════════════════════════════════════════════════════════════════════
-- X. ENTRY REVISIONS VIEW
-- View for tracking edits to ledger entries (originals remain immutable)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW bankroll_entry_revisions AS
SELECT
    r.id as revision_id,
    r.original_entry_id,
    o.category as original_category,
    o.gross_in as original_gross_in,
    o.gross_out as original_gross_out,
    o.net_result as original_net_result,
    o.entry_date as original_entry_date,
    o.created_at as original_created_at,
    r.category as revised_category,
    r.gross_in as revised_gross_in,
    r.gross_out as revised_gross_out,
    r.net_result as revised_net_result,
    r.entry_date as revised_entry_date,
    r.revision_reason,
    r.created_at as revision_created_at,
    r.user_id
FROM bankroll_ledger r
JOIN bankroll_ledger o ON r.original_entry_id = o.id
WHERE r.is_revision = TRUE;

-- ═══════════════════════════════════════════════════════════════════════════
-- XI. LOCATION STATS (Materialized View for Performance)
-- Pre-computed stats per location
-- ═══════════════════════════════════════════════════════════════════════════
CREATE MATERIALIZED VIEW IF NOT EXISTS bankroll_location_stats AS
SELECT
    user_id,
    location_id,
    category,
    COUNT(*) as session_count,
    SUM(net_result) as total_net,
    AVG(net_result) as avg_net,
    SUM(CASE WHEN net_result > 0 THEN 1 ELSE 0 END) as winning_sessions,
    SUM(CASE WHEN net_result < 0 THEN 1 ELSE 0 END) as losing_sessions,
    SUM(EXTRACT(EPOCH FROM (end_time - start_time))/3600) as total_hours,
    CASE
        WHEN SUM(EXTRACT(EPOCH FROM (end_time - start_time))/3600) > 0
        THEN SUM(net_result) / SUM(EXTRACT(EPOCH FROM (end_time - start_time))/3600)
        ELSE 0
    END as hourly_rate,
    MAX(entry_date) as last_session
FROM bankroll_ledger
WHERE is_revision = FALSE
GROUP BY user_id, location_id, category;

CREATE UNIQUE INDEX idx_location_stats_unique ON bankroll_location_stats(user_id, location_id, category);

-- ═══════════════════════════════════════════════════════════════════════════
-- XI. ROW LEVEL SECURITY POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE bankroll_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankroll_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankroll_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankroll_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankroll_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankroll_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankroll_rule_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankroll_assistant_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE bankroll_alerts ENABLE ROW LEVEL SECURITY;

-- Locations policies
CREATE POLICY "Users can view own locations" ON bankroll_locations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own locations" ON bankroll_locations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own locations" ON bankroll_locations FOR UPDATE USING (auth.uid() = user_id);

-- Trips policies
CREATE POLICY "Users can view own trips" ON bankroll_trips FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trips" ON bankroll_trips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trips" ON bankroll_trips FOR UPDATE USING (auth.uid() = user_id);

-- Ledger policies (NO DELETE - IMMUTABLE)
CREATE POLICY "Users can view own ledger" ON bankroll_ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ledger" ON bankroll_ledger FOR INSERT WITH CHECK (auth.uid() = user_id);
-- NO UPDATE POLICY - ledger is append-only, use revisions
-- NO DELETE POLICY - ledger is immutable

-- Segments policies
CREATE POLICY "Users can view own segments" ON bankroll_segments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own segments" ON bankroll_segments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own segments" ON bankroll_segments FOR UPDATE USING (auth.uid() = user_id);

-- Transfers policies
CREATE POLICY "Users can view own transfers" ON bankroll_transfers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own transfers" ON bankroll_transfers FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Rules policies
CREATE POLICY "Users can view own rules" ON bankroll_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own rules" ON bankroll_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own rules" ON bankroll_rules FOR UPDATE USING (auth.uid() = user_id);

-- Violations policies (NO DELETE - permanent record)
CREATE POLICY "Users can view own violations" ON bankroll_rule_violations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can acknowledge violations" ON bankroll_rule_violations FOR UPDATE USING (auth.uid() = user_id);

-- Memory policies
CREATE POLICY "Users can view own memory" ON bankroll_assistant_memory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own memory" ON bankroll_assistant_memory FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Alerts policies
CREATE POLICY "Users can view own alerts" ON bankroll_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own alerts" ON bankroll_alerts FOR UPDATE USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- XII. HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to refresh location stats
CREATE OR REPLACE FUNCTION refresh_bankroll_location_stats()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY bankroll_location_stats;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to refresh stats on new ledger entries
CREATE TRIGGER refresh_location_stats_trigger
AFTER INSERT ON bankroll_ledger
FOR EACH STATEMENT
EXECUTE FUNCTION refresh_bankroll_location_stats();

-- Function to calculate user's total bankroll
CREATE OR REPLACE FUNCTION get_total_bankroll(p_user_id UUID)
RETURNS DECIMAL AS $$
DECLARE
    total DECIMAL(12, 2);
BEGIN
    SELECT COALESCE(SUM(current_balance), 0)
    INTO total
    FROM bankroll_segments
    WHERE user_id = p_user_id AND segment_type != 'life';

    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Function to get leak percentage for a category
CREATE OR REPLACE FUNCTION get_leak_percentage(p_user_id UUID, p_category TEXT, p_location_id UUID DEFAULT NULL)
RETURNS DECIMAL AS $$
DECLARE
    category_loss DECIMAL(12, 2);
    total_loss DECIMAL(12, 2);
BEGIN
    -- Get losses for the specific category
    SELECT COALESCE(ABS(SUM(CASE WHEN net_result < 0 THEN net_result ELSE 0 END)), 0)
    INTO category_loss
    FROM bankroll_ledger
    WHERE user_id = p_user_id
      AND category = p_category
      AND is_revision = FALSE
      AND (p_location_id IS NULL OR location_id = p_location_id);

    -- Get total losses
    SELECT COALESCE(ABS(SUM(CASE WHEN net_result < 0 THEN net_result ELSE 0 END)), 0)
    INTO total_loss
    FROM bankroll_ledger
    WHERE user_id = p_user_id
      AND is_revision = FALSE
      AND (p_location_id IS NULL OR location_id = p_location_id);

    IF total_loss = 0 THEN
        RETURN 0;
    END IF;

    RETURN ROUND((category_loss / total_loss) * 100, 1);
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- XIII. INITIAL DATA SETUP FUNCTION
-- Call this after user signs up to initialize their bankroll segments
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION initialize_user_bankroll(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Create default segments
    INSERT INTO bankroll_segments (user_id, segment_type, current_balance, initial_deposit)
    VALUES
        (p_user_id, 'poker', 0, 0),
        (p_user_id, 'casino', 0, 0),
        (p_user_id, 'sports', 0, 0),
        (p_user_id, 'life', 0, 0)
    ON CONFLICT (user_id, segment_type) DO NOTHING;

    -- Create default rules
    INSERT INTO bankroll_rules (user_id, rule_type, value, is_active)
    VALUES
        (p_user_id, 'stop_loss_day', 1000, TRUE),
        (p_user_id, 'max_buyin_percent', 5, TRUE)
    ON CONFLICT (user_id, rule_type) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════
