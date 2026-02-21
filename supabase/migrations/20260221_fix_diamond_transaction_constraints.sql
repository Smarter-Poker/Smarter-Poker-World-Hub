-- ═══════════════════════════════════════════════════════════════════════════
-- Fix Diamond Transactions CHECK Constraint Conflict
-- The type column had two conflicting CHECK constraints:
--   1. diamond_transactions_type_check: only allowed specific categories
--   2. diamond_transactions_type_check1: only allowed 'earn' or 'spend'
-- The RPC functions write 'earn'/'spend' to `type` and the category to
-- `transaction_type`, which violated constraint #1.
-- This caused ALL reward transactions to silently fail and roll back.
--
-- Applied to production: Feb 21, 2026
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop ALL conflicting check constraints on diamond_transactions
ALTER TABLE diamond_transactions DROP CONSTRAINT IF EXISTS diamond_transactions_type_check;
ALTER TABLE diamond_transactions DROP CONSTRAINT IF EXISTS diamond_transactions_type_check1;
ALTER TABLE diamond_transactions DROP CONSTRAINT IF EXISTS diamond_transactions_transaction_type_check;

-- The type column now stores 'earn' or 'spend' (action direction)
-- The transaction_type column stores the specific category (daily_login, share, etc.)
-- No constraint needed — values are always set by the RPC functions
