-- ═══════════════════════════════════════════════════════════════════════════
-- BANKROLL PHASE 2 TABLES
-- Goals, Session Notes, Geofence Visits
-- ═══════════════════════════════════════════════════════════════════════════

-- Goal Setting Table
CREATE TABLE IF NOT EXISTS bankroll_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_amount NUMERIC NOT NULL,
    period TEXT CHECK (period IN ('weekly', 'monthly', 'quarterly', 'yearly')),
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add notes and media to ledger entries (for session deep dive)
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS media_urls JSONB;

-- Geofence Visits Table (for 12-hour reminder)
CREATE TABLE IF NOT EXISTS geofence_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL,
    venue_name TEXT,
    entered_at TIMESTAMPTZ NOT NULL,
    notified BOOLEAN DEFAULT FALSE,
    session_logged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE bankroll_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofence_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own goals" ON bankroll_goals
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own goals" ON bankroll_goals
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goals" ON bankroll_goals
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals" ON bankroll_goals
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own geofence visits" ON geofence_visits
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own geofence visits" ON geofence_visits
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own geofence visits" ON geofence_visits
    FOR UPDATE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bankroll_goals_user ON bankroll_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_bankroll_goals_period ON bankroll_goals(period, end_date);
CREATE INDEX IF NOT EXISTS idx_geofence_visits_user ON geofence_visits(user_id);
CREATE INDEX IF NOT EXISTS idx_geofence_visits_pending ON geofence_visits(notified, entered_at) 
    WHERE notified = FALSE;
