-- Two operator panels on pages/horses/hand-reviews.js were dead for every user
-- on every load, and the cause was a missing EXECUTE grant rather than anything
-- wrong with the panels.
--
-- That page reads eleven ca_horse_* / ca_brain_* functions directly from the
-- browser, on the signed-in operator's own JWT, through PostgREST as the
-- authenticated role. Nine of the eleven carry EXECUTE for authenticated. Two
-- do not: ca_horse_daily_audit(integer), called at line 501, and
-- ca_brain_telemetry(integer), called at line 508. Measured on production with
-- has_function_privilege before this migration was written:
--
--   function                                              authenticated  anon  service_role
--   ca_brain_telemetry(integer)                           false          false true
--   ca_horse_daily_audit(integer)                         false          false true
--   ca_horse_data_ledger(date)                            true           false true
--   ca_horse_frequency_card(integer)                      true           false true
--   ca_horse_hand_reviews(uuid,text,text,text,boolean,
--                         timestamptz,timestamptz,
--                         integer,integer)                true           false true
--   ca_horse_league_card(integer)                         true           false true
--   ca_horse_review_summary(integer)                      true           false true
--   ca_horse_solver_agreement(integer)                    true           false true
--   ca_horse_solver_agreement_decisions(date,text,
--                                       integer)          true           false true
--   ca_horse_tag_trends(integer)                          true           false true
--   ca_horse_tournament_card(integer)                     true           false true
--
-- Their ACLs before this migration were postgres=X/postgres and
-- service_role=X/postgres, with no authenticated entry and no PUBLIC entry, so
-- every browser call returned SQLSTATE 42501, permission denied for function.
-- The daily audit panel and the brain telemetry panel therefore rendered their
-- error state for every operator, every time, while the nine panels beside them
-- worked. This is a grant gap, not a code defect.
--
-- WHY THIS IS SAFE TO GRANT
--
-- Neither function decides anything from the caller's role. Both are SECURITY
-- DEFINER and both open by gating themselves, exactly as the nine siblings that
-- already hold the grant do:
--
--   begin
--     if not fn_is_horse_admin() then
--       raise exception 'admin only';
--     end if;
--     return query ...
--
-- fn_is_horse_admin() is a real check, not a stub. Its whole body is:
--
--   select exists (
--     select 1 from profiles
--     where id = auth.uid() and role in ('admin', 'superadmin', 'god')
--   );
--
-- So an authenticated caller who is not an admin, a superadmin or a god reaches
-- the raise and gets 'admin only'. Granting EXECUTE moves the refusal from the
-- PostgREST permission layer to the function's own gate. It does not widen who
-- can read horse audit or brain telemetry data by one row. The sibling function
-- ca_horse_review_summary(integer) already carries this exact grant against
-- this exact gate, which is the posture being matched here.
--
-- WHAT THIS MIGRATION DOES NOT DO
--
-- It grants to authenticated only. anon is not granted and PUBLIC is not
-- granted, and the post-apply block asserts that anon still has no EXECUTE on
-- either function. No function other than these two is touched. No body, no
-- signature, no RLS policy and no row is changed.
--
-- The pre-flight pins the md5 of each installed definition. If either body has
-- drifted from the one reviewed above, the migration refuses rather than
-- granting execute on a body nobody has read. It also asserts independently
-- that both definitions still call fn_is_horse_admin() to gate themselves, so
-- the security reason for the grant is stated in the file and not only in the
-- hash.
--
-- TIER: 2
-- AFFECTS: EXECUTE privilege for the authenticated role on exactly two
--          functions. No schema, data or policy change.
-- IRREVERSIBLE: no
--
-- ROLLBACK:
--   REVOKE EXECUTE ON FUNCTION public.ca_horse_daily_audit(integer) FROM authenticated;
--   REVOKE EXECUTE ON FUNCTION public.ca_brain_telemetry(integer) FROM authenticated;
-- Applying that rollback returns both panels to their 42501 state.

DO $preflight$
DECLARE
  v_audit_expected text := 'a94414044854257ba774a617a5904a99';
  v_tele_expected  text := '6816d00814dc3761dbdc0adccb76d284';
  v_audit_def      text;
  v_tele_def       text;
  v_audit_md5      text;
  v_tele_md5       text;
BEGIN
  v_audit_def := pg_get_functiondef('public.ca_horse_daily_audit(integer)'::regprocedure);
  v_tele_def  := pg_get_functiondef('public.ca_brain_telemetry(integer)'::regprocedure);

  v_audit_md5 := md5(v_audit_def);
  v_tele_md5  := md5(v_tele_def);

  IF v_audit_md5 IS DISTINCT FROM v_audit_expected THEN
    RAISE EXCEPTION 'Refusing to grant: ca_horse_daily_audit(integer) has md5 %, expected %. Read the current body and confirm it still self-gates before granting EXECUTE to authenticated.',
      v_audit_md5, v_audit_expected;
  END IF;

  IF v_tele_md5 IS DISTINCT FROM v_tele_expected THEN
    RAISE EXCEPTION 'Refusing to grant: ca_brain_telemetry(integer) has md5 %, expected %. Read the current body and confirm it still self-gates before granting EXECUTE to authenticated.',
      v_tele_md5, v_tele_expected;
  END IF;

  IF position('not fn_is_horse_admin()' in v_audit_def) = 0 THEN
    RAISE EXCEPTION 'Refusing to grant: ca_horse_daily_audit(integer) no longer gates itself with fn_is_horse_admin().';
  END IF;

  IF position('not fn_is_horse_admin()' in v_tele_def) = 0 THEN
    RAISE EXCEPTION 'Refusing to grant: ca_brain_telemetry(integer) no longer gates itself with fn_is_horse_admin().';
  END IF;

  IF NOT (SELECT p.prosecdef FROM pg_proc p
          WHERE p.oid = 'public.ca_horse_daily_audit(integer)'::regprocedure) THEN
    RAISE EXCEPTION 'Refusing to grant: ca_horse_daily_audit(integer) is not SECURITY DEFINER.';
  END IF;

  IF NOT (SELECT p.prosecdef FROM pg_proc p
          WHERE p.oid = 'public.ca_brain_telemetry(integer)'::regprocedure) THEN
    RAISE EXCEPTION 'Refusing to grant: ca_brain_telemetry(integer) is not SECURITY DEFINER.';
  END IF;

  RAISE NOTICE 'Pre-flight passed. Both definitions match their reviewed md5 and both self-gate with fn_is_horse_admin().';
END
$preflight$;

GRANT EXECUTE ON FUNCTION public.ca_horse_daily_audit(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ca_brain_telemetry(integer) TO authenticated;

DO $postcheck$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.ca_horse_daily_audit(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply assertion failed: authenticated still cannot execute ca_horse_daily_audit(integer)';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.ca_brain_telemetry(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply assertion failed: authenticated still cannot execute ca_brain_telemetry(integer)';
  END IF;

  IF has_function_privilege('anon', 'public.ca_horse_daily_audit(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply assertion failed: anon gained EXECUTE on ca_horse_daily_audit(integer), which this migration must not do';
  END IF;

  IF has_function_privilege('anon', 'public.ca_brain_telemetry(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'post-apply assertion failed: anon gained EXECUTE on ca_brain_telemetry(integer), which this migration must not do';
  END IF;

  RAISE NOTICE 'Post-apply assertions passed. authenticated can execute both functions; anon can execute neither.';
END
$postcheck$;
