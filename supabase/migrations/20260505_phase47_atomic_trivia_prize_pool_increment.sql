-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 47 — Atomic prize pool increment for trivia tournaments
-- ═══════════════════════════════════════════════════════════════════════════
-- Bug: pages/api/trivia/tournament-enter.js was doing read-then-write to
-- update prize_pool. When two users entered simultaneously, both read the
-- same starting value, both wrote starting+net, and the second write
-- clobbered the first → entry fee silently absorbed by the house.
--
-- Fix: SECURITY DEFINER RPC that does an atomic UPDATE with
-- `prize_pool + p_amount`. Handler now calls this RPC.
--
-- Applied to production via Supabase MCP on 2026-05-05.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_trivia_tournament_increment_prize_pool(
    p_tournament_id uuid,
    p_amount integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_new_pool integer;
BEGIN
    IF (SELECT auth.role()) <> 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    IF p_amount IS NULL OR p_amount < 0 THEN
        RAISE EXCEPTION 'invalid amount';
    END IF;

    UPDATE public.trivia_tournaments
       SET prize_pool = COALESCE(prize_pool, 0) + p_amount
     WHERE id = p_tournament_id
     RETURNING prize_pool INTO v_new_pool;

    IF v_new_pool IS NULL THEN
        RAISE EXCEPTION 'tournament_not_found';
    END IF;

    RETURN v_new_pool;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_trivia_tournament_increment_prize_pool(uuid, integer) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.fn_trivia_tournament_increment_prize_pool(uuid, integer) TO service_role;

COMMENT ON FUNCTION public.fn_trivia_tournament_increment_prize_pool(uuid, integer) IS
    'Atomic prize-pool increment for trivia tournaments. Phase 47 — closes the read-modify-write race in /api/trivia/tournament-enter.';
