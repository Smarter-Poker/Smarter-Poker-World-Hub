#!/usr/bin/env node

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260907010000_training_server_authoritative_completion.sql',
);
const AWARD_MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260907005900_award_diamonds_v2_serialized_family_caps.sql',
);
const MEMORY_AUTHORITY_MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260907010200_memory_practice_authority_lockdown.sql',
);
const SESSION_EVIDENCE_MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260907010400_training_session_evidence_projection_followup.sql',
);

function command(binary, args, { input, quiet = false } = {}) {
  const result = spawnSync(binary, args, {
    cwd: ROOT,
    encoding: 'utf8',
    input,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error([
      `${path.basename(binary)} ${args.join(' ')} failed with status ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  if (!quiet && result.stdout?.trim()) process.stdout.write(result.stdout);
  return result;
}

function resolvePostgresBin() {
  const candidates = [
    process.env.PHASE6_POSTGRES_BIN,
    '/opt/homebrew/opt/postgresql@17/bin',
    '/usr/local/opt/postgresql@17/bin',
    '/usr/local/pgsql/bin',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'postgres'))) return candidate;
  }
  const resolved = spawnSync('sh', ['-c', 'command -v postgres'], { encoding: 'utf8' });
  if (resolved.status === 0 && resolved.stdout.trim()) return path.dirname(resolved.stdout.trim());
  throw new Error(
    'PostgreSQL 17+ binaries are required. Set PHASE6_POSTGRES_BIN to the directory containing postgres, initdb, and pg_ctl.',
  );
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (!port) throw new Error('Could not reserve a disposable PostgreSQL port.');
  return port;
}

const BASELINE_SQL = String.raw`
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE TABLE public.training_question_cache (
  id text PRIMARY KEY, game_id text NOT NULL, level integer NOT NULL,
  question_data jsonb NOT NULL
);
ALTER TABLE public.training_question_cache ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.training_question_cache TO PUBLIC, anon, authenticated;
CREATE POLICY phase6_legacy_training_cache_read ON public.training_question_cache
  FOR SELECT TO PUBLIC USING (true);
CREATE TABLE public.training_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_text text, hero_hand text, hero_position text, board_cards jsonb,
  street text, correct_answer text, options jsonb, gto_action text,
  gto_explanation text, action_breakdown jsonb, gto_frequencies jsonb,
  difficulty integer, game_type text, stack_depth integer
);
ALTER TABLE public.training_questions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.training_questions TO PUBLIC, anon, authenticated;
CREATE POLICY phase6_legacy_training_questions_read ON public.training_questions
  FOR SELECT TO PUBLIC USING (true);
CREATE TABLE public.user_seen_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id text NOT NULL, question_id text NOT NULL, seen_at timestamptz DEFAULT now(),
  UNIQUE (user_id, game_id, question_id)
);
CREATE TABLE public.training_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id text NOT NULL, question_id text NOT NULL, answer_id text NOT NULL,
  is_correct boolean NOT NULL, level integer NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  hero_position text, villain_position text, street text, classification text,
  ev_loss numeric DEFAULT 0, spot_type text, submission_id text,
  solver_verified boolean NOT NULL DEFAULT false, solver_source text,
  selected_frequency numeric(6,2), optimal_frequency numeric(6,2),
  ev_loss_measured boolean NOT NULL DEFAULT false,
  evidence_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, submission_id)
);
CREATE TABLE public.training_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak integer DEFAULT 0, longest_streak integer DEFAULT 0,
  last_training_date date, streak_start_date date,
  milestones_claimed jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.training_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, game_id text NOT NULL,
  level integer NOT NULL DEFAULT 1,
  hands_played integer DEFAULT 0, correct_answers integer DEFAULT 0,
  total_answers integer DEFAULT 0, current_streak integer DEFAULT 0,
  best_streak integer DEFAULT 0, last_played_at timestamptz,
  UNIQUE (user_id, game_id)
);
CREATE TABLE public.training_level_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, game_id text NOT NULL,
  level integer NOT NULL, questions_answered integer NOT NULL,
  questions_correct integer NOT NULL, accuracy_percentage integer NOT NULL,
  passed boolean NOT NULL, time_spent_seconds integer,
  best_streak integer DEFAULT 0, diamonds_earned integer DEFAULT 0,
  completed_at timestamptz DEFAULT now()
);
CREATE TABLE public.training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, game_id text NOT NULL,
  game_name text, gtow_score numeric, score_scale smallint DEFAULT 2,
  total_ev_loss numeric DEFAULT 0, hands_played integer DEFAULT 0,
  mistake_count integer DEFAULT 0, accuracy numeric DEFAULT 0,
  correct_count integer DEFAULT 0, best_streak integer DEFAULT 0,
  level_passed boolean DEFAULT false, level integer DEFAULT 1,
  hand_history jsonb DEFAULT '[]'::jsonb, position_stats jsonb DEFAULT '{}'::jsonb,
  classification_counts jsonb DEFAULT '{}'::jsonb,
  trainer_config jsonb DEFAULT '{}'::jsonb,
  avg_ev_loss_per_hand numeric DEFAULT 0,
  avg_ev_loss_per_mistake numeric DEFAULT 0,
  avg_frequency_diff numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.training_leaderboard (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type text NOT NULL,
  period_key text NOT NULL,
  total_questions integer DEFAULT 0,
  correct_answers integer DEFAULT 0,
  perfect_rounds integer DEFAULT 0,
  best_streak integer DEFAULT 0,
  gtow_score_avg numeric,
  total_ev_loss numeric,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, period_type, period_key)
);
ALTER TABLE public.training_leaderboard ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.training_leaderboard TO authenticated;
CREATE POLICY phase6_legacy_leaderboard_select ON public.training_leaderboard
  FOR SELECT TO authenticated USING (true);
