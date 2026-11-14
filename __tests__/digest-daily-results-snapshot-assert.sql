-- 20261114155817: the reconciliation is computed before the digest and stored;
-- the live name keeps its answers, its cap and its callers.
DO $$ DECLARE b record; BEGIN
  FOR b IN SELECT * FROM digest_daily_results_before LOOP
    IF public.fn_sp_digest_daily_results(b.day) IS DISTINCT FROM b.result THEN
      RAISE EXCEPTION 'live answer changed for % without a snapshot', b.day; END IF;
    IF public.fn_sp_digest_daily_results_compute(b.day) IS DISTINCT FROM b.result THEN
      RAISE EXCEPTION 'compute answer changed for %', b.day; END IF;
  END LOOP;
END $$;
DO $$ BEGIN
  IF has_function_privilege('anon','public.fn_sp_digest_daily_results(date)','EXECUTE')
     OR has_function_privilege('anon','public.fn_sp_digest_daily_results_compute(date)','EXECUTE')
     OR has_function_privilege('anon','public.fn_sp_digest_daily_results_refresh(date)','EXECUTE')
     OR has_function_privilege('authenticated','public.fn_sp_digest_daily_results_refresh(date)','EXECUTE')
     OR has_table_privilege('anon','public.sp_digest_daily_results_snapshots','SELECT') THEN
    RAISE EXCEPTION 'snapshot surface is reachable by clients'; END IF;
  IF NOT has_function_privilege('service_role','public.fn_sp_digest_daily_results(date)','EXECUTE') THEN
    RAISE EXCEPTION 'the digest lost its report'; END IF;
END $$;
-- The live name keeps its own 60 s cap; the stored computation has its own budget.
DO $$ BEGIN
  IF NOT (SELECT 'statement_timeout=60s' = ANY(proconfig) FROM pg_proc WHERE oid='public.fn_sp_digest_daily_results(date)'::regprocedure) THEN
    RAISE EXCEPTION 'live cap changed'; END IF;
  IF NOT (SELECT 'statement_timeout=600s' = ANY(proconfig) FROM pg_proc WHERE oid='public.fn_sp_digest_daily_results_refresh(date)'::regprocedure) THEN
    RAISE EXCEPTION 'refresh budget missing'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc, unnest(proconfig) c WHERE oid='public.fn_sp_digest_daily_results_compute(date)'::regprocedure AND c LIKE 'statement_timeout=%') THEN
    RAISE EXCEPTION 'compute must inherit its caller''s budget'; END IF;
END $$;
-- A closed day is stored once and replaced on refresh; today is refused.
DO $$ DECLARE r jsonb; BEGIN
  r := public.fn_sp_digest_daily_results_refresh('2026-11-10');
  IF r->>'stored' <> 'true' OR r->>'status' IS DISTINCT FROM (SELECT result#>>'{reconciliation,status}' FROM digest_daily_results_before WHERE day='2026-11-10') THEN
    RAISE EXCEPTION 'refresh did not store %', r; END IF;
  r := public.fn_sp_digest_daily_results_refresh('2026-11-10');
  IF (SELECT count(*) FROM public.sp_digest_daily_results_snapshots WHERE day='2026-11-10') <> 1 THEN
    RAISE EXCEPTION 'refresh duplicated a day'; END IF;
  BEGIN
    PERFORM public.fn_sp_digest_daily_results_refresh((clock_timestamp() AT TIME ZONE 'America/Chicago')::date);
    RAISE EXCEPTION 'an open day was stored';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;
-- Within 12 hours the stored morning answer is served; after that the day is
-- computed live again, so an older day is never answered from a frozen copy.
UPDATE ca_hand_facts SET net = net - 0.01 WHERE user_id = '00000000-0000-0000-0000-00000000000b';
DO $$ BEGIN
  IF public.fn_sp_digest_daily_results('2026-11-10') IS DISTINCT FROM (SELECT result FROM digest_daily_results_before WHERE day='2026-11-10') THEN
    RAISE EXCEPTION 'fresh snapshot was not served'; END IF;
  IF public.fn_sp_digest_daily_results_compute('2026-11-10')#>>'{reconciliation,status}' <> 'discrepancy' THEN
    RAISE EXCEPTION 'compute did not see the change'; END IF;
END $$;
UPDATE public.sp_digest_daily_results_snapshots SET computed_at = clock_timestamp() - interval '13 hours' WHERE day='2026-11-10';
DO $$ BEGIN
  IF public.fn_sp_digest_daily_results('2026-11-10')#>>'{reconciliation,status}' <> 'discrepancy' THEN
    RAISE EXCEPTION 'an aged snapshot hid a live discrepancy'; END IF;
END $$;
UPDATE ca_hand_facts SET net = net + 0.01 WHERE user_id = '00000000-0000-0000-0000-00000000000b';
-- No schedule was added; the existing job keeps its schedule and its metrics
-- statement, and runs the refresh at 06:15 and (if still missing) 06:45 only.
DO $$ DECLARE c text := (SELECT command FROM cron.job WHERE jobid = 495); BEGIN
  IF (SELECT count(*) FROM cron.job) <> 1 OR (SELECT schedule FROM cron.job WHERE jobid = 495) <> '15,45 5-12 * * *' THEN
    RAISE EXCEPTION 'schedule changed'; END IF;
  IF position($m$SET statement_timeout = '1500s'; SELECT public.fn_sp_daily_metrics_snapshot()$m$ in c) <> 1
     OR c NOT LIKE '%fn_sp_digest_daily_results_refresh()%' OR c NOT LIKE '%''06:15''%' OR c NOT LIKE '%''06:45''%' THEN
    RAISE EXCEPTION 'job command wrong: %', c; END IF;
END $$;
