-- ═══════════════════════════════════════════════════════════════════════════
-- APPLIED TO PRODUCTION: 2026-08-18 via mcp apply_migration
-- (name bbj_payout_conservation_selftest). Mirror only. Do not re-run.
-- ═══════════════════════════════════════════════════════════════════════════
-- The minting bug lived in ONE arithmetic expression inside the sole payer and
-- survived a full solvency overhaul (§41), because every check asked whether a
-- payout EXCEEDED the pool — never whether the pool GREW. The clamp was right;
-- the drain was not, and nothing was watching the drain.
--
-- fn_bbj_selftest_payout_conservation runs the REAL bbj_atomic_payout_v2
-- against a real funded pool inside a subtransaction and rolls it back,
-- asserting main+backup fell by exactly the amount paid. It exercises the
-- actual function rather than a copy of its maths, so it cannot drift from the
-- thing it tests. Side-effect free; service-role only.
--
-- It is wired into fn_platform_invariants_health as a 17th check,
-- 'bbj_payout_conservation', so a future regression that mints chips shows up
-- in the same place every other money invariant does.

CREATE OR REPLACE FUNCTION public.fn_bbj_selftest_payout_conservation()
RETURNS TABLE (ok boolean, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool uuid; m0 numeric; b0 numeric; m1 numeric; b1 numeric;
  paid numeric := 0; minted numeric := 0; err text := ''; r record;
BEGIN
  SELECT id, main_balance, COALESCE(backup_balance,0)
    INTO v_pool, m0, b0
    FROM bbj_pools WHERE status='active' AND main_balance > 10
    ORDER BY main_balance DESC LIMIT 1;

  IF v_pool IS NULL THEN
    RETURN QUERY SELECT true, 'skipped: no funded active pool to test against';
    RETURN;
  END IF;

  BEGIN
    SELECT * INTO r FROM bbj_atomic_payout_v2(
      v_pool, gen_random_uuid(), 999999999::bigint, 15::numeric,
      (SELECT id FROM profiles LIMIT 1),
      (SELECT id FROM profiles OFFSET 1 LIMIT 1),
      ARRAY[]::uuid[], ARRAY[]::uuid[], '{"selftest":true}'::jsonb
    );
    paid := COALESCE(r.total_payout, 0);
    SELECT main_balance, COALESCE(backup_balance,0) INTO m1, b1 FROM bbj_pools WHERE id = v_pool;
    minted := (m1 + b1) - ((m0 + b0) - paid);
    RAISE EXCEPTION 'SELFTEST-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'SELFTEST-ROLLBACK' THEN
      GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
    END IF;
  END;

  IF err <> '' THEN
    RETURN QUERY SELECT false, 'selftest errored: ' || err;
  ELSIF ABS(COALESCE(minted, 0)) > 0.005 THEN
    RETURN QUERY SELECT false, format(
      'PAYER IS CREATING CHIPS: paid %s but pool total moved by %s (minted %s)',
      paid, (m1 + b1) - (m0 + b0), minted);
  ELSE
    RETURN QUERY SELECT true, format('conserves: paid %s, pool fell by exactly that', paid);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_bbj_selftest_payout_conservation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_bbj_selftest_payout_conservation() TO service_role;
