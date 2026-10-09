\set ON_ERROR_STOP on
-- Real service-role execution, not only catalog privilege assertions.
GRANT SELECT ON public.trivia_tournaments, public.trivia_tournament_entrants,
 public.trivia_tournament_population_runs, public.trivia_tournament_bracket_rounds,
 public.trivia_tournament_seats, public.trivia_tournament_field_snapshots,
 public.trivia_tournament_results, public.trivia_settlements,
 public.trivia_ledger_accounts, public.trivia_tournament_metrics_v1 TO service_role;
REVOKE ALL ON FUNCTION public.trivia_tournament_clock() FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO public.trivia_tournaments(id,schedule_kind,start_time,end_time,lifecycle_state,engine_version,created_at)
VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','test',now(),now()+interval '1 hour','live','tournament-v2',now());
INSERT INTO public.trivia_tournament_bracket_rounds(tournament_id,opens_at,status,deadline_at)
VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()-interval '10 minutes','open',now()-interval '5 minutes');
SET ROLE service_role;
DO $before$ BEGIN
 BEGIN
  PERFORM stuck_rounds FROM public.trivia_tournament_metrics_v1 WHERE tournament_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  RAISE EXCEPTION 'Expected the original private-clock permission failure';
 EXCEPTION WHEN insufficient_privilege THEN
  IF position('trivia_tournament_clock' IN SQLERRM)=0 THEN RAISE; END IF;
 END;
END $before$;
RESET ROLE;
