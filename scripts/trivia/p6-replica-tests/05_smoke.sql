\set ON_ERROR_STOP on
SELECT p6test.set_clock(date_trunc('minute', clock_timestamp()) + interval '1 minute');
SELECT public.trivia_tournament_create_test_instance('test', 'smoke-1', p6test.advance('0 s') + interval '70 minutes', 70, false) AS created \gset
SELECT (:'created'::jsonb->>'tournament_id') AS tid \gset
SELECT count(*) FILTER (WHERE (public.trivia_tournament_enter(:'tid', p6test.human(g), 'nonce-' || lpad(g::text, 6, '0'))->>'success')::boolean) AS humans_entered
  FROM generate_series(1, 0) g;
INSERT INTO public.trivia_tournament_canary_access (tournament_id, user_id, approved_by)
SELECT :'tid', p6test.human(g), 'p6 replica' FROM generate_series(1, 6) g;
SELECT g, public.trivia_tournament_enter(:'tid', p6test.human(g), 'nonce-' || lpad(g::text, 6, '0'))->>'error' AS err
  FROM generate_series(1, 6) g;
SELECT p6test.advance('20 minutes');            -- start - 50 min: plan
SELECT p6test.tick()->'actions' AS plan_tick;
DO $$ BEGIN FOR i IN 1..48 LOOP PERFORM p6test.advance('1 minute'); PERFORM p6test.tick(); END LOOP; END $$;
SELECT lifecycle_state, horse_target,
       (SELECT count(*) FROM trivia_tournament_entrants e WHERE e.tournament_id = t.id AND participant_kind='horse') horses,
       (SELECT count(*) FROM trivia_tournament_entrants e WHERE e.tournament_id = t.id AND participant_kind='human') humans,
       (SELECT outcome FROM trivia_tournament_population_runs p WHERE p.tournament_id=t.id AND run_kind='final_reconcile') final_outcome
  FROM trivia_tournaments t WHERE id = :'tid';
SELECT p6test.advance('2 minutes'); 
SELECT p6test.tick()->'actions' AS start_tick;
SELECT lifecycle_state, total_rounds FROM trivia_tournaments WHERE id = :'tid';
DO $$ DECLARE v_state text; v_tid uuid; BEGIN
  SELECT id INTO v_tid FROM trivia_tournaments WHERE schedule_key = 'test:smoke-1';
  FOR i IN 1..200 LOOP
    PERFORM p6test.play_humans(v_tid, 3);
    PERFORM p6test.tick();
    SELECT lifecycle_state INTO v_state FROM trivia_tournaments WHERE id = v_tid;
    EXIT WHEN v_state IN ('settled', 'cancelled');
    PERFORM p6test.advance('15 seconds');
  END LOOP;
END $$;
SELECT lifecycle_state, terminal_reason, live_started_at - start_time AS start_delay, final_resolved_at - live_started_at AS duration,
       settled_at - final_resolved_at AS settle_latency FROM trivia_tournaments WHERE id = :'tid';
SELECT * FROM trivia_tournament_metrics_v1 WHERE tournament_id = :'tid' \gx
SELECT public.trivia_tournament_results_v1(:'tid', 0, 5) AS top5;
SELECT alerts FROM trivia_tournament_scheduler_runs ORDER BY started_at DESC LIMIT 1;
