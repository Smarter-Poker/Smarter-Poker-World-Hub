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
  'supabase/migrations/20260907200000_training_cache_event_idempotent_replay.sql',
);
const DECISION_AUTHORITY_MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260907203000_training_attempt_decision_delivery_authority.sql',
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
  throw new Error('PostgreSQL 17+ binaries are required for the Training cache replay verifier.');
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
CREATE SCHEMA extensions;
CREATE SCHEMA auth;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;

CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE TABLE public.training_question_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id text NOT NULL UNIQUE,
  quality_status text NOT NULL,
  policy_checksum text NOT NULL,
  served_count integer NOT NULL DEFAULT 0,
  answered_count integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  times_used integer NOT NULL DEFAULT 0,
  last_served_at timestamptz,
  last_answered_at timestamptz,
  last_completed_at timestamptz
);

CREATE TABLE public.training_question_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  event_key text NOT NULL,
  question_id text NOT NULL,
  user_id uuid,
  is_correct boolean,
  policy_checksum text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_type, event_key)
);

CREATE TABLE public.training_question_snapshots (
  snapshot_key text PRIMARY KEY,
  source_question_id text NOT NULL,
  game_id text NOT NULL,
  level integer NOT NULL,
  content_digest text NOT NULL,
  question_data jsonb NOT NULL
);

CREATE TABLE public.training_attempts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  client_nonce text NOT NULL,
  game_id text NOT NULL,
  level integer NOT NULL,
  session_kind text NOT NULL,
  difficulty text NOT NULL,
  expected_hands integer NOT NULL,
  config_hash text NOT NULL,
  parent_attempt_id uuid,
  practice_only boolean NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  answered_hands integer,
  correct_hands integer,
  accuracy_percentage integer,
  passed boolean,
  best_streak integer,
  reward_diamonds integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.training_attempt_hands (
  attempt_id uuid NOT NULL REFERENCES public.training_attempts(id) ON DELETE CASCADE,
  hand_ordinal smallint NOT NULL,
  snapshot_key text NOT NULL REFERENCES public.training_question_snapshots(snapshot_key),
  scoring_rule text NOT NULL DEFAULT 'initial_decision',
  status text NOT NULL DEFAULT 'allocated',
  result_is_correct boolean,
  scored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, hand_ordinal)
);

CREATE TABLE public.training_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  game_id text NOT NULL,
  question_id text NOT NULL,
  answer_id text NOT NULL,
  is_correct boolean NOT NULL,
  level integer NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  submission_id text,
  session_id text,
  attempt_id uuid,
  hand_ordinal smallint,
  decision_ordinal smallint,
  snapshot_key text,
  classification text,
  solver_verified boolean,
  evidence_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX training_answers_attempt_decision_key
  ON public.training_answers(attempt_id, hand_ordinal, decision_ordinal)
  WHERE attempt_id IS NOT NULL;