CREATE POLICY phase6_legacy_leaderboard_insert ON public.training_leaderboard
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY phase6_legacy_leaderboard_update ON public.training_leaderboard
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.training_hand_replay (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text, question_id uuid REFERENCES public.training_questions(id),
  game_id text, hero_position text, hero_hand text, board_cards jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb, user_action text,
  solver_action text, ev_loss_bb numeric(8,3), was_correct boolean,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.training_hand_replay ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_hand_replay TO authenticated;
CREATE POLICY phase6_legacy_replay_read ON public.training_hand_replay
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY phase6_legacy_replay_insert ON public.training_hand_replay
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY phase6_legacy_replay_update ON public.training_hand_replay
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY phase6_legacy_replay_delete ON public.training_hand_replay
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.training_daily_challenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_id text NOT NULL,
  score integer DEFAULT 0,
  ev_loss real DEFAULT 0,
  selected_action text,
  completed_at timestamptz DEFAULT now(),
  UNIQUE (user_id, daily_id)
);
ALTER TABLE public.training_daily_challenge ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_daily_challenge TO authenticated;
CREATE POLICY phase6_legacy_daily_all ON public.training_daily_challenge
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.memory_game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_mode text NOT NULL,
  level integer NOT NULL,
  score integer,
  accuracy numeric,
  time_taken integer,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.memory_game_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memory_game_sessions TO authenticated;
CREATE POLICY phase6_legacy_memory_sessions_all ON public.memory_game_sessions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.memory_leaderboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_mode text NOT NULL,
  level integer NOT NULL,
  score integer,
  accuracy numeric,
  time_taken integer,
  perfect_game boolean NOT NULL DEFAULT false,
  session_id uuid REFERENCES public.memory_game_sessions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.memory_leaderboards ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memory_leaderboards TO anon, authenticated;
CREATE POLICY memory_leaderboards_read ON public.memory_leaderboards
  FOR SELECT USING (true);
CREATE POLICY memory_leaderboards_write ON public.memory_leaderboards
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE FUNCTION public.fn_memory_promote_session_to_leaderboard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.memory_leaderboards(
    user_id, game_mode, level, score, accuracy, time_taken, perfect_game, session_id
  ) VALUES (
    NEW.user_id, NEW.game_mode, NEW.level, NEW.score, NEW.accuracy,
    NEW.time_taken, coalesce(NEW.accuracy, 0) >= 100, NEW.id
  );
  RETURN NEW;
END $$;
CREATE TRIGGER trg_memory_promote_session
  AFTER INSERT ON public.memory_game_sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_memory_promote_session_to_leaderboard();

DO $legacy_tables$
DECLARE
  truth_table text;
BEGIN
  FOREACH truth_table IN ARRAY ARRAY[
    'training_spaced_repetition', 'jarvis_training_sessions',
    'jarvis_user_training_profile', 'user_question_history',
    'user_level_progress', 'training_user_achievements',
    'training_user_challenges', 'training_tournament_entries',
    'training_daily_bonus'
  ]
  LOOP
    EXECUTE format(
      'CREATE TABLE public.%I (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id))',
      truth_table
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', truth_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', truth_table);
    EXECUTE format(
      'CREATE POLICY phase6_legacy_owner_all ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      truth_table
    );
  END LOOP;
END
$legacy_tables$;

