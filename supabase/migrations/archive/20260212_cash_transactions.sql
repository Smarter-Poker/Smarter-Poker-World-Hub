-- Cash Game Buy-In/Cash-Out Tracking
-- Tracks chip purchases and redemptions per player session

CREATE TABLE IF NOT EXISTS commander_cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL,
  session_id UUID REFERENCES commander_time_sessions(id),
  player_name TEXT NOT NULL,
  table_number INT,
  seat_number INT,
  type TEXT NOT NULL CHECK (type IN ('buy_in', 'cash_out', 'add_on')),
  amount DECIMAL(10,2) NOT NULL,
  chip_count DECIMAL(10,2),
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'comp', 'marker')),
  processed_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_tx_venue ON commander_cash_transactions(venue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_tx_session ON commander_cash_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_tx_table ON commander_cash_transactions(venue_id, table_number);

ALTER TABLE commander_cash_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON commander_cash_transactions FOR ALL USING (true);

-- Add game_id to time_sessions if not exists
DO $$ BEGIN
  ALTER TABLE commander_time_sessions ADD COLUMN IF NOT EXISTS game_id UUID;
  ALTER TABLE commander_time_sessions ADD COLUMN IF NOT EXISTS player_id UUID;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
