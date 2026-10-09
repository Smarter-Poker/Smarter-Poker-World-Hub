\set ON_ERROR_STOP on
SET ROLE service_role;
DO $after$ BEGIN
 IF (SELECT stuck_rounds FROM public.trivia_tournament_metrics_v1
     WHERE tournament_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1 THEN
  RAISE EXCEPTION 'Service role cannot read the correct stuck-round count';
 END IF;
 IF has_function_privilege(current_user,'public.trivia_tournament_clock()','EXECUTE') THEN
  RAISE EXCEPTION 'Private clock access was broadened';
 END IF;
END $after$;
RESET ROLE;
SET ROLE authenticated;
DO $player$ BEGIN
 BEGIN
  PERFORM * FROM public.trivia_tournament_metrics_v1;
  RAISE EXCEPTION 'Player can read private operator metrics';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $player$;
RESET ROLE;
SET ROLE anon;
DO $anon$ BEGIN
 BEGIN
  PERFORM * FROM public.trivia_tournament_metrics_v1;
  RAISE EXCEPTION 'Anonymous user can read private operator metrics';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $anon$;
RESET ROLE;
