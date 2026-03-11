-- Fix commander_cash_transactions type CHECK constraint
-- The original migration only allowed: buy_in, cash_out, add_on
-- The cashier system now also records: time_purchase, membership, void
-- Without this fix, those transaction types silently fail at the DB level

-- Drop the old CHECK constraint on type
ALTER TABLE commander_cash_transactions DROP CONSTRAINT IF EXISTS commander_cash_transactions_type_check;

-- Add new CHECK constraint with all valid types
ALTER TABLE commander_cash_transactions ADD CONSTRAINT commander_cash_transactions_type_check
  CHECK (type IN ('buy_in', 'cash_out', 'add_on', 'time_purchase', 'membership', 'void'));

-- Also update the Supabase schema constraint that was defined in the CREATE TABLE
-- In case the above name doesn't match, try the auto-generated name pattern
DO $$ BEGIN
  ALTER TABLE commander_cash_transactions DROP CONSTRAINT IF EXISTS commander_cash_transactions_type_check1;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Also add voided_at, voided_by, void_reason columns for proper void audit trail
DO $$ BEGIN
  ALTER TABLE commander_cash_transactions ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
  ALTER TABLE commander_cash_transactions ADD COLUMN IF NOT EXISTS voided_by UUID;
  ALTER TABLE commander_cash_transactions ADD COLUMN IF NOT EXISTS void_reason TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
