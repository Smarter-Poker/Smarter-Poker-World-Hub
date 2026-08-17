-- APPLIED TO PRODUCTION 2026-08-17 06:00:14 UTC (version 20260817060014)
--
-- Drain batch 2 -- the final 12: read-only money getters.
--
-- Caller trace across BOTH repos before touching anything (grep for each name
-- in pages/, src/, server/src/, excluding node_modules and built output):
--
--   get_bbj_pool               CA src/pages/UnionGamesPage.tsx        browser, authenticated
--   get_player_rake_total      CA src/services/CommissionService.ts   browser, authenticated
--   get_wallet_balance_totals  CA src/services/SettlementCronService.ts  browser, authenticated
--   get_diamond_balance        WH pages/api/training/tournaments.js   server, SERVICE_ROLE
--   get_promo_status           WH pages/api/club-arena/distribute-promo.js  server, SERVICE_ROLE
--   fn_calculate_rakeback      no caller
--   fn_can_agent_remove_chips  no caller
--   get_settlement_periods     no caller
--   get_union_bbj_status       no caller
--   get_union_rake_for_period  no caller
--   is_club_settlement_locked  no caller -- checkSettlementLock() queries the
--                                          clubs and settlement_locks TABLES
--   get_player_rake_total(uuid,uuid)  no caller (second overload)
--
-- Zero browser-side callers in World Hub, and nothing on a public WH page.
--
-- SettlementCronService.runCanaryCheck() is FAIL-CLOSED -- if the RPC errors it
-- blocks settlement rather than proceeding unverified. That is the safe
-- direction to fail, and it is only reached inside an authenticated settlement
-- run, so this revoke cannot trigger it.
--
-- After this batch the anon-executable money backlog is zero.

DO $drain$
DECLARE
  r          record;
  n_revoked  int := 0;
  n_expected int;
  getters    text[] := ARRAY[
    'fn_calculate_rakeback','fn_can_agent_remove_chips','get_bbj_pool','get_diamond_balance',
    'get_player_rake_total','get_promo_status','get_settlement_periods','get_union_bbj_status',
    'get_union_rake_for_period','get_wallet_balance_totals','is_club_settlement_locked'
  ];
BEGIN
  SELECT count(*) INTO n_expected
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY(getters)
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  FOR r IN
    SELECT p.oid, p.prosecdef,
           format('public.%I(%s)', p.proname,
                  COALESCE((SELECT string_agg(format_type(t.typ, NULL), ', ' ORDER BY t.ord)
                              FROM unnest(p.proargtypes) WITH ORDINALITY AS t(typ, ord)), '')) AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY(getters)
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    IF NOT has_function_privilege('authenticated', r.oid, 'EXECUTE')
       AND NOT has_function_privilege('service_role', r.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'refusing to revoke anon on % - it would leave no caller role', r.sig;
    END IF;

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon',   r.sig);

    INSERT INTO public.privileged_function_lock (function_signature, security_definer, reason)
    VALUES (r.sig, r.prosecdef,
            'Read-only money getter. Caller-traced across both repos 2026-08-17: server callers use the service-role key, browser callers sit behind a session. No public-page caller.')
    ON CONFLICT (function_signature) DO NOTHING;

    n_revoked := n_revoked + 1;
  END LOOP;

  IF n_revoked <> n_expected THEN
    RAISE EXCEPTION 'revoked % but expected % - aborting', n_revoked, n_expected;
  END IF;
  RAISE NOTICE 'drain batch 2: revoked anon/PUBLIC on % read-only getters', n_revoked;
END
$drain$;

DO $assert$
DECLARE n_any int; n_bad int;
BEGIN
  SELECT count(*) INTO n_any FROM public.fn_audit_privileged_grants();
  IF n_any <> 0 THEN
    RAISE EXCEPTION 'expected the anon money backlog to be empty, still % rows', n_any;
  END IF;
  SELECT count(*) INTO n_bad FROM public.fn_grant_guard_health() WHERE status <> 'OK';
  IF n_bad <> 0 THEN RAISE EXCEPTION 'grant guard health not all-OK (% failing)', n_bad; END IF;
END
$assert$;
