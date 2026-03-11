-- ═══════════════════════════════════════════════════════════════════════════
-- STAKING ARRANGEMENTS & TOURNAMENT SERIES TABLES
-- Track backer relationships, makeup, and series-level tournament ROI
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. STAKING ARRANGEMENTS
-- Track relationships with backers/stakers
CREATE TABLE IF NOT EXISTS staking_arrangements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Backer info
    backer_name TEXT NOT NULL,
    backer_email TEXT,
    backer_phone TEXT,
    
    -- Terms
    split_percentage INTEGER NOT NULL DEFAULT 50, -- Player's share (e.g., 50 = 50/50)
    markup_percentage INTEGER DEFAULT 0, -- Additional markup on buy-ins
    
    -- Tracking
    starting_makeup DECIMAL DEFAULT 0,
    current_makeup DECIMAL DEFAULT 0,
    
    -- Period
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT true,
    
    -- Notes
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. STAKING SESSIONS
-- Link specific sessions to staking arrangements
CREATE TABLE IF NOT EXISTS staking_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    arrangement_id UUID NOT NULL REFERENCES staking_arrangements(id) ON DELETE CASCADE,
    ledger_entry_id UUID NOT NULL REFERENCES bankroll_ledger(id) ON DELETE CASCADE,
    
    -- Calculated splits
    gross_result DECIMAL NOT NULL,
    player_share DECIMAL NOT NULL,
    backer_share DECIMAL NOT NULL,
    
    -- Makeup adjustment
    makeup_before DECIMAL,
    makeup_after DECIMAL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(arrangement_id, ledger_entry_id)
);

-- 3. TOURNAMENT SERIES
-- Group events by series (WSOP, WPT, etc.)
CREATE TABLE IF NOT EXISTS tournament_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Series info
    name TEXT NOT NULL, -- "WSOP 2026", "WPT Choctaw Spring"
    series_type TEXT CHECK (series_type IN ('wsop', 'wpt', 'wpt_online', 'mspt', 'regional', 'online', 'other')),
    
    -- Location + dates
    location TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    
    -- Budget
    planned_budget DECIMAL,
    
    -- Notes
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Add series_id to bankroll_ledger
ALTER TABLE bankroll_ledger 
    ADD COLUMN IF NOT EXISTS series_id UUID REFERENCES tournament_series(id);

-- 5. EXPENSE RECEIPTS
-- Store scanned receipt data
CREATE TABLE IF NOT EXISTS expense_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Link to trip or series
    trip_id UUID REFERENCES trips(id),
    series_id UUID REFERENCES tournament_series(id),
    
    -- Receipt data
    category TEXT CHECK (category IN ('buy_in', 'hotel', 'flights', 'rental_car', 'gas', 'meals', 'transport', 'tips', 'tournament', 'other')),
    amount DECIMAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    vendor TEXT,
    location TEXT,
    receipt_date DATE,
    description TEXT,
    
    -- Tax info
    is_tax_deductible BOOLEAN DEFAULT true,
    
    -- Image storage
    image_url TEXT,
    ocr_confidence INTEGER, -- 0-100
    ocr_raw_data JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

-- Staking Arrangements
ALTER TABLE staking_arrangements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own staking arrangements" ON staking_arrangements
    FOR ALL USING (auth.uid() = user_id);

-- Staking Sessions
ALTER TABLE staking_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own staking sessions" ON staking_sessions
    FOR ALL USING (
        arrangement_id IN (SELECT id FROM staking_arrangements WHERE user_id = auth.uid())
    );

-- Tournament Series
ALTER TABLE tournament_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own tournament series" ON tournament_series
    FOR ALL USING (auth.uid() = user_id);

-- Expense Receipts
ALTER TABLE expense_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own expense receipts" ON expense_receipts
    FOR ALL USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_staking_arrangements_user ON staking_arrangements(user_id);
CREATE INDEX IF NOT EXISTS idx_staking_arrangements_active ON staking_arrangements(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_staking_sessions_arrangement ON staking_sessions(arrangement_id);

CREATE INDEX IF NOT EXISTS idx_tournament_series_user ON tournament_series(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_series_dates ON tournament_series(user_id, start_date);
CREATE INDEX IF NOT EXISTS idx_bankroll_ledger_series ON bankroll_ledger(series_id);

CREATE INDEX IF NOT EXISTS idx_expense_receipts_user ON expense_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_trip ON expense_receipts(trip_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_series ON expense_receipts(series_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_category ON expense_receipts(user_id, category);
