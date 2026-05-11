-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: streaming_deep_audit_round3_revoke_anon_and_lock_internal_rpcs
-- Version:   20260511020100
-- Applied:   2026-05-11 via Supabase MCP apply_migration
--
-- Follow-up to 20260511020000: Supabase's default role grants give anon
-- and authenticated EXECUTE on every public function. The round-3 v1
-- migration used "REVOKE ALL ... FROM PUBLIC" which doesn't strip per-role
-- defaults — verified empirically: anon could call fn_heartbeat_live_viewer
-- after v1 (the function returned reason=unauthenticated, so no data harm,
-- but the call surface was wider than intended).
--
-- v2 corrects this by REVOKEing EXECUTE explicitly from `anon` on all
-- round-2 and round-3 RPCs that should never be callable anonymously, and
-- REVOKEing from `authenticated` on the three RPCs that are service-role
-- only (cleanup crons + atomic merge helper).
--
-- Grant matrix after this migration:
--
-- | RPC                                | service_role | authenticated | anon |
-- |------------------------------------|--------------|---------------|------|
-- | fn_get_my_guest_invite_code        | ✓            | ✓             | ✗    |
-- | fn_heartbeat_live_viewer           | ✓            | ✓             | ✗    |
-- | fn_mark_feed_post_ended            | ✓            | ✗             | ✗    |
-- | fn_cleanup_stale_scheduled_lives   | ✓            | ✗             | ✗    |
-- | fn_cleanup_stale_viewers           | ✓            | ✗             | ✗    |
-- ═══════════════════════════════════════════════════════════════════════════

-- Strip anon on all 5 round-2/round-3 RPCs.
REVOKE EXECUTE ON FUNCTION public.fn_heartbeat_live_viewer(uuid)         FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_cleanup_stale_viewers(integer)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_get_my_guest_invite_code(uuid)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_cleanup_stale_scheduled_lives()     FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_mark_feed_post_ended(uuid)          FROM anon;

-- Strip authenticated on service-role-only RPCs. fn_get_my_guest_invite_code
-- and fn_heartbeat_live_viewer retain authenticated EXECUTE because they
-- are USER-facing RPCs scoped via internal auth.uid() checks.
REVOKE EXECUTE ON FUNCTION public.fn_cleanup_stale_viewers(integer)      FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_cleanup_stale_scheduled_lives()     FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_mark_feed_post_ended(uuid)          FROM authenticated;
