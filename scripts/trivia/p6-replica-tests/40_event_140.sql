-- Gate: a 140-horse-plus-human tournament includes every charged entrant, finishes
-- inside the 60-minute event budget, settles atomically with zero variance, and
-- every DTO stays answer-free.
\set ON_ERROR_STOP on
SELECT p6test.set_clock(date_trunc('minute', clock_timestamp()) + interval '1 minute') AS t0 \gset
SELECT (public.trivia_tournament_create_test_instance('test', 'event-140', :'t0'::timestamptz + interval '70 minutes', 140, false)->>'tournament_id') AS tid \gset
INSERT INTO public.trivia_tournament_canary_access (tournament_id, user_id, approved_by)
SELECT :'tid', p6test.human(g), 'p6 replica' FROM generate_series(1, 40) g;
SELECT count(*) FILTER (WHERE (public.trivia_tournament_enter(:'tid', p6test.human(g), 'e140-nonce-' || g)->>'success')::boolean) AS humans FROM generate_series(1, 40) g;
SELECT balance AS treasury_before FROM public.trivia_ledger_accounts WHERE account_code = 'treasury:trivia' \gset
DO $$ BEGIN FOR i IN 1..70 LOOP PERFORM p6test.advance('1 minute'); PERFORM p6test.tick(); END LOOP; END $$;
SELECT p6test.assert(lifecycle_state = 'live', 'started on time') FROM public.trivia_tournaments WHERE id = :'tid';
SELECT p6test.assert(fs.horse_count = 140 AND fs.human_count = 40 AND fs.entrant_count = 180 AND fs.bracket_size = 256 AND fs.round_count = 8,
       'field = 140 horses + 40 humans, 256 bracket') FROM public.trivia_tournament_field_snapshots fs WHERE fs.tournament_id = :'tid';
SELECT p6test.assert((SELECT count(*) FROM public.trivia_tournament_entrants WHERE tournament_id = :'tid' AND in_field)
     = (SELECT count(*) FROM public.trivia_settlement_participants sp JOIN public.trivia_settlements s ON s.id = sp.settlement_id
         WHERE s.subject_type = 'tournament' AND s.subject_id = :'tid'), 'every charged entrant is in the field');
-- Live: disconnect after 4 answers, reconnect and finish; ~20% of humans never show.
DO $$ DECLARE v_tid uuid; v_state text; BEGIN
  SELECT id INTO v_tid FROM public.trivia_tournaments WHERE schedule_key = 'test:event-140';
  -- Production cadence: the worker ticks every ~2-3 s while a round is live.
  FOR i IN 1..2000 LOOP
    IF i % 4 = 1 THEN PERFORM p6test.play_partial(v_tid, 2, 5); END IF;
    IF i % 25 = 0 THEN PERFORM p6test.play_humans(v_tid, 5); END IF;
    PERFORM p6test.tick();
    SELECT lifecycle_state INTO v_state FROM public.trivia_tournaments WHERE id = v_tid;
    EXIT WHEN v_state IN ('settled', 'cancelled');
    PERFORM p6test.advance('3 seconds');
  END LOOP;
END $$;
SELECT t.lifecycle_state, t.final_resolved_at - t.live_started_at AS bracket_duration, t.settled_at - t.final_resolved_at AS settle_latency,
       s.gross_pool, s.rake_amount, s.final_prize_pool, s.paid_total, s.state,
       (SELECT balance FROM public.trivia_ledger_accounts WHERE account_code = 'escrow:tournament:' || t.id::text) AS escrow
  FROM public.trivia_tournaments t JOIN public.trivia_settlements s ON s.subject_type = 'tournament' AND s.subject_id = t.id WHERE t.id = :'tid';
SELECT p6test.assert(t.lifecycle_state = 'settled' AND t.final_resolved_at - t.live_started_at <= interval '60 minutes'
       AND t.settled_at - t.final_resolved_at <= interval '60 seconds', 'settled inside the event budget and settlement SLO')
  FROM public.trivia_tournaments t WHERE t.id = :'tid';
SELECT p6test.assert(s.gross_pool = 1800 AND s.rake_amount = 180 AND s.final_prize_pool = 1620 AND s.paid_total = 1620
       AND (SELECT sum(payout) FROM public.trivia_tournament_results r WHERE r.tournament_id = :'tid') = 1620
       AND COALESCE((SELECT balance FROM public.trivia_ledger_accounts WHERE account_code = 'escrow:tournament:' || :'tid'), 0) = 0,
       'conservation: gross = rake + prizes, escrow 0') FROM public.trivia_settlements s WHERE s.subject_type = 'tournament' AND s.subject_id = :'tid';
