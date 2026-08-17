-- APPLIED TO PRODUCTION 2026-08-17 06:02:40 UTC (version 20260817060240)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PHANTOM RPC: verify_ledger_totals
--
-- ChipFlowService.verifyLedger() calls supabase.rpc('verify_ledger_totals').
-- The function had never existed. The call always returned PGRST202 and fell
-- through to a client-side paginated aggregation.
--
-- That fallback is not merely slow (up to 10,000 pages of wallet_transactions
-- plus 10,000 pages of wallets per run) -- it is UNSOUND. It aggregates
-- `wallets` and `wallet_transactions` through PostgREST as the calling user, so
-- RLS trims the result to the rows that user can see. A non-admin caller
-- therefore sums their OWN balance and calls it the platform total. Since
-- runReconciliation() raises a CRITICAL financial alert whenever
-- |minted - wallets - locked| >= 0.01, the missing RPC had been feeding a money
-- alarm from a number that was never the platform total.
--
-- Running the real aggregate for the first time is what exposed the
-- wallet_transactions sign-convention bug fixed in 20260817060750.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.verify_ledger_totals()
RETURNS TABLE(total_minted numeric, total_in_wallets numeric, total_locked numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean := false;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'verify_ledger_totals requires an authenticated caller';
    END IF;
    SELECT COALESCE(pr.is_admin, false) OR COALESCE(pr.role, '') IN ('admin', 'superadmin', 'staff')
      INTO v_is_admin
      FROM public.profiles pr
     WHERE pr.id = auth.uid();
    IF NOT COALESCE(v_is_admin, false) THEN
      RAISE EXCEPTION 'verify_ledger_totals is restricted to platform administrators';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE((SELECT sum(wt.amount)
                FROM public.wallet_transactions wt
               WHERE wt.type = 'credit' AND wt.category = 'mint'), 0)::numeric,
    COALESCE((SELECT sum(w.balance)        FROM public.wallets w), 0)::numeric,
    COALESCE((SELECT sum(w.locked_balance) FROM public.wallets w), 0)::numeric;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.verify_ledger_totals() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.verify_ledger_totals() TO authenticated, service_role;

INSERT INTO public.privileged_function_lock (function_signature, security_definer, reason)
VALUES ('public.verify_ledger_totals()', true,
        'SECURITY DEFINER platform-wide ledger totals. Self-authorizes to admins/service_role; anon must never reach it.')
ON CONFLICT (function_signature) DO NOTHING;

COMMENT ON FUNCTION public.verify_ledger_totals() IS
  'Platform-wide chip ledger totals for ChipFlowService.verifyLedger(). SECURITY DEFINER so it sees every wallet row - the previous client-side fallback was RLS-trimmed and therefore wrong. Admins and service_role only.';

DO $assert$
DECLARE r record; n_bad int; denied boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  SELECT * INTO r FROM public.verify_ledger_totals();
  IF r.total_minted IS NULL OR r.total_in_wallets IS NULL OR r.total_locked IS NULL THEN
    RAISE EXCEPTION 'verify_ledger_totals returned NULLs';
  END IF;

  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    PERFORM * FROM public.verify_ledger_totals();
  EXCEPTION WHEN OTHERS THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'an unauthenticated caller was NOT refused'; END IF;

  IF has_function_privilege('anon', 'public.verify_ledger_totals()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon still has EXECUTE on verify_ledger_totals';
  END IF;
  SELECT count(*) INTO n_bad FROM public.fn_grant_guard_health() WHERE status <> 'OK';
  IF n_bad <> 0 THEN RAISE EXCEPTION 'grant guard health not all-OK (% failing)', n_bad; END IF;
END
$assert$;
