-- Gate: persisted 70/100/140 horse targets are met exactly with unique horses,
-- humans are additive before/during/after population, replays change nothing.
\set ON_ERROR_STOP on
SELECT p6test.set_clock(date_trunc('minute', clock_timestamp()) + interval '1 minute') AS t0 \gset
CREATE TEMP TABLE inst (target integer, tid uuid, start_at timestamptz);
INSERT INTO inst SELECT x.target, (public.trivia_tournament_create_test_instance('test', 'pop-' || x.target,
        :'t0'::timestamptz + make_interval(mins => x.off), x.target, false)->>'tournament_id')::uuid,
        :'t0'::timestamptz + make_interval(mins => x.off)
  FROM (VALUES (70, 70), (100, 75), (140, 80)) x(target, off);
INSERT INTO public.trivia_tournament_canary_access (tournament_id, user_id, approved_by)
SELECT i.tid, p6test.human(g), 'p6 replica' FROM inst i, generate_series(1, 30) g;
CREATE OR REPLACE FUNCTION pg_temp.enter_range(p_tid uuid, p_from integer, p_to integer) RETURNS integer LANGUAGE sql AS
$$ SELECT count(*)::integer FROM generate_series(p_from, p_to) g
    WHERE (public.trivia_tournament_enter(p_tid, p6test.human(g), 'n-' || p_tid::text || '-' || g)->>'success')::boolean $$;
-- Before population.
SELECT p6test.assert(sum(pg_temp.enter_range(tid, 1, 10)) = 30, 'humans before population') FROM inst;
DO $$
DECLARE i integer; r record;
BEGIN
  FOR i IN 1..80 LOOP
    PERFORM p6test.advance('1 minute');
    FOR r IN SELECT * FROM inst LOOP
      IF public.trivia_tournament_clock() = r.start_at - interval '30 minutes' THEN
        PERFORM p6test.assert(pg_temp.enter_range(r.tid, 11, 20) = 10, 'humans during population');
      ELSIF public.trivia_tournament_clock() = r.start_at - interval '1 minute' THEN
        PERFORM p6test.tick();     -- the 7:58-equivalent final reconcile has run; now late humans
        PERFORM p6test.assert(pg_temp.enter_range(r.tid, 21, 30) = 10, 'humans after population');
        -- Replays of every population step with a valid token change nothing.
        PERFORM public.trivia_tournament_population_plan(r.tid, (p6test.owner()->>'fencing_token')::bigint, true);
        PERFORM public.trivia_tournament_population_join_due(r.tid, (p6test.owner()->>'fencing_token')::bigint, 1000, true);
        PERFORM public.trivia_tournament_population_finalize(r.tid, (p6test.owner()->>'fencing_token')::bigint);
        PERFORM p6test.assert((SELECT count(*) FROM public.trivia_tournament_entrants e
                                WHERE e.tournament_id = r.tid AND e.participant_kind = 'horse') = r.target, 'replay kept target');
      END IF;
    END LOOP;
    PERFORM p6test.tick();
  END LOOP;
END $$;
-- All three are live now (clock = t0 + 80 min).
SELECT i.target, t.lifecycle_state, fs.horse_count, fs.human_count, fs.bracket_size, fs.gross_entry_total,
       (SELECT outcome FROM public.trivia_tournament_population_runs p WHERE p.tournament_id = i.tid AND run_kind = 'final_reconcile') AS final_outcome,
       (SELECT funding_total FROM public.trivia_tournament_population_runs p WHERE p.tournament_id = i.tid AND run_kind = 'population') AS funding,
       (SELECT json_object_agg(skill_band, n) FROM (SELECT skill_band, count(*) n FROM public.trivia_tournament_horse_schedule h
          WHERE h.tournament_id = i.tid AND status = 'entered' GROUP BY 1) b) AS bands,
       (SELECT detail->'band_quota' FROM public.trivia_tournament_population_runs p WHERE p.tournament_id = i.tid AND run_kind = 'population') AS quota
  FROM inst i JOIN public.trivia_tournaments t ON t.id = i.tid
  LEFT JOIN public.trivia_tournament_field_snapshots fs ON fs.tournament_id = i.tid ORDER BY 1;
SELECT p6test.assert(bool_and(t.lifecycle_state = 'live' AND fs.horse_count = i.target AND fs.human_count = 30), 'field = target horses + 30 humans')
  FROM inst i JOIN public.trivia_tournaments t ON t.id = i.tid JOIN public.trivia_tournament_field_snapshots fs ON fs.tournament_id = i.tid;
SELECT p6test.assert(NOT EXISTS (SELECT participant_id FROM public.trivia_tournament_entrants e JOIN inst i ON i.tid = e.tournament_id
                                  WHERE e.participant_kind = 'horse' GROUP BY participant_id HAVING count(*) > 1), 'no horse in two overlapping events');
SELECT p6test.assert(bool_and(h.planned_join_at BETWEEN i.start_at - interval '45 minutes' AND i.start_at - interval '3 minutes'), 'staggered 7:15-7:57 equivalent')
  FROM inst i JOIN public.trivia_tournament_horse_schedule h ON h.tournament_id = i.tid AND NOT h.is_replacement;
SELECT p6test.assert(bool_and(s.subsidy_total = i.target * 10 AND s.gross_pool = (i.target + 30) * 10
                   AND (SELECT count(*) FROM public.trivia_settlement_participants sp WHERE sp.settlement_id = s.id
                         AND sp.participant_kind = 'horse' AND sp.funding_source = 'treasury') = i.target), 'ledger: treasury-funded entries = target')
  FROM inst i JOIN public.trivia_settlements s ON s.subject_type = 'tournament' AND s.subject_id = i.tid;
SELECT p6test.assert((SELECT bool_and(n = 1) FROM (SELECT count(*) n FROM public.trivia_ledger_journals j
         WHERE j.idempotency_key LIKE 'trivia_tourn_entry_%' GROUP BY j.idempotency_key) x), 'one journal per entry reference');
-- Roll all three back (operator), refunding every stored entry exactly once; replay refunds nothing.
SELECT public.trivia_tournament_operator_cancel(tid, 'p6 replica population gate rollback', 'p6-test') FROM inst;
SELECT public.trivia_tournament_operator_cancel(tid, 'p6 replica population gate rollback', 'p6-test')->>'error' FROM inst LIMIT 1;
SELECT p6test.assert(bool_and(p.diamonds = 1000), 'every human balance restored exactly') FROM public.profiles p
 WHERE p.id IN (SELECT p6test.human(g) FROM generate_series(1, 30) g);
SELECT p6test.assert(bool_and(s.state = 'refunded' AND COALESCE(a.balance, 0) = 0), 'terminal escrow zero')
  FROM inst i JOIN public.trivia_settlements s ON s.subject_type = 'tournament' AND s.subject_id = i.tid
  LEFT JOIN public.trivia_ledger_accounts a ON a.account_code = 'escrow:tournament:' || i.tid::text;
SELECT json_build_object('suite', 'population', 'pass', true,
  'targets', (SELECT json_agg(json_build_object('target', i.target, 'horses', fs.horse_count, 'humans', fs.human_count,
                 'bracket', fs.bracket_size, 'gross', fs.gross_entry_total, 'horse_funding', fs.horse_funding_total) ORDER BY i.target)
                FROM inst i JOIN public.trivia_tournament_field_snapshots fs ON fs.tournament_id = i.tid),
  'treasury_balance_after', (SELECT balance FROM public.trivia_ledger_accounts WHERE account_code = 'treasury:trivia')) AS result;
