-- Mirrored from the live database on 2026-08-08. Applied via MCP as migration 20260809022107_revoke_client_execute_on_training_leaderboard_record.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- fn_training_leaderboard_record(p_user_id, p_period_type, p_period_key,
--   p_answered, p_correct, p_is_perfect, p_best_streak, p_gtow_score,
--   p_ev_loss)
--
-- SECURITY DEFINER, executable by every authenticated user, takes the
-- target user id AND the score values as parameters, and WRITES them to
-- public.training_leaderboard with no auth.uid() check. Any logged-in
-- account could post arbitrary scores for itself or for any other user —
-- straightforward leaderboard forgery, and it bypasses the table's RLS
-- because the function is definer-owned.
--
-- SAFE TO REVOKE, verified three ways:
--   * zero references in Smarter-Poker-World-Hub, smarter-poker-commander
--     or club-arena
--   * no other database function calls it (pg_proc source scan: none)
--   * it is not a trigger function (pg_trigger: false)
-- So nothing currently invokes it from any client path; a future writer
-- should call it with the service role, as the other leaderboard writers do.
--
-- service_role retains EXECUTE. `public` is named explicitly because
-- revoking from a role alone is a no-op when the grant is held by PUBLIC.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname='public' AND p.proname='fn_training_leaderboard_record'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', r.sig);
    n := n + 1;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'fn_training_leaderboard_record not found'; END IF;
END $$;

DO $$
DECLARE r record; bad text := '';
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname='public' AND p.proname='fn_training_leaderboard_record'
  LOOP
    IF has_function_privilege('anon', r.oid,'EXECUTE')
       OR has_function_privilege('authenticated', r.oid,'EXECUTE') THEN
      bad := bad || r.sig || ' ';
    END IF;
    IF NOT has_function_privilege('service_role', r.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'service_role lost EXECUTE on %', r.sig;
    END IF;
  END LOOP;
  IF bad <> '' THEN RAISE EXCEPTION 'still client-callable: %', bad; END IF;
END $$;
