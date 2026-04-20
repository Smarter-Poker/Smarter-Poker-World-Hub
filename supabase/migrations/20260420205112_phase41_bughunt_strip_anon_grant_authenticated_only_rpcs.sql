-- =====================================================================
-- Pass 28: defense-in-depth — strip anon EXECUTE from RPCs that are
-- semantically authenticated-only. All of these have internal
-- auth.uid() checks that reject NULL callers, so this is purely to
-- prevent probing and reduce attack surface if an internal check is
-- ever regressed.
--
-- We intentionally KEEP anon grants on:
--   - get_home_group_public_detail, search_home_groups*,
--     get_trending_home_groups, get_home_groups_facets,
--     get_home_game_tournaments_for_date, generate_home_group_ical
--     → public browse surfaces
--   - track_home_group_share_click, track_home_group_view
--     → explicitly designed to accept anon analytics pings
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.broadcast_to_home_group_roster(uuid, uuid, text, text, boolean, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_home_game_player_dm(uuid, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_home_group_roster_dm(uuid, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_home_group_roster(uuid, uuid) FROM anon;

-- Phase41 seat RPCs: all require authenticated
REVOKE EXECUTE ON FUNCTION public.rpc_hg_claim_seat(uuid, integer, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_change_seat(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_release_seat(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_create_table(uuid, text, text, text, integer, integer, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_start_table(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_host_add_roster_member(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_host_claim_for_member(uuid, integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_list_roster(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_list_tables_and_reservations(uuid) FROM anon;
