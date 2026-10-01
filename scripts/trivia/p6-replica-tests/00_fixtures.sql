-- Phase 6 replica test kit: fake clock, synthetic fleet/players, synthetic
-- treasury, DR7 armed. Replica only - never run against production.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() !~ '^p6_' THEN RAISE EXCEPTION 'fixtures are for p6_* replica copies only'; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS p6test;
CREATE TABLE IF NOT EXISTS p6test.clock (id boolean PRIMARY KEY DEFAULT true, now timestamptz);
INSERT INTO p6test.clock VALUES (true, NULL) ON CONFLICT DO NOTHING;
-- The ONLY engine change for tests: the clock reads the fake clock when set.
CREATE OR REPLACE FUNCTION public.trivia_tournament_clock()
RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path = '' AS
$$ SELECT COALESCE((SELECT c.now FROM p6test.clock c), pg_catalog.clock_timestamp()) $$;
CREATE OR REPLACE FUNCTION p6test.set_clock(p timestamptz) RETURNS timestamptz LANGUAGE sql AS
$$ UPDATE p6test.clock SET now = p RETURNING now $$;
CREATE OR REPLACE FUNCTION p6test.advance(p interval) RETURNS timestamptz LANGUAGE sql AS
$$ UPDATE p6test.clock SET now = COALESCE(now, clock_timestamp()) + p RETURNING now $$;
CREATE OR REPLACE FUNCTION p6test.assert(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT FAILED: %', p_msg; END IF; END $$;

-- A profile trigger auto-friends one fixed platform account that a schema-only
-- replica does not have; disable just that social trigger on this test copy.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass
              AND tgfoid = 'public.auto_connect_to_dan_bekavac()'::regprocedure LOOP
    EXECUTE format('ALTER TABLE public.profiles DISABLE TRIGGER %I', r.tgname);
  END LOOP;
END $$;
-- 1,000 synthetic horses (same shape as production: profile + auth row) and 400 humans.
INSERT INTO auth.users (id, email, aud, role)
SELECT extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000006'::uuid, 'horse-' || g), 'p6horse' || g || '@example.com', 'authenticated', 'authenticated'
  FROM generate_series(1, 1000) g ON CONFLICT DO NOTHING;
INSERT INTO auth.users (id, email, aud, role)
SELECT extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000006'::uuid, 'human-' || g), 'p6human' || g || '@example.com', 'authenticated', 'authenticated'
  FROM generate_series(1, 400) g ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, username, display_name, is_horse, horse_status, diamonds, skill_tier)
SELECT extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000006'::uuid, 'horse-' || g), 'horse_' || g, 'Smarter Horse ' || g,
       true, 'available', 5000, 'Newcomer'
  FROM generate_series(1, 1000) g ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, username, display_name, is_horse, diamonds)
SELECT extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000006'::uuid, 'human-' || g), 'human_' || g, 'Player ' || g,
       false, 1000
  FROM generate_series(1, 400) g ON CONFLICT (id) DO NOTHING;
