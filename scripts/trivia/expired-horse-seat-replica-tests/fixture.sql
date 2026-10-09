-- Disposable local database only; never production.
DO $$ BEGIN IF current_database()<>'expired_horse' THEN RAISE EXCEPTION 'expiry fixture requires isolated expired_horse database'; END IF; END $$;
CREATE SCHEMA extensions;
CREATE EXTENSION "uuid-ossp" SCHEMA extensions;
CREATE TABLE trivia_tournaments(id uuid,roster_snapshot_id uuid,format_snapshot jsonb);
CREATE TABLE trivia_tournament_matchups(id uuid,tournament_id uuid,round_number int,status text,winner_entrant_id uuid,loser_entrant_id uuid,decided_reason text,decided_at timestamptz);
CREATE TABLE trivia_tournament_seats(matchup_id uuid,seat_no smallint,tournament_id uuid,round_number int,entrant_id uuid,participant_id uuid,participant_kind text,status text,session_id uuid,result_outcome text,question_total int,answered_count int,correct_count int,tiebreak_ms bigint,completed_at timestamptz,finished_at timestamptz,session_opened_at timestamptz,horse_plan_hash text);
CREATE TABLE trivia_tournament_bracket_rounds(tournament_id uuid,round_number int,status text,deadline_at timestamptz,opens_at timestamptz,shot_clock_seconds int,question_count int);
CREATE TABLE trivia_tournament_entrants(id uuid,participant_id uuid,entry_reference text,entry_fee int,funding_source text,seed_number int,eliminated_round int);
CREATE TABLE trivia_tournament_horse_personas(horse_id uuid,accuracy numeric,median_response_ms int);
CREATE TABLE trivia_tournament_secrets(tournament_id uuid,horse_plan_key bytea);
CREATE TABLE trivia_sessions(id uuid,status text);
CREATE TABLE trivia_session_answers(session_id uuid,outcome text);
CREATE TABLE calls(name text);
CREATE FUNCTION trivia_tournament_clock() RETURNS timestamptz LANGUAGE sql VOLATILE AS $$SELECT clock_timestamp()$$;
CREATE FUNCTION trivia_tournament_ensure_horse_personas() RETURNS int LANGUAGE sql AS $$SELECT 0$$;
-- Explicit boundary stub: exact original open-session deadline refusal contract;
-- all engine prepare/resolver bodies are unchanged source, no fake clock.
CREATE FUNCTION trivia_open_session_v3(uuid,uuid,uuid,int,text,timestamptz,jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN INSERT INTO public.calls VALUES('open'); RETURN jsonb_build_object('success',false,'error','invalid_arguments'); END$$;
CREATE FUNCTION trivia_tournament_engine_begin() RETURNS void LANGUAGE sql AS $$SELECT NULL::void$$;
CREATE FUNCTION trivia_tournament_place_winner(uuid) RETURNS void LANGUAGE sql AS $$INSERT INTO public.calls VALUES('place_winner')$$;
CREATE FUNCTION trivia_tournament_close_round(uuid,int,bigint) RETURNS void LANGUAGE sql AS $$INSERT INTO public.calls VALUES('close_round')$$;
CREATE FUNCTION trivia_tournament_event(uuid,text,jsonb,uuid,int,uuid,bigint) RETURNS void LANGUAGE sql AS $$INSERT INTO public.calls VALUES('event')$$;
CREATE FUNCTION assert_true(boolean,text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF $1 IS NOT TRUE THEN RAISE EXCEPTION 'assert failed: %',$2;END IF;END$$;
INSERT INTO trivia_tournaments VALUES('00000000-0000-0000-0000-000000000001',NULL,'{}');
INSERT INTO trivia_tournament_matchups VALUES('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',5,'ready',NULL,NULL,NULL,NULL);
INSERT INTO trivia_tournament_bracket_rounds VALUES('00000000-0000-0000-0000-000000000001',5,'open',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '2 hours',20,10);
INSERT INTO trivia_tournament_entrants SELECT ('00000000-0000-0000-0000-00000000000'||n)::uuid,('00000000-0000-0000-0000-00000000000'||n)::uuid,'entry-'||n,0,'none',n,NULL FROM generate_series(3,4)n;
INSERT INTO trivia_tournament_seats SELECT '00000000-0000-0000-0000-000000000002',(n-2)::smallint,'00000000-0000-0000-0000-000000000001',5,('00000000-0000-0000-0000-00000000000'||n)::uuid,('00000000-0000-0000-0000-00000000000'||n)::uuid,'horse','waiting',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL FROM generate_series(3,4)n;

ALTER TABLE trivia_tournament_seats ADD CONSTRAINT trivia_tournament_seats_check3 CHECK(participant_kind='human' OR status='waiting' OR horse_plan_hash IS NOT NULL);
ALTER TABLE trivia_tournament_seats ADD CONSTRAINT trivia_tournament_seats_check2 CHECK(status<>'no_show' OR session_id IS NULL);
ALTER TABLE trivia_tournament_seats ADD CONSTRAINT trivia_tournament_seats_check1 CHECK((status IN('finished','no_show'))=((result_outcome IS NOT NULL) AND (finished_at IS NOT NULL)));
