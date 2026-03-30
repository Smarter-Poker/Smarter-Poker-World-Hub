-- ═══════════════════════════════════════════════════════════════════════════════
-- Diamond Wallet Reconciliation — March 30, 2026
-- 
-- 1. Insert reconciliation transaction to bridge the gap between profiles.diamonds
--    (500,000) and the last diamond_transactions.balance_after (454,795).
--    This ~45,205 gap was caused by direct SQL profile.diamonds mutations that
--    bypassed the diamond_transactions ledger.
--
-- 2. Clean up orphaned test transactions (amount=0, description='test')
-- ═══════════════════════════════════════════════════════════════════════════════

-- Step 1: Delete orphaned test transactions (no balance_after, no transaction_type)
DELETE FROM diamond_transactions
WHERE user_id = '47965354-0e56-43ef-931c-ddaab82af765'
  AND description = 'test'
  AND (transaction_type IS NULL);

-- Step 2: Insert reconciliation transaction to align ledger with profile balance
-- The gap is: 500,000 (profile) - 454,795 (last ledger balance_after) = 45,205
INSERT INTO diamond_transactions (
  user_id,
  amount,
  type,
  transaction_type,
  description,
  balance_after,
  created_at
) VALUES (
  '47965354-0e56-43ef-931c-ddaab82af765',
  45205,
  'earn',
  'adjustment',
  'Ledger reconciliation — Admin grants and manual adjustments prior to March 2026',
  500000,
  NOW()
);
