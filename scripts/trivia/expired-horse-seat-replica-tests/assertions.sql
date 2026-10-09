SELECT assert_true(NOT trivia_tournament_prepare_horse_seat('00000000-0000-0000-0000-000000000002',1::smallint),'expired waiting seat refuses');
SELECT assert_true(NOT EXISTS(SELECT FROM calls WHERE name='open'),'no session-open attempted');
SELECT assert_true(NOT EXISTS(SELECT FROM trivia_sessions),'no session created');
SELECT assert_true(trivia_tournament_resolve_matchup('00000000-0000-0000-0000-000000000002',3),'original deadline resolution proceeds');
SELECT assert_true((SELECT count(*)=2 FROM trivia_tournament_seats WHERE status='no_show' AND session_id IS NULL AND correct_count=0 AND answered_count=0 AND tiebreak_ms=200000),'both original no-show scores');
SELECT assert_true((SELECT status='resolved' AND decided_reason='double_no_show' AND winner_entrant_id='00000000-0000-0000-0000-000000000003' FROM trivia_tournament_matchups),'original better seed advances');
SELECT assert_true(NOT trivia_tournament_resolve_matchup('00000000-0000-0000-0000-000000000002',3),'resolved matchup replay has no effect');
SELECT assert_true((SELECT count(*)=1 FROM calls WHERE name='place_winner'),'winner advanced exactly once');
SELECT 'PASS expired preparation guard, original no-show resolution and duplicate idempotency';

DO $$ BEGIN BEGIN UPDATE trivia_tournament_seats SET status='playing',result_outcome=NULL,finished_at=NULL WHERE seat_no=1; RAISE EXCEPTION 'unplanned playing horse accepted'; EXCEPTION WHEN check_violation THEN NULL; END; END $$;
SELECT 'PASS playing horse still requires plan hash';
