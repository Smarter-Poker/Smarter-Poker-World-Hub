-- ============================================================
-- SECURITY FIX 3: RLS always-true policies + mat view access
-- Addresses: rls_policy_always_true (2), materialized_view_in_api (3)
-- Date: 2026-05-06
-- ============================================================

-- ── FIX 3A: Tighten always-true INSERT policies ─────────────────────

-- horse_bug_reports: restrict INSERT to authenticated users only
-- (currently allows anonymous INSERT with no check — potential spam vector)
DROP POLICY IF EXISTS "Anyone can insert bug reports" ON public.horse_bug_reports;
CREATE POLICY "Authenticated users can insert bug reports"
  ON public.horse_bug_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- qr_code_scans: restrict INSERT to authenticated users only
DROP POLICY IF EXISTS "Anyone can record scans" ON public.qr_code_scans;
CREATE POLICY "Authenticated users can record scans"
  ON public.qr_code_scans
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── FIX 3B: Revoke anon SELECT on materialized views ───────────────
-- mv_hand_histories contains private hand data — anon should not access it.
-- mv_active_poker_locations and mv_home_groups_trending are semi-public but
-- should require auth to prevent bulk scraping.

REVOKE SELECT ON public.mv_hand_histories FROM anon;
REVOKE SELECT ON public.mv_active_poker_locations FROM anon;
REVOKE SELECT ON public.mv_home_groups_trending FROM anon;

-- Ensure authenticated role still has access
GRANT SELECT ON public.mv_active_poker_locations TO authenticated;
GRANT SELECT ON public.mv_home_groups_trending TO authenticated;
-- mv_hand_histories: authenticated access only via RPC, not direct
-- (leave revoked for anon, authenticated access controlled by calling function)
