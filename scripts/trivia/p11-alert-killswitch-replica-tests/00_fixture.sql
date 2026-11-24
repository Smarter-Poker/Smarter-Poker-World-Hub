\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;

CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), '')
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  role text,
  is_horse boolean NOT NULL DEFAULT false,
  email text
);

CREATE TABLE public.trivia_questions (
  id uuid PRIMARY KEY,
  category text NOT NULL,
  difficulty text NOT NULL,
  correct_answer text
);

CREATE TABLE public.trivia_question_quarantine (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.trivia_questions(id),
  reason_code text NOT NULL,
  source text NOT NULL,
  actor text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  released_at timestamptz
);

CREATE TABLE public.trivia_question_reports (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.trivia_questions(id),
  resolved_at timestamptz
);

CREATE TABLE public.trivia_pvp_engine_config (
  id integer PRIMARY KEY,
  joins_enabled boolean NOT NULL DEFAULT true,
  horses_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.trivia_pvp_engine_config (id, joins_enabled, horses_enabled) VALUES (1, true, true);

CREATE TABLE public.trivia_pvp_queue (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL
);

CREATE TABLE public.trivia_pvp_matches (
  id uuid PRIMARY KEY,
  player1_id uuid NOT NULL,
  player2_id uuid,
  status text NOT NULL,
  match_kind text NOT NULL,
  stake_amount integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline_at timestamptz,
  completed_at timestamptz
);

CREATE TABLE public.trivia_tournaments (
  id uuid PRIMARY KEY,
  engine_version text,
  schedule_kind text NOT NULL DEFAULT 'public_nightly',
  scheduled_local_date date,
  lifecycle_state text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  registration_closes_at timestamptz NOT NULL,
  horse_target integer,
  horse_population_mode text,
  terminal_reason text,
  final_resolved_at timestamptz,
  format_snapshot jsonb NOT NULL DEFAULT '{"population_final_before_seconds":120,"settlement_sla_seconds":60}'::jsonb
);

CREATE TABLE public.trivia_tournament_entrants (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id),
  participant_id uuid NOT NULL,
  participant_kind text NOT NULL,
  entry_state text NOT NULL DEFAULT 'entered'
);

CREATE TABLE public.trivia_tournament_bracket_rounds (
  tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id),
  round_number integer NOT NULL,
  status text NOT NULL,
  deadline_at timestamptz NOT NULL,
  resolved_count integer NOT NULL DEFAULT 0,
  matchup_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (tournament_id, round_number)
);

CREATE TABLE public.trivia_tournament_matchups (
  id uuid PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id),
  round_number integer NOT NULL,
  status text NOT NULL
);

CREATE TABLE public.trivia_tournament_scheduler_runs (
  run_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  outcome text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz
);

CREATE TABLE public.trivia_ledger_accounts (
  account_code text PRIMARY KEY,
  balance bigint NOT NULL DEFAULT 0
);

CREATE TABLE public.trivia_settlements (
  id uuid PRIMARY KEY,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  escrow_account_code text NOT NULL REFERENCES public.trivia_ledger_accounts(account_code),
  state text NOT NULL,
  outcome text
);

CREATE TABLE public.trivia_settlement_participants (
  settlement_id uuid NOT NULL REFERENCES public.trivia_settlements(id),
  user_id uuid NOT NULL,
  PRIMARY KEY (settlement_id, user_id)
);

-- Controllable test harness state for authoritative delegate RPCs
CREATE TABLE public.p11_drill_state (
  id integer PRIMARY KEY DEFAULT 1,
  eligible_pool integer NOT NULL DEFAULT 15000,
  scheduler_busy boolean NOT NULL DEFAULT false,
  pvp_recover_standby boolean NOT NULL DEFAULT false
);
INSERT INTO public.p11_drill_state (id) VALUES (1);

CREATE FUNCTION public.trivia_question_health_v1(p_record boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'healthy', (SELECT eligible_pool >= 256 FROM public.p11_drill_state WHERE id = 1),
    'metrics', jsonb_build_object('eligible_pool', (SELECT eligible_pool FROM public.p11_drill_state WHERE id = 1))
  )
$$;

CREATE FUNCTION public.trivia_quarantine_question_v1(p_qid uuid, p_reason text, p_source text, p_actor text, p_detail jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.trivia_question_quarantine (question_id, reason_code, source, actor, detail)
  VALUES (p_qid, p_reason, p_source, p_actor, COALESCE(p_detail, '{}'::jsonb));
  RETURN jsonb_build_object('success', true, 'questionId', p_qid, 'reasonCode', p_reason);
END $$;

CREATE FUNCTION public.trivia_release_question_quarantine_v1(p_qid uuid, p_actor text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.trivia_question_quarantine SET released_at = clock_timestamp()
   WHERE question_id = p_qid AND released_at IS NULL;
  RETURN jsonb_build_object('success', true, 'questionId', p_qid, 'released', true);
END $$;

CREATE FUNCTION public.trivia_pvp_recover_v2(p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_standby boolean;
BEGIN
  SELECT pvp_recover_standby INTO v_standby FROM public.p11_drill_state WHERE id = 1;
  IF v_standby THEN
    RETURN jsonb_build_object('owner', false, 'outcome', 'standby', 'limit', p_limit);
  END IF;
  RETURN jsonb_build_object('success', true, 'owner', true, 'outcome', 'owner', 'limit', p_limit);
END $$;

CREATE FUNCTION public.trivia_tournament_operator_cancel(p_tid uuid, p_reason text, p_actor text)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.trivia_tournaments SET lifecycle_state = 'cancelled', terminal_reason = 'operator_cancelled'
   WHERE id = p_tid;
  RETURN jsonb_build_object('success', true, 'tournamentId', p_tid, 'cancelled', true);
END $$;

CREATE FUNCTION public.trivia_tournament_scheduler_acquire(p_holder text, p_lease_seconds integer DEFAULT 60)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_busy boolean;
BEGIN
  SELECT scheduler_busy INTO v_busy FROM public.p11_drill_state WHERE id = 1;
  IF v_busy THEN
    RETURN jsonb_build_object('owner', false, 'lease_expires_at', clock_timestamp() + interval '30 seconds');
  END IF;
  RETURN jsonb_build_object('owner', true, 'run_id', extensions.gen_random_uuid(), 'fencing_token', 77);
END $$;

CREATE FUNCTION public.trivia_tournament_settle(p_tid uuid, p_fence bigint)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.trivia_tournaments SET lifecycle_state = 'settled' WHERE id = p_tid;
  RETURN jsonb_build_object('success', true, 'tournamentId', p_tid, 'fencingToken', p_fence);
END $$;

CREATE FUNCTION public.trivia_tournament_scheduler_release(p_run_id uuid, p_fence bigint)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('released', true, 'run_id', p_run_id, 'fencing_token', p_fence)
$$;

-- Seed 3 actors: supervisor (superadmin), observer (admin), and non-operator user
INSERT INTO public.profiles (id, role, is_horse, email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'superadmin', false, 'supervisor@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'admin', false, 'observer@example.com'),
  ('33333333-3333-4333-8333-333333333333', 'player', false, 'player@example.com');

INSERT INTO public.trivia_questions (id, category, difficulty, correct_answer) VALUES
  ('44444444-4444-4444-8444-444444444444', 'poker_rules', 'medium', 'SECRET_ANSWER_NEVER_EXPOSE');
