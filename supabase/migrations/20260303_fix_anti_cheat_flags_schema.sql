-- ════════════════════════════════════════════════════════════════
-- Fix anti_cheat_flags: API expects many columns that don't exist
-- ════════════════════════════════════════════════════════════════

-- 1. Add club_id — API filters all queries by club_id
ALTER TABLE anti_cheat_flags ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_acf_club ON anti_cheat_flags(club_id);

-- 2. Add status column — API uses text-based status ('open', 'reviewed', 'dismissed', 'actioned')
--    Schema only has 'resolved' BOOLEAN which doesn't support the workflow
ALTER TABLE anti_cheat_flags ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open'
  CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned'));

-- 3. Add review_notes — API stores reviewer notes
ALTER TABLE anti_cheat_flags ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- 4. Add table_id — API stores which table the flag originated from
ALTER TABLE anti_cheat_flags ADD COLUMN IF NOT EXISTS table_id UUID;

-- 5. Rename columns: API uses reviewed_by/reviewed_at but schema has resolved_by/resolved_at
--    We ADD the new names rather than rename, to avoid breaking existing data
ALTER TABLE anti_cheat_flags ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id);
ALTER TABLE anti_cheat_flags ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Note: close_table_session RPC already exists in 20260301_missing_tables_and_rpcs.sql

-- Fix rakeback_periods status CHECK: code uses 'claiming' as intermediate state
ALTER TABLE rakeback_periods DROP CONSTRAINT IF EXISTS rakeback_periods_status_check;
ALTER TABLE rakeback_periods ADD CONSTRAINT rakeback_periods_status_check
  CHECK (status IN ('open', 'closed', 'claiming', 'claimed'));

-- Add balance_after to chip_transactions (rakeback.js writes it)
ALTER TABLE chip_transactions ADD COLUMN IF NOT EXISTS balance_after NUMERIC(14,2);

-- Fix commission_records.agent_id: missing FK to agents table
-- settle-period.js status action does .select('*, agents!inner(user_id)')
-- PostgREST !inner joins require a FK relationship to work
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'commission_records_agent_id_fkey'
      AND table_name = 'commission_records'
  ) THEN
    ALTER TABLE commission_records
      ADD CONSTRAINT commission_records_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Fix commission_history: missing period_id column
-- settle-period.js close action inserts period_id but column doesn't exist
-- PostgREST silently ignores it, leaving records unlinked to periods
ALTER TABLE commission_history ADD COLUMN IF NOT EXISTS period_id UUID REFERENCES settlement_periods(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_commission_hist_period ON commission_history (period_id);

-- RPC: Atomic increment of settlement period counters
-- record_rake RPC updates clubs.total_rake but NOT settlement_periods
-- This RPC is called per-hand to keep the open period's counters accurate
CREATE OR REPLACE FUNCTION increment_settlement_counters(
  p_club_id UUID,
  p_rake NUMERIC,
  p_hands INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE settlement_periods
  SET total_rake_collected = COALESCE(total_rake_collected, 0) + COALESCE(p_rake, 0),
      total_hands_dealt = COALESCE(total_hands_dealt, 0) + COALESCE(p_hands, 0)
  WHERE club_id = p_club_id
    AND status = 'open';
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- Fix rakeback_distributions: club_id declared as INTEGER but clubs.id is UUID
-- Original in 20260228_auto_settlement_invoicing.sql has wrong type
-- CREATE TABLE IF NOT EXISTS won't fix it if table was created with INTEGER
-- Must DROP and recreate (table should be empty since FK would have failed)
-- ════════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS rakeback_distributions CASCADE;
CREATE TABLE IF NOT EXISTS rakeback_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES settlement_periods(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  agent_user_id UUID NOT NULL,
  player_user_id UUID NOT NULL,
  player_rake_contributed NUMERIC(14,2) NOT NULL DEFAULT 0,
  rakeback_percentage NUMERIC(5,4) NOT NULL DEFAULT 0,
  rakeback_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'transferred', 'failed')),
  transferred_at TIMESTAMPTZ,
  chip_transfer_id UUID,
  error_message TEXT,
  invoice_id UUID REFERENCES settlement_invoices(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rakeback_dist_period ON rakeback_distributions(club_id, period_id);
CREATE INDEX IF NOT EXISTS idx_rakeback_dist_status ON rakeback_distributions(status);

-- Fix is_club_settlement_locked: param was INTEGER, should be UUID
CREATE OR REPLACE FUNCTION is_club_settlement_locked(p_club_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM settlement_locks
    WHERE club_id = p_club_id
      AND is_active = true
      AND unlock_at > NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
