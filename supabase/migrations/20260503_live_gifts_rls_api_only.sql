-- ═══════════════════════════════════════════════════════════════════════
-- BUG FIX #16/17: Lock down live_gifts INSERT RLS
--
-- PROBLEM: The original live_gifts INSERT policy was WITH CHECK (true),
-- allowing ANY authenticated user to insert a gift record directly via
-- the Supabase anon client — without any diamond deduction occurring.
-- The Phase42 audit tightened it to sender_id = auth.uid(), but this
-- still allows fabricated gift rows (attacker pays nothing, gets a gift
-- record, could trigger false broadcast animations if they sent the
-- channel event separately).
--
-- The correct policy is: NO direct client inserts to live_gifts.
-- ALL inserts must go through /api/live/gift (service-role key),
-- which enforces diamond deduction → credit → insert atomically.
--
-- This is achieved by creating a policy that only allows the
-- service_role (BYPASSRLS) to insert. Since service_role bypasses RLS
-- entirely, we can achieve a "deny all client inserts" by removing the
-- permissive policy and adding a restrictive one.
--
-- Implementation: DROP the permissive policy, add a WITH CHECK (false)
-- policy that blocks all anon/authenticated inserts. Service-role
-- bypasses RLS so gift.js continues to work unchanged.
-- ═══════════════════════════════════════════════════════════════════════

-- Drop the permissive INSERT policies (original + Phase42 rewrite)
DROP POLICY IF EXISTS lg_ins ON public.live_gifts;
DROP POLICY IF EXISTS "lg_ins" ON public.live_gifts;

-- Block all direct client inserts — only service_role (gift.js API) may insert
CREATE POLICY "live_gifts_api_only_insert" ON public.live_gifts
    FOR INSERT
    WITH CHECK (false);
