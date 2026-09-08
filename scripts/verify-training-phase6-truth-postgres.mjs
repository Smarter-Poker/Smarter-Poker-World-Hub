#!/usr/bin/env node

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION_072000 = path.join(
  ROOT,
  'supabase/migrations/20260907200000_training_cache_event_idempotent_replay.sql',
);
const MIGRATION_072030 = path.join(
  ROOT,
  'supabase/migrations/20260907203000_training_attempt_decision_delivery_authority.sql',
);
const MIGRATION_CLOSEOUT = path.join(
  ROOT,
  'supabase/migrations/20260908151000_training_phase6_cache_and_level_stats_authority.sql',
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
  if (!quiet && result.stdout) process.stdout.write(result.stdout);
  return result;
}

function resolvePostgresBin() {
  const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
  const candidates = [
    process.env.PHASE6_POSTGRES_BIN,
    pgConfig.status === 0 ? pgConfig.stdout.trim() : null,
    '/opt/homebrew/opt/postgresql@17/bin',
    '/usr/local/opt/postgresql@17/bin',
    '/usr/lib/postgresql/17/bin',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!['postgres', 'initdb', 'pg_ctl', 'psql', 'createdb'].every((name) => (
      existsSync(path.join(candidate, name))
    ))) continue;
    const version = spawnSync(path.join(candidate, 'postgres'), ['--version'], {
      encoding: 'utf8',
    });
    if (version.status === 0 && /\b17\.\d+\b/.test(version.stdout)) return candidate;
  }
  throw new Error('PostgreSQL 17 binaries are required for the Phase 6 truth verifier.');
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function sourceFromOriginOrDisk(relativePath) {
  const diskPath = path.join(ROOT, relativePath);
  if (existsSync(diskPath)) return readFileSync(diskPath, 'utf8');
  const result = spawnSync('git', ['show', `origin/main:${relativePath}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`Unable to read ${relativePath} from disk or origin/main.\n${result.stderr}`);
  }
  return result.stdout;
}

function extractFunction(source, functionName) {
  const marker = `CREATE OR REPLACE FUNCTION public.${functionName}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${marker}`);
  const bodyStart = source.indexOf('AS $$', start);
  const end = source.indexOf('\n$$;', bodyStart);
  if (bodyStart < 0 || end < 0) throw new Error(`Could not isolate ${functionName}`);
  return source.slice(start, end + 4);
}

const truthEnforcement = sourceFromOriginOrDisk(
  'supabase/migrations/20260907070000_training_cache_truth_enforcement.sql',
);
const eventIntegrity = sourceFromOriginOrDisk(
  'supabase/migrations/20260908140000_training_cache_event_integrity.sql',
);
const predecessorSql = [
  extractFunction(truthEnforcement, 'fn_training_cache_grade'),
  extractFunction(truthEnforcement, 'fn_training_answer_cache_event'),
  `DROP TRIGGER IF EXISTS training_answer_cache_event ON public.training_answers;
   CREATE TRIGGER training_answer_cache_event
   AFTER INSERT ON public.training_answers
   FOR EACH ROW EXECUTE FUNCTION public.fn_training_answer_cache_event();`,
].join('\n\n');
const upstreamIntegritySql = [
  `ALTER TABLE public.training_question_events
     ADD COLUMN IF NOT EXISTS binding_status text NOT NULL DEFAULT 'CHECKSUM_BOUND';
   ALTER TABLE public.training_question_events
     DROP CONSTRAINT IF EXISTS training_question_events_binding_status_check,
     DROP CONSTRAINT IF EXISTS training_question_events_binding_metadata_check,
     ADD CONSTRAINT training_question_events_binding_status_check
       CHECK (binding_status IN ('CHECKSUM_BOUND', 'HISTORICAL_UNBOUND')),
     ADD CONSTRAINT training_question_events_binding_metadata_check CHECK (
       (binding_status = 'HISTORICAL_UNBOUND'
         AND metadata @> '{"historicalPolicyBinding":false}'::jsonb)
       OR (binding_status = 'CHECKSUM_BOUND'
         AND NOT metadata @> '{"historicalPolicyBinding":false}'::jsonb)
     );`,
  extractFunction(eventIntegrity, 'fn_training_cache_record_event'),
  extractFunction(eventIntegrity, 'fn_training_answer_cache_event'),
  extractFunction(eventIntegrity, 'fn_training_answer_reject_mutation'),
  `DROP TRIGGER IF EXISTS training_answer_cache_event ON public.training_answers;
   CREATE TRIGGER training_answer_cache_event
   AFTER INSERT ON public.training_answers
   FOR EACH ROW EXECUTE FUNCTION public.fn_training_answer_cache_event();
   DROP TRIGGER IF EXISTS training_answer_reject_mutation ON public.training_answers;
   CREATE TRIGGER training_answer_reject_mutation
   BEFORE UPDATE ON public.training_answers
   FOR EACH ROW EXECUTE FUNCTION public.fn_training_answer_reject_mutation();
   REVOKE ALL PRIVILEGES ON TABLE public.training_question_events FROM service_role;
   GRANT SELECT ON TABLE public.training_question_events TO service_role;
   REVOKE ALL ON FUNCTION public.fn_training_cache_record_event(
     text,text,text,uuid,boolean,jsonb,timestamptz,text
   ) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.fn_training_cache_record_event(
     text,text,text,uuid,boolean,jsonb,timestamptz,text
   ) TO service_role;
   REVOKE ALL ON FUNCTION public.fn_training_answer_cache_event()
     FROM PUBLIC, anon, authenticated, service_role;
   REVOKE ALL ON FUNCTION public.fn_training_answer_reject_mutation()
     FROM PUBLIC, anon, authenticated, service_role;`,
].join('\n\n');

const BASELINE_SQL = String.raw`
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$$;
CREATE SCHEMA extensions;
CREATE SCHEMA auth;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE SET search_path = pg_catalog
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog
AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;

CREATE TABLE public.training_question_cache (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  question_id text NOT NULL UNIQUE,
  question_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  canonical_policy jsonb NOT NULL,
  source_classification text NOT NULL,
  policy_version text NOT NULL,
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
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
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
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
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
  solver_verified boolean NOT NULL DEFAULT false,
  solver_source text,
  selected_frequency numeric,
  optimal_frequency numeric,
  ev_loss_measured boolean NOT NULL DEFAULT false,
  ev_loss numeric NOT NULL DEFAULT 0,
  evidence_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX training_answers_attempt_decision_key
  ON public.training_answers(attempt_id, hand_ordinal, decision_ordinal)
  WHERE attempt_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_training_cache_policy_seal_is_valid(p_policy jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT jsonb_typeof(p_policy) = 'object'
    AND p_policy ->> 'contractVersion' = 'smarter-poker.solver-policy.v1'
    AND jsonb_typeof(p_policy -> 'actions') = 'array'
    AND jsonb_typeof(p_policy -> 'distribution') = 'object'
    AND p_policy ->> 'policyVersion' = 'truth-verifier-v1'
    AND p_policy #>> '{sourceArtifact,sourceArtifactChecksum}' ~ '^[0-9a-f]{64}$'
$$;

CREATE OR REPLACE FUNCTION public.get_user_level_stats(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog
AS $$ SELECT jsonb_build_object('compatibility', true, 'userId', p_user_id) $$;

-- Mirror the insecure overload already present in production before this
-- closeout: invoker rights, caller-supplied user id, and broad default ACL.
CREATE OR REPLACE FUNCTION public.get_user_level_stats(
  p_user_id uuid,
  p_level_id integer
)
RETURNS TABLE (
  total_questions bigint,
  correct_answers bigint,
  accuracy numeric,
  avg_ev_loss numeric
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT 999::bigint, 999::bigint, 99.99::numeric, 99.99::numeric
$$;
GRANT EXECUTE ON FUNCTION public.get_user_level_stats(uuid,integer)
  TO PUBLIC, anon, authenticated, service_role;
`;

const FIXTURE_SQL = String.raw`
CREATE OR REPLACE FUNCTION public.test_training_policy(p_variant text DEFAULT 'canonical')
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE
  v_actions jsonb;
  v_distribution jsonb;
  v_evs jsonb;
BEGIN
  v_actions := jsonb_build_array(
    jsonb_build_object('id','x','family','check','legal',true,
      'size',jsonb_build_object('potFraction',NULL)),
    jsonb_build_object('id','b25','family','bet','legal',true,
      'size',jsonb_build_object('potFraction',0.25)),
    jsonb_build_object('id','b60','family','bet','legal',true,
      'size',jsonb_build_object('potFraction',0.60)),
    jsonb_build_object('id','b150','family','bet','legal',true,
      'size',jsonb_build_object('potFraction',1.50))
  );
  v_distribution := jsonb_build_object('x',0.10,'b25',0.20,'b60',0.60,'b150',0.10);
  v_evs := jsonb_build_object('x',0.00,'b25',0.10,'b60',0.30,'b150',-0.40);
  IF p_variant = 'overcomplete' THEN
    v_actions := v_actions || jsonb_build_array(
      jsonb_build_object('id','b95','family','bet','legal',true,
        'size',jsonb_build_object('potFraction',0.95))
    );
    v_distribution := jsonb_build_object(
      'x',0.10,'b25',0.20,'b60',0.50,'b95',0.15,'b150',0.05
    );
    v_evs := jsonb_build_object(
      'x',0.00,'b25',0.10,'b60',0.30,'b95',0.20,'b150',-0.40
    );
  ELSIF p_variant = 'replacement' THEN
    v_distribution := jsonb_build_object('x',0.70,'b25',0.10,'b60',0.10,'b150',0.10);
  END IF;
  RETURN jsonb_build_object(
    'contractVersion','smarter-poker.solver-policy.v1',
    'policyVersion','truth-verifier-v1',
    'qualitySeal','SOLVER_EXACT',
    'actions',v_actions,
    'distribution',v_distribution,
    'chipEv',jsonb_build_object(
      'measuredByAction',true,
      'byAction',v_evs
    ),
    'sourceArtifact',jsonb_build_object(
      'system','truth-verifier-solver',
      'sourceArtifactChecksum',repeat('d',64)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.test_policy_checksum(p_policy jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT encode(extensions.digest(p_policy::text,'sha256'),'hex')
$$;

CREATE OR REPLACE FUNCTION public.test_training_question(
  p_question_id text,
  p_policy jsonb,
  p_correct_answer text DEFAULT 'b60'
)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object(
    'id', p_question_id,
    'dataQuality','SOLVER_EXACT',
    'sourceClassification','SOLVER_EXACT',
    'correctAnswer',p_correct_answer,
    'options',(
      SELECT jsonb_agg(jsonb_build_object('id', action ->> 'id', 'text', action ->> 'id'))
      FROM jsonb_array_elements(p_policy -> 'actions') AS action
    ),
    'solverPolicy',p_policy,
    'policyChecksum',encode(extensions.digest(p_policy::text,'sha256'),'hex')
  )
$$;

INSERT INTO auth.users(id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

WITH fixtures(question_id, snapshot_key, attempt_id, nonce, difficulty) AS (
  VALUES
    ('raw-attempt', repeat('1',64), '10000000-0000-4000-8000-000000000001'::uuid, 'raw-session', 'exact'),
    ('grouped-attempt', repeat('2',64), '10000000-0000-4000-8000-000000000002'::uuid, 'grouped-session', 'grouped'),
    ('rng-attempt', repeat('3',64), '10000000-0000-4000-8000-000000000003'::uuid, 'rng-session', 'grouped'),
    ('stale-attempt', repeat('4',64), '10000000-0000-4000-8000-000000000004'::uuid, 'stale-session', 'exact')
), policy AS (
  SELECT public.test_training_policy() AS value
)
INSERT INTO public.training_question_snapshots(
  snapshot_key,source_question_id,game_id,level,content_digest,question_data
)
SELECT snapshot_key,question_id,'cash-001',2,repeat('a',64),
  public.test_training_question(question_id,policy.value)
FROM fixtures CROSS JOIN policy;

WITH fixtures(attempt_id, nonce, difficulty, snapshot_key) AS (
  VALUES
    ('10000000-0000-4000-8000-000000000001'::uuid, 'raw-session', 'exact', repeat('1',64)),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'grouped-session', 'grouped', repeat('2',64)),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'rng-session', 'grouped', repeat('3',64)),
    ('10000000-0000-4000-8000-000000000004'::uuid, 'stale-session', 'exact', repeat('4',64))
)
INSERT INTO public.training_attempts(
  id,user_id,client_nonce,game_id,level,session_kind,difficulty,
  expected_hands,config_hash,practice_only,status,expires_at
)
SELECT attempt_id,'11111111-1111-4111-8111-111111111111',nonce,
  'cash-001',2,'campaign',difficulty,1,repeat('c',64),false,'open',now()+interval '1 hour'
FROM fixtures;

INSERT INTO public.training_attempt_hands(attempt_id,hand_ordinal,snapshot_key)
SELECT id,1,CASE client_nonce
  WHEN 'raw-session' THEN repeat('1',64)
  WHEN 'grouped-session' THEN repeat('2',64)
  WHEN 'rng-session' THEN repeat('3',64)
  ELSE repeat('4',64) END
FROM public.training_attempts;

WITH policy AS (SELECT public.test_training_policy() AS value), fixtures(question_id) AS (
  VALUES ('raw-active'),('raw-attempt'),('grouped-attempt'),('rng-attempt'),('stale-attempt')
)
INSERT INTO public.training_question_cache(
  question_id,question_data,canonical_policy,source_classification,
  policy_version,quality_status,policy_checksum
)
SELECT question_id,public.test_training_question(question_id,policy.value),policy.value,
  'SOLVER_EXACT','truth-verifier-v1','active',
  encode(extensions.digest(policy.value::text,'sha256'),'hex')
FROM fixtures CROSS JOIN policy;

SELECT public.fn_training_attempt_record_served_batch_v1(
  attempt.id,attempt.user_id,
  jsonb_build_array(jsonb_build_object(
    'handOrdinal',1,'decisionOrdinal',1,
    'snapshotKey',hand.snapshot_key,
    'questionId',snapshot.source_question_id,
    'policyChecksum',snapshot.question_data ->> 'policyChecksum',
    'difficultyMode',attempt.difficulty,
    'rngRolls',jsonb_build_object('low',95,'high',6)
  ))
)
FROM public.training_attempts attempt
JOIN public.training_attempt_hands hand ON hand.attempt_id=attempt.id
JOIN public.training_question_snapshots snapshot ON snapshot.snapshot_key=hand.snapshot_key;

DO $$
DECLARE
  v_policy jsonb := public.test_training_policy('overcomplete');
  v_question jsonb;
  v_grade jsonb;
BEGIN
  v_question := public.test_training_question('overcomplete',v_policy,'b150');
  v_grade := public.fn_training_grade_delivered_policy_v1(
    v_policy,v_question,'x','grouped',NULL
  );
  IF coalesce((v_grade ->> 'valid')::boolean,false) THEN
    RAISE EXCEPTION 'the unserved fifth grouped option was accepted';
  END IF;
  v_grade := public.fn_training_grade_delivered_policy_v1(
    v_policy,v_question,'grouped_large','grouped',NULL
  );
  IF coalesce((v_grade ->> 'valid')::boolean,false) IS NOT TRUE
     OR (v_grade ->> 'selectedFrequency')::numeric <> 15 THEN
    RAISE EXCEPTION 'the policy-derived 81-100%% group was not preserved: %',v_grade;
  END IF;
  v_grade := public.fn_training_grade_delivered_policy_v1(
    public.test_training_policy(),
    public.test_training_question('grouped-attempt',public.test_training_policy()),
    'grouped_overbet','grouped',jsonb_build_object('mode','low','roll',95)
  );
  IF v_grade ->> 'rngTargetAction' <> 'grouped_overbet' THEN
    RAISE EXCEPTION 'the database did not independently resolve the RNG target: %',v_grade;
  END IF;
END;
$$;

-- Preserve the immutable snapshot, but replace the mutable cache policy before
-- its answer. The trigger must grade the delivered snapshot and avoid writing
-- counters to this replacement row.
WITH replacement AS (SELECT public.test_training_policy('replacement') AS value)
UPDATE public.training_question_cache cache
SET canonical_policy=replacement.value,
    question_data=public.test_training_question(cache.question_id,replacement.value,'x'),
    policy_checksum=encode(extensions.digest(replacement.value::text,'sha256'),'hex')
FROM replacement
WHERE cache.question_id='stale-attempt';

CREATE OR REPLACE FUNCTION public.test_attempt_answer(
  p_attempt_id uuid,
  p_selected text,
  p_rng jsonb DEFAULT NULL,
  p_mutation text DEFAULT NULL,
  p_expected_error text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  v_attempt public.training_attempts%ROWTYPE;
  v_snapshot public.training_question_snapshots%ROWTYPE;
  v_policy jsonb;
  v_grade jsonb;
  v_answer_id uuid := extensions.gen_random_uuid();
  v_is_correct boolean;
  v_classification text;
  v_selected_frequency numeric;
  v_optimal_frequency numeric;
  v_ev_loss numeric;
  v_evidence jsonb;
  v_error text;
BEGIN
  SELECT * INTO v_attempt FROM public.training_attempts WHERE id=p_attempt_id;
  SELECT snapshot.* INTO v_snapshot
  FROM public.training_attempt_hands hand
  JOIN public.training_question_snapshots snapshot ON snapshot.snapshot_key=hand.snapshot_key
  WHERE hand.attempt_id=p_attempt_id AND hand.hand_ordinal=1;
  v_policy := v_snapshot.question_data -> 'solverPolicy';
  v_grade := public.fn_training_grade_delivered_policy_v1(
    v_policy,v_snapshot.question_data,p_selected,v_attempt.difficulty,p_rng
  );
  v_is_correct := (v_grade ->> 'isCorrect')::boolean;
  v_classification := v_grade ->> 'classification';
  v_selected_frequency := (v_grade ->> 'selectedFrequency')::numeric;
  v_optimal_frequency := (v_grade ->> 'optimalFrequency')::numeric;
  v_ev_loss := coalesce((v_grade ->> 'evLoss')::numeric,0);
  v_evidence := jsonb_build_object(
    'gradeMode',CASE WHEN p_rng IS NULL THEN 'solver-decision' ELSE 'rng-adherence' END,
    'difficultyMode',v_attempt.difficulty,
    'policyChecksum',v_snapshot.question_data ->> 'policyChecksum',
    'policyVersion',v_grade ->> 'policyVersion',
    'dataQuality','SOLVER_EXACT',
    'sourceChecksum',v_grade ->> 'sourceChecksum',
    'canonicalSolverClassification',v_grade ->> 'canonicalClassification',
    'canonicalSolverIsCorrect',(v_grade ->> 'canonicalIsCorrect')::boolean
  );
  IF p_rng IS NOT NULL THEN
    v_evidence := v_evidence || jsonb_build_object(
      'rng',p_rng || jsonb_build_object('targetActionId',v_grade ->> 'rngTargetAction')
    );
  END IF;
  CASE p_mutation
    WHEN 'grade' THEN v_is_correct := NOT v_is_correct;
    WHEN 'frequency' THEN v_selected_frequency := v_selected_frequency + 1;
    WHEN 'ev' THEN v_ev_loss := v_ev_loss + 0.125;
    WHEN 'lineage' THEN v_evidence := jsonb_set(v_evidence,'{policyVersion}','"forged"');
    WHEN 'source-checksum' THEN v_evidence := jsonb_set(
      v_evidence,'{sourceChecksum}',to_jsonb(repeat('f',64))
    );
    WHEN 'difficulty' THEN v_evidence := jsonb_set(v_evidence,'{difficultyMode}','"exact"');
    WHEN 'rng-roll' THEN v_evidence := jsonb_set(v_evidence,'{rng,roll}','94');
    WHEN 'rng-target' THEN v_evidence := jsonb_set(v_evidence,'{rng,targetActionId}','"x"');
    ELSE NULL;
  END CASE;
  BEGIN
    INSERT INTO public.training_answers(
      id,user_id,game_id,question_id,answer_id,is_correct,level,submission_id,
      session_id,attempt_id,hand_ordinal,decision_ordinal,snapshot_key,
      classification,solver_verified,solver_source,selected_frequency,
      optimal_frequency,ev_loss_measured,ev_loss,evidence_metadata
    ) VALUES (
      v_answer_id,v_attempt.user_id,v_attempt.game_id,v_snapshot.source_question_id,
      p_selected,v_is_correct,v_attempt.level,'truth:'||v_answer_id::text,
      v_attempt.client_nonce,v_attempt.id,1,1,v_snapshot.snapshot_key,
      v_classification,(v_grade ->> 'solverVerified')::boolean,
      v_grade ->> 'solverSource',v_selected_frequency,v_optimal_frequency,
      (v_grade ->> 'evLossMeasured')::boolean,v_ev_loss,v_evidence
    );
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  IF p_expected_error IS NULL AND v_error IS NOT NULL THEN
    RAISE EXCEPTION 'valid attempt answer failed: %',v_error;
  ELSIF p_expected_error IS NOT NULL AND (
    v_error IS NULL OR position(p_expected_error IN v_error)=0
  ) THEN
    RAISE EXCEPTION 'expected %, received %',p_expected_error,coalesce(v_error,'success');
  END IF;
  RETURN CASE WHEN v_error IS NULL THEN v_answer_id ELSE NULL END;
END;
$$;

CREATE OR REPLACE FUNCTION public.test_active_answer(
  p_mutation text DEFAULT NULL,
  p_expected_error text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  v_cache public.training_question_cache%ROWTYPE;
  v_grade jsonb;
  v_answer_id uuid := extensions.gen_random_uuid();
  v_is_correct boolean;
  v_selected_frequency numeric;
  v_ev_loss numeric;
  v_evidence jsonb;
  v_error text;
BEGIN
  SELECT * INTO v_cache FROM public.training_question_cache WHERE question_id='raw-active';
  v_grade := public.fn_training_cache_grade(v_cache.canonical_policy,'b60');
  v_is_correct := (v_grade ->> 'isCorrect')::boolean;
  v_selected_frequency := (v_grade ->> 'selectedFrequency')::numeric;
  v_ev_loss := coalesce((v_grade ->> 'evLoss')::numeric,0);
  v_evidence := jsonb_build_object(
    'policyChecksum',v_cache.policy_checksum,
    'policyVersion',v_grade ->> 'policyVersion',
    'dataQuality',v_cache.source_classification,
    'sourceChecksum',v_grade ->> 'sourceChecksum'
  );
  CASE p_mutation
    WHEN 'grade' THEN v_is_correct := NOT v_is_correct;
    WHEN 'frequency' THEN v_selected_frequency := v_selected_frequency + 1;
    WHEN 'ev' THEN v_ev_loss := v_ev_loss + 0.125;
    WHEN 'lineage' THEN v_evidence := jsonb_set(v_evidence,'{dataQuality}','"forged"');
    WHEN 'source-checksum' THEN v_evidence := jsonb_set(
      v_evidence,'{sourceChecksum}',to_jsonb(repeat('f',64))
    );
    ELSE NULL;
  END CASE;
  BEGIN
    INSERT INTO public.training_answers(
      id,user_id,game_id,question_id,answer_id,is_correct,level,submission_id,
      classification,solver_verified,solver_source,selected_frequency,
      optimal_frequency,ev_loss_measured,ev_loss,evidence_metadata
    ) VALUES (
      v_answer_id,'11111111-1111-4111-8111-111111111111','cash-001','raw-active',
      'b60',v_is_correct,2,'truth:'||v_answer_id::text,v_grade ->> 'classification',
      (v_grade ->> 'solverVerified')::boolean,v_grade ->> 'solverSource',
      v_selected_frequency,(v_grade ->> 'optimalFrequency')::numeric,
      (v_grade ->> 'evLossMeasured')::boolean,v_ev_loss,v_evidence
    );
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  IF p_expected_error IS NULL AND v_error IS NOT NULL THEN
    RAISE EXCEPTION 'valid active-cache answer failed: %',v_error;
  ELSIF p_expected_error IS NOT NULL AND (
    v_error IS NULL OR position(p_expected_error IN v_error)=0
  ) THEN
    RAISE EXCEPTION 'expected %, received %',p_expected_error,coalesce(v_error,'success');
  END IF;
  RETURN CASE WHEN v_error IS NULL THEN v_answer_id ELSE NULL END;
END;
$$;

DO $$
DECLARE
  v_mutation text;
  v_answer_id uuid;
  v_metadata jsonb;
  v_blocked boolean := false;
BEGIN
  -- Raw active-cache path: every value rejected by 070700 remains rejected by
  -- the final chain, including the source artifact checksum added by #1579.
  FOREACH v_mutation IN ARRAY ARRAY['grade','frequency','ev','lineage','source-checksum'] LOOP
    PERFORM public.test_active_answer(
      v_mutation,
      CASE v_mutation
        WHEN 'grade' THEN 'training_answer_grade_mismatch'
        WHEN 'frequency' THEN 'training_answer_solver_evidence_mismatch'
        WHEN 'ev' THEN 'training_answer_ev_evidence_mismatch'
        ELSE 'training_answer_lineage_mismatch' END
    );
  END LOOP;
  PERFORM public.test_active_answer();

  -- Immutable-snapshot recovery path rejects the same five tamper families.
  FOREACH v_mutation IN ARRAY ARRAY['grade','frequency','ev','lineage','source-checksum'] LOOP
    PERFORM public.test_attempt_answer(
      '10000000-0000-4000-8000-000000000004','b60',NULL,v_mutation,
      CASE v_mutation
        WHEN 'grade' THEN 'training_answer_grade_mismatch'
        WHEN 'frequency' THEN 'training_answer_solver_evidence_mismatch'
        WHEN 'ev' THEN 'training_answer_ev_evidence_mismatch'
        ELSE 'training_answer_lineage_mismatch' END
    );
  END LOOP;

  v_answer_id := public.test_attempt_answer(
    '10000000-0000-4000-8000-000000000001','b60'
  );
  PERFORM public.test_attempt_answer(
    '10000000-0000-4000-8000-000000000002','grouped_medium'
  );
  PERFORM public.test_attempt_answer(
    '10000000-0000-4000-8000-000000000003','x',
    jsonb_build_object('mode','low','roll',95)
  );
  PERFORM public.test_attempt_answer(
    '10000000-0000-4000-8000-000000000004','b60'
  );

  -- The roll and target are independently bound to the pre-answer served
  -- event. These probes use a fresh transaction slot by deleting only the
  -- disposable failed rows (a rejected insert never occupies the slot).
  DELETE FROM public.training_answers
  WHERE attempt_id='10000000-0000-4000-8000-000000000003';
  PERFORM public.test_attempt_answer(
    '10000000-0000-4000-8000-000000000003','x',
    jsonb_build_object('mode','low','roll',95),'rng-roll',
    'training_answer_rng_authority_mismatch'
  );
  PERFORM public.test_attempt_answer(
    '10000000-0000-4000-8000-000000000003','x',
    jsonb_build_object('mode','low','roll',95),'rng-target',
    'training_answer_attempt_grade_metadata_mismatch'
  );
  PERFORM public.test_attempt_answer(
    '10000000-0000-4000-8000-000000000003','x',
    jsonb_build_object('mode','low','roll',95)
  );

  -- Exact helper replay is idempotent; changing even selectedAnswer in the
  -- durable event makes the next replay fail closed.
  PERFORM public.fn_training_record_answer_cache_event_v1(answer)
  FROM public.training_answers answer WHERE answer.id=v_answer_id;
  SELECT metadata INTO v_metadata FROM public.training_question_events
  WHERE event_type='answered' AND event_key='training-answer:'||v_answer_id::text;
  UPDATE public.training_question_events
  SET metadata=jsonb_set(metadata,'{selectedAnswer}','"forged"')
  WHERE event_type='answered' AND event_key='training-answer:'||v_answer_id::text;
  BEGIN
    PERFORM public.fn_training_record_answer_cache_event_v1(answer)
    FROM public.training_answers answer WHERE answer.id=v_answer_id;
  EXCEPTION WHEN OTHERS THEN
    v_blocked := position('training_cache_event_binding_mismatch' IN SQLERRM)>0;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'changed idempotent event binding was accepted'; END IF;
  UPDATE public.training_question_events SET metadata=v_metadata
  WHERE event_type='answered' AND event_key='training-answer:'||v_answer_id::text;

  IF NOT EXISTS (
    SELECT 1 FROM public.training_question_events
    WHERE event_type='served' AND question_id='rng-attempt'
      AND metadata ->> 'difficultyMode'='grouped'
      AND metadata #>> '{rngRolls,low}'='95'
      AND binding_status='CHECKSUM_BOUND'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.training_question_events
    WHERE event_type='answered' AND question_id='stale-attempt'
      AND metadata ->> 'immutableSnapshotRecovery'='true'
      AND metadata ->> 'selectedAnswer'='b60'
      AND binding_status='CHECKSUM_BOUND'
  ) THEN
    RAISE EXCEPTION 'served RNG or stale-snapshot evidence was not fully bound';
  END IF;
END;
$$;

INSERT INTO public.training_question_cache(
  question_id,question_data,canonical_policy,source_classification,
  policy_version,quality_status,policy_checksum
)
SELECT
  'immutable-event-replay',
  public.test_training_question('immutable-event-replay',public.test_training_policy()),
  public.test_training_policy(),'SOLVER_EXACT','truth-verifier-v1','active',
  public.test_policy_checksum(public.test_training_policy());
DO $$
DECLARE
  v_first jsonb;
  v_replay jsonb;
  v_blocked boolean := false;
BEGIN
  v_first := public.fn_training_cache_record_event(
    'served','immutable-event-replay-key','immutable-event-replay',
    '11111111-1111-4111-8111-111111111111',NULL,
    jsonb_build_object('surface','truth-verifier'),now(),
    public.test_policy_checksum(public.test_training_policy())
  );
  UPDATE public.training_question_cache
  SET quality_status='retired'
  WHERE question_id='immutable-event-replay';
  v_replay := public.fn_training_cache_record_event(
    'served','immutable-event-replay-key','immutable-event-replay',
    '11111111-1111-4111-8111-111111111111',NULL,
    jsonb_build_object('surface','truth-verifier'),now(),
    public.test_policy_checksum(public.test_training_policy())
  );
  IF coalesce((v_first ->> 'inserted')::boolean,false) IS NOT TRUE
     OR coalesce((v_replay ->> 'inserted')::boolean,true) IS NOT FALSE
     OR v_replay ->> 'bindingStatus' <> 'CHECKSUM_BOUND' THEN
    RAISE EXCEPTION 'immutable cache-event replay was not preserved';
  END IF;
  BEGIN
    PERFORM public.fn_training_cache_record_event(
      'served','immutable-event-replay-key','immutable-event-replay',
      '11111111-1111-4111-8111-111111111111',NULL,
      jsonb_build_object('surface','forged'),now(),
      public.test_policy_checksum(public.test_training_policy())
    );
  EXCEPTION WHEN OTHERS THEN
    v_blocked := position('training_cache_event_binding_mismatch' IN SQLERRM)>0;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'immutable cache-event replay accepted changed metadata';
  END IF;
END;
$$;

UPDATE public.training_attempts
SET status='completed',completed_at=now()
WHERE id IN (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003'
);

DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.fn_training_answer_cache_event()'::regprocedure)
  INTO v_definition;
  IF position('fn_training_record_answer_cache_event_v1' IN v_definition)=0
     OR position('training_answer_grade_mismatch' IN pg_get_functiondef(
       'public.fn_training_record_answer_cache_event_v1(public.training_answers)'::regprocedure
     ))=0 THEN
    RAISE EXCEPTION 'a later CREATE OR REPLACE weakened the 070700 truth boundary';
  END IF;
END;
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$
DECLARE
  v_stats record;
  v_compat jsonb;
  v_blocked boolean := false;
BEGIN
  SELECT * INTO v_stats FROM public.get_user_level_stats(
    '11111111-1111-4111-8111-111111111111',2
  );
  IF v_stats.total_questions <> 3 OR v_stats.correct_answers <> 2
     OR v_stats.accuracy <> 66.67 OR v_stats.avg_ev_loss <> 0.10 THEN
    RAISE EXCEPTION 'authoritative level stats were wrong: %',to_jsonb(v_stats);
  END IF;
  SELECT * INTO v_stats FROM public.get_user_level_stats(
    '11111111-1111-4111-8111-111111111111',12
  );
  IF v_stats.total_questions <> 0 OR v_stats.correct_answers <> 0
     OR v_stats.accuracy <> 0 OR v_stats.avg_ev_loss <> 0 THEN
    RAISE EXCEPTION 'zero-safe level stats were wrong: %',to_jsonb(v_stats);
  END IF;
  BEGIN
    PERFORM public.get_user_level_stats('22222222-2222-4222-8222-222222222222',2);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'cross-user level stats read was accepted'; END IF;
  v_compat := public.get_user_level_stats('11111111-1111-4111-8111-111111111111');
  IF v_compat ->> 'compatibility' <> 'true' THEN
    RAISE EXCEPTION 'one-argument level stats compatibility was removed';
  END IF;
END;
$$;
RESET ROLE;

SET ROLE service_role;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claim.role','service_role',false);
DO $$
DECLARE
  v_stats record;
BEGIN
  SELECT * INTO v_stats FROM public.get_user_level_stats(
    '11111111-1111-4111-8111-111111111111',2
  );
  IF v_stats.total_questions <> 3 OR v_stats.correct_answers <> 2
     OR v_stats.accuracy <> 66.67 OR v_stats.avg_ev_loss <> 0.10 THEN
    RAISE EXCEPTION 'service-role level stats authority was wrong: %',to_jsonb(v_stats);
  END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  IF has_function_privilege('anon','public.get_user_level_stats(uuid,integer)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.get_user_level_stats(uuid,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.get_user_level_stats(uuid,integer)','EXECUTE')
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc
       WHERE oid='public.get_user_level_stats(uuid,integer)'::regprocedure
         AND prosecdef AND provolatile='s'
         AND proconfig @> ARRAY['search_path=pg_catalog']
     )
     OR coalesce(
       obj_description('public.get_user_level_stats(uuid)'::regprocedure,'pg_proc'),
       ''
     ) NOT LIKE 'Legacy one-argument profile-XP compatibility overload;%' THEN
    RAISE EXCEPTION 'two-argument level stats ACL or execution contract drifted';
  END IF;
END;
$$;

SELECT jsonb_build_object(
  'orderedChain',jsonb_build_array('070700','072030','081400','081510'),
  'raw',true,'grouped',true,'rng',true,'staleSnapshot',true,
  'activeTamperFamilies',5,'snapshotTamperFamilies',5,
  'levelStats',true,'crossUserDenied',true,'serviceRoleAuthorized',true,
  'existingLevelStatsOverloadHardened',true,'immutableEventReplay',true
)::text;
`;

const FINAL_FINGERPRINT_SQL = String.raw`
SELECT jsonb_build_object(
  'cacheRecord',md5(pg_get_functiondef(
    'public.fn_training_cache_record_event(text,text,text,uuid,boolean,jsonb,timestamptz,text)'::regprocedure
  )),
  'answerTriggerFunction',md5(pg_get_functiondef(
    'public.fn_training_answer_cache_event()'::regprocedure
  )),
  'answerRecorder',md5(pg_get_functiondef(
    'public.fn_training_record_answer_cache_event_v1(public.training_answers)'::regprocedure
  )),
  'deliveredGrader',md5(pg_get_functiondef(
    'public.fn_training_grade_delivered_policy_v1(jsonb,jsonb,text,text,jsonb)'::regprocedure
  )),
  'levelStats',md5(pg_get_functiondef(
    'public.get_user_level_stats(uuid,integer)'::regprocedure
  )),
  'answerTriggers',(
    SELECT jsonb_object_agg(trigger_row.tgname,md5(pg_get_triggerdef(trigger_row.oid,true))
      ORDER BY trigger_row.tgname)
    FROM pg_trigger trigger_row
    WHERE trigger_row.tgrelid='public.training_answers'::regclass
      AND NOT trigger_row.tgisinternal
  ),
  'eventConstraints',(
    SELECT jsonb_object_agg(constraint_row.conname,
      md5(pg_get_constraintdef(constraint_row.oid,true)) ORDER BY constraint_row.conname)
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid='public.training_question_events'::regclass
  ),
  'slotConstraints',(
    SELECT jsonb_object_agg(constraint_row.conname,
      md5(pg_get_constraintdef(constraint_row.oid,true)) ORDER BY constraint_row.conname)
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid='public.training_attempt_decision_slots'::regclass
  )
)::text;
`;

function evidenceFromOutput(output, label) {
  const evidenceLine = output
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('{')
      && line.endsWith('}')
      && line.includes('"orderedChain"'));
  if (!evidenceLine) throw new Error(`${label} evidence was missing.\n${output}`);
  return JSON.parse(evidenceLine);
}

function authorityFingerprint(psql, connection) {
  const result = command(psql, ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: FINAL_FINGERPRINT_SQL,
    quiet: true,
  });
  const line = result.stdout.split('\n').map((entry) => entry.trim()).find((entry) => entry.startsWith('{'));
  if (!line) throw new Error(`Final authority fingerprint was missing.\n${result.stdout}`);
  return JSON.parse(line);
}

const pgBin = resolvePostgresBin();
const workspace = mkdtempSync(path.join(tmpdir(), 'sp-training-phase6-truth-'));
const dataDir = path.join(workspace, 'data');
const socketDir = path.join(workspace, 'socket');
const port = await reservePort();
const tool = (name) => path.join(pgBin, name);

try {
  command(tool('initdb'), [
    '-D', dataDir, '-A', 'trust', '--locale=en_US.UTF-8', '--encoding=UTF8',
  ], { quiet: true });
  command('mkdir', ['-p', socketDir], { quiet: true });
  command(tool('pg_ctl'), [
    '-D', dataDir,
    '-o', `-F -p ${port} -k ${socketDir} -c listen_addresses=''`,
    '-l', path.join(workspace, 'postgres.log'),
    '-w', 'start',
  ], { quiet: true });
  command(tool('createdb'), ['-h', socketDir, '-p', String(port), 'phase6_truth'], { quiet: true });
  command(tool('createdb'), ['-h', socketDir, '-p', String(port), 'phase6_truth_production_order'], { quiet: true });
  const connection = ['-h', socketDir, '-p', String(port), '-d', 'phase6_truth'];
  const productionConnection = [
    '-h', socketDir, '-p', String(port), '-d', 'phase6_truth_production_order',
  ];
  const environment = command(
    tool('psql'),
    ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', ...connection],
    {
      input: String.raw`SELECT current_setting('server_version_num'),
        current_setting('server_encoding'),
        datcollate
      FROM pg_catalog.pg_database
      WHERE datname = current_database();`,
      quiet: true,
    },
  ).stdout.trim().split('|');
  if (
    !/^17\d{4}$/.test(environment[0] || '')
    || environment[1] !== 'UTF8'
    || environment[2] !== 'en_US.UTF-8'
  ) {
    throw new Error(`Phase 6 truth verifier requires PostgreSQL 17, UTF8, en_US.UTF-8; received ${environment.join('|')}`);
  }
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: BASELINE_SQL,
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: predecessorSql,
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', MIGRATION_072000], {
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', MIGRATION_072030], {
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: upstreamIntegritySql,
    quiet: true,
  });
  const upstreamDefinition = command(
    tool('psql'),
    ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...connection],
    { input: "SELECT pg_get_functiondef('public.fn_training_answer_cache_event()'::regprocedure);", quiet: true },
  ).stdout;
  if (!upstreamDefinition.includes('selectedAnswer')
      || upstreamDefinition.includes('fn_training_record_answer_cache_event_v1')) {
    throw new Error('The ordered test did not install the exact 081400 overwrite.');
  }
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', MIGRATION_CLOSEOUT], {
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', MIGRATION_CLOSEOUT], {
    quiet: true,
  });
  const evidence = command(tool('psql'), ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: FIXTURE_SQL,
    quiet: true,
  });
  const historicalEvidence = evidenceFromOutput(evidence.stdout, 'Fresh-history Phase 6 truth');
  const historicalFingerprint = authorityFingerprint(tool('psql'), connection);

  // Production already applied 070700 and 081400. The older-numbered Phase 6
  // migrations therefore arrive afterward even though a clean database sorts
  // them first. Certify both histories and require byte-identical final
  // function/trigger/constraint definitions.
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...productionConnection], {
    input: BASELINE_SQL,
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...productionConnection], {
    input: predecessorSql,
    quiet: true,
  });
  command(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...productionConnection], {
    input: upstreamIntegritySql,
    quiet: true,
  });
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...productionConnection, '-f', MIGRATION_072000,
  ], { quiet: true });
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...productionConnection, '-f', MIGRATION_072030,
  ], { quiet: true });
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...productionConnection, '-f', MIGRATION_CLOSEOUT,
  ], { quiet: true });
  command(tool('psql'), [
    '-X', '-v', 'ON_ERROR_STOP=1', ...productionConnection, '-f', MIGRATION_CLOSEOUT,
  ], { quiet: true });
  const productionEvidenceResult = command(
    tool('psql'),
    ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...productionConnection],
    { input: FIXTURE_SQL, quiet: true },
  );
  evidenceFromOutput(productionEvidenceResult.stdout, 'Production-order Phase 6 truth');
  const productionFingerprint = authorityFingerprint(tool('psql'), productionConnection);
  if (JSON.stringify(productionFingerprint) !== JSON.stringify(historicalFingerprint)) {
    throw new Error([
      'Fresh-history and production-order authority fingerprints differ.',
      JSON.stringify({ historicalFingerprint, productionFingerprint }, null, 2),
    ].join('\n'));
  }
  console.log(`Training Phase 6 truth PostgreSQL 17 verifier passed: ${JSON.stringify({
    ...historicalEvidence,
    productionOrder: ['070700', '081400', '072000', '072030', '081510'],
    migrationReapply: true,
    finalAuthorityFingerprint: historicalFingerprint,
  })}`);
} finally {
  if (existsSync(dataDir)) {
    spawnSync(tool('pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: process.env,
    });
  }
  rmSync(workspace, { recursive: true, force: true });
}
