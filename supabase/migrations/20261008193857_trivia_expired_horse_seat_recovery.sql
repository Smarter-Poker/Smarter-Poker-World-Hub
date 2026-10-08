-- TIER: 3; AUTHOR: Codex; AFFECTS: original horse preparation and seat plan constraint.
-- WHY: A genuinely interrupted tournament leaves expired waiting horse seats.
-- Original preparation raises invalid_arguments opening an expired session;
-- original deadline resolver then fails its horse plan constraint for no_show.
-- HOW: Refuse preparation after the real round deadline; permit original no_show
-- without a horse plan, preserving its independent NULL-session constraint.
-- No clock, scoring, entrant, financial, schedule, lease or certificate changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $repair$
DECLARE v_definition text; v_constraint text;
BEGIN
SELECT pg_get_functiondef('public.trivia_tournament_prepare_horse_seat(uuid,smallint)'::regprocedure) INTO v_definition;
IF md5(v_definition)<>'ba05834a24f5af64f8dbce6ddbd3bc39' THEN RAISE EXCEPTION 'prepare horse predecessor changed'; END IF;
SELECT pg_get_constraintdef(oid) INTO v_constraint FROM pg_constraint WHERE conrelid='public.trivia_tournament_seats'::regclass AND conname='trivia_tournament_seats_check3';
IF v_constraint IS DISTINCT FROM 'CHECK (((participant_kind = ''human''::text) OR (status = ''waiting''::text) OR (horse_plan_hash IS NOT NULL)))' THEN RAISE EXCEPTION 'horse plan constraint predecessor changed'; END IF;
IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='trivia_tournament_prepare_horse_seat')<>1 THEN RAISE EXCEPTION 'horse prepare overload changed'; END IF;
IF v_definition NOT LIKE '%IF rd.status <> ''open'' THEN%' THEN RAISE EXCEPTION 'prepare guard predecessor absent'; END IF;
EXECUTE replace(v_definition,'IF rd.status <> ''open'' THEN','IF rd.status <> ''open'' OR rd.deadline_at <= public.trivia_tournament_clock() THEN');
ALTER TABLE public.trivia_tournament_seats DROP CONSTRAINT trivia_tournament_seats_check3;
ALTER TABLE public.trivia_tournament_seats ADD CONSTRAINT trivia_tournament_seats_check3 CHECK(participant_kind='human' OR status IN('waiting','no_show') OR horse_plan_hash IS NOT NULL);
IF pg_get_functiondef('public.trivia_tournament_prepare_horse_seat(uuid,smallint)'::regprocedure) NOT LIKE '%IF rd.status <> ''open'' OR rd.deadline_at <= public.trivia_tournament_clock() THEN%' THEN RAISE EXCEPTION 'deadline guard absent'; END IF;
IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.trivia_tournament_seats'::regclass AND conname='trivia_tournament_seats_check2' AND pg_get_constraintdef(oid)='CHECK (((status <> ''no_show''::text) OR (session_id IS NULL)))') THEN RAISE EXCEPTION 'no-show session guard changed'; END IF;
END $repair$;
COMMIT;
-- ROLLBACK: install as a NEW forward migration, never replay prior history.
-- Refuses if genuine no-show horses already require the corrected contract.
-- Do not alter their outcomes or fabricate a plan merely to force rollback.
-- BEGIN;
-- SET LOCAL lock_timeout='5s';
-- SET LOCAL statement_timeout='30s';
-- DO $rollback$
-- DECLARE v_definition text;
-- BEGIN
-- IF EXISTS(SELECT 1 FROM public.trivia_tournament_seats WHERE participant_kind='horse' AND status='no_show' AND horse_plan_hash IS NULL) THEN RAISE EXCEPTION 'rollback incompatible with retained no-show horse history'; END IF;
-- SELECT pg_get_functiondef('public.trivia_tournament_prepare_horse_seat(uuid,smallint)'::regprocedure) INTO v_definition;
-- IF v_definition NOT LIKE '%IF rd.status <> ''open'' OR rd.deadline_at <= public.trivia_tournament_clock() THEN%' THEN RAISE EXCEPTION 'rollback postimage changed'; END IF;
-- EXECUTE replace(v_definition,'IF rd.status <> ''open'' OR rd.deadline_at <= public.trivia_tournament_clock() THEN','IF rd.status <> ''open'' THEN');
-- IF md5(pg_get_functiondef('public.trivia_tournament_prepare_horse_seat(uuid,smallint)'::regprocedure))<>'ba05834a24f5af64f8dbce6ddbd3bc39' THEN RAISE EXCEPTION 'rollback original function hash mismatch'; END IF;
-- ALTER TABLE public.trivia_tournament_seats DROP CONSTRAINT trivia_tournament_seats_check3;
-- ALTER TABLE public.trivia_tournament_seats ADD CONSTRAINT trivia_tournament_seats_check3 CHECK(participant_kind='human' OR status='waiting' OR horse_plan_hash IS NOT NULL);
-- END $rollback$;
-- COMMIT;
