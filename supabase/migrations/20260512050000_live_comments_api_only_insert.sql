-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260512050000_live_comments_api_only_insert.sql
-- Audit:     4-Pass Maximum Rigor Audit — AUDIT-A (HIGH/SECURITY)
--
-- PROBLEM: live_comments INSERT RLS policy `lc_ins` / `live_comments_insert`
-- allows any authenticated user to insert comment rows directly via the
-- Supabase anon key, entirely bypassing /api/live/comment which enforces:
--   - Stream status check (must be 'live' or within 60s grace)
--   - Ban check (banned viewers silenced)
--   - Slow-mode throttle (per-user rate limit)
--   - Profanity/threat filter (checkProfanity)
--   - Text length cap (300 chars)
--   - Auth check (no anonymous comments)
--
-- live_gifts was correctly locked down to service-role-only in
-- 20260503_live_gifts_rls_api_only.sql. live_comments must match.
--
-- The DB trigger `trig_enforce_live_comment_author_name` already
-- prevents author_name spoofing, but does NOT enforce any of the
-- business rules listed above.
--
-- FIX: Drop all permissive INSERT policies for authenticated role and
-- replace with WITH CHECK (false). /api/live/comment uses
-- SUPABASE_SERVICE_ROLE_KEY which bypasses RLS, so the API route
-- is unaffected. Client-side direct inserts are now blocked.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop all existing INSERT policies for live_comments (idempotent)
DROP POLICY IF EXISTS lc_ins              ON public.live_comments;
DROP POLICY IF EXISTS live_comments_insert ON public.live_comments;

-- Block all direct client inserts — only service_role (comment.js API) may insert.
-- Service_role bypasses RLS by default in Postgres, so the API route is unaffected.
CREATE POLICY live_comments_api_only_insert
  ON public.live_comments
  FOR INSERT
  WITH CHECK (false);

COMMENT ON POLICY live_comments_api_only_insert ON public.live_comments IS
  'AUDIT-A: Block direct client inserts. All comment creation must go through '
  '/api/live/comment (service_role) which enforces stream status, ban, slow-mode, '
  'profanity, and length checks. Mirrors live_gifts_api_only_insert policy.';
