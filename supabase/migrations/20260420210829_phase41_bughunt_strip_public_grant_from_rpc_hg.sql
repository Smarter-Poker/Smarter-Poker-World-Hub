-- Pass 28b: previous REVOKE FROM anon was a no-op because the
-- EXECUTE grant lives on PUBLIC (the `=X/postgres` entry). Revoke
-- from PUBLIC and re-grant to authenticated + service_role only.
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.rpc_hg_change_seat(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_claim_seat(uuid, integer, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_create_table(uuid, text, text, text, integer, integer, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_host_add_roster_member(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_host_claim_for_member(uuid, integer, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_list_roster(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_list_tables_and_reservations(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_release_seat(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_start_table(uuid) FROM PUBLIC;
