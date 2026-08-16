-- Fix anon-callable security definer invariants
-- The previous lint migration recreated these functions without their original REVOKE statements.

REVOKE EXECUTE ON FUNCTION public.fn_trivia_tournament_payout(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trivia_tournament_payout(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_trivia_round_set_matchup_score(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_trivia_round_set_matchup_score(uuid, uuid, integer, integer) TO service_role;
