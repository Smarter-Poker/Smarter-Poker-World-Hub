-- APPLIED TO PRODUCTION 2026-08-17 (clubs_rls_owner_spoof_and_ownership_giveaway)
--
-- Two RLS holes on public.clubs, both probe-verified fixed:
-- 1. INSERT policy checked only auth.uid() IS NOT NULL — never tied owner_id
--    to the caller, so any logged-in user could create a club OWNED BY ANY
--    OTHER USER.
-- 2. UPDATE policy had USING but NO WITH CHECK, so an owner could UPDATE
--    owner_id to anyone — re-opening at the RLS level the ownership-transfer
--    hole closed at the RPC level. Transfers must use transfer_club_ownership.
--
-- Probes (role-impersonated, rolled back): spoofed insert blocked; own create
-- + owner-membership insert still work; owner_id giveaway blocked; benign own
-- update works.
DROP POLICY IF EXISTS "Authenticated users can create clubs" ON public.clubs;
CREATE POLICY "Authenticated users can create clubs" ON public.clubs
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owners can update clubs" ON public.clubs;
CREATE POLICY "Owners can update clubs" ON public.clubs
  FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
