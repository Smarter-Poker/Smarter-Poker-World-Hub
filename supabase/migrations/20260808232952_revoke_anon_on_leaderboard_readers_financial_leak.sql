-- Mirrored from the live database on 2026-08-08. Applied via MCP as migration 20260808232952_revoke_anon_on_leaderboard_readers_financial_leak.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Closing the OTHER half of the player_stats_snapshots leak.
--
-- Enabling RLS on player_stats_snapshots (migration 20260808220526) closed
-- direct PostgREST reads of that table by anon. It was NOT sufficient.
--
-- Three SECURITY DEFINER functions read the same table and were executable
-- by `anon`. Because they are DEFINER (owner: postgres), they bypass the
-- RLS that was just enabled. Verified by executing as anon: a caller with
-- no session at all still received, per user_id, the full financial record —
--   total_winnings, total_losses, total_rake, hands_played, tournaments_won
-- for every ranked player. The table lock closed the front door and left
-- this side door open.
--
--   fn_club_leaderboard_period(uuid, text, text, integer)
--   fn_union_leaderboard_period(uuid, text, text, integer)
--   fn_user_rank_period(uuid, uuid, text, text)
--
-- SAFE TO REVOKE: none of the three is referenced anywhere in
-- Smarter-Poker-World-Hub, smarter-poker-commander or club-arena. They were
-- added by recent leaderboard migrations for a feature that is not yet
-- wired to any caller, so no shipping surface loses access.
--
-- `authenticated` is PRESERVED: a leaderboard is a plausible logged-in
-- feature and revoking it would pre-empt a product decision. What is NOT
-- decided here, and is recorded for review: whether a leaderboard should
-- expose total_losses and total_rake at all, even to a logged-in user.
-- Ranking needs a score, not a full financial statement. That is a column-
-- level product call, not something to guess at.
--
-- Naming `public` in the revoke matters: revoking from anon alone is a
-- no-op when the grant is actually held by PUBLIC.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

REVOKE EXECUTE ON FUNCTION public.fn_club_leaderboard_period(uuid, text, text, integer)
  FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.fn_club_leaderboard_period(uuid, text, text, integer)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_union_leaderboard_period(uuid, text, text, integer)
  FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.fn_union_leaderboard_period(uuid, text, text, integer)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_user_rank_period(uuid, uuid, text, text)
  FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.fn_user_rank_period(uuid, uuid, text, text)
  TO authenticated;

-- Post-condition: anon must be locked out, authenticated must retain access.
DO $$
DECLARE leaked text := ''; broke text := '';
BEGIN
  IF has_function_privilege('anon','public.fn_club_leaderboard_period(uuid,text,text,integer)','EXECUTE')
    THEN leaked := leaked||'club '; END IF;
  IF has_function_privilege('anon','public.fn_union_leaderboard_period(uuid,text,text,integer)','EXECUTE')
    THEN leaked := leaked||'union '; END IF;
  IF has_function_privilege('anon','public.fn_user_rank_period(uuid,uuid,text,text)','EXECUTE')
    THEN leaked := leaked||'rank '; END IF;

  IF NOT has_function_privilege('authenticated','public.fn_club_leaderboard_period(uuid,text,text,integer)','EXECUTE')
    THEN broke := broke||'club '; END IF;
  IF NOT has_function_privilege('authenticated','public.fn_union_leaderboard_period(uuid,text,text,integer)','EXECUTE')
    THEN broke := broke||'union '; END IF;

  IF leaked <> '' OR broke <> '' THEN
    RAISE EXCEPTION 'post-condition failed. anon still exec:[%]; authenticated lost:[%]', leaked, broke;
  END IF;
END $$;

COMMIT;
