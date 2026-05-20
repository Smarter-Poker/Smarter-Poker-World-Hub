-- Migration: Add composite index on wallet_transactions to prevent statement timeouts
-- Issue: Sentry #7485938168 — useWalletStore.Load_transactions_failed (canceling statement due to statement timeout)
-- Root cause: Full table scan on wallet_transactions when filtering by user_id + ordering by created_at
-- Fix: Composite index (user_id, created_at DESC) covers the standard loadTransactions query pattern

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_transactions_user_created
  ON wallet_transactions (user_id, created_at DESC);

-- Also ensure the bus_event_log table has an index for the BusEventLogger flush pattern
-- Issue: Sentry #7485938906 — BusEventLogger.flush (TypeError: Load failed on high-volume insert)
-- Adding a partial index on unprocessed events to speed up any cleanup queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bus_event_log_created
  ON bus_event_log (created_at DESC);

-- Note: financial_alerts RLS is handled at the application layer (FinancialAlertService)
-- The SPA client session cannot INSERT into financial_alerts — this is by design.
-- If server-side logging is needed, route through a SECURITY DEFINER RPC.
