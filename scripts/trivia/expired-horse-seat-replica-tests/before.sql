DO $$ BEGIN
BEGIN PERFORM trivia_tournament_prepare_horse_seat('00000000-0000-0000-0000-000000000002',1::smallint); RAISE EXCEPTION 'expected original preparation failure absent'; EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE '%horse session open refused: invalid_arguments%' THEN RAISE; END IF; END;
BEGIN PERFORM trivia_tournament_resolve_matchup('00000000-0000-0000-0000-000000000002',3); RAISE EXCEPTION 'expected original constraint failure absent'; EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE '%trivia_tournament_seats_check3%' THEN RAISE; END IF;END;
END $$;
SELECT 'PASS both original defects reproduced with exact constraints';
