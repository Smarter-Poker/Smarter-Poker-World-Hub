-- Gate: a 256-player run (140 horses + 116 humans) with worker outage, a crashed
-- (rolled back) tick, disconnects/reconnects and no-shows ends with complete
-- standings and zero variance.
\set ON_ERROR_STOP on
SELECT p6test.set_clock(date_trunc('minute', clock_timestamp()) + interval '1 minute') AS t0 \gset
SELECT (public.trivia_tournament_create_test_instance('test', 'event-256', :'t0'::timestamptz + interval '70 minutes', 140, false)->>'tournament_id') AS tid \gset
INSERT INTO public.trivia_tournament_canary_access (tournament_id, user_id, approved_by)
SELECT :'tid', p6test.human(g), 'p6 replica' FROM generate_series(101, 216) g;
SELECT count(*) FILTER (WHERE (public.trivia_tournament_enter(:'tid', p6test.human(g), 'e256-' || g)->>'success')::boolean) AS humans FROM generate_series(101, 216) g;
DO $$ BEGIN FOR i IN 1..70 LOOP PERFORM p6test.advance('1 minute'); PERFORM p6test.tick(); END LOOP; END $$;
SELECT p6test.assert(fs.entrant_count = 256 AND fs.bracket_size = 256 AND fs.horse_count = 140, '256 entrants, no byes')
  FROM public.trivia_tournament_field_snapshots fs WHERE fs.tournament_id = :'tid';
CREATE TEMP TABLE outage_alerts (a jsonb);
DO $$ DECLARE v_tid uuid; v_state text; v_r jsonb; BEGIN
  SELECT id INTO v_tid FROM public.trivia_tournaments WHERE schedule_key = 'test:event-256';
  FOR i IN 1..500 LOOP
    PERFORM p6test.play_partial(v_tid, 3);
    IF i BETWEEN 15 AND 35 THEN
      NULL;  -- worker outage: no ticks for ~10 simulated minutes, humans keep playing
    ELSIF i = 36 THEN
      -- crash: a full tick runs and its transaction dies before commit
      BEGIN
        PERFORM p6test.tick();
        RAISE EXCEPTION 'simulated worker crash';
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      INSERT INTO outage_alerts SELECT public.trivia_tournament_health_v1();
      PERFORM p6test.tick();
    ELSE
      PERFORM p6test.tick();
    END IF;
    PERFORM p6test.advance('20 seconds');
    PERFORM p6test.play_humans(v_tid, 7);   -- reconnect: resume and finish
    IF i NOT BETWEEN 15 AND 35 THEN PERFORM p6test.tick(); END IF;
    SELECT lifecycle_state INTO v_state FROM public.trivia_tournaments WHERE id = v_tid;
    EXIT WHEN v_state IN ('settled', 'cancelled');
  END LOOP;
END $$;
SELECT p6test.assert((SELECT a->'alerts' @> '[{"code":"round_stuck"}]'::jsonb FROM outage_alerts LIMIT 1), 'outage was detected (round_stuck)');
SELECT p6test.assert(t.lifecycle_state = 'settled', 'settled after recovery') FROM public.trivia_tournaments t WHERE t.id = :'tid';
SELECT p6test.assert((SELECT count(*) FROM public.trivia_tournament_results WHERE tournament_id = :'tid') = 256
       AND (SELECT min(final_rank) = 1 AND max(final_rank) = 256 AND count(DISTINCT final_rank) = 256
              FROM public.trivia_tournament_results WHERE tournament_id = :'tid'), 'complete standings 1..256');
SELECT p6test.assert(s.gross_pool = 2560 AND s.rake_amount = 256 AND s.paid_total = 2304 AND s.state = 'settled'
       AND (SELECT sum(payout) FROM public.trivia_tournament_results WHERE tournament_id = :'tid') = 2304
       AND COALESCE((SELECT balance FROM public.trivia_ledger_accounts WHERE account_code = 'escrow:tournament:' || :'tid'), 0) = 0,
       'zero variance') FROM public.trivia_settlements s WHERE s.subject_type = 'tournament' AND s.subject_id = :'tid';
SELECT p6test.assert(NOT EXISTS (SELECT 1 FROM public.trivia_tournament_matchups WHERE tournament_id = :'tid' AND status <> 'resolved'), 'every matchup resolved once');
SELECT p6test.assert((SELECT count(*) FROM public.trivia_tournament_seats WHERE tournament_id = :'tid') = 2 * 255, 'one seat per entrant per matchup');
SELECT public.trivia_ledger_health_v1()->'healthy' AS ledger_healthy;
SELECT p6test.assert((public.trivia_ledger_health_v1()->>'healthy')::boolean, 'Phase 2 ledger health clean');
SELECT json_build_object('suite', 'event_256_failures', 'pass', true,
  'bracket_minutes', (SELECT round(extract(epoch FROM final_resolved_at - live_started_at) / 60.0, 1) FROM public.trivia_tournaments WHERE id = :'tid'),
  'round_seconds', (SELECT json_agg(round(extract(epoch FROM closed_at - opens_at)) ORDER BY round_number) FROM public.trivia_tournament_bracket_rounds WHERE tournament_id = :'tid'),
  'no_shows', (SELECT count(*) FROM public.trivia_tournament_seats WHERE tournament_id = :'tid' AND status = 'no_show'),
  'expired_seats', (SELECT count(*) FROM public.trivia_tournament_seats WHERE tournament_id = :'tid' AND result_outcome = 'expired'),
  'decided_by', (SELECT json_object_agg(decided_reason, n) FROM (SELECT decided_reason, count(*) n FROM public.trivia_tournament_matchups WHERE tournament_id = :'tid' GROUP BY 1) x),
  'outage_alerts', (SELECT a->'alerts' FROM outage_alerts LIMIT 1),
  'human_prizes', (SELECT COALESCE(sum(payout), 0) FROM public.trivia_tournament_results WHERE tournament_id = :'tid' AND participant_kind = 'human'),
  'horse_prizes', (SELECT COALESCE(sum(payout), 0) FROM public.trivia_tournament_results WHERE tournament_id = :'tid' AND participant_kind = 'horse')) AS result;
