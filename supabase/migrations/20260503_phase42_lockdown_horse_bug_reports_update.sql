-- Phase 42 — drop wide-open auth UPDATE on horse_bug_reports (audit-trail copy)
-- Already applied via Supabase MCP on 2026-05-03.
-- Was: TO authenticated USING (true) — any logged-in user could mark
-- anyone's bug as resolved. No anon-context UPDATE callers exist.
-- Server-side bug triage uses service_role (RLS bypass).
DROP POLICY IF EXISTS "Authenticated users can update bug reports" ON public.horse_bug_reports;
