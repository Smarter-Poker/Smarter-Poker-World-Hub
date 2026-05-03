-- ═══════════════════════════════════════════════════════════════════════
-- 20260503_phase37_post_audit_restore_jarvis_and_training.sql
-- TIER 3 — bug-hunt corrective for jarvis_response_cache + training_events
-- Applied to production via Supabase MCP on 2026-05-03.
-- ═══════════════════════════════════════════════════════════════════════
CREATE POLICY "jarvis_response_cache_anon_select" ON public.jarvis_response_cache
    FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "training_events_insert_self" ON public.training_events
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