-- Model the production predecessor trigger before the schema-first Phase 6
-- expansion lands. PR A must leave this validator unchanged; its separate
-- contract replacement is intentionally held for PR B.
CREATE FUNCTION public.fn_validate_training_answer_v2()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  attempt_row public.training_attempts%ROWTYPE;
  hand_row public.training_attempt_hands%ROWTYPE;
  snapshot_row public.training_question_snapshots%ROWTYPE;
  exact_replay_exists boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.attempt_id IS NULL AND NEW.attempt_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_LEGACY_ANSWER_CANNOT_BE_REBOUND';
    END IF;
    IF OLD.attempt_id IS NOT NULL AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_ANSWER_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.attempt_id IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.training_answers existing
    WHERE existing.user_id = NEW.user_id
      AND existing.submission_id = NEW.submission_id
      AND existing.attempt_id = NEW.attempt_id
      AND existing.hand_ordinal = NEW.hand_ordinal
      AND existing.decision_ordinal = NEW.decision_ordinal
      AND existing.snapshot_key = NEW.snapshot_key
      AND existing.question_id = NEW.question_id
      AND lower(existing.answer_id) = lower(NEW.answer_id)
  ) INTO exact_replay_exists;
  IF exact_replay_exists THEN RETURN NEW; END IF;

  SELECT * INTO attempt_row FROM public.training_attempts
  WHERE id = NEW.attempt_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'TRAINING_ATTEMPT_NOT_FOUND';
  END IF;
  IF attempt_row.status <> 'open' OR attempt_row.expires_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_NOT_OPEN';
  END IF;
  IF NEW.user_id <> attempt_row.user_id OR NEW.game_id <> attempt_row.game_id
     OR NEW.level <> attempt_row.level OR NEW.session_id <> attempt_row.client_nonce THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_ANSWER_OWNER_MISMATCH';
  END IF;
  IF coalesce(NEW.evidence_metadata ->> 'difficultyMode', '') <> attempt_row.difficulty THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_DIFFICULTY_MISMATCH';
  END IF;

  SELECT * INTO hand_row FROM public.training_attempt_hands
  WHERE attempt_id = NEW.attempt_id AND hand_ordinal = NEW.hand_ordinal;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_HAND_MISMATCH';
  END IF;
  IF NEW.decision_ordinal = 1 AND hand_row.snapshot_key <> NEW.snapshot_key THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_INITIAL_SNAPSHOT_MISMATCH';
  END IF;
  IF NEW.decision_ordinal > 1 AND NOT EXISTS (
    SELECT 1 FROM public.training_answers prior
    WHERE prior.attempt_id = NEW.attempt_id
      AND prior.hand_ordinal = NEW.hand_ordinal
      AND prior.decision_ordinal = NEW.decision_ordinal - 1
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_DECISION_SEQUENCE_GAP';
  END IF;

  SELECT * INTO snapshot_row FROM public.training_question_snapshots
  WHERE snapshot_key = NEW.snapshot_key;
  IF NOT FOUND OR snapshot_row.game_id <> NEW.game_id
     OR snapshot_row.level <> NEW.level
     OR NOT (
       snapshot_row.source_question_id = NEW.question_id
       OR snapshot_row.question_data ->> 'id' = NEW.question_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_QUESTION_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER training_answers_validate_v2
  BEFORE INSERT OR UPDATE ON public.training_answers
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_training_answer_v2();

CREATE FUNCTION public.fn_training_cache_record_served_batch(
  p_request_key text,
  p_question_receipts jsonb,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  receipt record;
  result jsonb;
  inserted_count integer := 0;
  requested_count integer := jsonb_array_length(p_question_receipts);
BEGIN
  FOR receipt IN
    SELECT item ->> 'questionId' AS question_id,
      lower(item ->> 'policyChecksum') AS policy_checksum
    FROM jsonb_array_elements(p_question_receipts) AS entries(item)
    ORDER BY item ->> 'questionId'
  LOOP
    result := public.fn_training_cache_record_event(
      'served',
      p_request_key || ':' || encode(extensions.digest(receipt.question_id, 'sha256'), 'hex'),
      receipt.question_id,
      p_user_id,
      NULL,
      jsonb_build_object('requestKey', p_request_key),
      now(),
      receipt.policy_checksum
    );
    IF coalesce((result ->> 'inserted')::boolean, false) THEN
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object(
    'questionCount', requested_count,
    'inserted', inserted_count,
    'duplicates', requested_count - inserted_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_training_cache_record_served_batch(text,jsonb,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_training_cache_record_served_batch(text,jsonb,uuid)
  TO service_role;
`;

const DECISION_BEHAVIOR_SQL = String.raw`

CREATE TRIGGER training_answer_cache_event
  AFTER INSERT OR UPDATE OF question_id, user_id, is_correct, evidence_metadata
  ON public.training_answers
  FOR EACH ROW EXECUTE FUNCTION public.fn_training_answer_cache_event();

INSERT INTO auth.users(id) VALUES ('11111111-1111-4111-8111-111111111111')
ON CONFLICT DO NOTHING;
INSERT INTO public.training_question_snapshots (
  snapshot_key, source_question_id, game_id, level, content_digest, question_data
) VALUES
  (repeat('1', 64), 'recovered-old-policy', 'cash-6max', 2, repeat('a', 64),
   jsonb_build_object('id', 'recovered-old-policy', 'policyChecksum', repeat('a', 64))),
  (repeat('2', 64), 'never-served-policy', 'cash-6max', 2, repeat('b', 64),
   jsonb_build_object('id', 'never-served-policy', 'policyChecksum', repeat('b', 64))),
  (repeat('3', 64), 'continuation-a', 'cash-6max', 2, repeat('c', 64),
   jsonb_build_object('id', 'continuation-a', 'policyChecksum', repeat('c', 64))),
  (repeat('4', 64), 'continuation-b', 'cash-6max', 2, repeat('d', 64),
   jsonb_build_object('id', 'continuation-b', 'policyChecksum', repeat('d', 64)));
INSERT INTO public.training_attempts (
  id, user_id, client_nonce, game_id, level, session_kind, difficulty,
  expected_hands, config_hash, practice_only, status, expires_at
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111', 'decision-authority-session',
  'cash-6max', 2, 'campaign', 'exact', 2, repeat('e', 64), false,
  'open', now() + interval '1 hour'
);
INSERT INTO public.training_attempt_hands(attempt_id, hand_ordinal, snapshot_key)
VALUES
  ('22222222-2222-4222-8222-222222222222', 1, repeat('1', 64)),
  ('22222222-2222-4222-8222-222222222222', 2, repeat('2', 64));
INSERT INTO public.training_question_cache(question_id, quality_status, policy_checksum)
VALUES
  ('recovered-old-policy', 'active', repeat('a', 64)),
  ('continuation-a', 'active', repeat('c', 64));

DO $$
DECLARE
  v_first jsonb;
  v_retry jsonb;
  v_authority jsonb;
  v_legacy_promotion jsonb;
  v_legacy_second_chunk jsonb;
  v_legacy_continuation jsonb;
  v_legacy_replay jsonb;
  v_winner_a jsonb;
  v_winner_b jsonb;
  blocked boolean := false;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.training_question_events
    WHERE event_type = 'served'
      AND event_key = 'training-attempt:55555555-5555-4555-8555-555555555555:hand:1:decision:1'
  ) THEN
    RAISE EXCEPTION 'migration fabricated an attempt binding from an unbound random request key';
  END IF;
  v_legacy_promotion := public.fn_training_promote_legacy_signed_decision_v1(
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111', 1, 1,
    repeat('5', 64), 'legacy-manifest-question', repeat('5', 64),
    'training-attempt:55555555-5555-4555-8555-555555555555:hand:1:decision:1',
    extract(epoch FROM now())::bigint,
    extract(epoch FROM now() + interval '1 hour')::bigint
  );
  IF coalesce((v_legacy_promotion ->> 'authorized')::boolean, false) IS TRUE
     OR v_legacy_promotion ->> 'code' <> 'TRAINING_LEGACY_PROMOTION_INPUT_INVALID' THEN
    RAISE EXCEPTION 'stable post-cutover receipt entered legacy promotion: %', v_legacy_promotion;
  END IF;
  v_legacy_promotion := public.fn_training_promote_legacy_signed_decision_v1(
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111', 1, 1,
    repeat('5', 64), 'legacy-manifest-question', repeat('5', 64),
    '17171717-1717-1171-8171-171717171717', extract(epoch FROM now())::bigint,
    extract(epoch FROM now() + interval '1 hour')::bigint
  );
  IF coalesce((v_legacy_promotion ->> 'authorized')::boolean, false) IS TRUE
     OR v_legacy_promotion ->> 'code' <> 'TRAINING_LEGACY_PROMOTION_INPUT_INVALID' THEN
    RAISE EXCEPTION 'non-v4 UUID entered legacy promotion: %', v_legacy_promotion;
  END IF;
  v_legacy_promotion := public.fn_training_promote_legacy_signed_decision_v1(
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111', 1, 1,
    repeat('5', 64), 'legacy-manifest-question', repeat('5', 64),
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', extract(epoch FROM now())::bigint,
    extract(epoch FROM now() + interval '1 hour')::bigint
  );
  IF coalesce((v_legacy_promotion ->> 'authorized')::boolean, false) IS NOT TRUE
     OR coalesce((v_legacy_promotion ->> 'promoted')::boolean, false) IS NOT TRUE
     OR NOT EXISTS (
       SELECT 1 FROM public.training_question_events
       WHERE event_type = 'served'
         AND event_key = 'training-attempt:55555555-5555-4555-8555-555555555555:hand:1:decision:1'
         AND question_id = 'legacy-manifest-question'
         AND policy_checksum = repeat('5', 64)
         AND metadata ->> 'snapshotKey' = repeat('5', 64)
         AND metadata ->> 'legacySignedReceiptRecovery' = 'true'
         AND metadata ->> 'migratedFromEventKey' LIKE 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:%'
     ) THEN
    RAISE EXCEPTION 'verified legacy receipt was not promoted to its manifest slot: %', v_legacy_promotion;
  END IF;
  v_legacy_second_chunk := public.fn_training_promote_legacy_signed_decision_v1(
    '99999999-9999-4999-8999-999999999999',
    '11111111-1111-4111-8111-111111111111', 1, 1,
    repeat('9', 64), 'legacy-second-chunk-question', repeat('9', 64),
    '18181818-1818-4181-8181-181818181818', extract(epoch FROM now())::bigint,
    extract(epoch FROM now() + interval '1 hour')::bigint
  );
  IF coalesce((v_legacy_second_chunk ->> 'authorized')::boolean, false) IS NOT TRUE
     OR NOT EXISTS (
       SELECT 1 FROM public.training_question_events
       WHERE event_type = 'served'
         AND event_key = 'training-attempt:99999999-9999-4999-8999-999999999999:hand:1:decision:1'
         AND metadata ->> 'migratedFromEventKey'
           LIKE '99999999-9999-4999-8999-999999999999:1:%'
     ) THEN
    RAISE EXCEPTION 'verified predecessor :1 chunk receipt was not promoted: %', v_legacy_second_chunk;
  END IF;
  v_legacy_replay := public.fn_training_promote_legacy_signed_decision_v1(
    '77777777-7777-4777-8777-777777777777',
    '11111111-1111-4111-8111-111111111111', 1, 1,
    repeat('5', 64), 'legacy-manifest-question', repeat('5', 64),
    '16161616-1616-4161-8161-161616161616', extract(epoch FROM now())::bigint,
    extract(epoch FROM now() + interval '1 hour')::bigint
  );
  IF coalesce((v_legacy_replay ->> 'authorized')::boolean, false) IS NOT TRUE
     OR NOT EXISTS (
       SELECT 1 FROM public.training_question_events
       WHERE event_type = 'served'
         AND event_key = 'training-attempt:77777777-7777-4777-8777-777777777777:hand:1:decision:1'
         AND metadata ->> 'legacyProofKind' = 'replay_parent_answer'
         AND metadata ->> 'legacyReplayParentSubmissionId'
           = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
         AND NOT (metadata ? 'migratedFromEventKey')
     ) THEN
    RAISE EXCEPTION 'verified predecessor replay receipt lacked parent-mistake promotion: %', v_legacy_replay;
  END IF;
  IF EXISTS (SELECT 1 FROM public.training_delivery_authority_attestations) THEN
    RAISE EXCEPTION 'legacy promotion falsely attested a dual-write application deployment';
  END IF;
  v_legacy_promotion := public.fn_training_promote_legacy_signed_decision_v1(
    '55555555-5555-4555-8555-555555555555', NULL::uuid, 1, 1,
    repeat('5', 64), 'legacy-manifest-question', repeat('5', 64),
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd', extract(epoch FROM now())::bigint,
    extract(epoch FROM now() + interval '1 hour')::bigint
  );
  IF coalesce((v_legacy_promotion ->> 'authorized')::boolean, false) IS TRUE
     OR v_legacy_promotion ->> 'code' <> 'TRAINING_LEGACY_PROMOTION_INPUT_INVALID' THEN
    RAISE EXCEPTION 'null owner passed legacy promotion: %', v_legacy_promotion;
  END IF;
  v_legacy_promotion := public.fn_training_promote_legacy_signed_decision_v1(
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111', 1, 1,
    repeat('5', 64), 'legacy-manifest-question', repeat('5', 64),
    'abababab-abab-4bab-8bab-abababababab', extract(epoch FROM now() - interval '25 hours')::bigint,
    extract(epoch FROM now() + interval '1 hour')::bigint
  );
  IF coalesce((v_legacy_promotion ->> 'authorized')::boolean, false) IS TRUE
     OR v_legacy_promotion ->> 'code' <> 'TRAINING_LEGACY_PROMOTION_RECEIPT_TIME_INVALID' THEN
    RAISE EXCEPTION 'overlong legacy receipt passed promotion: %', v_legacy_promotion;
  END IF;
  blocked := false;
  BEGIN
    UPDATE public.training_delivery_authority_cutover
    SET legacy_accept_until = legacy_accept_until + interval '1 day';
  EXCEPTION WHEN OTHERS THEN
    blocked := position('TRAINING_DELIVERY_AUTHORITY_CUTOVER_IMMUTABLE' IN SQLERRM) > 0;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'delivery authority cutover update was accepted'; END IF;
  blocked := false;
  BEGIN
    DELETE FROM public.training_delivery_authority_cutover;
  EXCEPTION WHEN OTHERS THEN
    blocked := position('TRAINING_DELIVERY_AUTHORITY_CUTOVER_IMMUTABLE' IN SQLERRM) > 0;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'delivery authority cutover delete was accepted'; END IF;
  blocked := false;
  BEGIN
    PERFORM public.fn_training_attempt_record_served_batch_v1(
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111', NULL::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    blocked := position('TRAINING_ATTEMPT_SERVE_AUDIT_INVALID' IN SQLERRM) > 0;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'null served batch input was accepted'; END IF;
  blocked := false;
  BEGIN
    PERFORM public.fn_training_attempt_record_served_batch_v1(
      '22222222-2222-4222-8222-222222222222', NULL::uuid,
      jsonb_build_array(jsonb_build_object(
        'handOrdinal', 2, 'decisionOrdinal', 1,
        'snapshotKey', repeat('2', 64), 'questionId', 'never-served-policy',
        'policyChecksum', repeat('b', 64)
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    blocked := position('TRAINING_ATTEMPT_SERVE_AUDIT_INVALID' IN SQLERRM) > 0;
  END;
  IF NOT blocked OR EXISTS (
    SELECT 1 FROM public.training_question_events
    WHERE event_type = 'served'
      AND event_key = 'training-attempt:22222222-2222-4222-8222-222222222222:hand:2:decision:1'
  ) THEN
    RAISE EXCEPTION 'null owner poisoned an attempt-scoped served receipt';
  END IF;
  v_first := public.fn_training_attempt_record_served_batch_v1(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    jsonb_build_array(jsonb_build_object(
      'handOrdinal', 1, 'decisionOrdinal', 1,
      'snapshotKey', repeat('1', 64), 'questionId', 'recovered-old-policy',
      'policyChecksum', repeat('a', 64)
    ))
  );
  IF (v_first ->> 'questionCount')::integer <> 1 THEN
    RAISE EXCEPTION 'attempt-scoped initial served receipt failed';
  END IF;

  UPDATE public.training_question_events
  SET metadata = metadata - 'decisionOrdinal'
  WHERE event_type = 'served'
    AND event_key = 'training-attempt:22222222-2222-4222-8222-222222222222:hand:1:decision:1';
  v_authority := public.fn_training_authorize_attempt_decision_v1(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111', 1, 1,
    repeat('1', 64), 'recovered-old-policy', repeat('a', 64)
  );
  IF coalesce((v_authority ->> 'authorized')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'served event with incomplete slot metadata was authorized';
  END IF;
  UPDATE public.training_question_events
  SET metadata = metadata || jsonb_build_object('decisionOrdinal', 1)
  WHERE event_type = 'served'
    AND event_key = 'training-attempt:22222222-2222-4222-8222-222222222222:hand:1:decision:1';

  -- Refresh the mutable row to a new policy before the first answer. The old
  -- immutable delivery must remain authorized without touching new counters.
  UPDATE public.training_question_cache
  SET policy_checksum = repeat('f', 64), answered_count = 0, correct_count = 0
  WHERE question_id = 'recovered-old-policy';
  v_retry := public.fn_training_attempt_record_served_batch_v1(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    jsonb_build_array(jsonb_build_object(
      'handOrdinal', 1, 'decisionOrdinal', 1,
      'snapshotKey', repeat('1', 64), 'questionId', 'recovered-old-policy',
      'policyChecksum', repeat('a', 64)
    ))
  );
  v_authority := public.fn_training_authorize_attempt_decision_v1(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111', 1, 1,
    repeat('1', 64), 'recovered-old-policy', repeat('a', 64)
  );
  IF coalesce((v_authority ->> 'authorized')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'recovered old policy was not authorized: %', v_authority;
  END IF;
  v_authority := public.fn_training_authorize_attempt_decision_v1(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111', 1, 1,
    repeat('1', 64), 'recovered-old-policy', NULL::text
  );
  IF coalesce((v_authority ->> 'authorized')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'missing policy checksum was authorized';
  END IF;

  INSERT INTO public.training_answers (
    user_id, game_id, question_id, answer_id, is_correct, level,
    submission_id, session_id, attempt_id, hand_ordinal, decision_ordinal,
    snapshot_key, classification, solver_verified, evidence_metadata
  ) VALUES (
    '11111111-1111-4111-8111-111111111111', 'cash-6max',
    'recovered-old-policy', 'call', true, 2, 'parent-submission',
    'decision-authority-session', '22222222-2222-4222-8222-222222222222',
    1, 1, repeat('1', 64), 'SOLVER_EXACT', true,
    jsonb_build_object('difficultyMode', 'exact', 'policyChecksum', repeat('a', 64))
  );
  IF (SELECT answered_count FROM public.training_question_cache
      WHERE question_id = 'recovered-old-policy') <> 0
     OR NOT EXISTS (
       SELECT 1 FROM public.training_question_events
       WHERE event_type = 'answered' AND question_id = 'recovered-old-policy'
         AND metadata ->> 'immutableSnapshotRecovery' = 'true'
  ) THEN
    RAISE EXCEPTION 'old-policy answer polluted refreshed cache or missed immutable event';
  END IF;

  blocked := false;
  BEGIN
    PERFORM public.fn_training_attempt_record_served_batch_v1(
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      jsonb_build_array(jsonb_build_object(
        'handOrdinal', 1, 'decisionOrdinal', 1,
        'snapshotKey', repeat('1', 64), 'questionId', 'recovered-old-policy',
        'policyChecksum', repeat('a', 64)
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    blocked := position('TRAINING_ATTEMPT_DECISION_ALREADY_ANSWERED' IN SQLERRM) > 0;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'answered slot received a new serve audit'; END IF;

  v_legacy_promotion := public.fn_training_promote_legacy_signed_decision_v1(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111', 1, 1,
    repeat('1', 64), 'recovered-old-policy', repeat('a', 64),
    '19191919-1919-4191-8191-191919191919', extract(epoch FROM now())::bigint,
    extract(epoch FROM now() + interval '1 hour')::bigint
  );
  IF coalesce((v_legacy_promotion ->> 'authorized')::boolean, false) IS TRUE
     OR v_legacy_promotion ->> 'code' <> 'TRAINING_ATTEMPT_DECISION_ALREADY_ANSWERED' THEN
    RAISE EXCEPTION 'answered slot accepted a legacy promotion: %', v_legacy_promotion;
  END IF;

  blocked := false;
  BEGIN
    PERFORM public.fn_training_register_continuation_slot_v1(
      '22222222-2222-4222-8222-222222222222', NULL::uuid, 1, 2,
      repeat('3', 64), repeat('1', 64), 'parent-submission'
    );
  EXCEPTION WHEN OTHERS THEN
    blocked := position('TRAINING_CONTINUATION_SLOT_INPUT_INVALID' IN SQLERRM) > 0;
  END;
  IF NOT blocked OR EXISTS (
    SELECT 1 FROM public.training_attempt_decision_slots
    WHERE attempt_id = '22222222-2222-4222-8222-222222222222'
      AND hand_ordinal = 1 AND decision_ordinal = 2
  ) THEN
    RAISE EXCEPTION 'null owner poisoned a continuation slot';
  END IF;

  blocked := false;
  BEGIN
    UPDATE public.training_delivery_authority_attestations
    SET first_attested_at = first_attested_at - interval '1 minute';
  EXCEPTION WHEN OTHERS THEN
    blocked := position('TRAINING_DELIVERY_AUTHORITY_CUTOVER_IMMUTABLE' IN SQLERRM) > 0;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'delivery authority attestation update was accepted'; END IF;

  v_authority := public.fn_training_authorize_attempt_decision_v1(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111', 2, 1,
    repeat('2', 64), 'never-served-policy', repeat('b', 64)
  );
  IF coalesce((v_authority ->> 'authorized')::boolean, false) IS TRUE
     OR v_authority ->> 'code' <> 'TRAINING_DECISION_NOT_SERVED' THEN
    RAISE EXCEPTION 'never-served manifest snapshot gained delivery authority: %', v_authority;
  END IF;

  PERFORM public.fn_training_cache_record_event(
    'served',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:'
      || encode(extensions.digest('continuation-a', 'sha256'), 'hex'),
    'continuation-a', '11111111-1111-4111-8111-111111111111', NULL,
    jsonb_build_object('requestKey', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    now(), repeat('c', 64)
  );
  v_legacy_continuation := public.fn_training_promote_legacy_signed_decision_v1(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111', 1, 2,
    repeat('3', 64), 'continuation-a', repeat('c', 64),
    '12121212-1212-4121-8121-121212121212', extract(epoch FROM now())::bigint,
    extract(epoch FROM now() + interval '1 hour')::bigint
  );
  IF coalesce((v_legacy_continuation ->> 'authorized')::boolean, false) IS NOT TRUE
     OR NOT EXISTS (
       SELECT 1 FROM public.training_attempt_decision_slots
       WHERE attempt_id = '22222222-2222-4222-8222-222222222222'
         AND hand_ordinal = 1 AND decision_ordinal = 2
         AND snapshot_key = repeat('3', 64)
         AND parent_snapshot_key = repeat('1', 64)
         AND parent_submission_id = 'parent-submission'
     ) THEN
    RAISE EXCEPTION 'verified legacy continuation was not reconstructed: %', v_legacy_continuation;
  END IF;

  v_winner_a := public.fn_training_register_continuation_slot_v1(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111', 1, 2,
    repeat('3', 64), repeat('1', 64), 'parent-submission'
  );
  BEGIN
    PERFORM public.fn_training_register_continuation_slot_v1(
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111', 1, 2,
      repeat('4', 64), repeat('1', 64), 'parent-submission'
    );
  EXCEPTION WHEN check_violation THEN
    blocked := SQLERRM = 'TRAINING_CONTINUATION_SLOT_SNAPSHOT_MISMATCH';
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'a different child snapshot was accepted as the continuation winner';
  END IF;
  blocked := false;
  v_winner_b := public.fn_training_register_continuation_slot_v1(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111', 1, 2,
    repeat('3', 64), repeat('1', 64), 'parent-submission'
  );
  IF v_winner_a ->> 'snapshotKey' <> repeat('3', 64)
     OR v_winner_b ->> 'snapshotKey' <> repeat('3', 64) THEN
    RAISE EXCEPTION 'continuation retry changed the immutable slot winner';
  END IF;
  PERFORM public.fn_training_attempt_record_served_batch_v1(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    jsonb_build_array(jsonb_build_object(
      'handOrdinal', 1, 'decisionOrdinal', 2,
      'snapshotKey', repeat('3', 64), 'questionId', 'continuation-a',
      'policyChecksum', repeat('c', 64)
    ))
  );
  PERFORM public.fn_training_attempt_record_served_batch_v1(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    jsonb_build_array(jsonb_build_object(
      'handOrdinal', 1, 'decisionOrdinal', 2,
      'snapshotKey', repeat('3', 64), 'questionId', 'continuation-a',
      'policyChecksum', repeat('c', 64)
    ))
  );
  IF (SELECT served_count FROM public.training_question_cache
      WHERE question_id = 'continuation-a') <> 1 THEN
    RAISE EXCEPTION 'continuation retry double-counted served audit';
  END IF;
  v_legacy_promotion := public.fn_training_promote_legacy_signed_decision_v1(
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111', 2, 1,
    repeat('2', 64), 'never-served-policy', repeat('b', 64),
    '13131313-1313-4131-8131-131313131313', extract(epoch FROM now())::bigint,
    extract(epoch FROM now() + interval '1 hour')::bigint
  );
  IF coalesce((v_legacy_promotion ->> 'authorized')::boolean, false) IS TRUE
     OR v_legacy_promotion ->> 'code' <> 'TRAINING_LEGACY_PROMOTION_EVENT_MISSING'
     OR EXISTS (
       SELECT 1 FROM public.training_question_events
       WHERE event_type = 'served'
         AND event_key = 'training-attempt:22222222-2222-4222-8222-222222222222:hand:2:decision:1'
     ) THEN
    RAISE EXCEPTION 'missing predecessor event was promoted: %', v_legacy_promotion;
  END IF;
  UPDATE public.training_attempts SET status = 'completed'
  WHERE id = '22222222-2222-4222-8222-222222222222';
  blocked := false;
  BEGIN
    PERFORM public.fn_training_attempt_record_served_batch_v1(
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      jsonb_build_array(jsonb_build_object(
        'handOrdinal', 1, 'decisionOrdinal', 2,
        'snapshotKey', repeat('3', 64), 'questionId', 'continuation-a',
        'policyChecksum', repeat('c', 64)
      ))
    );
  EXCEPTION WHEN OTHERS THEN
    blocked := position('TRAINING_ATTEMPT_NOT_OPEN' IN SQLERRM) > 0;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'closed attempt accepted a served receipt'; END IF;
END;
$$;

-- Simulate time passing without weakening the production trigger. This
-- disposable superuser-only transaction rolls the cutover row back after
-- proving that promotion fails closed once the immutable window expires.
BEGIN;
SET LOCAL session_replication_role = replica;
UPDATE public.training_delivery_authority_cutover
SET applied_at = now() - interval '2 days',
    legacy_accept_until = now() - interval '1 second';
SET LOCAL session_replication_role = origin;
DO $$
DECLARE result jsonb;
BEGIN
  result := public.fn_training_promote_legacy_signed_decision_v1(
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111', 1, 1,
    repeat('5', 64), 'legacy-manifest-question', repeat('5', 64),
    '14141414-1414-4141-8141-141414141414', extract(epoch FROM now())::bigint,
    extract(epoch FROM now() + interval '1 hour')::bigint
  );
  IF coalesce((result ->> 'authorized')::boolean, false) IS TRUE
     OR result ->> 'code' <> 'TRAINING_LEGACY_PROMOTION_WINDOW_CLOSED' THEN
    RAISE EXCEPTION 'expired legacy promotion window remained open: %', result;
  END IF;
END;
$$;
ROLLBACK;

SET ROLE authenticated;
DO $$
DECLARE
  blocked_authorize boolean := false;
  blocked_promote boolean := false;
  blocked_serve boolean := false;
  blocked_register boolean := false;
  blocked_table boolean := false;
  blocked_cutover boolean := false;
  blocked_attestation boolean := false;
BEGIN
  BEGIN
    PERFORM public.fn_training_authorize_attempt_decision_v1(
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111', 1, 1,
      repeat('1', 64), 'recovered-old-policy', repeat('a', 64)
    );
  EXCEPTION WHEN insufficient_privilege THEN blocked_authorize := true;
  END;
  BEGIN
    PERFORM public.fn_training_promote_legacy_signed_decision_v1(
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111', 1, 1,
      repeat('1', 64), 'recovered-old-policy', repeat('a', 64),
      '15151515-1515-4151-8151-151515151515', extract(epoch FROM now())::bigint,
      extract(epoch FROM now() + interval '1 hour')::bigint
    );
  EXCEPTION WHEN insufficient_privilege THEN blocked_promote := true;
  END;
  BEGIN
    PERFORM public.fn_training_attempt_record_served_batch_v1(
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111', '[]'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN blocked_serve := true;
  END;
  BEGIN
    PERFORM public.fn_training_register_continuation_slot_v1(
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111', 1, 2,
      repeat('3', 64), repeat('1', 64), 'parent-submission'
    );
  EXCEPTION WHEN insufficient_privilege THEN blocked_register := true;
  END;
  BEGIN
    PERFORM 1 FROM public.training_attempt_decision_slots LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN blocked_table := true;
  END;
  BEGIN
    PERFORM 1 FROM public.training_delivery_authority_cutover LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN blocked_cutover := true;
  END;
  BEGIN
    PERFORM 1 FROM public.training_delivery_authority_attestations LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN blocked_attestation := true;
  END;
  IF NOT blocked_authorize OR NOT blocked_promote OR NOT blocked_serve
     OR NOT blocked_register OR NOT blocked_table OR NOT blocked_cutover
     OR NOT blocked_attestation THEN
    RAISE EXCEPTION 'authenticated role crossed decision authority ACL';
  END IF;
END;
$$;
RESET ROLE;

SET ROLE service_role;
DO $$
DECLARE
  blocked_slot boolean := false;
  blocked_attestation boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.training_attempt_decision_slots (
      attempt_id, hand_ordinal, decision_ordinal, snapshot_key,
      parent_snapshot_key, parent_submission_id
    ) VALUES (
      '22222222-2222-4222-8222-222222222222', 1, 3,
      repeat('4', 64), repeat('3', 64), 'unauthorized-direct-slot'
    );
  EXCEPTION WHEN insufficient_privilege THEN blocked_slot := true;
  END;
  BEGIN
    INSERT INTO public.training_delivery_authority_attestations (
      contract_version, evidence_event_key, evidence_kind
    ) VALUES (
      'training-attempt-decision-authority-v1', 'unauthorized-direct-attestation',
      'attempt_scoped_serve'
    );
  EXCEPTION WHEN insufficient_privilege THEN blocked_attestation := true;
  END;
  IF NOT blocked_slot THEN RAISE EXCEPTION 'service role bypassed continuation registration RPC'; END IF;
  IF NOT blocked_attestation THEN RAISE EXCEPTION 'service role bypassed delivery attestation RPC boundary'; END IF;
END;
$$;
RESET ROLE;
`;

const LEGACY_BACKFILL_FIXTURE_SQL = String.raw`
INSERT INTO auth.users(id) VALUES ('11111111-1111-4111-8111-111111111111');
INSERT INTO public.training_question_snapshots (
  snapshot_key, source_question_id, game_id, level, content_digest, question_data
) VALUES
  (
    repeat('5', 64), 'legacy-manifest-question', 'cash-6max', 2, repeat('6', 64),
    jsonb_build_object('id', 'legacy-manifest-question', 'policyChecksum', repeat('5', 64))
  ),
  (
    repeat('9', 64), 'legacy-second-chunk-question', 'cash-6max', 2, repeat('9', 64),
    jsonb_build_object('id', 'legacy-second-chunk-question', 'policyChecksum', repeat('9', 64))
  );
INSERT INTO public.training_attempts (
  id, user_id, client_nonce, game_id, level, session_kind, difficulty,
  expected_hands, config_hash, practice_only, status, expires_at
) VALUES
  (
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111', 'legacy-session',
    'cash-6max', 2, 'campaign', 'exact', 1, repeat('7', 64), false,
    'open', now() + interval '1 hour'
  ),
  (
    '99999999-9999-4999-8999-999999999999',
    '11111111-1111-4111-8111-111111111111', 'legacy-second-chunk-session',
    'cash-6max', 2, 'campaign', 'exact', 1, repeat('9', 64), false,
    'open', now() + interval '1 hour'
  );
INSERT INTO public.training_attempt_hands(attempt_id, hand_ordinal, snapshot_key)
VALUES
  ('55555555-5555-4555-8555-555555555555', 1, repeat('5', 64)),
  ('99999999-9999-4999-8999-999999999999', 1, repeat('9', 64));
UPDATE public.training_attempt_hands
SET created_at = now() - interval '2 hours'
WHERE attempt_id IN (
  '55555555-5555-4555-8555-555555555555',
  '99999999-9999-4999-8999-999999999999'
) AND hand_ordinal = 1;
INSERT INTO public.training_question_events (
  event_type, event_key, question_id, user_id, is_correct,
  policy_checksum, metadata, occurred_at
) VALUES
  (
    'served', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:0:'
      || encode(extensions.digest('legacy-manifest-question', 'sha256'), 'hex'),
    'legacy-manifest-question',
    '11111111-1111-4111-8111-111111111111', NULL, repeat('5', 64),
    jsonb_build_object('requestKey', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:0'),
    now() - interval '2 hours'
  ),
  (
    'served', '99999999-9999-4999-8999-999999999999:1:'
      || encode(extensions.digest('legacy-second-chunk-question', 'sha256'), 'hex'),
    'legacy-second-chunk-question',
    '11111111-1111-4111-8111-111111111111', NULL, repeat('9', 64),
    jsonb_build_object('requestKey', '99999999-9999-4999-8999-999999999999:1'),
    now() - interval '2 hours'
  );

-- The predecessor mistake-replay branch created and signed a new immutable
-- replay manifest without recording a new served event. Its completed parent
-- mistake is the only truthful durable replay evidence.
INSERT INTO public.training_attempts (
  id, user_id, client_nonce, game_id, level, session_kind, difficulty,
  expected_hands, config_hash, parent_attempt_id, practice_only, status,
  started_at, expires_at, completed_at
) VALUES
  (
    '66666666-6666-4666-8666-666666666666',
    '11111111-1111-4111-8111-111111111111', 'legacy-replay-parent',
    'cash-6max', 2, 'campaign', 'exact', 1, repeat('8', 64), NULL, false,
    'open', now() - interval '3 hours', now() + interval '21 hours', NULL
  ),
  (
    '77777777-7777-4777-8777-777777777777',
    '11111111-1111-4111-8111-111111111111', 'legacy-replay-child',
    'cash-6max', 2, 'replay', 'exact', 1, repeat('9', 64),
    '66666666-6666-4666-8666-666666666666', true,
    'open', now() - interval '1 hour', now() + interval '23 hours', NULL
  );
INSERT INTO public.training_attempt_hands(
  attempt_id, hand_ordinal, snapshot_key, status, result_is_correct, scored_at
) VALUES
  (
    '66666666-6666-4666-8666-666666666666', 1, repeat('5', 64),
    'scored', false, now() - interval '2 hours 45 minutes'
  ),
  (
    '77777777-7777-4777-8777-777777777777', 1, repeat('5', 64),
    'allocated', NULL, NULL
  );
INSERT INTO public.training_answers (
  user_id, game_id, question_id, answer_id, is_correct, level,
  submission_id, session_id, attempt_id, hand_ordinal, decision_ordinal,
  snapshot_key, classification, solver_verified, evidence_metadata,
  answered_at
) VALUES (
  '11111111-1111-4111-8111-111111111111', 'cash-6max',
  'legacy-manifest-question', 'fold', false, 2,
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'legacy-replay-parent',
  '66666666-6666-4666-8666-666666666666', 1, 1, repeat('5', 64),
  'SOLVER_EXACT', true,
  jsonb_build_object('difficultyMode', 'exact', 'policyChecksum', repeat('5', 64)),
  now() - interval '2 hours 45 minutes'
);
UPDATE public.training_attempts
SET status = 'completed', completed_at = now() - interval '2 hours 30 minutes'
WHERE id = '66666666-6666-4666-8666-666666666666';
`;

const EXPANSION_OVERLAP_SQL = String.raw`
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.training_delivery_authority_attestations) THEN
    RAISE EXCEPTION 'contract enforcement attested before the dual-write application ran';
  END IF;
END;
$$;
INSERT INTO public.training_question_snapshots (
  snapshot_key, source_question_id, game_id, level, content_digest, question_data
) VALUES
  (
    repeat('8', 64), 'schema-first-predecessor-question', 'cash-6max', 2,
    repeat('8', 64),
    jsonb_build_object('id', 'schema-first-predecessor-question', 'policyChecksum', repeat('8', 64))
  ),
  (
    repeat('7', 64), 'schema-first-predecessor-continuation', 'cash-6max', 2,
    repeat('7', 64),
    jsonb_build_object('id', 'schema-first-predecessor-continuation', 'policyChecksum', repeat('7', 64))
  );
INSERT INTO public.training_attempts (
  id, user_id, client_nonce, game_id, level, session_kind, difficulty,
  expected_hands, config_hash, practice_only, status, expires_at
) VALUES (
  '88888888-8888-4888-8888-888888888888',
  '11111111-1111-4111-8111-111111111111', 'schema-first-predecessor',
  'cash-6max', 2, 'campaign', 'exact', 1, repeat('8', 64), false,
  'open', now() + interval '1 hour'
);
INSERT INTO public.training_attempt_hands(attempt_id, hand_ordinal, snapshot_key)
VALUES ('88888888-8888-4888-8888-888888888888', 1, repeat('8', 64));

-- Exact predecessor write shape: no attempt-scoped served event. The PR-A
-- expansion migration is present, but its dual-write application has not run.
INSERT INTO public.training_answers (
  user_id, game_id, question_id, answer_id, is_correct, level,
  submission_id, session_id, attempt_id, hand_ordinal, decision_ordinal,
  snapshot_key, classification, solver_verified, evidence_metadata
) VALUES (
  '11111111-1111-4111-8111-111111111111', 'cash-6max',
  'schema-first-predecessor-question', 'fold', false, 2,
  '88888888-8888-4888-8888-888888888888', 'schema-first-predecessor',
  '88888888-8888-4888-8888-888888888888', 1, 1, repeat('8', 64),
  'SOLVER_EXACT', true,
  jsonb_build_object('difficultyMode', 'exact', 'policyChecksum', repeat('8', 64))
);
-- The predecessor next-street endpoint did not register the new decision-slot
-- table. Expansion must preserve this exact continuation write too.
INSERT INTO public.training_answers (
  user_id, game_id, question_id, answer_id, is_correct, level,
  submission_id, session_id, attempt_id, hand_ordinal, decision_ordinal,
  snapshot_key, classification, solver_verified, evidence_metadata
) VALUES (
  '11111111-1111-4111-8111-111111111111', 'cash-6max',
  'schema-first-predecessor-continuation', 'call', true, 2,
  '87878787-8787-4787-8787-878787878787', 'schema-first-predecessor',
  '88888888-8888-4888-8888-888888888888', 1, 2, repeat('7', 64),
  'SOLVER_EXACT', true,
  jsonb_build_object('difficultyMode', 'exact', 'policyChecksum', repeat('7', 64))
);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.training_answers
      WHERE attempt_id = '88888888-8888-4888-8888-888888888888') <> 2
     OR EXISTS (
       SELECT 1 FROM public.training_attempt_decision_slots
       WHERE attempt_id = '88888888-8888-4888-8888-888888888888'
     ) THEN
    RAISE EXCEPTION 'expansion blocked or silently rewired the predecessor answer writer';
  END IF;
END;
$$;
DELETE FROM public.training_attempts
WHERE id = '88888888-8888-4888-8888-888888888888';
DELETE FROM public.training_question_snapshots
WHERE snapshot_key IN (repeat('8', 64), repeat('7', 64));
`;

const BEHAVIOR_SQL = String.raw`
INSERT INTO public.training_question_cache (
  question_id, quality_status, policy_checksum
) VALUES (
  'immutable-question-1', 'active', repeat('a', 64)
);

DO $$
DECLARE
  first_result jsonb;
  replay_result jsonb;
  answered_result jsonb;
  v_event_key text := 'training-attempt:22222222-2222-4222-8222-222222222222:'
    || encode(extensions.digest('immutable-question-1', 'sha256'), 'hex');
  blocked boolean;
BEGIN
  first_result := public.fn_training_cache_record_served_batch(
    'training-attempt:22222222-2222-4222-8222-222222222222',
    jsonb_build_array(jsonb_build_object(
      'questionId', 'immutable-question-1',
      'policyChecksum', repeat('a', 64)
    )),
    '11111111-1111-4111-8111-111111111111'
  );
  IF (first_result ->> 'inserted')::integer <> 1
     OR (SELECT served_count FROM public.training_question_cache
         WHERE question_id = 'immutable-question-1') <> 1
     OR (SELECT count(*) FROM public.training_question_events
         WHERE event_type = 'served' AND event_key = v_event_key) <> 1 THEN
    RAISE EXCEPTION 'initial immutable serve receipt failed: %', first_result;
  END IF;

  answered_result := public.fn_training_cache_record_event(
    'answered', 'answer-replay-1', 'immutable-question-1',
    '11111111-1111-4111-8111-111111111111', true,
    '{}'::jsonb, now(), repeat('a', 64)
  );
  IF answered_result ->> 'inserted' <> 'true' THEN
    RAISE EXCEPTION 'initial immutable answer receipt failed: %', answered_result;
  END IF;

  DELETE FROM public.training_question_cache
  WHERE question_id = 'immutable-question-1';

  replay_result := public.fn_training_cache_record_served_batch(
    'training-attempt:22222222-2222-4222-8222-222222222222',
    jsonb_build_array(jsonb_build_object(
      'questionId', 'immutable-question-1',
      'policyChecksum', repeat('a', 64)
    )),
    '11111111-1111-4111-8111-111111111111'
  );
  IF (replay_result ->> 'inserted')::integer <> 0
     OR (replay_result ->> 'duplicates')::integer <> 1
     OR (SELECT count(*) FROM public.training_question_events
         WHERE event_type = 'served' AND event_key = v_event_key) <> 1 THEN
    RAISE EXCEPTION 'cache-independent immutable replay failed: %', replay_result;
  END IF;

  blocked := false;
  BEGIN
    PERFORM public.fn_training_cache_record_event(
      'served', v_event_key, 'changed-question',
      '11111111-1111-4111-8111-111111111111', NULL,
      '{}'::jsonb, now(), repeat('a', 64)
    );
  EXCEPTION WHEN OTHERS THEN
    blocked := position('training_cache_event_binding_mismatch' IN SQLERRM) > 0;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'changed question replay was accepted'; END IF;

  blocked := false;
  BEGIN
    PERFORM public.fn_training_cache_record_event(
      'served', v_event_key, 'immutable-question-1',
      '33333333-3333-4333-8333-333333333333', NULL,
      '{}'::jsonb, now(), repeat('a', 64)
    );
  EXCEPTION WHEN OTHERS THEN
    blocked := position('training_cache_event_binding_mismatch' IN SQLERRM) > 0;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'changed user replay was accepted'; END IF;

  blocked := false;
  BEGIN
    PERFORM public.fn_training_cache_record_event(
      'served', v_event_key, 'immutable-question-1',
      '11111111-1111-4111-8111-111111111111', NULL,
      '{}'::jsonb, now(), repeat('b', 64)
    );
  EXCEPTION WHEN OTHERS THEN
    blocked := position('training_cache_event_binding_mismatch' IN SQLERRM) > 0;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'changed checksum replay was accepted'; END IF;

  blocked := false;
  BEGIN
    PERFORM public.fn_training_cache_record_event(
      'answered', 'answer-replay-1', 'immutable-question-1',
      '11111111-1111-4111-8111-111111111111', false,
      '{}'::jsonb, now(), repeat('a', 64)
    );
  EXCEPTION WHEN OTHERS THEN
    blocked := position('training_cache_event_binding_mismatch' IN SQLERRM) > 0;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'changed verdict replay was accepted'; END IF;

  blocked := false;
  BEGIN
    PERFORM public.fn_training_cache_record_event(
      'served', 'never-delivered-key', 'immutable-question-1',
      '11111111-1111-4111-8111-111111111111', NULL,
      '{}'::jsonb, now(), repeat('a', 64)
    );
  EXCEPTION WHEN OTHERS THEN
    blocked := position('training_cache_event_question_not_active' IN SQLERRM) > 0;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'a new receipt bypassed active cache authority'; END IF;
END;
$$;

SET ROLE authenticated;
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    PERFORM public.fn_training_cache_record_event(
      'served', 'unauthorized', 'immutable-question-1', NULL, NULL,
      '{}'::jsonb, now(), repeat('a', 64)
    );
  EXCEPTION WHEN insufficient_privilege THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'authenticated could execute immutable event authority'; END IF;
END;
$$;
RESET ROLE;

SELECT jsonb_build_object(
  'eventRows', (SELECT count(*) FROM public.training_question_events),
  'cacheRows', (SELECT count(*) FROM public.training_question_cache),
  'immutableServeReplay', true,
  'changedBindingsBlocked', true,
  'newInactiveReceiptBlocked', true,
  'authenticatedExecuteBlocked', true,
  'schemaFirstPredecessorWritePreserved', true,
  'twoProtectedPrExpandContractStaging', true,
  'legacyPromotionCannotAttestDualWrite', true,
  'deliveryAttestationImmutableAndPrivate', true,
  'legacyReceiptRequiresRfc4122V4', true,
  'legacyHelperChunkZeroSupported', true,
  'legacyHelperChunkOneSupported', true,
  'legacyDirectUuidSupported', true,
  'legacyHandTimeRecoveryProved', true,
  'legacyReplayParentProofRequired', true,
  'legacyRandomKeyRequiresSignedPromotion', true,
  'legacyContinuationReconstructed', true,
  'legacyPromotionWindowBounded', true,
  'nullOwnerPoisoningBlocked', true,
  'deliveryCutoverImmutable', true,
  'recoveredOldPolicyFirstAnswer', true,
  'neverServedSnapshotAuthorizationDenied', true,
  'answeredSlotRefused', true,
  'continuationWinnerIdempotent', true
) AS training_cache_replay_evidence;
`;

const postgresBin = resolvePostgresBin();
const tempRoot = mkdtempSync(path.join(tmpdir(), 'sp-training-cache-replay-'));
const dataDir = path.join(tempRoot, 'data');
const port = await reservePort();
let started = false;
const tool = (name) => path.join(postgresBin, name);
const connection = ['-h', tempRoot, '-p', String(port), '-d', 'phase6_cache_replay'];

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
  command(tool('createdb'), ['-h', tempRoot, '-p', String(port), 'phase6_cache_replay'], { quiet: true });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: BASELINE_SQL,
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', MIGRATION], {
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', MIGRATION], {
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: LEGACY_BACKFILL_FIXTURE_SQL,
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', DECISION_AUTHORITY_MIGRATION], {
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', DECISION_AUTHORITY_MIGRATION], {
    quiet: true,
  });
  // Protected PR A: expansion plus the dual-write application. Before the
  // later contract PR exists, both initial and continuation predecessor writes
  // must still pass under the exact predecessor validator.
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: EXPANSION_OVERLAP_SQL,
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: DECISION_BEHAVIOR_SQL,
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
  if (!evidenceLine) throw new Error(`Cache replay verifier emitted no evidence.\n${evidence.stdout}`);
  console.log(`Phase 6 Training cache replay verification passed: ${evidenceLine}`);
} finally {
  if (started) {
    spawnSync(tool('pg_ctl'), ['-D', dataDir, '-m', 'fast', 'stop'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  }
  if (tempRoot.startsWith(`${tmpdir()}${path.sep}sp-training-cache-replay-`)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
