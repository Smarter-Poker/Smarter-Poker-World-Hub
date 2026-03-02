-- ============================================================================
-- Migration: DROP exec_sql — CRITICAL security vulnerability
-- Date: 2026-03-02
--
-- BUG #122: exec_sql(query TEXT) is SECURITY DEFINER and executes arbitrary
--           SQL. Any authenticated Supabase user can call it directly via
--           the PostgREST RPC endpoint, giving them full DBA-level access.
--
-- All callers are one-time admin/setup scripts that have already run.
-- This function is no longer needed in production.
-- ============================================================================

-- Revoke first (in case DROP fails)
REVOKE ALL ON FUNCTION exec_sql(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION exec_sql(TEXT) FROM anon;
REVOKE ALL ON FUNCTION exec_sql(TEXT) FROM authenticated;

-- Drop the function
DROP FUNCTION IF EXISTS exec_sql(TEXT);
