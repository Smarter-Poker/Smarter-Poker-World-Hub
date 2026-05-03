-- Phase 37 audit fix #3 — restore sandbox_results SELECT (audit-trail copy)
-- Applied via Supabase MCP on 2026-05-03.
-- Bug-hunt found src/hooks/useAssistant.js (used by /hub/personal-assistant/*
-- pages) reads sandbox_results from anon-key context. Tier-B drop left it
-- with 0 policies → silent empty results. Restored with TO authenticated.
CREATE POLICY "sandbox_results_authenticated_select"
    ON public.sandbox_results
    FOR SELECT TO authenticated
    USING (true);
