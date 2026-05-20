-- Migration: Add composite index on wallet_transactions to prevent statement timeouts
-- Issue: Sentry #7485938168 — useWalletStore.Load_transactions_failed (canceling statement due to statement timeout)
-- Root cause: Full table scan on wallet_transactions when filtering by user_id + ordering by created_at
-- Fix: Composite index (user_id, created_at DESC) covers the standard loadTransactions query pattern

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created
  ON wallet_transactions (user_id, created_at DESC);

-- Also index bus_event_log for BusEventLogger flush performance
-- Issue: Sentry #7485938906 — BusEventLogger.flush high-volume inserts
CREATE INDEX IF NOT EXISTS idx_bus_event_log_created
  ON bus_event_log (created_at DESC);
