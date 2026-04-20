-- =====================================================================
-- Pass 14: lock down commander_home_seats INSERT and DELETE paths.
--
-- The UPDATE path was already blocked by fn_block_direct_home_seat_update.
-- But INSERT and DELETE were wide open:
--
--   S1 — Host / group owner can direct-INSERT seats via PostgREST, seating
--        ANY real user (no membership check). The RLS INSERT policy only
--        checks that the inserter owns the game, not that the seated
--        user is a member of the group.
--
--   S4 — Host / group owner can direct-DELETE seats, bypassing
--        release_home_game_seat RPC and any downstream logic (flake
--        tracking, audit log, reservation sync, seat broadcast).
--
-- Fix: extend the block to all three verbs. Authenticated / anon
-- direct INSERT/UPDATE/DELETE is forbidden; all mutations must go
-- through the RPCs (claim_home_game_seat, release_home_game_seat,
-- assign_home_game_seat, fn_home_init_seats, rpc_hg_start_table).
-- RPCs are SECURITY DEFINER and run as postgres, so they bypass.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_block_direct_home_seat_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'DIRECT_SEAT_MUTATION_FORBIDDEN'
          USING HINT = 'use claim_home_game_seat / release_home_game_seat / '
                     || 'assign_home_game_seat / fn_home_move_seat / '
                     || 'rpc_hg_start_table RPCs instead of direct mutations';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

-- Extend coverage to INSERT, UPDATE, DELETE. Old trigger was UPD only.
DROP TRIGGER IF EXISTS trg_block_direct_home_seat_update ON public.commander_home_seats;

CREATE TRIGGER trg_block_direct_home_seat_mutation
BEFORE INSERT OR UPDATE OR DELETE ON public.commander_home_seats
FOR EACH ROW
EXECUTE FUNCTION public.fn_block_direct_home_seat_update();