CREATE OR REPLACE FUNCTION p6test.horse(i integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS
$$ SELECT extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000006'::uuid, 'horse-' || i) $$;
CREATE OR REPLACE FUNCTION p6test.human(i integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS
$$ SELECT extensions.uuid_generate_v5('00000000-0000-0000-0000-000000000006'::uuid, 'human-' || i) $$;

-- Synthetic treasury (production stays unfunded until Dan approves funding).
SELECT public.trivia_ledger_set_config('treasury_daily_subsidy_ceiling', 100000000, 'p6 replica tests');
SELECT public.trivia_ledger_set_config('treasury_exposure_ceiling', 100000000, 'p6 replica tests');
SELECT public.trivia_ledger_treasury_fund('p6-replica-treasury-fund-1', 10000000, 'platform_issuance',
       '{"approved_by":"p6 replica test kit","reason":"synthetic replica treasury for Phase 6 tests","evidence":"replica-only database p6_*"}'::jsonb);

-- DR7 armed exactly like production: solo Trivia capped at 2,000/day, tournaments uncapped.
INSERT INTO public.diamond_engine_daily_caps (engine, max_per_user_per_day, max_per_user_per_day_vip, note, updated_at)
VALUES ('trivia', 2000, 2000, 'replica mirror', now()), ('trivia_tournaments', NULL, NULL, 'replica mirror', now())
ON CONFLICT (engine) DO UPDATE SET max_per_user_per_day = EXCLUDED.max_per_user_per_day,
                                   max_per_user_per_day_vip = EXCLUDED.max_per_user_per_day_vip;
INSERT INTO public.ca_diamond_rule_modes (rule, mode, flip_after, clean_days_required, updated_at)
VALUES ('DR7:user_over_daily_cap', 'refuse', now() - interval '1 day', 0, now())
ON CONFLICT (rule) DO UPDATE SET mode = 'refuse';

SELECT public.trivia_tournament_ensure_horse_personas() AS personas_created;

-- Scheduler helpers: one owner per call, mirroring the worker.
CREATE OR REPLACE FUNCTION p6test.owner(p_holder text DEFAULT 'p6-test-owner') RETURNS jsonb LANGUAGE sql AS
$$ SELECT public.trivia_tournament_scheduler_acquire(p_holder, 300) $$;
CREATE OR REPLACE FUNCTION p6test.tick(p_horses boolean DEFAULT true, p_steps integer DEFAULT 2000, p_holder text DEFAULT 'p6-test-owner') RETURNS jsonb LANGUAGE plpgsql AS
$$ DECLARE o jsonb; r jsonb; BEGIN
     o := p6test.owner(p_holder);
     IF NOT (o->>'owner')::boolean THEN RETURN jsonb_build_object('standby', true); END IF;
     r := public.trivia_tournament_scheduler_tick((o->>'run_id')::uuid, (o->>'fencing_token')::bigint, p_horses, p_steps);
     RETURN r;
   END $$;

-- Human input simulator: every live human seat (optionally skipping some) opens,
-- answers every question (random display index) and auto-finishes.
CREATE OR REPLACE FUNCTION p6test.play_humans(p_tournament uuid, p_skip_mod integer DEFAULT 0) RETURNS integer LANGUAGE plpgsql AS
$$ DECLARE s record; q record; n integer := 0; r jsonb; BEGIN
   FOR s IN SELECT st.* FROM public.trivia_tournament_seats st
             JOIN public.trivia_tournament_matchups m ON m.id = st.matchup_id
             JOIN public.trivia_tournament_bracket_rounds rd ON rd.tournament_id = st.tournament_id AND rd.round_number = st.round_number
            WHERE st.tournament_id = p_tournament AND st.participant_kind = 'human' AND st.status IN ('waiting', 'playing')
              AND m.status = 'ready' AND rd.status = 'open' AND rd.opens_at <= public.trivia_tournament_clock()
   LOOP
     IF p_skip_mod > 0 AND (abs(hashtext(s.entrant_id::text)) % p_skip_mod) = 0 THEN CONTINUE; END IF;
     r := public.trivia_tournament_play_open(p_tournament, s.participant_id);
     IF COALESCE((r->>'success')::boolean, false) IS NOT TRUE THEN CONTINUE; END IF;
     FOR q IN SELECT a.position, a.question_id FROM public.trivia_session_answers a
               JOIN public.trivia_tournament_seats st2 ON st2.session_id = a.session_id
              WHERE st2.matchup_id = s.matchup_id AND st2.seat_no = s.seat_no AND a.outcome IS NULL ORDER BY a.position LOOP
       PERFORM public.trivia_tournament_play_question(p_tournament, s.participant_id, q.position);
       PERFORM public.trivia_tournament_play_answer(p_tournament, s.participant_id, q.question_id,
           (abs(hashtext(s.participant_id::text || q.question_id::text)) % 4), gen_random_uuid());
     END LOOP;
     n := n + 1;
   END LOOP;
   RETURN n;
 END $$;

-- Disconnect simulator: answer only the next k questions of each live human seat (no finish).
CREATE OR REPLACE FUNCTION p6test.play_partial(p_tournament uuid, p_k integer, p_skip_mod integer DEFAULT 0) RETURNS integer LANGUAGE plpgsql AS
$$ DECLARE s record; q record; n integer := 0; r jsonb; BEGIN
   FOR s IN SELECT st.* FROM public.trivia_tournament_seats st
             JOIN public.trivia_tournament_matchups m ON m.id = st.matchup_id
             JOIN public.trivia_tournament_bracket_rounds rd ON rd.tournament_id = st.tournament_id AND rd.round_number = st.round_number
            WHERE st.tournament_id = p_tournament AND st.participant_kind = 'human' AND st.status IN ('waiting', 'playing')
              AND m.status = 'ready' AND rd.status = 'open' AND rd.opens_at <= public.trivia_tournament_clock()
   LOOP
     IF p_skip_mod > 0 AND (abs(hashtext(s.entrant_id::text)) % p_skip_mod) = 0 THEN CONTINUE; END IF;
     r := public.trivia_tournament_play_open(p_tournament, s.participant_id);
     IF COALESCE((r->>'success')::boolean, false) IS NOT TRUE THEN CONTINUE; END IF;
     FOR q IN SELECT a.position, a.question_id FROM public.trivia_session_answers a
               JOIN public.trivia_tournament_seats st2 ON st2.session_id = a.session_id
              WHERE st2.matchup_id = s.matchup_id AND st2.seat_no = s.seat_no AND a.outcome IS NULL ORDER BY a.position LIMIT p_k LOOP
       PERFORM public.trivia_tournament_play_question(p_tournament, s.participant_id, q.position);
       PERFORM public.trivia_tournament_play_answer(p_tournament, s.participant_id, q.question_id,
           (abs(hashtext(s.participant_id::text || q.question_id::text)) % 4), gen_random_uuid());
     END LOOP;
     n := n + 1;
   END LOOP;
   RETURN n;
 END $$;

-- Skill simulator: one human answers every question right (or wrong) via the server's own key.
CREATE OR REPLACE FUNCTION p6test.play_scripted(p_tournament uuid, p_user uuid, p_right boolean) RETURNS integer LANGUAGE plpgsql AS
$$ DECLARE r jsonb; q record; v_sess uuid; v_correct integer; v_display integer; n integer := 0; BEGIN
   r := public.trivia_tournament_play_open(p_tournament, p_user);
   IF COALESCE((r->>'success')::boolean, false) IS NOT TRUE THEN RETURN 0; END IF;
   SELECT session_id INTO v_sess FROM public.trivia_tournament_seats WHERE tournament_id = p_tournament AND participant_id = p_user
    ORDER BY round_number DESC LIMIT 1;
   FOR q IN SELECT a.position, a.question_id FROM public.trivia_session_answers a WHERE a.session_id = v_sess AND a.outcome IS NULL ORDER BY a.position LOOP
     SELECT rv.correct_index INTO v_correct FROM public.trivia_sessions ss
       JOIN public.trivia_roster_snapshot_items i ON i.snapshot_id = (SELECT roster_snapshot_id FROM public.trivia_tournaments WHERE id = p_tournament)
            AND i.question_id = q.question_id
       JOIN public.trivia_question_revisions rv ON rv.id = i.revision_id
      WHERE ss.id = v_sess LIMIT 1;
     SELECT (e.ord - 1)::integer INTO v_display FROM public.trivia_sessions ss,
            jsonb_array_elements_text(ss.permutations -> q.question_id::text) WITH ORDINALITY e(v, ord)
      WHERE ss.id = v_sess AND e.v::integer = v_correct;
     IF NOT p_right THEN v_display := (v_display + 1) % 4; END IF;
     PERFORM public.trivia_tournament_play_question(p_tournament, p_user, q.position);
     PERFORM public.trivia_tournament_play_answer(p_tournament, p_user, q.question_id, v_display, gen_random_uuid());
     n := n + 1;
   END LOOP;
   RETURN n;
 END $$;
