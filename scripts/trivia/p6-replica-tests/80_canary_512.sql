-- Gate (capacity): a zero-diamond canary with a 512 field builds a 9-round bracket
-- with 90 unique questions, opens round 1, and rolls back with no money moved.
\set ON_ERROR_STOP on
SELECT p6test.set_clock(date_trunc('minute', clock_timestamp()) + interval '1 minute') AS t0 \gset
SELECT (public.trivia_tournament_create_test_instance('canary', 'cap-512', :'t0'::timestamptz + interval '60 minutes', 140, true, NULL, 512)->>'tournament_id') AS tid \gset
INSERT INTO public.trivia_tournament_canary_access (tournament_id, user_id, approved_by) SELECT :'tid', p6test.human(g), 'p6' FROM generate_series(1, 300) g;
SELECT count(*) FILTER (WHERE (public.trivia_tournament_enter(:'tid', p6test.human(g), 'c512-nonce-' || g)->>'success')::boolean) AS humans FROM generate_series(1, 300) g;
DO $$ BEGIN FOR i IN 1..60 LOOP PERFORM p6test.advance('1 minute'); PERFORM p6test.tick(); END LOOP; END $$;
SELECT p6test.assert(fs.entrant_count = 440 AND fs.bracket_size = 512 AND fs.round_count = 9 AND fs.gross_entry_total = 0, '512 bracket, 9 rounds, zero diamonds')
  FROM public.trivia_tournament_field_snapshots fs WHERE fs.tournament_id = :'tid';
SELECT p6test.assert((SELECT count(DISTINCT i.question_id) FROM public.trivia_roster_snapshot_items i
        WHERE i.snapshot_id = (SELECT roster_snapshot_id FROM public.trivia_tournaments WHERE id = :'tid')) = 90, '90 unique questions across 9 rounds');
SELECT p6test.assert((SELECT count(*) FROM public.trivia_tournament_matchups WHERE tournament_id = :'tid') = 511
       AND (SELECT count(*) FROM public.trivia_tournament_matchups WHERE tournament_id = :'tid' AND is_bye) = 72, '511 matchups, 72 byes to top seeds');
SELECT public.trivia_tournament_operator_cancel(:'tid', 'p6 canary capacity check complete', 'p6-test')->>'success';
SELECT p6test.assert(s.state = 'voided' AND t.lifecycle_state = 'cancelled', 'canary closed with no money')
  FROM public.trivia_settlements s JOIN public.trivia_tournaments t ON t.id = s.subject_id WHERE s.subject_type = 'tournament' AND s.subject_id = :'tid';
SELECT json_build_object('suite', 'canary_512', 'pass', true, 'entrants', 440, 'bracket', 512, 'rounds', 9, 'questions', 90) AS result;
