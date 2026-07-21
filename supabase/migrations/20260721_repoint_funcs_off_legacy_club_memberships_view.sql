-- Task #53 (expanded): repoint ALL functions off the legacy club_memberships VIEW
-- onto the canonical club_members table. Applied to prod via Supabase MCP 2026-07-21.
--
-- Discovery: 16 money RPCs referenced the view, not just mint_club_chips
-- (distribute_chips, fn_add_prepaid_credit_atomic, fn_approve_cashout_atomic,
-- fn_cancel_cashout_atomic, fn_credit_chips, fn_debit_chips, fn_leave_club_atomic,
-- fn_request_cashout, fn_tournament_atomic_register, fn_transfer_chips,
-- lock_chips_for_table, mass_fund_horses, mint_club_chips,
-- transfer_chips_agent_to_player, transfer_promo_club_to_agent,
-- unlock_chips_from_table).
--
-- All 16 are SECURITY INVOKER, and the view is security_invoker=true (a transparent
-- RLS-preserving passthrough of club_members), so swapping the view name for the
-- table name is behavior-IDENTICAL for every caller (service-role and user-JWT).
-- Verified afterward: 0 functions still reference the view; INVOKER posture preserved.
--
-- Implemented as a self-verifying loop: regenerate each function's exact current
-- definition, substitute the view name for the table name, and re-create it.
-- Idempotent (a replay finds nothing to change). The view itself is left in place as
-- a compatibility alias for any remaining readers.
DO $mig$
DECLARE r record; v_def text;
BEGIN
  FOR r IN
    SELECT oid, proname FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND prosrc ILIKE '%club_memberships%'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(v_def, 'club_memberships', 'club_members');
    EXECUTE v_def;
  END LOOP;
END
$mig$;
