-- ════════════════════════════════════════════════════════════════
-- Fix settlement_invoices: missing columns from stripped-down recreation
-- The 20260303_fix_settlement_periods_columns migration dropped the full
-- settlement_invoices table (to fix INTEGER→UUID) but recreated it with
-- a minimal schema. This adds back all columns the code needs.
-- ════════════════════════════════════════════════════════════════

-- 1. Add missing party type columns
ALTER TABLE settlement_invoices ADD COLUMN IF NOT EXISTS from_entity_type TEXT;
ALTER TABLE settlement_invoices ADD COLUMN IF NOT EXISTS to_entity_type TEXT;

-- 2. Add missing financial columns
ALTER TABLE settlement_invoices ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE settlement_invoices ADD COLUMN IF NOT EXISTS net_amount NUMERIC(14,2) DEFAULT 0;
ALTER TABLE settlement_invoices ADD COLUMN IF NOT EXISTS deductions NUMERIC(14,2) DEFAULT 0;
ALTER TABLE settlement_invoices ADD COLUMN IF NOT EXISTS breakdown JSONB DEFAULT '{}';

-- 3. Add missing transfer tracking columns
ALTER TABLE settlement_invoices ADD COLUMN IF NOT EXISTS chips_transferred BOOLEAN DEFAULT false;
ALTER TABLE settlement_invoices ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ;
ALTER TABLE settlement_invoices ADD COLUMN IF NOT EXISTS chip_transfer_id UUID;

-- 4. Fix invoice_type CHECK constraint to include all types used by code:
--    'union_to_club', 'club_to_agent', 'agent_to_subagent', 'agent_to_player'
--    The fix migration had 'agent_to_sub_agent' (wrong) and was missing 'agent_to_player'
ALTER TABLE settlement_invoices DROP CONSTRAINT IF EXISTS settlement_invoices_invoice_type_check;
ALTER TABLE settlement_invoices ADD CONSTRAINT settlement_invoices_invoice_type_check
  CHECK (invoice_type IN ('union_to_club', 'club_to_agent', 'agent_to_subagent', 'agent_to_player'));

-- 5. Fix status CHECK to include 'generated' (used by auto-settlement)
ALTER TABLE settlement_invoices DROP CONSTRAINT IF EXISTS settlement_invoices_status_check;
ALTER TABLE settlement_invoices ADD CONSTRAINT settlement_invoices_status_check
  CHECK (status IN ('pending', 'generated', 'paid', 'cancelled', 'overdue'));

-- 6. Fix is_club_settlement_locked function: parameter type was INTEGER, should be UUID
CREATE OR REPLACE FUNCTION is_club_settlement_locked(p_club_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM settlement_locks
    WHERE club_id = p_club_id
      AND is_active = true
      AND unlock_at > NOW()
  );
END;
$$;
