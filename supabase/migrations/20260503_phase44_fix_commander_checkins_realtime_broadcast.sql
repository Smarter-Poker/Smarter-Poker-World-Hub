-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 44 — Fix silently-broken realtime on commander_checkins
-- ═══════════════════════════════════════════════════════════════════════════
-- Bug: commander_checkins has RLS=enabled but ZERO policies. Two pages
-- subscribe via supabase realtime postgres_changes:
--   • pages/hub/commander/check-in/[venueId].js  (table card-refresh trigger)
--   • pages/hub/commander/leaderboard/[venueId].js
-- Supabase Realtime requires the subscriber's role to have row-level SELECT
-- access for the change event to broadcast. With no policy, anon AND
-- authenticated get nothing → both subscriptions silently fire never.
-- Fallback: both pages also do periodic refetch on visibility, so users
-- see updates after a delay rather than instantly. Real-time UX broken.
--
-- Fix: add a permissive SELECT policy. commander_checkins rows contain only
-- (id, member_id, venue_id, checked_in_at) — no PII beyond member_id which
-- is already public via leaderboard-style lookups. Safe to expose to
-- authenticated. Anon stays denied (default).
--
-- Applied to production via Supabase MCP on 2026-05-03. This file is the
-- on-disk audit-trail copy. Re-applying is idempotent via the IF NOT EXISTS
-- pattern below.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname='public'
           AND tablename='commander_checkins'
           AND policyname='authenticated read for realtime'
    ) THEN
        CREATE POLICY "authenticated read for realtime"
            ON public.commander_checkins
            FOR SELECT
            TO authenticated
            USING (true);
    END IF;
END $$;

COMMENT ON POLICY "authenticated read for realtime" ON public.commander_checkins IS
    'Required for Supabase Realtime postgres_changes to broadcast to authenticated subscribers. Phase 44.';