SELECT p6test.assert((SELECT count(*) FROM public.trivia_tournament_results WHERE tournament_id = :'tid') = 180
       AND (SELECT count(DISTINCT final_rank) FROM public.trivia_tournament_results WHERE tournament_id = :'tid') = 180
       AND (SELECT array_agg(DISTINCT placement_tier ORDER BY placement_tier) FROM public.trivia_tournament_results WHERE tournament_id = :'tid')
           = ARRAY[1, 2, 3, 5, 9, 17, 33, 65, 129], 'complete standings, every tier');
-- Treasury: paid 1,400 of horse entries, received every horse prize back.
SELECT p6test.assert((SELECT balance FROM public.trivia_ledger_accounts WHERE account_code = 'treasury:trivia')
       = :treasury_before - 1400 + (SELECT COALESCE(sum(payout), 0) FROM public.trivia_tournament_results
                                      WHERE tournament_id = :'tid' AND participant_kind = 'horse'), 'horse prizes routed to treasury');
SELECT p6test.assert(bool_and(p.diamonds = 990 + COALESCE(r.payout, 0)), 'human wallets = 1000 - entry + prize')
  FROM generate_series(1, 40) g JOIN public.profiles p ON p.id = p6test.human(g)
  LEFT JOIN public.trivia_tournament_entrants e ON e.tournament_id = :'tid' AND e.participant_id = p.id
  LEFT JOIN public.trivia_tournament_results r ON r.tournament_id = :'tid' AND r.entrant_id = e.id;
-- Every DTO for this event is answer-free.
CREATE TEMP TABLE dtos AS
SELECT public.trivia_tournament_summary_v1(:'tid', p6test.human(1)) d
UNION ALL SELECT public.trivia_tournament_field_v1(:'tid', 0, 200)
UNION ALL SELECT public.trivia_tournament_bracket_v1(:'tid', r, 0, 256) FROM generate_series(1, 8) r
UNION ALL SELECT public.trivia_tournament_my_run_v1(:'tid', p6test.human(g)) FROM generate_series(1, 40) g
UNION ALL SELECT public.trivia_tournament_results_v1(:'tid', 0, 200)
UNION ALL SELECT public.trivia_tournament_receipt_v1(:'tid', p6test.human(1))
UNION ALL SELECT public.trivia_tournament_history_v1(p6test.human(1), 0, 20)
UNION ALL SELECT public.trivia_tournament_events_feed_v1(0, 2000);
SELECT p6test.assert(NOT EXISTS (SELECT 1 FROM dtos, jsonb_path_query(d, 'strict $.**') v
        WHERE jsonb_typeof(v) = 'object' AND (v ? 'correct_index' OR v ? 'correctIndex' OR v ? 'chosen_original_index'
              OR v ? 'planned_correct' OR v ? 'permutations' OR v ? 'revision_id' OR v ? 'horse_plan_key')), 'DTOs are answer-free');
SELECT p6test.assert(bool_and((x->>'participantKind') IN ('human', 'horse') AND x ? 'displayName' AND x ? 'rank' AND x ? 'score' AND x ? 'payout'),
       'standardized winner fields') FROM jsonb_array_elements(public.trivia_tournament_results_v1(:'tid', 0, 200)->'items') x;
SELECT json_build_object('suite', 'event_140', 'pass', true,
  'bracket_minutes', (SELECT round(extract(epoch FROM final_resolved_at - live_started_at) / 60.0, 1) FROM public.trivia_tournaments WHERE id = :'tid'),
  'round_seconds', (SELECT json_agg(round(extract(epoch FROM closed_at - opens_at)) ORDER BY round_number) FROM public.trivia_tournament_bracket_rounds WHERE tournament_id = :'tid'),
  'no_shows', (SELECT count(*) FROM public.trivia_tournament_seats WHERE tournament_id = :'tid' AND status = 'no_show'),
  'decided_by', (SELECT json_object_agg(decided_reason, n) FROM (SELECT decided_reason, count(*) n FROM public.trivia_tournament_matchups WHERE tournament_id = :'tid' GROUP BY 1) x),
  'champion_kind', (SELECT participant_kind FROM public.trivia_tournament_results WHERE tournament_id = :'tid' AND final_rank = 1),
  'human_prizes', (SELECT COALESCE(sum(payout), 0) FROM public.trivia_tournament_results WHERE tournament_id = :'tid' AND participant_kind = 'human'),
  'horse_prizes', (SELECT COALESCE(sum(payout), 0) FROM public.trivia_tournament_results WHERE tournament_id = :'tid' AND participant_kind = 'horse')) AS result;
