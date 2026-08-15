-- fn_memory_promote_session_to_leaderboard is a TRIGGER function; it was
-- created with Postgres's default EXECUTE grant to PUBLIC, which put it in
-- scope of the economy_invariants() assertion
-- anon_mutating_definer_functions_check_auth_uid (anon-callable SECURITY
-- DEFINER function that writes without checking auth.uid()) and turned the
-- Build Safety Gate red. Direct RPC invocation of a trigger function fails
-- anyway ("trigger functions can only be called as triggers"), and trigger
-- firing does not depend on the session role's EXECUTE privilege, so this
-- revoke removes the anon-callable surface with zero behavior change.
REVOKE EXECUTE ON FUNCTION public.fn_memory_promote_session_to_leaderboard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_memory_promote_session_to_leaderboard() FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_memory_promote_session_to_leaderboard() FROM authenticated;

DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM public.economy_invariants() WHERE NOT ok;
  IF bad > 0 THEN
    RAISE EXCEPTION 'economy_invariants still failing: % check(s)', bad;
  END IF;
END $$;
