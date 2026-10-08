-- Real wall clock; no test clock override. Subtransactions restore fixtures.
DO $$ BEGIN
BEGIN
UPDATE public.trivia_tournament_bracket_rounds SET deadline_at=clock_timestamp()+interval '1 hour';
BEGIN PERFORM public.trivia_tournament_prepare_horse_seat('00000000-0000-0000-0000-000000000002',1::smallint); RAISE EXCEPTION 'live preparation was silently blocked'; EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE '%horse session open refused: invalid_arguments%' THEN RAISE; END IF; END;
RAISE EXCEPTION 'restore fixture'; EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'restore fixture' THEN RAISE; END IF;END;
BEGIN
UPDATE public.trivia_tournament_seats SET participant_kind='human' WHERE seat_no=1;
PERFORM public.assert_true(NOT public.trivia_tournament_prepare_horse_seat('00000000-0000-0000-0000-000000000002',1::smallint),'human seat guard');
RAISE EXCEPTION 'restore fixture'; EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'restore fixture' THEN RAISE; END IF;END;
BEGIN
UPDATE public.trivia_tournament_bracket_rounds SET status='closed';
PERFORM public.assert_true(NOT public.trivia_tournament_prepare_horse_seat('00000000-0000-0000-0000-000000000002',1::smallint),'closed round guard');
RAISE EXCEPTION 'restore fixture'; EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'restore fixture' THEN RAISE; END IF;END;
END $$;
SELECT 'PASS live preparation, human exclusion and closed-round guards';
