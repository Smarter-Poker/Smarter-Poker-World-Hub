#!/usr/bin/env node

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260907005900_award_diamonds_v2_serialized_family_caps.sql',
);

function run(binary, args, { input, quiet = false } = {}) {
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
  return result.stdout || '';
}

function runAsync(binary, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error([
          `${path.basename(binary)} ${args.join(' ')} failed with status ${code}`,
          stdout,
          stderr,
        ].filter(Boolean).join('\n')));
        return;
      }
      resolve(stdout.trim());
    });
    child.stdin.end(input || '');
  });
}

function resolvePostgresBin() {
  const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
  const candidates = [
    process.env.AWARD_V2_POSTGRES_BIN,
    pgConfig.status === 0 ? pgConfig.stdout.trim() : null,
    '/opt/homebrew/opt/postgresql@17/bin',
    '/usr/local/opt/postgresql@17/bin',
    '/usr/lib/postgresql/17/bin',
    '/usr/local/pgsql/bin',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, 'postgres'))
      && existsSync(path.join(candidate, 'initdb'))
      && existsSync(path.join(candidate, 'pg_ctl'))
      && existsSync(path.join(candidate, 'psql'))
      && existsSync(path.join(candidate, 'createdb'))
    ) {
      const version = spawnSync(path.join(candidate, 'postgres'), ['--version'], { encoding: 'utf8' });
      if (version.status === 0 && /\b17\.\d+\b/.test(version.stdout)) return candidate;
    }
  }

  const resolved = spawnSync('sh', ['-c', 'command -v postgres'], { encoding: 'utf8' });
  if (resolved.status === 0 && resolved.stdout.trim()) {
    const candidate = path.dirname(resolved.stdout.trim());
    const version = spawnSync(path.join(candidate, 'postgres'), ['--version'], { encoding: 'utf8' });
    if (version.status === 0 && /\b17\.\d+\b/.test(version.stdout)) return candidate;
  }
  throw new Error(
    'PostgreSQL 17 binaries are required. Set AWARD_V2_POSTGRES_BIN to the directory containing postgres, initdb, pg_ctl, psql, and createdb.',
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

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
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
CREATE UNIQUE INDEX idx_diamond_transactions_reference_id
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

INSERT INTO public.profiles(id, diamond_multiplier) VALUES
  ('11111111-1111-4111-8111-111111111111', 10.00),
  ('22222222-2222-4222-8222-222222222222', 10.00),
  ('33333333-3333-4333-8333-333333333333', 10.00),
  ('44444444-4444-4444-8444-444444444444', 10.00),
  ('55555555-5555-4555-8555-555555555555', 10.00);
`;

const CONTENTION_SQL = String.raw`
-- Make any missing early per-user lock deterministic: an unsafe function lets
-- every caller read stale state before they queue at this later global lock.
CREATE FUNCTION public.phase6_slow_budget_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_sleep(0.12);
  RETURN NEW;
END;
$$;

CREATE TRIGGER phase6_slow_budget_update
  BEFORE UPDATE ON public.diamond_platform_budget
  FOR EACH ROW EXECUTE FUNCTION public.phase6_slow_budget_update();

CREATE FUNCTION public.phase6_reject_ledger_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.reference_id = 'force-ledger-failure' THEN
    RAISE EXCEPTION 'forced ledger failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER phase6_reject_ledger_insert
  BEFORE INSERT ON public.diamond_transactions
  FOR EACH ROW EXECUTE FUNCTION public.phase6_reject_ledger_insert();
`;

const FINAL_ASSERTIONS_SQL = String.raw`
DO $$
DECLARE
  profile_balance integer;
  shadow_balance integer;
  ledger_total bigint;
  ledger_rows integer;
  spent bigint;
BEGIN
  SELECT diamonds, diamond_balance
    INTO profile_balance, shadow_balance
    FROM public.profiles
   WHERE id = '11111111-1111-4111-8111-111111111111';
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO ledger_total, ledger_rows
    FROM public.diamond_transactions
   WHERE user_id = '11111111-1111-4111-8111-111111111111'
     AND transaction_type = 'streak_reward';
  IF profile_balance <> 1000 OR shadow_balance <> 1000
     OR ledger_total <> 1000 OR ledger_rows <> 1 THEN
    RAISE EXCEPTION 'streak cap failed: profile=%, shadow=%, ledger=%, rows=%',
      profile_balance, shadow_balance, ledger_total, ledger_rows;
  END IF;

  SELECT diamonds, diamond_balance
    INTO profile_balance, shadow_balance
    FROM public.profiles
   WHERE id = '22222222-2222-4222-8222-222222222222';
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO ledger_total, ledger_rows
    FROM public.diamond_transactions
   WHERE user_id = '22222222-2222-4222-8222-222222222222'
     AND transaction_type = 'training_reward';
  IF profile_balance <> 1500 OR shadow_balance <> 1500
     OR ledger_total <> 1500 OR ledger_rows <> 3 THEN
    RAISE EXCEPTION 'training contention failed: profile=%, shadow=%, ledger=%, rows=%',
      profile_balance, shadow_balance, ledger_total, ledger_rows;
  END IF;

  SELECT diamonds, diamond_balance
    INTO profile_balance, shadow_balance
    FROM public.profiles
   WHERE id = '33333333-3333-4333-8333-333333333333';
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO ledger_total, ledger_rows
    FROM public.diamond_transactions
   WHERE user_id = '33333333-3333-4333-8333-333333333333'
     AND transaction_type = 'training_reward';
  IF profile_balance <> 500 OR shadow_balance <> 500
     OR ledger_total <> 500 OR ledger_rows <> 1 THEN
    RAISE EXCEPTION 'duplicate contention failed: profile=%, shadow=%, ledger=%, rows=%',
      profile_balance, shadow_balance, ledger_total, ledger_rows;
  END IF;

  -- The deliberately failed ledger insertion must have rolled the profile and
  -- platform budget back with it.
  SELECT diamonds, diamond_balance
    INTO profile_balance, shadow_balance
    FROM public.profiles
   WHERE id = '44444444-4444-4444-8444-444444444444';
  IF profile_balance <> 0 OR shadow_balance <> 0 OR EXISTS (
    SELECT 1 FROM public.diamond_transactions
     WHERE user_id = '44444444-4444-4444-8444-444444444444'
  ) THEN
    RAISE EXCEPTION 'ledger failure diverged the profile';
  END IF;

  SELECT spent_diamonds INTO spent
    FROM public.diamond_platform_budget
   WHERE period = to_char(now() AT TIME ZONE 'America/Chicago', 'YYYY-MM');
  SELECT COALESCE(SUM(amount), 0) INTO ledger_total
    FROM public.diamond_transactions;
  IF spent <> ledger_total OR spent <> 3000 THEN
    RAISE EXCEPTION 'platform/ledger divergence: spent=%, ledger=%', spent, ledger_total;
  END IF;
END;
$$;
`;

const postgresBin = resolvePostgresBin();
const initdb = path.join(postgresBin, 'initdb');
const pgCtl = path.join(postgresBin, 'pg_ctl');
const psql = path.join(postgresBin, 'psql');
const workspace = mkdtempSync(path.join(tmpdir(), 'award-v2-concurrency-'));
const dataDir = path.join(workspace, 'data');
const socketDir = path.join(workspace, 'socket');
const postgresLog = path.join(workspace, 'postgres.log');
const port = await reservePort();
let started = false;

const connectionArgs = [
  '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
  '-h', socketDir, '-p', String(port), '-U', 'postgres', '-d', 'postgres',
];

try {
  run(initdb, [
    '-D', dataDir,
    '--username=postgres',
    '--auth=trust',
    '--locale=en_US.UTF-8',
    '--encoding=UTF8',
  ], { quiet: true });
  mkdirSync(socketDir, { recursive: true });
  run(pgCtl, [
    '-D', dataDir,
    '-l', postgresLog,
    '-o', `-F -p ${port} -k ${socketDir} -c listen_addresses=127.0.0.1`,
    '-w', 'start',
  ], { quiet: true });
  started = true;

  const environment = run(psql, [...connectionArgs], {
    input: String.raw`SELECT current_setting('server_version_num'),
      current_setting('server_encoding'),
      datcollate
    FROM pg_catalog.pg_database
    WHERE datname = current_database();`,
    quiet: true,
  }).trim().split('|');
  if (
    !/^17\d{4}$/.test(environment[0] || '')
    || environment[1] !== 'UTF8'
    || environment[2] !== 'en_US.UTF-8'
  ) {
    throw new Error(`Award verifier requires PostgreSQL 17, UTF8, en_US.UTF-8; received ${environment.join('|')}`);
  }

  run(psql, connectionArgs, { input: BASELINE_SQL, quiet: true });
  run(psql, [...connectionArgs, '-f', MIGRATION], { quiet: true });
  run(psql, connectionArgs, { input: CONTENTION_SQL, quiet: true });

  const streakResult = JSON.parse(run(psql, connectionArgs, {
    input: String.raw`SELECT public.award_diamonds_v2(
      '11111111-1111-4111-8111-111111111111', 'streak_reward',
      'streak-max-multiplier', NULL, '{"streak_diamonds":10000}'::jsonb
    )::text;`,
    quiet: true,
  }).trim());
  if (streakResult.success !== true || streakResult.awarded !== 1000 || streakResult.capped !== true) {
    throw new Error(`maximum-multiplier streak cap failed: ${JSON.stringify(streakResult)}`);
  }

  const exhaustedStreak = JSON.parse(run(psql, connectionArgs, {
    input: String.raw`SELECT public.award_diamonds_v2(
      '11111111-1111-4111-8111-111111111111', 'streak_reward',
      'streak-cap-exhausted', NULL, '{"streak_diamonds":1}'::jsonb
    )::text;`,
    quiet: true,
  }).trim());
  if (exhaustedStreak.success !== false || exhaustedStreak.awarded !== 0 || exhaustedStreak.reason !== 'action_limit') {
    throw new Error(`exhausted streak cap failed: ${JSON.stringify(exhaustedStreak)}`);
  }

  const trainingCalls = Array.from({ length: 12 }, (_, index) => runAsync(psql, connectionArgs, {
    input: `SELECT public.award_diamonds_v2(
      '22222222-2222-4222-8222-222222222222', 'training_reward',
      'training-concurrent-${index}', NULL, '{"reward_diamonds":50}'::jsonb
    )::text;`,
  }));
  const trainingResults = (await Promise.all(trainingCalls)).map((value) => JSON.parse(value));
  const trainingAwarded = trainingResults.reduce((sum, result) => sum + Number(result.awarded || 0), 0);
  if (trainingAwarded !== 1500 || trainingResults.filter((result) => result.success === true).length !== 3) {
    throw new Error(`concurrent training cap failed: ${JSON.stringify(trainingResults)}`);
  }

  const duplicateCalls = Array.from({ length: 8 }, () => runAsync(psql, connectionArgs, {
    input: String.raw`SELECT public.award_diamonds_v2(
      '33333333-3333-4333-8333-333333333333', 'training_reward',
      'same-reference', NULL, '{"reward_diamonds":50}'::jsonb
    )::text;`,
  }));
  const duplicateResults = (await Promise.all(duplicateCalls)).map((value) => JSON.parse(value));
  if (
    duplicateResults.filter((result) => result.success === true).length !== 1
    || duplicateResults.reduce((sum, result) => sum + Number(result.awarded || 0), 0) !== 500
  ) {
    throw new Error(`concurrent idempotency failed: ${JSON.stringify(duplicateResults)}`);
  }

  const forcedFailure = spawnSync(psql, connectionArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    input: String.raw`SELECT public.award_diamonds_v2(
      '44444444-4444-4444-8444-444444444444', 'training_reward',
      'force-ledger-failure', NULL, '{"reward_diamonds":50}'::jsonb
    )::text;`,
  });
  if (forcedFailure.status === 0 || !forcedFailure.stderr.includes('forced ledger failure')) {
    throw new Error('the forced ledger failure did not abort the award transaction');
  }

  run(psql, connectionArgs, { input: FINAL_ASSERTIONS_SQL, quiet: true });

  run(psql, connectionArgs, {
    input: String.raw`
      INSERT INTO public.diamond_transactions(
        user_id, amount, transaction_type, type, reference_id, metadata
      ) VALUES (
        '55555555-5555-4555-8555-555555555555', 0,
        'test_sentinel', 'test_sentinel', 'unrelated-sentinel', '{}'::jsonb
      );
      CREATE UNIQUE INDEX phase6_unrelated_user_uidx
        ON public.diamond_transactions(user_id)
        WHERE user_id = '55555555-5555-4555-8555-555555555555';
    `,
    quiet: true,
  });
  const unrelatedUniqueFailure = spawnSync(psql, connectionArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    input: String.raw`SELECT public.award_diamonds_v2(
      '55555555-5555-4555-8555-555555555555', 'training_reward',
      'must-not-be-translated-to-duplicate', NULL, '{"reward_diamonds":10}'::jsonb
    )::text;`,
  });
  if (
    unrelatedUniqueFailure.status === 0
    || !unrelatedUniqueFailure.stderr.includes('phase6_unrelated_user_uidx')
  ) {
    throw new Error('an unrelated unique violation was incorrectly translated to duplicate');
  }
  run(psql, connectionArgs, {
    input: String.raw`DO $$
      BEGIN
        IF (SELECT diamonds FROM public.profiles
            WHERE id = '55555555-5555-4555-8555-555555555555') <> 0
           OR (SELECT count(*) FROM public.diamond_transactions
               WHERE user_id = '55555555-5555-4555-8555-555555555555') <> 1 THEN
          RAISE EXCEPTION 'unrelated uniqueness rollback diverged user state';
        END IF;
      END;
    $$;`,
    quiet: true,
  });

  console.log('[award-v2-postgres] PASS migration applies to disposable PostgreSQL');
  console.log('[award-v2-postgres] PASS 10x streak request capped at 1,000 final diamonds');
  console.log('[award-v2-postgres] PASS 12 concurrent 10x Training calls capped at 1,500 total');
  console.log('[award-v2-postgres] PASS 8 concurrent identical references create one 500-diamond award');
  console.log('[award-v2-postgres] PASS profile, shadow balance, ledger, and platform budget converge');
  console.log('[award-v2-postgres] PASS forced ledger failure rolls back profile and platform writes');
  console.log('[award-v2-postgres] PASS unrelated uniqueness failures remain loud and roll back');
} finally {
  if (started) {
    spawnSync(pgCtl, ['-D', dataDir, '-m', 'fast', '-w', 'stop'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: process.env,
    });
  }
  rmSync(workspace, { recursive: true, force: true });
}
