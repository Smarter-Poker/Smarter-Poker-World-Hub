-- ═══════════════════════════════════════════════════════════════════════════
-- Revoke anon EXECUTE on mutating SECURITY DEFINER functions
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY
-- CHECK 10 (Diamond economy invariants) has been FAILING on every push to main
-- on the assertion `anon_mutating_definer_functions_check_auth_uid`. It is not
-- a false alarm. Ten functions in public are SECURITY DEFINER (so they execute
-- as the owner and bypass RLS), are EXECUTE-able by `anon`, contain a write,
-- and never reference auth.uid().
--
-- Three of the ten take an id as a parameter and are directly callable over
-- PostgREST by an UNAUTHENTICATED caller:
--
--   commander_clock_write(uuid, jsonb, jsonb)
--       UPDATEs commander_tournaments — status, current_level, actual_start,
--       ended_at — with no authorization check of any kind. Reachable because
--       the function carries the default PUBLIC EXECUTE grant.
--
--   fn_union_close_club_tables_for_join(uuid)
--       Refunds seated players, vacates and closes every non-private table of
--       the given club. Anyone holding a club UUID could close that club down.
--
--   fn_union_pnl_bootstrap(uuid)
--       Writes union P&L rows.
--
-- The remaining seven are trigger functions. A trigger function cannot be
-- invoked directly over PostgREST, so they are not an exposure, but they do
-- carry the grant and so they keep the invariant red — which trains everyone
-- to ignore a failing safety gate.
--
-- SAFETY — verified before writing this migration
--   1. Firing a trigger does NOT require EXECUTE on the trigger function.
--      Proven empirically on this database: a table + SECURITY DEFINER trigger
--      were created, EXECUTE was revoked from PUBLIC/anon/authenticated, and an
--      INSERT performed with `SET LOCAL ROLE anon` still fired the trigger and
--      stamped the row. Revoking from the seven trigger functions is therefore
--      behaviour-neutral.
--   2. fn_union_close_club_tables_for_join has exactly one caller,
--      pages/api/club-arena/union-application.js, which uses the service-role
--      client (supabaseAdmin). service_role keeps its grant, so that path is
--      unaffected.
--   3. fn_union_pnl_bootstrap and commander_clock_write have NO caller in
--      Smarter-Poker-World-Hub or Smarter-Poker-Club-Arena (grepped js/jsx/
--      ts/tsx). commander_clock_write is nonetheless left EXECUTE-able by
--      `authenticated` because the Club Commander desktop client lives in a
--      separate repository that could not be inspected here — this migration
--      removes the ANONYMOUS vector without risking a logged-in staff client.
--
-- FOLLOW-UP (not done here, deliberately)
--   commander_clock_write still performs no authorization check for an
--   authenticated caller, so any logged-in user who knows a tournament id can
--   drive that tournament's clock. Fixing that means adding a staff/ownership
--   predicate inside the function, which changes behaviour rather than just
--   reachability, and belongs in its own reviewed change.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── PRE-FLIGHT ────────────────────────────────────────────────────────────
-- Abort if the catalog does not look the way this migration was written for.
DO $$
DECLARE
  v_violations int;
BEGIN
  SELECT COUNT(*) INTO v_violations
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND p.prosrc ~* '\m(insert|update|delete)\M'
     AND p.prosrc !~* 'auth\.uid\(\)';

  IF v_violations = 0 THEN
    RAISE EXCEPTION
      'Pre-flight: expected at least one violating function, found none. '
      'Already fixed by another change? Review before re-running.';
  END IF;

  RAISE NOTICE 'Pre-flight: % violating function(s) found', v_violations;
END $$;

-- ── DIRECTLY CALLABLE FUNCTIONS ───────────────────────────────────────────

-- Carried only the default PUBLIC grant. Revoke it, then hand `authenticated`
-- back explicitly so a staff client outside this repo keeps working.
REVOKE EXECUTE ON FUNCTION public.commander_clock_write(uuid, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commander_clock_write(uuid, jsonb, jsonb)
  TO authenticated, service_role;

-- Server-only: the sole caller uses the service-role key.
REVOKE EXECUTE ON FUNCTION public.fn_union_close_club_tables_for_join(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_union_close_club_tables_for_join(uuid)
  TO service_role;

-- No caller anywhere; keep it available to the service role only.
REVOKE EXECUTE ON FUNCTION public.fn_union_pnl_bootstrap(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_union_pnl_bootstrap(uuid)
  TO service_role;

-- ── TRIGGER FUNCTIONS ─────────────────────────────────────────────────────
-- Not directly invocable, and triggers fire regardless of EXECUTE (proven
-- above). Revoked so the invariant reflects reality.
REVOKE EXECUTE ON FUNCTION public.fn_fold_hand_winnings()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_grant_first_club_bonus()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_mirror_notification_to_push_outbox()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_stamp_table_union_ownership()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_stamp_tournament_union_ownership()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_club_union_mirror()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_hand_history_club_member_stats()
  FROM PUBLIC, anon, authenticated;

-- ── POST-APPLY ASSERTIONS ─────────────────────────────────────────────────
DO $$
DECLARE
  v_remaining int;
  v_names     text;
BEGIN
  SELECT COUNT(*), COALESCE(string_agg(p.proname, ', '), '')
    INTO v_remaining, v_names
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND p.prosrc ~* '\m(insert|update|delete)\M'
     AND p.prosrc !~* 'auth\.uid\(\)';

  IF v_remaining > 0 THEN
    RAISE EXCEPTION
      'Post-apply: % function(s) still anon-executable: %', v_remaining, v_names;
  END IF;

  -- The one legitimate caller must retain access.
  IF NOT has_function_privilege(
       'service_role',
       'public.fn_union_close_club_tables_for_join(uuid)',
       'EXECUTE') THEN
    RAISE EXCEPTION
      'Post-apply: service_role lost EXECUTE on fn_union_close_club_tables_for_join '
      '- the union approval route would break.';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.commander_clock_write(uuid, jsonb, jsonb)',
       'EXECUTE') THEN
    RAISE EXCEPTION
      'Post-apply: authenticated lost EXECUTE on commander_clock_write '
      '- the Commander clock UI would break.';
  END IF;

  RAISE NOTICE 'Post-apply: 0 anon-executable mutating definer functions remain';
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK  (restores the exact prior grants; paste and run to revert)
-- ═══════════════════════════════════════════════════════════════════════════
-- BEGIN;
-- GRANT EXECUTE ON FUNCTION public.commander_clock_write(uuid, jsonb, jsonb) TO PUBLIC;
-- REVOKE EXECUTE ON FUNCTION public.commander_clock_write(uuid, jsonb, jsonb) FROM authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_union_close_club_tables_for_join(uuid) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_union_pnl_bootstrap(uuid)              TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_fold_hand_winnings()                   TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_grant_first_club_bonus()               TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.fn_mirror_notification_to_push_outbox()   TO PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_stamp_table_union_ownership()          TO PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_stamp_tournament_union_ownership()     TO PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.fn_sync_club_union_mirror()               TO PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.trg_hand_history_club_member_stats()      TO PUBLIC, anon, authenticated;
-- COMMIT;
