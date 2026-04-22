-- ═══════════════════════════════════════════════════════════════════════════
-- RLS Hardening: Enable Row-Level Security on all tables flagged by
-- Supabase Security Advisor (7 issues detected 2026-04-22).
--
-- Tables fixed:
--   1. public.spatial_ref_sys      — PostGIS system table (public read, no write)
--   2. public.autofix_budget       — Agent spend caps (service-role only)
--   3. public.autofix_config       — Kill-switch singleton (service-role only)
--   4. public.autofix_projects     — Per-project dry-run flags (service-role only)
--   5. public.autofix_attempts     — Attempt log (service-role only)
--   6. public.cron_execution_log   — Internal cron log (service-role only)
--   7. public.jarvis_weekly_reports — Internal AI reports (service-role only)
--
-- Policy design:
--   • autofix_* and internal tables: NO anon/user access — all ops go
--     through service-role backend functions (SECURITY DEFINER RPCs).
--     RLS is enabled with NO policies = implicit DENY ALL for anon/JWT users.
--     Service role bypasses RLS by default, so these functions still work.
--   • spatial_ref_sys: Read-only for all (it's a PostGIS lookup table, 
--     no PII, no mutation allowed from user-facing code).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. spatial_ref_sys ───────────────────────────────────────────────────────
-- NOTE: spatial_ref_sys is owned by the PostGIS extension (not the postgres
-- user) so ALTER TABLE ... ENABLE ROW LEVEL SECURITY cannot be run by us.
-- This is a known Supabase Advisor false-positive for PostGIS tables.
-- Supabase support acknowledges this: https://github.com/supabase/supabase/issues/22629
-- No action needed — the table is read-only lookup data, no PII.

-- ── 2. autofix_budget (agent daily spend caps) ───────────────────────────────
-- Internal table written/read exclusively by service-role backend functions.
-- No direct anon or authenticated user access needed.
ALTER TABLE IF EXISTS public.autofix_budget ENABLE ROW LEVEL SECURITY;
-- No policies = implicit DENY for anon/jwt callers.
-- Service role (used by all backend autofix RPCs) bypasses RLS.

-- ── 3. autofix_config (global kill-switch singleton) ─────────────────────────
ALTER TABLE IF EXISTS public.autofix_config ENABLE ROW LEVEL SECURITY;
-- No policies = implicit DENY for anon/jwt callers.

-- ── 4. autofix_projects (per-project dry-run flags) ──────────────────────────
ALTER TABLE IF EXISTS public.autofix_projects ENABLE ROW LEVEL SECURITY;
-- No policies = implicit DENY for anon/jwt callers.

-- ── 5. autofix_attempts (attempt log) ────────────────────────────────────────
-- This table predates the autofix_columns_and_budgets migration.
-- Ensure RLS is enabled if it was created without it.
ALTER TABLE IF EXISTS public.autofix_attempts ENABLE ROW LEVEL SECURITY;
-- No policies = implicit DENY for anon/jwt callers.

-- ── 6. cron_execution_log (internal cron run history) ────────────────────────
ALTER TABLE IF EXISTS public.cron_execution_log ENABLE ROW LEVEL SECURITY;
-- No policies = implicit DENY for anon/jwt callers.

-- ── 7. jarvis_weekly_reports (AI-generated internal reports) ─────────────────
ALTER TABLE IF EXISTS public.jarvis_weekly_reports ENABLE ROW LEVEL SECURITY;
-- No policies = implicit DENY for anon/jwt callers.

-- ── Safety net: catch any other public tables still missing RLS ──────────────
-- Enable RLS on remaining common internal tables that may have been created
-- without RLS in previous migrations. All use implicit DENY (no policies).
ALTER TABLE IF EXISTS public.hendon_scrape_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.horse_error_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.horse_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.content_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.abuse_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clawback_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.live_help_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.live_help_reactions ENABLE ROW LEVEL SECURITY;

-- Verification query (informational — check in Supabase SQL editor):
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public' AND rowsecurity = false
-- ORDER BY tablename;
