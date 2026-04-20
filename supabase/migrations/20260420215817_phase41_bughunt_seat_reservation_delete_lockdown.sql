-- =====================================================================
-- Phase 41 bug-hunt pass 35a: lock down direct DELETE on
-- commander_home_seat_reservations.
--
-- BUG (verified):
--   AG — admin can direct-DELETE a member's seat_reservation via
--        PostgREST, bypassing rpc_hg_release_seat. This breaks the
--        shadow-rsvp sync (the RSVP stays 'yes' with a seat_number
--        pointing at a nonexistent reservation). No notifications.
--
-- BACKGROUND:
--   Seat reservations are never hard-deleted by the application.
--   Release flow is:
--     reserved → released (UPDATE, via rpc_hg_release_seat)
--   DELETE only happens for admin cleanup / test fixtures / cascade.
--
-- FIX:
--   Drop the user-facing DELETE policy entirely. Only service_role
--   (which bypasses RLS) and SECURITY DEFINER RPCs (running as
--   postgres) can DELETE. All user-initiated releases must go through
--   rpc_hg_release_seat, which transitions status to 'released'.
-- =======================================================================

DROP POLICY IF EXISTS home_seat_reservations_delete ON public.commander_home_seat_reservations;

-- No policy = no authenticated DELETE. Service-role bypass still works.
-- Leaving this intentionally policyless so the default-deny behavior
-- is explicit. If a legitimate admin cleanup case emerges, it should
-- be exposed as a SECURITY DEFINER RPC, not as a raw DELETE.