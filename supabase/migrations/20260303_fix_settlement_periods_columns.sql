-- ════════════════════════════════════════════════════════════════
-- Fix settlement_periods table to match application code
-- Both settle-period.js AND auto-settlement.js use these columns
-- but they were never added to the schema
-- ════════════════════════════════════════════════════════════════

-- Add missing columns used by settle-period.js and auto-settlement.js
ALTER TABLE settlement_periods ADD COLUMN IF NOT EXISTS union_id UUID REFERENCES unions(id) ON DELETE SET NULL;
ALTER TABLE settlement_periods ADD COLUMN IF NOT EXISTS period_number INTEGER DEFAULT 1;
ALTER TABLE settlement_periods ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE settlement_periods ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE settlement_periods ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;
ALTER TABLE settlement_periods ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
ALTER TABLE settlement_periods ADD COLUMN IF NOT EXISTS settled_by UUID REFERENCES auth.users(id);
ALTER TABLE settlement_periods ADD COLUMN IF NOT EXISTS total_player_winnings NUMERIC(14,2) DEFAULT 0;
ALTER TABLE settlement_periods ADD COLUMN IF NOT EXISTS total_player_losses NUMERIC(14,2) DEFAULT 0;

-- Backfill: copy period_start → start_at, period_end → end_at for any existing rows
UPDATE settlement_periods SET start_at = period_start WHERE start_at IS NULL AND period_start IS NOT NULL;
UPDATE settlement_periods SET end_at = period_end WHERE end_at IS NULL AND period_end IS NOT NULL;

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_settlement_periods_union ON settlement_periods(union_id) WHERE union_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_settlement_periods_status ON settlement_periods(club_id, status);

-- Also add missing columns to commission_records if needed
ALTER TABLE commission_records ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Also ensure commission_history table exists (used by settle-period.js)
CREATE TABLE IF NOT EXISTS commission_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  player_rake_generated NUMERIC(14,2) DEFAULT 0,
  commission_rate NUMERIC(5,4) DEFAULT 0,
  commission_earned NUMERIC(14,2) DEFAULT 0,
  sub_agent_commission NUMERIC(14,2) DEFAULT 0,
  net_commission NUMERIC(14,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Also ensure union_bbj_ledger table exists (used by record_rake RPC)
CREATE TABLE IF NOT EXISTS union_bbj_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  union_id UUID NOT NULL REFERENCES unions(id) ON DELETE CASCADE,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  hand_id TEXT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('contribution', 'payout', 'adjustment', 'seed')),
  main_amount NUMERIC(14,2) DEFAULT 0,
  backup_amount NUMERIC(14,2) DEFAULT 0,
  promo_amount NUMERIC(14,2) DEFAULT 0,
  main_balance_after NUMERIC(14,2) DEFAULT 0,
  backup_balance_after NUMERIC(14,2) DEFAULT 0,
  promo_balance_after NUMERIC(14,2) DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_union_bbj_ledger_union ON union_bbj_ledger(union_id);

-- RLS for new tables
ALTER TABLE commission_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY commission_history_svc ON commission_history FOR ALL TO service_role USING (true);

ALTER TABLE union_bbj_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY union_bbj_ledger_svc ON union_bbj_ledger FOR ALL TO service_role USING (true);
CREATE POLICY union_bbj_ledger_read ON union_bbj_ledger FOR SELECT
  USING (EXISTS (SELECT 1 FROM union_admins ua WHERE ua.union_id = union_bbj_ledger.union_id AND ua.user_id = auth.uid()));

-- ════════════════════════════════════════════════════════════════
-- Fix settlement_locks type mismatch (was INTEGER, should be UUID)
-- The original migration used club_id INTEGER but clubs.id is UUID.
-- Drop and recreate with correct types if they have wrong types.
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- Only fix if the table exists with wrong type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'settlement_locks' AND column_name = 'club_id' AND data_type = 'integer'
  ) THEN
    -- Drop and recreate with UUID type
    DROP TABLE IF EXISTS settlement_locks CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS settlement_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  lock_type TEXT NOT NULL DEFAULT 'weekly_settlement',
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unlock_at TIMESTAMPTZ NOT NULL,
  unlocked_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  lock_reason TEXT DEFAULT 'Weekly auto-settlement in progress',
  settlement_period_id UUID REFERENCES settlement_periods(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_locks_active ON settlement_locks(club_id, is_active) WHERE is_active = true;

ALTER TABLE settlement_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS settlement_locks_svc ON settlement_locks;
CREATE POLICY settlement_locks_svc ON settlement_locks FOR ALL TO service_role USING (true);

-- Fix settlement_invoices if it has wrong type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'settlement_invoices' AND column_name = 'club_id' AND data_type = 'integer'
  ) THEN
    DROP TABLE IF EXISTS settlement_invoices CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS settlement_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES settlement_periods(id) ON DELETE CASCADE,
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('union_to_club', 'club_to_agent', 'agent_to_sub_agent')),
  from_entity_id UUID,
  to_entity_id UUID,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'overdue')),
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE settlement_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS settlement_invoices_svc ON settlement_invoices;
CREATE POLICY settlement_invoices_svc ON settlement_invoices FOR ALL TO service_role USING (true);

-- Fix rakeback_payments if it has wrong type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'rakeback_payments' AND column_name = 'club_id' AND data_type = 'integer'
  ) THEN
    DROP TABLE IF EXISTS rakeback_payments CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS rakeback_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES settlement_periods(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  agent_user_id UUID NOT NULL,
  player_user_id UUID NOT NULL,
  player_rake_contribution NUMERIC(14,2) DEFAULT 0,
  rakeback_rate NUMERIC(5,4) DEFAULT 0,
  rakeback_amount NUMERIC(14,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE rakeback_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rakeback_payments_svc ON rakeback_payments;
CREATE POLICY rakeback_payments_svc ON rakeback_payments FOR ALL TO service_role USING (true);
