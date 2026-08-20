-- PRODUCT RULE (Dan, 2026-08-19): chips can NEVER be bought with diamonds.
--
-- Diamonds are the global purchasable currency; chips are per-club gambling
-- balance. Conversion between them is forbidden outright, so both conversion
-- functions have EXECUTE revoked from EVERY application role, including
-- service_role -- the API route runs as service_role and therefore cannot
-- convert either.
--
-- Revoked rather than dropped so the definitions and audit trail survive and
-- the rollback is one line. This is the layer that holds even if a browser is
-- still running a cached bundle against the old endpoint; the route itself
-- returns 410 and the client entry points are removed separately.
DO $$
DECLARE v_before int;
BEGIN
  SELECT count(*) INTO v_before
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('fn_purchase_chips','fn_purchase_club_chips')
     AND has_function_privilege('service_role', p.oid, 'EXECUTE');
  RAISE NOTICE 'Pre-flight: % conversion fn(s) executable by service_role', v_before;
END $$;

REVOKE ALL ON FUNCTION public.fn_purchase_chips(p_user_id uuid, p_amount numeric, p_diamonds_cost integer, p_reference_id text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_purchase_club_chips(p_user_id uuid, p_club_id uuid, p_amount numeric, p_diamonds_cost integer, p_reference_id text)
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE v_after int; v_names text;
BEGIN
  SELECT count(*), COALESCE(string_agg(p.proname, ', '), '') INTO v_after, v_names
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('fn_purchase_chips','fn_purchase_club_chips')
     AND (has_function_privilege('service_role',  p.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR has_function_privilege('anon',          p.oid, 'EXECUTE'));
  IF v_after > 0 THEN
    RAISE EXCEPTION 'Post-apply: diamond->chip conversion still reachable: %', v_names;
  END IF;
  RAISE NOTICE 'Post-apply: diamond->chip conversion unreachable by every application role';
END $$;

-- ROLLBACK:
--   GRANT EXECUTE ON FUNCTION public.fn_purchase_chips(uuid, numeric, integer, text) TO service_role;
--   GRANT EXECUTE ON FUNCTION public.fn_purchase_club_chips(uuid, uuid, numeric, integer, text) TO service_role;
