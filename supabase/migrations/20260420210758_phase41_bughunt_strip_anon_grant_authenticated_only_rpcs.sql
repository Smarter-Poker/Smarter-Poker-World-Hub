-- =====================================================================
-- Pass 28: revoke anon EXECUTE on RPCs that require authenticated state.
--
-- All nine `rpc_hg_*` seat-management functions use `auth.uid()` to
-- identify the caller; an anon call can never succeed, but the grant
-- is wrong-principled (defense-in-depth + reduces attack surface).
--
-- `broadcast_to_home_group_roster`, `get_home_group_roster`,
-- `start_home_game_player_dm`, `start_home_group_roster_dm` — all
-- authenticated-user entry points that happened to have `anon` grants
-- from a PUBLIC-role default grant at creation time.
--
-- Explicitly NOT stripped (kept public): search_home_groups*,
-- get_trending_home_groups, get_home_group_public_detail,
-- get_home_groups_facets, generate_home_group_ical,
-- get_home_game_tournaments_for_date, track_home_group_view,
-- track_home_group_share_click. These serve unauthenticated visitors.
-- =====================================================================

-- Seat-management RPCs (authenticated only)
REVOKE EXECUTE ON FUNCTION public.rpc_hg_change_seat(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_claim_seat(uuid, integer, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_create_table(uuid, text, text, text, integer, integer, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_host_add_roster_member(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_host_claim_for_member(uuid, integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_list_roster(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_list_tables_and_reservations(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_release_seat(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_hg_start_table(uuid) FROM anon;

-- Notification / roster / DM RPCs (authenticated only)
REVOKE EXECUTE ON FUNCTION public.broadcast_to_home_group_roster(uuid, uuid, text, text, boolean, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_home_group_roster(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_home_game_player_dm(uuid, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_home_group_roster_dm(uuid, uuid, uuid, text) FROM anon;

-- Post-audit: confirm `authenticated` retains EXECUTE (none of these
-- should have been granted with FROM PUBLIC without also including
-- authenticated; verify explicitly)
DO $$
DECLARE fn_name text;
BEGIN
  FOR fn_name IN
    SELECT 'rpc_hg_change_seat(uuid, integer)'
    UNION ALL SELECT 'rpc_hg_claim_seat(uuid, integer, boolean)'
    UNION ALL SELECT 'rpc_hg_create_table(uuid, text, text, text, integer, integer, integer, text)'
    UNION ALL SELECT 'rpc_hg_host_add_roster_member(uuid, text, text)'
    UNION ALL SELECT 'rpc_hg_host_claim_for_member(uuid, integer, uuid)'
    UNION ALL SELECT 'rpc_hg_list_roster(uuid)'
    UNION ALL SELECT 'rpc_hg_list_tables_and_reservations(uuid)'
    UNION ALL SELECT 'rpc_hg_release_seat(uuid)'
    UNION ALL SELECT 'rpc_hg_start_table(uuid)'
    UNION ALL SELECT 'broadcast_to_home_group_roster(uuid, uuid, text, text, boolean, boolean, text)'
    UNION ALL SELECT 'get_home_group_roster(uuid, uuid)'
  LOOP
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.' || fn_name || ' TO authenticated';
  END LOOP;
END $$;