CREATE FUNCTION public.get_random_cached_question(text, integer, text, uuid, text[])
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.get_next_training_question(uuid, integer)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.training_leaderboard_refresh()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END $$;
CREATE FUNCTION public.fn_add_xp(uuid, integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END $$;
CREATE FUNCTION public.unlock_achievement(uuid, text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN NULL; END $$;
CREATE FUNCTION public.claim_reward(uuid, uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{"success":true}'::jsonb $$;
CREATE FUNCTION public.complete_daily_challenge(uuid, text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{"success":true}'::jsonb $$;
GRANT EXECUTE ON FUNCTION public.get_random_cached_question(text, integer, text, uuid, text[])
  TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_training_question(uuid, integer)
  TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.training_leaderboard_refresh()
  TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_add_xp(uuid, integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_achievement(uuid, text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reward(uuid, uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_daily_challenge(uuid, text) TO PUBLIC, anon, authenticated;

CREATE TABLE public.phase6_awards (
  user_id uuid NOT NULL, reference_id text NOT NULL UNIQUE, amount integer NOT NULL
);
CREATE TABLE public.phase6_leaderboard_calls (
  user_id uuid NOT NULL, period_type text NOT NULL, period_key text NOT NULL,
  answered integer NOT NULL, correct integer NOT NULL
);
CREATE FUNCTION public.award_diamonds_v2(
  p_user_id uuid, p_action_key text, p_reference_id text,
  p_target_id text, p_metadata jsonb
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  requested integer := coalesce(
    (p_metadata ->> 'streak_diamonds')::integer,
    (p_metadata ->> 'reward_diamonds')::integer,
    0
  );
  inserted integer := 0;
BEGIN
  IF p_action_key = 'streak_reward' THEN
    requested := least(requested, 1000);
  END IF;
  INSERT INTO public.phase6_awards(user_id, reference_id, amount)
  VALUES (p_user_id, p_reference_id, requested)
  ON CONFLICT (reference_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN jsonb_build_object(
    'success', true,
    'awarded', CASE WHEN inserted = 1 THEN requested ELSE 0 END
  );
END $$;
CREATE FUNCTION public.fn_training_leaderboard_record(
  p_user_id uuid, p_period_type text, p_period_key text,
  p_answered integer, p_correct integer, p_is_perfect boolean,
  p_best_streak integer, p_gtow_score numeric, p_ev_loss numeric
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.phase6_leaderboard_calls(
    user_id, period_type, period_key, answered, correct
  ) VALUES (p_user_id, p_period_type, p_period_key, p_answered, p_correct);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_training_leaderboard_record(
  uuid, text, text, integer, integer, boolean, integer, numeric, numeric
) TO PUBLIC, anon, authenticated;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  diamonds integer NOT NULL DEFAULT 0,
  diamond_balance integer NOT NULL DEFAULT 0,
  diamond_multiplier numeric(6,2) NOT NULL DEFAULT 1.00,
  is_vip boolean NOT NULL DEFAULT false,
  vip_tier text,
  vip_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.diamond_reward_catalog (
  action_key text PRIMARY KEY,
  diamonds integer NOT NULL,
  max_per_day integer,
  counts_toward_daily_cap boolean NOT NULL DEFAULT true,
  lifetime boolean NOT NULL DEFAULT false,
  category text,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.diamond_transactions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  amount integer NOT NULL,
  transaction_type text NOT NULL,
  type text NOT NULL,
  description text,
  balance_after integer,
  reference_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX diamond_transactions_reference_uidx
  ON public.diamond_transactions(reference_id)
  WHERE reference_id IS NOT NULL;
CREATE TABLE public.diamond_platform_budget (
  period text PRIMARY KEY,
  budget_diamonds bigint NOT NULL,
  spent_diamonds bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.diamond_reward_catalog(
  action_key, diamonds, max_per_day, counts_toward_daily_cap,
  lifetime, category, active
) VALUES
  ('training_reward', 0, NULL, false, false, 'training', true),
  ('streak_reward', 0, NULL, false, false, 'training', true);
`;

const BEHAVIOR_SQL = String.raw`
INSERT INTO auth.users(id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
INSERT INTO public.profiles(id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

CREATE FUNCTION public.phase6_seed_attempt(
  p_game text,
  p_nonce text,
  p_correct integer,
  p_kind text DEFAULT 'campaign',
  p_expected integer DEFAULT 20,
  p_parent uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  start_result jsonb;
  attempt uuid;
BEGIN
  start_result := public.fn_start_training_attempt_v2(
    '11111111-1111-4111-8111-111111111111', p_nonce, p_game, 1,
    p_kind, 'grouped', p_expected, repeat('a', 64), p_parent
  );
  IF start_result ->> 'success' <> 'true' THEN
    RAISE EXCEPTION 'start failed: %', start_result;
  END IF;
  attempt := (start_result ->> 'attemptId')::uuid;

  INSERT INTO public.training_question_snapshots(
    snapshot_key, source_question_id, game_id, level, content_digest, question_data
  )
  SELECT
    md5(p_nonce || ':' || i::text) || md5('snapshot:' || p_nonce || ':' || i::text),
    p_nonce || '-q-' || i::text,
    p_game,
    1,
    md5(p_nonce || ':' || i::text) || md5('snapshot:' || p_nonce || ':' || i::text),
    jsonb_build_object('id', p_nonce || '-q-' || i::text)
  FROM generate_series(1, p_expected) i;

  INSERT INTO public.training_attempt_hands(attempt_id, hand_ordinal, snapshot_key)
  SELECT
    attempt,
    i,
    md5(p_nonce || ':' || i::text) || md5('snapshot:' || p_nonce || ':' || i::text)
  FROM generate_series(1, p_expected) i;

  INSERT INTO public.training_answers(
    user_id, game_id, question_id, answer_id, is_correct, level, answered_at,
    hero_position, villain_position, street, classification, ev_loss,
    spot_type, submission_id, solver_verified, solver_source,
    selected_frequency, optimal_frequency, ev_loss_measured, evidence_metadata,
    session_id, attempt_id, hand_ordinal, decision_ordinal, snapshot_key
  )
  SELECT
    '11111111-1111-4111-8111-111111111111', p_game,
    p_nonce || '-q-' || i::text, CASE WHEN i <= p_correct THEN 'check' ELSE 'bet' END,
    i <= p_correct, 1, now() + (i || ' seconds')::interval,
    'BTN', 'BB', 'flop', CASE WHEN i <= p_correct THEN 'best' ELSE 'wrong' END,
    CASE WHEN i <= p_correct THEN 0 ELSE 1 END, 'single-raised-pot',
    p_nonce || '-submission-' || i::text, true, 'phase6-fixture',
    CASE WHEN i <= p_correct THEN 75 ELSE 25 END, 75, true,
    jsonb_build_object('difficultyMode', 'grouped'),
    p_nonce, attempt, i, 1,
    md5(p_nonce || ':' || i::text) || md5('snapshot:' || p_nonce || ':' || i::text)
  FROM generate_series(1, p_expected) i;

  RETURN attempt;
END $$;

DO $$
DECLARE
  attempt_one uuid;
  attempt_two uuid;
  replay_attempt uuid;
  expired_attempt uuid;
  first_start jsonb;
  conflict_start jsonb;
  expired_start jsonb;
  replay_start jsonb;
  completion jsonb;
  replay_completion jsonb;
  session_result jsonb;
  streak_before_replay jsonb;
  immutable_failed boolean := false;
  sequence_failed boolean := false;
  owner_failed boolean := false;
  snapshot_two text;
  dashboard_avg numeric;
  dashboard_sessions bigint;
  last_accuracy numeric;
  lifetime_diamonds bigint;
BEGIN
  attempt_one := public.phase6_seed_attempt('cash-001', 'phase6-run-one', 17);

  first_start := public.fn_start_training_attempt_v2(
    '11111111-1111-4111-8111-111111111111', 'phase6-run-one', 'cash-001', 1,
    'campaign', 'grouped', 20, repeat('a', 64), NULL
  );
  IF first_start ->> 'newAttempt' <> 'false'
     OR (first_start ->> 'attemptId')::uuid <> attempt_one THEN
    RAISE EXCEPTION 'start RPC is not nonce-idempotent: %', first_start;
  END IF;

  conflict_start := public.fn_start_training_attempt_v2(
    '11111111-1111-4111-8111-111111111111', 'phase6-run-one', 'cash-001', 1,
    'campaign', 'grouped', 20, repeat('b', 64), NULL
  );
  IF conflict_start ->> 'success' <> 'false'
     OR conflict_start ->> 'code' <> 'TRAINING_ATTEMPT_NONCE_CONFLICT' THEN
    RAISE EXCEPTION 'changed config reused an existing nonce: %', conflict_start;
  END IF;

  expired_start := public.fn_start_training_attempt_v2(
    '11111111-1111-4111-8111-111111111111', 'phase6-expired', 'cash-001', 1,
    'campaign', 'grouped', 20, repeat('a', 64), NULL
  );
  expired_attempt := (expired_start ->> 'attemptId')::uuid;
  UPDATE public.training_attempts
  SET started_at = now() - interval '2 hours',
      expires_at = now() - interval '1 hour'
  WHERE id = expired_attempt;
  expired_start := public.fn_start_training_attempt_v2(
    '11111111-1111-4111-8111-111111111111', 'phase6-expired', 'cash-001', 1,
    'campaign', 'grouped', 20, repeat('a', 64), NULL
  );
  IF expired_start ->> 'success' <> 'false'
     OR expired_start ->> 'code' <> 'TRAINING_ATTEMPT_EXPIRED'
     OR (SELECT status FROM public.training_attempts WHERE id = expired_attempt) <> 'expired' THEN
    RAISE EXCEPTION 'overdue attempt was not atomically expired: %', expired_start;
  END IF;
  expired_start := public.fn_start_training_attempt_v2(
    '11111111-1111-4111-8111-111111111111', 'phase6-expired', 'cash-001', 1,
    'campaign', 'grouped', 20, repeat('a', 64), NULL
  );
  IF expired_start ->> 'code' <> 'TRAINING_ATTEMPT_EXPIRED' THEN
    RAISE EXCEPTION 'expired attempt did not remain terminal: %', expired_start;
  END IF;

  snapshot_two := md5('phase6-turn') || md5('phase6-turn-snapshot');
  INSERT INTO public.training_question_snapshots(
    snapshot_key, source_question_id, game_id, level, content_digest, question_data
  ) VALUES (
    snapshot_two, 'phase6-turn-q', 'cash-001', 1, snapshot_two,
    jsonb_build_object('id', 'phase6-turn-q')
  );
  INSERT INTO public.training_answers(
    user_id, game_id, question_id, answer_id, is_correct, level,
    hero_position, villain_position, street, classification, ev_loss,
    spot_type, submission_id, solver_verified, selected_frequency,
    optimal_frequency, ev_loss_measured, evidence_metadata,
    session_id, attempt_id, hand_ordinal, decision_ordinal, snapshot_key
  ) VALUES (
    '11111111-1111-4111-8111-111111111111', 'cash-001', 'phase6-turn-q',
    'bet', false, 1, 'BTN', 'BB', 'turn', 'wrong-turn', 2,
    'single-raised-pot', 'phase6-turn-submission', true, 75, 75, true,
    jsonb_build_object('difficultyMode', 'grouped'),
    'phase6-run-one', attempt_one, 1, 2, snapshot_two
  );

  BEGIN
    INSERT INTO public.training_answers(
      user_id, game_id, question_id, answer_id, is_correct, level,
      submission_id, evidence_metadata, session_id, attempt_id,
      hand_ordinal, decision_ordinal, snapshot_key
    ) VALUES (
      '11111111-1111-4111-8111-111111111111', 'cash-001', 'phase6-turn-q',
      'check', true, 1, 'phase6-gap-submission',
      jsonb_build_object('difficultyMode', 'grouped'),
      'phase6-run-one', attempt_one, 2, 3, snapshot_two
    );
  EXCEPTION WHEN check_violation THEN
    sequence_failed := true;
  END;
  IF NOT sequence_failed THEN RAISE EXCEPTION 'decision sequence gap was accepted'; END IF;

  BEGIN
    INSERT INTO public.training_answers(
      user_id, game_id, question_id, answer_id, is_correct, level,
      submission_id, evidence_metadata, session_id, attempt_id,
      hand_ordinal, decision_ordinal, snapshot_key
    ) VALUES (
      '22222222-2222-4222-8222-222222222222', 'cash-001', 'phase6-turn-q',
      'check', true, 1, 'phase6-owner-submission',
      jsonb_build_object('difficultyMode', 'grouped'),
      'phase6-run-one', attempt_one, 2, 2, snapshot_two
    );
  EXCEPTION WHEN check_violation THEN
    owner_failed := true;
  END;
  IF NOT owner_failed THEN RAISE EXCEPTION 'cross-user answer was accepted'; END IF;

  completion := public.fn_complete_training_attempt_v2(
    '11111111-1111-4111-8111-111111111111', attempt_one
  );
  IF completion ->> 'success' <> 'true'
     OR completion ->> 'newCompletion' <> 'true'
     OR (completion ->> 'answered')::integer <> 20
     OR (completion ->> 'correct')::integer <> 17
     OR (completion ->> 'accuracy')::integer <> 85
     OR completion ->> 'passed' <> 'true'
     OR (completion ->> 'diamondsEarned')::integer <> 10
     OR (completion #>> '{trainingStreak,current_streak}')::integer <> 1 THEN
    RAISE EXCEPTION 'authoritative completion result is wrong: %', completion;
  END IF;
  IF (SELECT count(*) FROM public.training_level_history WHERE attempt_id = attempt_one) <> 1
     OR (SELECT count(*) FROM public.diamond_transactions WHERE reference_id = 'training_attempt:' || attempt_one) <> 1
     OR (SELECT count(*) FROM public.training_verified_leaderboard
         WHERE user_id = '11111111-1111-4111-8111-111111111111') <> 12
     OR (SELECT hands_played FROM public.training_progress WHERE user_id = '11111111-1111-4111-8111-111111111111' AND game_id = 'cash-001') <> 20 THEN
    RAISE EXCEPTION 'completion side effects are incomplete';
  END IF;

  completion := public.fn_complete_training_attempt_v2(
    '11111111-1111-4111-8111-111111111111', attempt_one
  );
  IF completion ->> 'newCompletion' <> 'false'
     OR (SELECT count(*) FROM public.training_level_history WHERE attempt_id = attempt_one) <> 1
     OR (SELECT count(*) FROM public.diamond_transactions WHERE reference_id = 'training_attempt:' || attempt_one) <> 1
     OR (SELECT count(*) FROM public.training_verified_leaderboard
         WHERE user_id = '11111111-1111-4111-8111-111111111111') <> 12
     OR (SELECT hands_played FROM public.training_progress WHERE user_id = '11111111-1111-4111-8111-111111111111' AND game_id = 'cash-001') <> 20 THEN
    RAISE EXCEPTION 'completion replay duplicated a side effect: %', completion;
  END IF;

  first_start := public.fn_start_training_attempt_v2(
    '11111111-1111-4111-8111-111111111111', 'phase6-run-one', 'cash-001', 1,
    'campaign', 'grouped', 20, repeat('a', 64), NULL
  );
  IF first_start ->> 'success' <> 'false'
     OR first_start ->> 'code' <> 'TRAINING_ATTEMPT_NOT_OPEN' THEN
    RAISE EXCEPTION 'completed attempt was incorrectly resumed: %', first_start;
  END IF;

  session_result := public.fn_save_training_session_v2(
    '11111111-1111-4111-8111-111111111111', attempt_one
  );
  IF session_result ->> 'newSession' <> 'true'
     OR jsonb_array_length(session_result #> '{session,hand_history}') <> 21
     OR (session_result #>> '{session,hand_history,1,decisionOrdinal}')::integer <> 2
     OR (session_result #>> '{session,hand_history,1,evLossMeasured}')::boolean IS NOT TRUE
     OR (session_result #>> '{session,mistake_count}')::integer <> 4
     OR (session_result #>> '{session,total_ev_loss}')::numeric <> 5
     OR (session_result #>> '{session,trainer_config,decisionCount}')::integer <> 21
     OR (session_result #>> '{session,trainer_config,continuationDecisionCount}')::integer <> 1 THEN
    RAISE EXCEPTION 'analytics session was not derived correctly: %', session_result;
  END IF;

  PERFORM set_config(
    'request.jwt.claim.sub',
    '11111111-1111-4111-8111-111111111111',
    false
  );
  SELECT avg_score, sessions_count
  INTO dashboard_avg, dashboard_sessions
  FROM public.training_dashboard_30day_stats(
    '11111111-1111-4111-8111-111111111111', 'cash-001'
  );
  SELECT accuracy
  INTO last_accuracy
  FROM public.training_dashboard_last_session(
    '11111111-1111-4111-8111-111111111111', 'cash-001'
  );
  SELECT total_diamonds_est
  INTO lifetime_diamonds
  FROM public.training_dashboard_lifetime_stats(
    '11111111-1111-4111-8111-111111111111', 'cash-001'
  );
  IF dashboard_avg <> 85
     OR dashboard_sessions <> 1
     OR last_accuracy <> 85
     OR lifetime_diamonds <> 10 THEN
    RAISE EXCEPTION 'setup dashboard evidence is wrong: avg %, sessions %, last %, rewards %',
      dashboard_avg, dashboard_sessions, last_accuracy, lifetime_diamonds;
  END IF;
  session_result := public.fn_save_training_session_v2(
    '11111111-1111-4111-8111-111111111111', attempt_one
  );
  IF session_result ->> 'newSession' <> 'false'
     OR (SELECT count(*) FROM public.training_sessions WHERE attempt_id = attempt_one) <> 1 THEN
    RAISE EXCEPTION 'analytics session replay was not idempotent: %', session_result;
  END IF;

  BEGIN
    UPDATE public.training_answers SET is_correct = false
    WHERE attempt_id = attempt_one AND hand_ordinal = 1 AND decision_ordinal = 1;
  EXCEPTION WHEN check_violation THEN
    immutable_failed := true;
  END;
  IF NOT immutable_failed THEN RAISE EXCEPTION 'persisted answer was mutable'; END IF;

  UPDATE public.training_streaks
  SET current_streak = 4,
      longest_streak = 6,
      last_training_date = timezone('America/Chicago', now())::date - 1,
      streak_start_date = timezone('America/Chicago', now())::date - 4,
      authority_current_streak = 4,
      authority_longest_streak = 6,
      authority_last_training_date = timezone('America/Chicago', now())::date - 1,
      authority_streak_start_date = timezone('America/Chicago', now())::date - 4
  WHERE user_id = '11111111-1111-4111-8111-111111111111';
  attempt_two := public.phase6_seed_attempt('adv-011', 'phase6-run-two', 20);
  completion := public.fn_complete_training_attempt_v2(
    '11111111-1111-4111-8111-111111111111', attempt_two
  );
  IF (completion #>> '{trainingStreak,current_streak}')::integer <> 5
     OR (completion #>> '{trainingStreak,longest_streak}')::integer <> 6 THEN
    RAISE EXCEPTION 'consecutive-day streak transition is wrong: %', completion;
  END IF;

  replay_start := public.fn_start_training_attempt_v2(
    '11111111-1111-4111-8111-111111111111', 'phase6-replay', 'adv-011', 1,
    'replay', 'grouped', 1, repeat('a', 64), attempt_two
  );
  IF replay_start ->> 'success' <> 'true' OR replay_start ->> 'practiceOnly' <> 'true' THEN
    RAISE EXCEPTION 'replay attempt contract is wrong: %', replay_start;
  END IF;
  replay_attempt := (replay_start ->> 'attemptId')::uuid;
  SELECT to_jsonb(streaks) INTO streak_before_replay
  FROM public.training_streaks AS streaks
  WHERE user_id = '11111111-1111-4111-8111-111111111111';
  INSERT INTO public.training_question_snapshots(
    snapshot_key, source_question_id, game_id, level, content_digest, question_data
  ) VALUES (
    md5('phase6-replay') || md5('phase6-replay-snapshot'),
    'phase6-replay-q', 'adv-011', 1,
    md5('phase6-replay') || md5('phase6-replay-snapshot'),
    jsonb_build_object('id', 'phase6-replay-q')
  );
  INSERT INTO public.training_attempt_hands(attempt_id, hand_ordinal, snapshot_key)
  VALUES (replay_attempt, 1, md5('phase6-replay') || md5('phase6-replay-snapshot'));
  INSERT INTO public.training_answers(
    user_id, game_id, question_id, answer_id, is_correct, level,
    submission_id, evidence_metadata, session_id, attempt_id,
    hand_ordinal, decision_ordinal, snapshot_key
  ) VALUES (
    '11111111-1111-4111-8111-111111111111', 'adv-011', 'phase6-replay-q',
    'check', true, 1, 'phase6-replay-submission',
    jsonb_build_object('difficultyMode', 'grouped'),
    'phase6-replay', replay_attempt, 1, 1,
    md5('phase6-replay') || md5('phase6-replay-snapshot')
  );
  replay_completion := public.fn_complete_training_attempt_v2(
    '11111111-1111-4111-8111-111111111111', replay_attempt
  );
  IF replay_completion ->> 'practiceOnly' <> 'true'
     OR (replay_completion ->> 'diamondsEarned')::integer <> 0
     OR (SELECT hands_played FROM public.training_progress WHERE user_id = '11111111-1111-4111-8111-111111111111' AND game_id = 'adv-011') <> 20
     OR (SELECT count(*) FROM public.training_verified_leaderboard
         WHERE user_id = '11111111-1111-4111-8111-111111111111') <> 20
     OR (SELECT count(*) FROM public.diamond_transactions WHERE user_id = '11111111-1111-4111-8111-111111111111') <> 2
     OR (SELECT to_jsonb(streaks) FROM public.training_streaks AS streaks
         WHERE user_id = '11111111-1111-4111-8111-111111111111') IS DISTINCT FROM streak_before_replay THEN
    RAISE EXCEPTION 'practice replay changed campaign economy or progression: %', replay_completion;
  END IF;
END $$;

DO $$
DECLARE
  daily_attempt uuid;
  daily_result jsonb;
  daily_replay jsonb;
  expected_daily_id text := 'daily-' || timezone('America/Chicago', now())::date::text;
BEGIN
  daily_attempt := public.phase6_seed_attempt(
    'daily-challenge', expected_daily_id, 1, 'daily', 1
  );
  daily_result := public.fn_complete_training_attempt_v2(
    '11111111-1111-4111-8111-111111111111', daily_attempt
  );
  IF daily_result ->> 'success' <> 'true'
     OR daily_result ->> 'newCompletion' <> 'true'
     OR (daily_result ->> 'diamondsEarned')::integer <> 25
     OR (daily_result #>> '{dailyChallenge,score}')::integer <> 100
     OR daily_result #>> '{dailyChallenge,selected_action}' <> 'check'
     OR (daily_result #>> '{dailyChallenge,attempt_id}')::uuid <> daily_attempt
     OR (SELECT count(*) FROM public.training_daily_challenge
         WHERE user_id = '11111111-1111-4111-8111-111111111111'
           AND daily_id = expected_daily_id) <> 1
     OR (SELECT count(*) FROM public.diamond_transactions
         WHERE reference_id = 'training_attempt:' || daily_attempt) <> 1 THEN
    RAISE EXCEPTION 'Daily Challenge completion was not authoritative: %', daily_result;
  END IF;
  daily_replay := public.fn_complete_training_attempt_v2(
    '11111111-1111-4111-8111-111111111111', daily_attempt
  );
  IF daily_replay ->> 'newCompletion' <> 'false'
     OR (daily_replay ->> 'diamondsEarned')::integer <> 25
     OR (SELECT count(*) FROM public.training_daily_challenge
         WHERE user_id = '11111111-1111-4111-8111-111111111111'
           AND daily_id = expected_daily_id) <> 1
     OR (SELECT count(*) FROM public.diamond_transactions
         WHERE reference_id = 'training_attempt:' || daily_attempt) <> 1 THEN
    RAISE EXCEPTION 'Daily Challenge replay duplicated state: %', daily_replay;
  END IF;
END $$;

DO $$
DECLARE
  claim jsonb;
  replay jsonb;
  partial jsonb;
BEGIN
  INSERT INTO public.training_streaks(
    user_id, current_streak, longest_streak, last_training_date,
    streak_start_date, milestones_claimed,
    authority_current_streak, authority_longest_streak,
    authority_last_training_date, authority_streak_start_date
  ) VALUES (
    '22222222-2222-4222-8222-222222222222', 3, 3,
    timezone('America/Chicago', now())::date,
    timezone('America/Chicago', now())::date - 2,
    '[]'::jsonb, 3, 3,
    timezone('America/Chicago', now())::date,
    timezone('America/Chicago', now())::date - 2
  );

  claim := public.fn_claim_training_streak_milestone_v2(
    '22222222-2222-4222-8222-222222222222', 3
  );
  IF claim ->> 'success' <> 'true'
     OR claim ->> 'newClaim' <> 'true'
     OR (claim ->> 'milestoneDays')::integer <> 3
     OR (claim ->> 'diamondsAwarded')::integer <> 25
     OR (SELECT milestones_claimed FROM public.training_streaks
         WHERE user_id = '22222222-2222-4222-8222-222222222222') <> '[3]'::jsonb
     OR (SELECT count(*) FROM public.diamond_transactions
         WHERE reference_id = 'streak_22222222-2222-4222-8222-222222222222_3_part_1') <> 1 THEN
    RAISE EXCEPTION 'atomic streak milestone claim is wrong: %', claim;
  END IF;

  replay := public.fn_claim_training_streak_milestone_v2(
    '22222222-2222-4222-8222-222222222222', 3
  );
  IF replay ->> 'success' <> 'true'
     OR replay ->> 'newClaim' <> 'false'
     OR (replay ->> 'diamondsAwarded')::integer <> 0
     OR (replay ->> 'diamondsAwardedTotal')::integer <> 25
     OR (SELECT milestones_claimed FROM public.training_streaks
         WHERE user_id = '22222222-2222-4222-8222-222222222222') <> '[3]'::jsonb
     OR (SELECT count(*) FROM public.diamond_transactions
         WHERE reference_id = 'streak_22222222-2222-4222-8222-222222222222_3_part_1') <> 1 THEN
    RAISE EXCEPTION 'streak milestone replay was not idempotent: %', replay;
  END IF;

  UPDATE public.training_streaks
  SET current_streak = 100,
      longest_streak = 100,
      authority_current_streak = 100,
      authority_longest_streak = 100
  WHERE user_id = '22222222-2222-4222-8222-222222222222';
  partial := public.fn_claim_training_streak_milestone_v2(
    '22222222-2222-4222-8222-222222222222', 100
  );
  IF partial ->> 'success' <> 'true'
     OR partial ->> 'newClaim' <> 'false'
     OR partial ->> 'awardApplied' <> 'true'
     OR partial ->> 'milestoneCompleted' <> 'false'
     OR (partial ->> 'diamondsAwarded')::integer <> 975
     OR (partial ->> 'diamondsAwardedTotal')::integer <> 975
     OR (partial ->> 'diamondsRemaining')::integer <> 1025
     OR (SELECT milestones_claimed FROM public.training_streaks
         WHERE user_id = '22222222-2222-4222-8222-222222222222') <> '[3]'::jsonb
     OR (SELECT diamonds_awarded FROM public.training_streak_milestone_claims
         WHERE user_id = '22222222-2222-4222-8222-222222222222'
           AND milestone_days = 100) <> 975
     OR (SELECT completed_at FROM public.training_streak_milestone_claims
         WHERE user_id = '22222222-2222-4222-8222-222222222222'
           AND milestone_days = 100) IS NOT NULL THEN
    RAISE EXCEPTION 'partial capped streak milestone was consumed incorrectly: %', partial;
  END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
DO $$
DECLARE
  write_blocked boolean := false;
  leaderboard_write_blocked boolean := false;
  leaderboard_rpc_blocked boolean := false;
  verified_leaderboard_read_blocked boolean := false;
  verified_leaderboard_write_blocked boolean := false;
  verified_leaderboard_record_blocked boolean := false;
  verified_leaderboard_rank_blocked boolean := false;
  answer_table_read_blocked boolean := false;
  cache_answer_read_blocked boolean := false;
  replay_write_blocked boolean := false;
  legacy_cache_rpc_blocked boolean := false;
  legacy_question_rpc_blocked boolean := false;
  refresh_rpc_blocked boolean := false;
  xp_rpc_blocked boolean := false;
  achievement_rpc_blocked boolean := false;
  legacy_truth_write_blocked boolean := false;
  memory_session_write_blocked boolean := false;
  memory_leaderboard_write_blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.training_answers(
      user_id, game_id, question_id, answer_id, is_correct, level
    ) VALUES (
      '11111111-1111-4111-8111-111111111111', 'cash-001', 'forged', 'check', true, 1
    );
  EXCEPTION WHEN insufficient_privilege THEN
    write_blocked := true;
  END;
  IF NOT write_blocked THEN RAISE EXCEPTION 'authenticated role retained answer write authority'; END IF;
  BEGIN
    INSERT INTO public.training_leaderboard(
      user_id, period_type, period_key, total_questions, correct_answers
    ) VALUES (
      '11111111-1111-4111-8111-111111111111', 'alltime', 'forged', 100, 100
    );
  EXCEPTION WHEN insufficient_privilege THEN
    leaderboard_write_blocked := true;
  END;
  IF NOT leaderboard_write_blocked THEN
    RAISE EXCEPTION 'authenticated role retained leaderboard write authority';
  END IF;
  BEGIN
    PERFORM public.fn_training_leaderboard_record(
      '11111111-1111-4111-8111-111111111111', 'alltime', 'forged-rpc',
      1000000, 1000000, true, 1000000, 100, 0
    );
  EXCEPTION WHEN insufficient_privilege THEN
    leaderboard_rpc_blocked := true;
  END;
  IF NOT leaderboard_rpc_blocked THEN
    RAISE EXCEPTION 'authenticated role retained leaderboard RPC mutation authority';
  END IF;
  BEGIN
    PERFORM 1 FROM public.training_verified_leaderboard LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN
    verified_leaderboard_read_blocked := true;
  END;
  IF NOT verified_leaderboard_read_blocked THEN
    RAISE EXCEPTION 'authenticated role retained verified leaderboard read authority';
  END IF;
  BEGIN
    INSERT INTO public.training_verified_leaderboard(
      user_id, period_type, period_key, dimension_type, dimension_key
    ) VALUES (
      '11111111-1111-4111-8111-111111111111', 'alltime', 'alltime',
      'overall', 'overall'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    verified_leaderboard_write_blocked := true;
  END;
  IF NOT verified_leaderboard_write_blocked THEN
    RAISE EXCEPTION 'authenticated role retained verified leaderboard write authority';
  END IF;
  BEGIN
    PERFORM public.fn_training_verified_leaderboard_record_v2(
      '11111111-1111-4111-8111-111111111111', 'cash-001', 'alltime', 'alltime',
      1000000, 1000000, true, 1000000, 100, 0
    );
  EXCEPTION WHEN insufficient_privilege THEN
    verified_leaderboard_record_blocked := true;
  END;
  IF NOT verified_leaderboard_record_blocked THEN
    RAISE EXCEPTION 'authenticated role retained verified leaderboard mutation RPC';
  END IF;
  BEGIN
    PERFORM public.fn_training_verified_leaderboard_rank_v2(
      '11111111-1111-4111-8111-111111111111', 'alltime', 'alltime',
      'overall', 'overall'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    verified_leaderboard_rank_blocked := true;
  END;
  IF NOT verified_leaderboard_rank_blocked THEN
    RAISE EXCEPTION 'authenticated role retained verified leaderboard rank RPC';
  END IF;
  BEGIN
    PERFORM 1 FROM public.training_questions LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN
    answer_table_read_blocked := true;
  END;
  IF NOT answer_table_read_blocked THEN
    RAISE EXCEPTION 'authenticated role retained direct answer-table read authority';
  END IF;
  BEGIN
    PERFORM question_data FROM public.training_question_cache LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN
    cache_answer_read_blocked := true;
  END;
  IF NOT cache_answer_read_blocked THEN
    RAISE EXCEPTION 'authenticated role retained cached answer-key read authority';
  END IF;
  BEGIN
    INSERT INTO public.training_hand_replay(user_id, solver_action, was_correct)
    VALUES ('11111111-1111-4111-8111-111111111111', 'check', true);
  EXCEPTION WHEN insufficient_privilege THEN
    replay_write_blocked := true;
  END;
  IF NOT replay_write_blocked THEN
    RAISE EXCEPTION 'authenticated role retained replay write authority';
  END IF;
  BEGIN
    PERFORM public.get_random_cached_question(
      'cash-001', 1, 'PIO',
      '11111111-1111-4111-8111-111111111111', ARRAY[]::text[]
    );
  EXCEPTION WHEN insufficient_privilege THEN
    legacy_cache_rpc_blocked := true;
  END;
  IF NOT legacy_cache_rpc_blocked THEN
    RAISE EXCEPTION 'authenticated role retained legacy cache-answer RPC authority';
  END IF;
  BEGIN
    PERFORM public.get_next_training_question(
      '11111111-1111-4111-8111-111111111111', 1
    );
  EXCEPTION WHEN insufficient_privilege THEN
    legacy_question_rpc_blocked := true;
  END;
  IF NOT legacy_question_rpc_blocked THEN
    RAISE EXCEPTION 'authenticated role retained legacy question-answer RPC authority';
  END IF;
  BEGIN
    PERFORM public.training_leaderboard_refresh();
  EXCEPTION WHEN insufficient_privilege THEN
    refresh_rpc_blocked := true;
  END;
  IF NOT refresh_rpc_blocked THEN
    RAISE EXCEPTION 'authenticated role retained leaderboard refresh authority';
  END IF;
  BEGIN
    PERFORM public.fn_add_xp('11111111-1111-4111-8111-111111111111', 1000000);
  EXCEPTION WHEN insufficient_privilege THEN
    xp_rpc_blocked := true;
  END;
  IF NOT xp_rpc_blocked THEN
    RAISE EXCEPTION 'authenticated role retained arbitrary XP mutation authority';
  END IF;
  BEGIN
    PERFORM public.unlock_achievement(
      '11111111-1111-4111-8111-111111111111', 'forged'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    achievement_rpc_blocked := true;
  END;
  IF NOT achievement_rpc_blocked THEN
    RAISE EXCEPTION 'authenticated role retained arbitrary achievement authority';
  END IF;
  BEGIN
    INSERT INTO public.training_spaced_repetition(id, user_id)
    VALUES (gen_random_uuid(), '11111111-1111-4111-8111-111111111111');
  EXCEPTION WHEN insufficient_privilege THEN
    legacy_truth_write_blocked := true;
  END;
  IF NOT legacy_truth_write_blocked THEN
    RAISE EXCEPTION 'authenticated role retained legacy Training truth writes';
  END IF;
  BEGIN
    INSERT INTO public.memory_game_sessions(user_id, game_mode, level, score, accuracy, completed)
    VALUES ('11111111-1111-4111-8111-111111111111', 'range', 1, 999999, 100, true);
  EXCEPTION WHEN insufficient_privilege THEN
    memory_session_write_blocked := true;
  END;
  IF NOT memory_session_write_blocked THEN
    RAISE EXCEPTION 'authenticated role retained browser-authored memory session authority';
  END IF;
  BEGIN
    INSERT INTO public.memory_leaderboards(user_id, game_mode, level, score, accuracy)
    VALUES ('11111111-1111-4111-8111-111111111111', 'range', 1, 999999, 100);
  EXCEPTION WHEN insufficient_privilege THEN
    memory_leaderboard_write_blocked := true;
  END;
  IF NOT memory_leaderboard_write_blocked THEN
    RAISE EXCEPTION 'authenticated role retained browser-authored memory leaderboard authority';
  END IF;
  IF (SELECT count(*) FROM public.training_answers) <> 43 THEN
    RAISE EXCEPTION 'self-select policy returned the wrong answer set';
  END IF;
END $$;
RESET ROLE;

SELECT jsonb_build_object(
  'attempts', (SELECT count(*) FROM public.training_attempts),
  'firstDecisions', (SELECT count(*) FROM public.training_answers WHERE decision_ordinal = 1),
  'continuations', (SELECT count(*) FROM public.training_answers WHERE decision_ordinal > 1),
  'completions', (SELECT count(*) FROM public.training_level_history),
  'awards', (SELECT count(*) FROM public.diamond_transactions),
  'legacyLeaderboardWrites', (SELECT count(*) FROM public.phase6_leaderboard_calls),
  'verifiedLeaderboardRows', (SELECT count(*) FROM public.training_verified_leaderboard),
  'analyticsSessions', (SELECT count(*) FROM public.training_sessions),
  'authenticatedWritesBlocked', true,
  'answerKeyReadsBlocked', true,
  'cacheAnswerKeyReadsBlocked', true,
  'maintenanceRpcBlocked', true,
  'leaderboardRpcBlocked', true,
  'verifiedLeaderboardDirectAccessBlocked', true,
  'legacyTruthWritesBlocked', true,
  'memoryPracticeWritesBlocked', true,
  'memoryPromotionTriggerRetired', NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.memory_game_sessions'::regclass
      AND tgname = 'trg_memory_promote_session'
      AND NOT tgisinternal
  )
) AS phase6_authority_evidence;
`;

const postgresBin = resolvePostgresBin();
const tempRoot = mkdtempSync(path.join(tmpdir(), 'sp-training-authority-'));
const dataDir = path.join(tempRoot, 'data');
const port = await reservePort();
let started = false;

const tool = (name) => path.join(postgresBin, name);
const connection = ['-h', tempRoot, '-p', String(port), '-d', 'phase6'];

try {
  command(tool('initdb'), ['-D', dataDir, '-A', 'trust', '--no-locale'], { quiet: true });
  command(tool('pg_ctl'), [
    '-D', dataDir,
    '-o', `-p ${port} -k ${tempRoot}`,
    '-l', path.join(tempRoot, 'postgres.log'),
    '-w',
    'start',
  ], { quiet: true });
  started = true;
  command(tool('createdb'), ['-h', tempRoot, '-p', String(port), 'phase6'], { quiet: true });
  command(tool('psql'), ['-v', 'ON_ERROR_STOP=1', ...connection], {
    input: BASELINE_SQL,
    quiet: true,
  });
  command(tool('psql'), ['-v', 'ON_ERROR_STOP=1', ...connection, '-f', AWARD_MIGRATION], {
    quiet: true,
  });
  command(tool('psql'), ['-v', 'ON_ERROR_STOP=1', ...connection, '-f', MIGRATION], {
    quiet: true,
  });
  command(tool('psql'), ['-v', 'ON_ERROR_STOP=1', ...connection, '-f', SESSION_EVIDENCE_MIGRATION], {
    quiet: true,
  });
  command(tool('psql'), ['-v', 'ON_ERROR_STOP=1', ...connection, '-f', MEMORY_AUTHORITY_MIGRATION], {
    quiet: true,
  });
  const evidence = command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: BEHAVIOR_SQL,
    quiet: true,
  });
  const evidenceLine = evidence.stdout
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('{') && line.endsWith('}'));
  if (!evidenceLine) throw new Error(`PostgreSQL verifier did not emit its evidence object.\n${evidence.stdout}`);
  console.log(`Phase 6 PostgreSQL authority verification passed: ${evidenceLine}`);
} finally {
  if (started) {
    spawnSync(tool('pg_ctl'), ['-D', dataDir, '-m', 'fast', 'stop'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  }
  if (tempRoot.startsWith(`${tmpdir()}${path.sep}sp-training-authority-`)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
