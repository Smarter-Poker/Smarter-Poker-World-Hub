-- =====================================================================
-- Phase 41 bug-hunt pass 11: force all home-group ownership transfers
-- to go through transfer_home_group_ownership RPC.
--
-- BUG:
--   protect_home_group_owner_id allowed the current owner to direct-UPDATE
--   owner_id via PostgREST. The comment in the old trigger acknowledged
--   this explicitly ("keeps the door open if Dan builds a transfer
--   ownership feature later"). That feature now exists, and it does
--   critical atomic work the direct UPDATE skips:
--     • Validates target is an approved member AND holds role 'admin'
--       (prevents gifting ownership to a stranger or non-admin)
--     • Demotes old owner's member row to 'admin'
--     • Promotes new owner's member row to 'owner'
--     • Writes a commander_home_audit_log entry
--
--   A direct owner_id flip leaves the group in an inconsistent state:
--     • group.owner_id now points at user X
--     • commander_home_members: old owner still has role='owner',
--       X still has role='member' or isn't a member at all
--     • protect_home_group_owner_membership then disagrees about which
--       row is "the owner row", triggering weird downstream enforcement.
--
-- FIX:
--   Switch trigger to SECURITY INVOKER. Bypass only privileged roles:
--     postgres / supabase_admin / service_role / supabase_auth_admin /
--     supabase_storage_admin
--   All other callers (authenticated, anon) cannot direct-UPDATE owner_id.
--   The transfer_home_group_ownership RPC is SECURITY DEFINER and runs
--   its UPDATE body as its owner (postgres) — trigger sees current_user
--   = postgres and bypasses. Everyone else: blocked.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.protect_home_group_owner_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := current_user;
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    IF v_role IN ('postgres', 'supabase_admin', 'service_role',
                  'supabase_auth_admin', 'supabase_storage_admin') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'DIRECT_OWNER_TRANSFER_FORBIDDEN'
      USING ERRCODE = '42501',
            HINT = 'use the transfer_home_group_ownership RPC; direct UPDATE of '
                || 'owner_id bypasses member-role promotion/demotion and audit logging';
  END IF;
  RETURN NEW;
END;
$function$;
