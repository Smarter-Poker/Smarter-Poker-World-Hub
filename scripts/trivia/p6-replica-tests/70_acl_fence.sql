-- Gate: browser roles have nothing; service_role reads only non-secret tables and
-- calls only the published RPCs; legacy writers cannot touch a v2 instance.
\set ON_ERROR_STOP on
SELECT p6test.set_clock(date_trunc('minute', clock_timestamp()) + interval '1 minute') AS t0 \gset
SELECT (public.trivia_tournament_create_test_instance('test', 'acl', :'t0'::timestamptz + interval '90 minutes', 70, false)->>'tournament_id') AS tid \gset
CREATE OR REPLACE FUNCTION pg_temp.denied(p_role text, p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN EXECUTE p_sql; EXCEPTION WHEN insufficient_privilege THEN RESET ROLE; RETURN true; END;
  RESET ROLE; RETURN false;
END $$;
SELECT p6test.assert(bool_and(pg_temp.denied(r, s)), 'browser roles denied everywhere')
  FROM unnest(ARRAY['anon', 'authenticated']) r,
       unnest(ARRAY['SELECT 1 FROM public.trivia_tournament_entrants', 'SELECT 1 FROM public.trivia_tournament_matchups',
                    'SELECT 1 FROM public.trivia_tournament_secrets', 'SELECT 1 FROM public.trivia_tournament_metrics_v1',
                    'SELECT public.trivia_tournament_enter(''' || :'tid' || ''', gen_random_uuid(), NULL)',
                    'SELECT public.trivia_tournament_schedule_v1(NULL, 8)',
                    'SELECT public.trivia_tournament_scheduler_acquire(''x-holder'', 60)']) s;
SELECT p6test.assert(bool_and(pg_temp.denied('service_role', s)), 'service_role cannot write or read secrets/plans/internals')
  FROM unnest(ARRAY['SELECT 1 FROM public.trivia_tournament_secrets', 'SELECT 1 FROM public.trivia_tournament_horse_actions',
                    'DELETE FROM public.trivia_tournament_entrants', 'UPDATE public.trivia_tournament_matchups SET slot = slot',
                    'INSERT INTO public.trivia_tournament_events (tournament_id, event_type, created_at) VALUES (''' || :'tid' || ''', ''forged'', now())',
                    'SELECT public.trivia_tournament_admit(''' || :'tid' || ''', gen_random_uuid(), ''human'', NULL, NULL)',
                    'SELECT public.trivia_tournament_settle(''' || :'tid' || ''', 1)',
                    'SELECT public.trivia_tournament_start(''' || :'tid' || ''', 1, true)']) s;
SELECT p6test.assert(NOT pg_temp.denied('service_role', 'SELECT public.trivia_tournament_schedule_v1(NULL, 8)')
       AND NOT pg_temp.denied('service_role', 'SELECT count(*) FROM public.trivia_tournament_entrants'), 'service_role reads DTOs');
-- Legacy/direct writers are fenced off the v2 row even with table privileges.
DO $$ DECLARE v_tid uuid; v_ok boolean;
BEGIN
  SELECT id INTO v_tid FROM public.trivia_tournaments WHERE schedule_key = 'test:acl';
  PERFORM pg_catalog.set_config('trivia.tournament_engine', '', true);
  FOR i IN 1..3 LOOP
    v_ok := false;
    BEGIN
      CASE i
        WHEN 1 THEN UPDATE public.trivia_tournaments SET prize_pool = 999 WHERE id = v_tid;
        WHEN 2 THEN INSERT INTO public.trivia_tournament_entries (tournament_id, user_id) VALUES (v_tid, p6test.human(1));
        WHEN 3 THEN DELETE FROM public.trivia_tournaments WHERE id = v_tid;
      END CASE;
    EXCEPTION WHEN insufficient_privilege THEN v_ok := true;
    END;
    PERFORM p6test.assert(v_ok, 'legacy write fenced: case ' || i);
  END LOOP;
  PERFORM p6test.assert(public.enter_trivia_tournament_v2(v_tid, p6test.human(1))->>'error' = 'tournament_entry_retired', 'legacy entry retired');
END $$;
SELECT json_build_object('suite', 'acl_fence', 'pass', true) AS result;
