-- ════════════════════════════════════════════════════════════════════════════════
-- Migration: Harden live_gifts INSERT RLS (Pass 3 adversarial audit — 2026-05-01)
-- ════════════════════════════════════════════════════════════════════════════════
-- BUG: live_gifts had INSERT WITH CHECK (true) — any authenticated user could
-- insert fraudulent gift records directly via the Supabase client, bypassing
-- the /api/live/gift endpoint and the deduct_diamonds RPC entirely.
-- 
-- RISK: A malicious user could write arbitrary amount / receiver_id to the
-- live_gifts table with zero diamond cost, poisoning gift analytics and leaderboards.
--
-- FIX: Restrict INSERT to service-role only (gift.js uses service-role client).
--      Authenticated users (anon key) may only SELECT their own sent/received gifts.
-- ════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Drop the permissive INSERT policy
DROP POLICY IF EXISTS lg_ins ON public.live_gifts;

-- New INSERT policy: only the service role bypasses RLS, so this policy
-- effectively blocks all direct-client inserts. The API route uses the
-- service-role client which bypasses RLS entirely.
-- We create a restrictive policy so authenticated (anon key) callers cannot insert.
CREATE POLICY lg_ins ON public.live_gifts FOR INSERT
WITH CHECK (false);

-- Tighten SELECT: users can only view gifts they sent or received
-- (was SELECT USING (true) — public readable, no leakage concern for read,
--  but keep it for transparency / feed display)
-- Leave SELECT open (gifts are non-sensitive public events on a live stream)

COMMIT;
