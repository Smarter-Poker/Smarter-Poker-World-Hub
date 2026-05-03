-- ═══════════════════════════════════════════════════════════════════════
-- 20260503_phase37_post_audit_restore_jarvis_and_training.sql
-- TIER 3 — bug-hunt corrective for jarvis_response_cache + training_events
--
-- jarvis_response_cache: lockdown left 0 policies, so anon-key reads from
-- src/lib/jarvisCache.js (called by 5 pages/api/gto/* routes) silent-failed.
-- Restore SELECT only — cache content is hash-keyed, no PII; writes still
-- go through service_role.
--
-- training_events: lockdown dropped the public INSERT policy. CentralBus.js
-- (used by TrainingArena.jsx + FeaturedHero.jsx) silent-failed. Restore
-- INSERT scoped to auth.uid() = user_id (NULL allowed for pre-login
-- session events).
--
-- Already applied to production via Supabase MCP apply_migration on 2026-05-03.
-- ═══════════════════════════════════════════════════════════════════════
CREATE POLICY "jarvis_response_cache_anon_select" ON public.jarvis_response_cache
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "training_events_insert_self" ON public.training_events
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
