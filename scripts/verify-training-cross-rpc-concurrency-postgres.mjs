#!/usr/bin/env node

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AWARD_MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260907005900_award_diamonds_v2_serialized_family_caps.sql',
);
const AUTHORITY_MIGRATION = path.join(
  ROOT,
  'supabase/migrations/20260907010000_training_server_authoritative_completion.sql',
);
const AUTHORITY_VERIFIER = path.join(ROOT, 'scripts/verify-training-authority-postgres.mjs');
const USER_LOCK_NAMESPACE = 1799876946;
const TEST_GATE_NAMESPACE = 2057996901;
const TEST_GATE_KEY = 612341;

function extractRawTemplate(source, name) {
  const marker = `const ${name} = String.raw\``;
  const start = source.indexOf(marker);
  const bodyStart = start + marker.length;
  const end = source.indexOf('\n`;', bodyStart);
  if (start < 0 || end < 0) {
    throw new Error(`Could not extract ${name} from the authority verifier.`);
  }
  return source.slice(bodyStart, end);
}

const BASELINE_SQL = extractRawTemplate(readFileSync(AUTHORITY_VERIFIER, 'utf8'), 'BASELINE_SQL');

const LEGACY_FIXTURE_SQL = String.raw`
INSERT INTO auth.users(id) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  ('12121212-1212-4121-8121-121212121212');
INSERT INTO public.profiles(id, diamonds, diamond_balance, diamond_multiplier) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 0, 0, 1.00),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1000, 1000, 2.00),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 0, 0, 1.00),
  ('12121212-1212-4121-8121-121212121212', 4000, 4000, 1.00);

INSERT INTO public.training_streaks(
  user_id, current_streak, longest_streak, last_training_date,
  streak_start_date, milestones_claimed
) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 365, 365, current_date, current_date - 364, '[365]'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 100, 100, current_date, current_date - 99, '[100]'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 30, 60, current_date, current_date - 29, '[3,7,14,30]'),
  ('12121212-1212-4121-8121-121212121212', 100, 100, current_date, current_date - 99, '[100]');
INSERT INTO public.training_progress(
  user_id, game_id, level, hands_played, correct_answers,
  total_answers, current_streak, best_streak, last_played_at
) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cash-001', 12, 5000, 4900, 5000, 100, 250, now()),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'cash-001', 9, 900, 850, 900, 50, 80, now());
INSERT INTO public.training_leaderboard(
  user_id, period_type, period_key, total_questions, correct_answers,
  perfect_rounds, best_streak
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'alltime', 'alltime',
  1000000, 1000000, 1000000, 1000000
);
INSERT INTO public.diamond_transactions(
  user_id, amount, transaction_type, type, reference_id,
  balance_after, metadata, created_at
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1000,
  'streak_reward', 'streak_reward',
  'streak_cccccccc-cccc-4ccc-8ccc-cccccccccccc_100',
  1000, '{"legacy":true}', now() - interval '2 months'
), (
  '12121212-1212-4121-8121-121212121212', 4000,
  'streak_reward', 'streak_reward',
  'streak_12121212-1212-4121-8121-121212121212_100',
  4000, '{"legacy":true,"multiplier":2}', now() - interval '2 months'
);
INSERT INTO public.training_daily_challenge(
  user_id, daily_id, score, ev_loss, selected_action, completed_at
) VALUES (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'daily-' || timezone('America/Chicago', now())::date::text,
  100, 0, 'check', now()
);
`;

function run(binary, args, { input, env, quiet = false, allowFailure = false } = {}) {
  const result = spawnSync(binary, args, {
    cwd: ROOT,
    encoding: 'utf8',
    input,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error([
      `${path.basename(binary)} ${args.join(' ')} failed with status ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  if (!quiet && result.stdout?.trim()) process.stdout.write(result.stdout);
  return result;
}

function runAsync(binary, args, { input, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
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
    process.env.PHASE6_POSTGRES_BIN,
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
    'PostgreSQL 17 binaries are required. Set PHASE6_POSTGRES_BIN to the directory containing postgres, initdb, pg_ctl, psql, and createdb.',
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

function jsonLine(output) {
  const line = output.split('\n').map((item) => item.trim())
    .find((item) => item.startsWith('{') && item.endsWith('}'));
  if (!line) throw new Error(`Expected a JSON result, received:\n${output}`);
  return JSON.parse(line);
}

function uuidLine(output) {
  const line = output.split('\n').map((item) => item.trim())
    .find((item) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(item));
  if (!line) throw new Error(`Expected a UUID result, received:\n${output}`);
  return line;
}

function startGateHolder(psql, connection) {
  const child = spawn(psql, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', ...connection], {
    cwd: ROOT,
    env: { ...process.env, PGAPPNAME: 'phase6-cross-gate-holder' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gate-holder psql failed with ${code}\n${stdout}\n${stderr}`));
    });
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (stdout.includes('PHASE6_GATE_HELD')) readyResolve();
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.once('close', (code) => {
    if (!stdout.includes('PHASE6_GATE_HELD')) {
      readyReject(new Error(`gate holder closed before acquiring the gate (${code})\n${stderr}`));
    }
  });
  child.stdin.write(
    `SELECT pg_catalog.pg_advisory_lock(${TEST_GATE_NAMESPACE}, ${TEST_GATE_KEY});\n`
    + "SELECT 'PHASE6_GATE_HELD';\n",
  );
  return {
    child,
    ready,
    async release() {
      if (child.exitCode === null) {
        child.stdin.write(
          `SELECT pg_catalog.pg_advisory_unlock(${TEST_GATE_NAMESPACE}, ${TEST_GATE_KEY});\n\\q\n`,
        );
        child.stdin.end();
      }
      await closed;
    },
  };
}

const FIXTURE_SQL = String.raw`
INSERT INTO auth.users(id) VALUES
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444'),
  ('55555555-5555-4555-8555-555555555555'),
  ('66666666-6666-4666-8666-666666666666'),
  ('77777777-7777-4777-8777-777777777777'),
  ('88888888-8888-4888-8888-888888888888'),
  ('99999999-9999-4999-8999-999999999999'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('13131313-1313-4313-8313-131313131313'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff');

INSERT INTO public.profiles(id, diamonds, diamond_balance, diamond_multiplier) VALUES
  ('33333333-3333-4333-8333-333333333333', 0, 0, 1.00),
  ('44444444-4444-4444-8444-444444444444', 0, 0, 2.00),
  ('55555555-5555-4555-8555-555555555555', 0, 0, 10.00),
  ('66666666-6666-4666-8666-666666666666', 0, 0, 2.00),
  ('88888888-8888-4888-8888-888888888888', 0, 0, 1.00),
  ('99999999-9999-4999-8999-999999999999', 0, 0, 1.00),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 0, 1.00),
  ('13131313-1313-4313-8313-131313131313', 1000, 1000, 2.00);

CREATE FUNCTION public.phase6_cross_seed_attempt(
  p_user uuid,
  p_nonce text,
  p_game text DEFAULT 'cash-001',
  p_correct integer DEFAULT 20
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  start_result jsonb;
  attempt uuid;
BEGIN
  start_result := public.fn_start_training_attempt_v2(
    p_user, p_nonce, p_game, 1, 'campaign', 'grouped', 20, repeat('a', 64), NULL
  );
  IF start_result ->> 'success' <> 'true' THEN
    RAISE EXCEPTION 'cross-RPC start failed: %', start_result;
  END IF;
  attempt := (start_result ->> 'attemptId')::uuid;

  INSERT INTO public.training_question_snapshots(
    snapshot_key, source_question_id, game_id, level, content_digest, question_data
  )
  SELECT
    md5(p_nonce || ':' || ordinal::text) || md5('snapshot:' || p_nonce || ':' || ordinal::text),
    p_nonce || '-q-' || ordinal::text,
    p_game,
    1,
    md5(p_nonce || ':' || ordinal::text) || md5('snapshot:' || p_nonce || ':' || ordinal::text),
    jsonb_build_object('id', p_nonce || '-q-' || ordinal::text)
  FROM generate_series(1, 20) ordinal;

  INSERT INTO public.training_attempt_hands(attempt_id, hand_ordinal, snapshot_key)
  SELECT attempt, ordinal,
    md5(p_nonce || ':' || ordinal::text) || md5('snapshot:' || p_nonce || ':' || ordinal::text)
  FROM generate_series(1, 20) ordinal;

  INSERT INTO public.training_answers(
    user_id, game_id, question_id, answer_id, is_correct, level, answered_at,
    hero_position, villain_position, street, classification, ev_loss,
    spot_type, submission_id, solver_verified, solver_source,
    selected_frequency, optimal_frequency, ev_loss_measured, evidence_metadata,
    session_id, attempt_id, hand_ordinal, decision_ordinal, snapshot_key
  )
  SELECT p_user, p_game, p_nonce || '-q-' || ordinal::text,
    CASE WHEN ordinal <= p_correct THEN 'check' ELSE 'bet' END,
    ordinal <= p_correct, 1, now() + (ordinal || ' seconds')::interval,
    'BTN', 'BB', 'flop', CASE WHEN ordinal <= p_correct THEN 'best' ELSE 'wrong' END,
    CASE WHEN ordinal <= p_correct THEN 0 ELSE 1 END,
    'single-raised-pot', p_nonce || '-submission-' || ordinal::text,
    true, 'phase6-cross-fixture',
    CASE WHEN ordinal <= p_correct THEN 75 ELSE 25 END, 75, true,
    jsonb_build_object('difficultyMode', 'grouped'),
    p_nonce, attempt, ordinal, 1,
    md5(p_nonce || ':' || ordinal::text) || md5('snapshot:' || p_nonce || ':' || ordinal::text)
  FROM generate_series(1, 20) ordinal;
  RETURN attempt;
END $$;

CREATE FUNCTION public.phase6_cross_seed_daily_attempt(
  p_user uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  nonce text := 'daily-' || timezone('America/Chicago', now())::date::text;
  start_result jsonb;
  attempt uuid;
  snapshot text;
BEGIN
  start_result := public.fn_start_training_attempt_v2(
    p_user, nonce, 'daily-challenge', 1, 'daily', 'grouped', 1,
    repeat('d', 64), NULL
  );
  IF start_result ->> 'success' <> 'true' THEN
    RAISE EXCEPTION 'cross-RPC daily start failed: %', start_result;
  END IF;
  attempt := (start_result ->> 'attemptId')::uuid;
  snapshot := md5(nonce || ':' || p_user::text)
    || md5('snapshot:' || nonce || ':' || p_user::text);

  INSERT INTO public.training_question_snapshots(
    snapshot_key, source_question_id, game_id, level, content_digest, question_data
  ) VALUES (
    snapshot, nonce || '-q', 'daily-challenge', 1, snapshot,
    jsonb_build_object('id', nonce || '-q')
  ) ON CONFLICT (snapshot_key) DO NOTHING;
  INSERT INTO public.training_attempt_hands(attempt_id, hand_ordinal, snapshot_key)
  VALUES (attempt, 1, snapshot);
  INSERT INTO public.training_answers(
    user_id, game_id, question_id, answer_id, is_correct, level, answered_at,
    hero_position, villain_position, street, classification, ev_loss,
    spot_type, submission_id, solver_verified, solver_source,
    selected_frequency, optimal_frequency, ev_loss_measured, evidence_metadata,
    session_id, attempt_id, hand_ordinal, decision_ordinal, snapshot_key
  ) VALUES (
    p_user, 'daily-challenge', nonce || '-q', 'check', true, 1, now(),
    'BTN', 'BB', 'flop', 'best', 0, 'single-raised-pot',
    nonce || '-submission', true, 'phase6-cross-fixture', 75, 75, true,
    jsonb_build_object('difficultyMode', 'grouped'), nonce, attempt, 1, 1, snapshot
  );
  RETURN attempt;
END $$;

CREATE FUNCTION public.phase6_cross_claim_gate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(${TEST_GATE_NAMESPACE}, ${TEST_GATE_KEY});
  RETURN NEW;
END $$;
CREATE TRIGGER phase6_cross_claim_gate
  BEFORE INSERT ON public.training_streak_milestone_claims
  FOR EACH ROW EXECUTE FUNCTION public.phase6_cross_claim_gate();
`;

const postgresBin = resolvePostgresBin();
const tempRoot = mkdtempSync(path.join(tmpdir(), 'sp-training-cross-rpc-'));
const dataDir = path.join(tempRoot, 'data');
const port = await reservePort();
let started = false;
let gateHolder = null;
const tool = (name) => path.join(postgresBin, name);
const connection = ['-h', tempRoot, '-p', String(port), '-d', 'phase6'];
const psqlArgs = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', ...connection];

function sql(input, options = {}) {
  return run(tool('psql'), psqlArgs, { input, quiet: true, ...options }).stdout.trim();
}

async function waitForCount(query, label) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const count = Number(sql(query));
    if (count > 0) return count;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function seedAttempt(user, nonce, game = 'cash-001') {
  return uuidLine(sql(
    `SELECT public.phase6_cross_seed_attempt('${user}', '${nonce}', '${game}', 20);`,
  ));
}

function seedDailyAttempt(user) {
  return uuidLine(sql(
    `SELECT public.phase6_cross_seed_daily_attempt('${user}');`,
  ));
}

function callJson(statement) {
  return jsonLine(sql(`SET statement_timeout = '8s';\n${statement}`));
}

try {
  run(tool('initdb'), [
    '-D', dataDir, '-A', 'trust', '--locale=en_US.UTF-8', '--encoding=UTF8',
  ], { quiet: true });
  run(tool('pg_ctl'), [
    '-D', dataDir,
    '-o', `-p ${port} -k ${tempRoot}`,
    '-l', path.join(tempRoot, 'postgres.log'),
    '-w', 'start',
  ], { quiet: true });
  started = true;
  run(tool('createdb'), ['-h', tempRoot, '-p', String(port), 'phase6'], { quiet: true });
  const environment = run(tool('psql'), ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', ...connection], {
    input: String.raw`SELECT current_setting('server_version_num'),
      current_setting('server_encoding'),
      datcollate
    FROM pg_catalog.pg_database
    WHERE datname = current_database();`,
    quiet: true,
  }).stdout.trim().split('|');
  if (
    !/^17\d{4}$/.test(environment[0] || '')
    || environment[1] !== 'UTF8'
    || environment[2] !== 'en_US.UTF-8'
  ) {
    throw new Error(`Training cross-RPC verifier requires PostgreSQL 17, UTF8, en_US.UTF-8; received ${environment.join('|')}`);
  }
  sql(BASELINE_SQL);
  sql(LEGACY_FIXTURE_SQL);
  run(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', AWARD_MIGRATION], { quiet: true });
  run(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', AUTHORITY_MIGRATION], { quiet: true });
  sql(FIXTURE_SQL);

  // Legacy browser-authored counters remain preserved in same-row snapshots,
  // but cannot unlock levels, claim milestones, boost rewards, or seed the
  // clean verified leaderboard. A verified post-epoch pass advances normally.
  const legacyUser = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const forgedHighStart = callJson(String.raw`
    SELECT public.fn_start_training_attempt_v2(
      '${legacyUser}', 'phase6-forged-level-12', 'cash-001', 12,
      'campaign', 'grouped', 30, repeat('b', 64), NULL
    )::text;
  `);
  const forgedStreakClaim = callJson(
    `SELECT public.fn_claim_training_streak_milestone_v2('${legacyUser}', 365)::text;`,
  );
  if (
    forgedHighStart.success !== false
    || forgedHighStart.code !== 'TRAINING_ATTEMPT_LEVEL_LOCKED'
    || forgedStreakClaim.success !== false
    || forgedStreakClaim.code !== 'TRAINING_STREAK_MILESTONE_NOT_REACHED'
  ) {
    throw new Error(`Legacy authority quarantine failed: ${JSON.stringify({
      forgedHighStart,
      forgedStreakClaim,
    })}`);
  }

  const legacyAttempt = seedAttempt(legacyUser, 'phase6-post-epoch-pass');
  const legacyCompletion = callJson(
    `SELECT public.fn_complete_training_attempt_v2('${legacyUser}', '${legacyAttempt}')::text;`,
  );
  if (
    legacyCompletion.success !== true
    || legacyCompletion.newCompletion !== true
    || legacyCompletion.diamondsEarned !== 17
  ) {
    throw new Error(`Post-epoch legacy-user completion failed: ${JSON.stringify(legacyCompletion)}`);
  }
  const verifiedLegacyIsolation = jsonLine(sql(String.raw`
    SELECT jsonb_build_object(
      'legacyQuestions', (SELECT total_questions FROM public.training_leaderboard
        WHERE user_id = '${legacyUser}' AND period_type = 'alltime'),
      'verifiedRows', (SELECT count(*) FROM public.training_verified_leaderboard
        WHERE user_id = '${legacyUser}'),
      'overallQuestions', (SELECT questions_answered
        FROM public.training_verified_leaderboard
        WHERE user_id = '${legacyUser}' AND period_type = 'alltime'
          AND dimension_type = 'overall'),
      'gameQuestions', (SELECT questions_answered
        FROM public.training_verified_leaderboard
        WHERE user_id = '${legacyUser}' AND period_type = 'alltime'
          AND dimension_type = 'game' AND game_id = 'cash-001'),
      'categoryQuestions', (SELECT questions_answered
        FROM public.training_verified_leaderboard
        WHERE user_id = '${legacyUser}' AND period_type = 'alltime'
          AND dimension_type = 'category' AND category = 'cash'),
      'legacyWriterCalls', (SELECT count(*) FROM public.phase6_leaderboard_calls
        WHERE user_id = '${legacyUser}')
    );
  `));
  if (
    verifiedLegacyIsolation.legacyQuestions !== 1000000
    || verifiedLegacyIsolation.verifiedRows !== 12
    || verifiedLegacyIsolation.overallQuestions !== 20
    || verifiedLegacyIsolation.gameQuestions !== 20
    || verifiedLegacyIsolation.categoryQuestions !== 20
    || verifiedLegacyIsolation.legacyWriterCalls !== 0
  ) {
    throw new Error(`Forged legacy leaderboard affected verified totals: ${JSON.stringify(verifiedLegacyIsolation)}`);
  }
  const verifiedLegacyRank = callJson(String.raw`
    SELECT public.fn_training_verified_leaderboard_rank_v2(
      '${legacyUser}', 'alltime', 'alltime', 'overall', 'overall'
    )::text;
  `);
  const noVerifiedRank = callJson(String.raw`
    SELECT public.fn_training_verified_leaderboard_rank_v2(
      '77777777-7777-4777-8777-777777777777',
      'alltime', 'alltime', 'overall', 'overall'
    )::text;
  `);
  if (
    verifiedLegacyRank.myRank !== 1
    || verifiedLegacyRank.myEntry?.questionsCorrect !== 20
    || noVerifiedRank.myRank !== null
    || noVerifiedRank.myEntry !== null
  ) {
    throw new Error(`Verified rank contract fabricated or omitted rank state: ${JSON.stringify({
      verifiedLegacyRank,
      noVerifiedRank,
    })}`);
  }
  const unlockedLevelTwo = callJson(String.raw`
    SELECT public.fn_start_training_attempt_v2(
      '${legacyUser}', 'phase6-authority-level-2', 'cash-001', 2,
      'campaign', 'grouped', 20, repeat('c', 64), NULL
    )::text;
  `);
  if (unlockedLevelTwo.success !== true || unlockedLevelTwo.level !== 2) {
    throw new Error(`Verified progression did not unlock level 2: ${JSON.stringify(unlockedLevelTwo)}`);
  }

  const authorityBeforeRerun = sql(String.raw`
    SELECT jsonb_build_object(
      'streakSnapshot', streaks.legacy_authority_snapshot,
      'streakEpoch', streaks.authority_epoch,
      'authorityCurrentStreak', streaks.authority_current_streak,
      'authorityLongestStreak', streaks.authority_longest_streak,
      'progressSnapshot', progress.legacy_authority_snapshot,
      'progressEpoch', progress.authority_epoch,
      'authorityLevel', progress.authority_level,
      'authorityHands', progress.authority_hands_played
    )::text
    FROM public.training_streaks streaks
    JOIN public.training_progress progress ON progress.user_id = streaks.user_id
    WHERE streaks.user_id = '${legacyUser}' AND progress.game_id = 'cash-001';
  `);
  run(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', AWARD_MIGRATION], { quiet: true });
  run(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', AUTHORITY_MIGRATION], { quiet: true });
  const authorityAfterRerun = sql(String.raw`
    SELECT jsonb_build_object(
      'streakSnapshot', streaks.legacy_authority_snapshot,
      'streakEpoch', streaks.authority_epoch,
      'authorityCurrentStreak', streaks.authority_current_streak,
      'authorityLongestStreak', streaks.authority_longest_streak,
      'progressSnapshot', progress.legacy_authority_snapshot,
      'progressEpoch', progress.authority_epoch,
      'authorityLevel', progress.authority_level,
      'authorityHands', progress.authority_hands_played
    )::text
    FROM public.training_streaks streaks
    JOIN public.training_progress progress ON progress.user_id = streaks.user_id
    WHERE streaks.user_id = '${legacyUser}' AND progress.game_id = 'cash-001';
  `);
  if (!authorityBeforeRerun || authorityBeforeRerun !== authorityAfterRerun) {
    throw new Error(`Authority cutover was not rerun-idempotent:\n${authorityBeforeRerun}\n${authorityAfterRerun}`);
  }

  // A historical exact-reference payment is credited, but its legacy marker
  // cannot prove post-epoch eligibility. Once 100 verified days exist, the
  // current 2x entitlement is snapshotted and only the exact 3,000 remainder
  // is paid over later cap windows.
  const historicalUser = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const historicalEarlyClaim = callJson(
    `SELECT public.fn_claim_training_streak_milestone_v2('${historicalUser}', 100)::text;`,
  );
  if (
    historicalEarlyClaim.success !== false
    || historicalEarlyClaim.code !== 'TRAINING_STREAK_MILESTONE_NOT_REACHED'
    || Number(sql(`SELECT count(*) FROM public.diamond_transactions
      WHERE user_id = '${historicalUser}' AND reference_id LIKE '%_part_%';`)) !== 0
  ) {
    throw new Error(`Historical marker incorrectly granted eligibility: ${JSON.stringify(historicalEarlyClaim)}`);
  }
  sql(`UPDATE public.training_streaks
    SET authority_current_streak = 100,
        authority_longest_streak = 100,
        authority_last_training_date = current_date,
        authority_streak_start_date = current_date - 99
    WHERE user_id = '${historicalUser}';`);
  const historicalInstallments = [];
  for (let part = 1; part <= 3; part += 1) {
    const installment = callJson(
      `SELECT public.fn_claim_training_streak_milestone_v2('${historicalUser}', 100)::text;`,
    );
    historicalInstallments.push(installment);
    if (
      installment.success !== true
      || installment.diamondsAwarded !== 1000
      || installment.diamondsAwardedTotal !== 1000 * (part + 1)
      || installment.entitlementDiamonds !== 4000
      || installment.diamondsRemaining !== 1000 * (3 - part)
      || Number(installment.rewardMultiplier) !== 2
    ) {
      throw new Error(`Historical payout installment ${part} failed: ${JSON.stringify(installment)}`);
    }
    sql(`UPDATE public.diamond_transactions SET created_at = now() - interval '${part} months'
      WHERE user_id = '${historicalUser}'
        AND reference_id = 'streak_${historicalUser}_100_part_${part}';`);
  }
  const historicalReplay = callJson(
    `SELECT public.fn_claim_training_streak_milestone_v2('${historicalUser}', 100)::text;`,
  );
  if (
    historicalReplay.success !== true
    || historicalReplay.newClaim !== false
    || historicalReplay.diamondsAwardedTotal !== 4000
    || historicalReplay.entitlementDiamonds !== 4000
    || Number(sql(`SELECT sum(amount) FROM public.diamond_transactions
      WHERE user_id = '${historicalUser}' AND transaction_type = 'streak_reward';`)) !== 4000
  ) {
    throw new Error(`Historical payout replay was not exact: ${JSON.stringify(historicalReplay)}`);
  }

  const historicalOverpaidUser = '12121212-1212-4121-8121-121212121212';
  sql(`UPDATE public.training_streaks
    SET authority_current_streak = 100,
        authority_longest_streak = 100,
        authority_last_training_date = current_date,
        authority_streak_start_date = current_date - 99
    WHERE user_id = '${historicalOverpaidUser}';`);
  const historicalOverpaidClaim = callJson(
    `SELECT public.fn_claim_training_streak_milestone_v2('${historicalOverpaidUser}', 100)::text;`,
  );
  const historicalOverpaidReplay = callJson(
    `SELECT public.fn_claim_training_streak_milestone_v2('${historicalOverpaidUser}', 100)::text;`,
  );
  if (
    historicalOverpaidClaim.success !== true
    || historicalOverpaidClaim.diamondsAwarded !== 0
    || historicalOverpaidClaim.diamondsAwardedTotal !== 4000
    || historicalOverpaidClaim.entitlementDiamonds !== 4000
    || Number(historicalOverpaidClaim.rewardMultiplier) !== 2
    || historicalOverpaidReplay.success !== true
    || historicalOverpaidReplay.diamondsAwardedTotal !== 4000
    || Number(historicalOverpaidReplay.rewardMultiplier) !== 2
    || Number(sql(`SELECT count(*) FROM public.diamond_transactions
      WHERE user_id = '${historicalOverpaidUser}';`)) !== 1
  ) {
    throw new Error(`Historical 2x-to-1x replay was inconsistent: ${JSON.stringify({
      historicalOverpaidClaim,
      historicalOverpaidReplay,
    })}`);
  }

  // A deployment-day legacy Daily row with a null attempt binding is already
  // consumed. It can bind to the sealed recovery attempt, but awards zero.
  const legacyDailyUser = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const legacyDailyAttempt = seedDailyAttempt(legacyDailyUser);
  const legacyDailyCompletion = callJson(
    `SELECT public.fn_complete_training_attempt_v2('${legacyDailyUser}', '${legacyDailyAttempt}')::text;`,
  );
  if (
    legacyDailyCompletion.success !== true
    || legacyDailyCompletion.diamondsEarned !== 0
    || Number(sql(`SELECT count(*) FROM public.diamond_transactions
      WHERE user_id = '${legacyDailyUser}'
        AND reference_id = 'training_attempt:${legacyDailyAttempt}';`)) !== 0
    || sql(`SELECT attempt_id::text FROM public.training_daily_challenge
      WHERE user_id = '${legacyDailyUser}';`) !== legacyDailyAttempt
  ) {
    throw new Error(`Legacy Daily recovery awarded twice: ${JSON.stringify(legacyDailyCompletion)}`);
  }

  // Ordinary service/direct deletion of a sealed answer remains forbidden,
  // while deleting the actual auth.users parent cascades all personal attempt
  // data. Same-row legacy snapshots and verified leaderboard rows also honor
  // authorized account erasure.
  const eraseUser = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const eraseAttempt = seedAttempt(eraseUser, 'phase6-account-erasure');
  const directAnswerDelete = run(tool('psql'), psqlArgs, {
    quiet: true,
    allowFailure: true,
    input: `DELETE FROM public.training_answers WHERE attempt_id = '${eraseAttempt}';\n`,
  });
  if (
    directAnswerDelete.status === 0
    || !directAnswerDelete.stderr.includes('TRAINING_ATTEMPT_ANSWER_IMMUTABLE')
  ) {
    throw new Error(`Direct sealed-answer deletion was not rejected:\n${directAnswerDelete.stdout}\n${directAnswerDelete.stderr}`);
  }
  sql(`DELETE FROM auth.users WHERE id = '${eraseUser}';`);
  if (Number(sql(`SELECT
      (SELECT count(*) FROM public.training_attempts WHERE user_id = '${eraseUser}')
      + (SELECT count(*) FROM public.training_answers WHERE user_id = '${eraseUser}')
      + (SELECT count(*) FROM public.training_attempt_hands WHERE attempt_id = '${eraseAttempt}');`)) !== 0) {
    throw new Error('Account erasure left attempt, hand, or sealed answer rows behind.');
  }
  sql("DELETE FROM auth.users WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';");
  if (Number(sql("SELECT (SELECT count(*) FROM public.training_streaks WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') + (SELECT count(*) FROM public.training_progress WHERE user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');")) !== 0) {
    throw new Error('Same-row authority snapshots prevented account erasure.');
  }
  const legacyDailyVerifiedRows = Number(sql(`SELECT count(*)
    FROM public.training_verified_leaderboard WHERE user_id = '${legacyDailyUser}';`));
  if (legacyDailyVerifiedRows !== 8) {
    throw new Error(`Verified overall/game leaderboard dimensions were incomplete: ${legacyDailyVerifiedRows}`);
  }
  // The production account-erasure workflow removes the profile before its
  // auth parent; this verifier baseline intentionally models profiles with a
  // NO ACTION FK so the ordering remains explicit.
  sql(`DELETE FROM public.profiles WHERE id = '${legacyDailyUser}';
    DELETE FROM auth.users WHERE id = '${legacyDailyUser}';`);
  if (Number(sql(`SELECT count(*) FROM public.training_verified_leaderboard
      WHERE user_id = '${legacyDailyUser}';`)) !== 0) {
    throw new Error('Verified leaderboard did not cascade on account erasure.');
  }

  const concurrentUser = '33333333-3333-4333-8333-333333333333';
  const concurrentAttempt = seedAttempt(concurrentUser, 'phase6-cross-concurrent');
  sql(`
    INSERT INTO public.training_streaks(
      user_id, current_streak, longest_streak, last_training_date,
      streak_start_date, milestones_claimed,
      authority_current_streak, authority_longest_streak,
      authority_last_training_date, authority_streak_start_date
    ) VALUES (
      '${concurrentUser}', 3, 3,
      timezone('America/Chicago', now())::date,
      timezone('America/Chicago', now())::date - 2,
      '[]'::jsonb, 3, 3,
      timezone('America/Chicago', now())::date,
      timezone('America/Chicago', now())::date - 2
    );
  `);

  gateHolder = startGateHolder(tool('psql'), connection);
  await gateHolder.ready;
  const claimPromise = runAsync(tool('psql'), psqlArgs, {
    env: { PGAPPNAME: 'phase6-cross-claim' },
    input: `SET statement_timeout = '8s';\nSET deadlock_timeout = '100ms';\n`
      + `SELECT public.fn_claim_training_streak_milestone_v2('${concurrentUser}', 3)::text;\n`,
  });
  await waitForCount(
    `SELECT count(*) FROM pg_catalog.pg_locks
      WHERE locktype = 'advisory'
        AND classid = '${TEST_GATE_NAMESPACE}'::oid
        AND objid = '${TEST_GATE_KEY}'::oid
        AND NOT granted;`,
    'the milestone claim to hold its user/streak locks at the test gate',
  );

  const completionPromise = runAsync(tool('psql'), psqlArgs, {
    env: { PGAPPNAME: 'phase6-cross-completion' },
    input: `SET statement_timeout = '8s';\nSET deadlock_timeout = '100ms';\n`
      + `SELECT public.fn_complete_training_attempt_v2('${concurrentUser}', '${concurrentAttempt}')::text;\n`,
  });
  await waitForCount(
    `SELECT count(*) FROM pg_catalog.pg_stat_activity
      WHERE application_name = 'phase6-cross-completion'
        AND wait_event_type = 'Lock';`,
    'completion to queue behind the shared per-user lock',
  );
  await gateHolder.release();
  gateHolder = null;
  const [claimOutput, completionOutput] = await Promise.all([claimPromise, completionPromise]);
  const claim = jsonLine(claimOutput);
  const completion = jsonLine(completionOutput);
  if (
    claim.success !== true || claim.diamondsAwardedTotal !== 25
    || completion.success !== true || completion.newCompletion !== true
    || completion.diamondsEarned !== 17
  ) {
    throw new Error(`Cross-RPC results were invalid: ${JSON.stringify({ claim, completion })}`);
  }
  sql('DROP TRIGGER phase6_cross_claim_gate ON public.training_streak_milestone_claims;');

  // One-time post-multiplier entitlement snapshots: 2x and 10x complete below
  // the monthly ceiling, while a 2x 100-day award pays exactly 4,000 over four
  // simulated cap windows without multiplying any installment again.
  const entitlementEvidence = jsonLine(sql(String.raw`
DO $$
DECLARE
  first_claim jsonb;
  replay_claim jsonb;
  installment jsonb;
  multi_user uuid := '66666666-6666-4666-8666-666666666666';
  deferred_user uuid := '13131313-1313-4313-8313-131313131313';
  part integer;
BEGIN
  INSERT INTO public.training_streaks(
    user_id, current_streak, longest_streak, last_training_date,
    streak_start_date, milestones_claimed,
    authority_current_streak, authority_longest_streak,
    authority_last_training_date, authority_streak_start_date
  ) VALUES
    ('44444444-4444-4444-8444-444444444444', 3, 3, current_date, current_date - 2, '[]', 3, 3, current_date, current_date - 2),
    ('55555555-5555-4555-8555-555555555555', 3, 3, current_date, current_date - 2, '[]', 3, 3, current_date, current_date - 2),
    (multi_user, 100, 100, current_date, current_date - 99, '[]', 100, 100, current_date, current_date - 99),
    (deferred_user, 60, 60, current_date, current_date - 59, '[]', 60, 60, current_date, current_date - 59);

  -- Exhaust the current streak family allowance before this user's first
  -- eligible 2x claim. The failed claim must still snapshot a coherent 1,600
  -- entitlement at 2x, then later windows pay that exact target once.
  INSERT INTO public.diamond_transactions(
    user_id, amount, transaction_type, type, reference_id, balance_after
  ) VALUES (
    deferred_user, 1000, 'streak_reward', 'streak_reward',
    'phase6-deferred-family-cap', 1000
  );
  first_claim := public.fn_claim_training_streak_milestone_v2(deferred_user, 60);
  IF first_claim ->> 'success' <> 'false'
     OR first_claim ->> 'code' <> 'TRAINING_STREAK_AWARD_NOT_APPLIED'
     OR (first_claim #>> '{rewardVerdict,reason}') <> 'action_limit'
     OR (first_claim #>> '{rewardVerdict,entitlement}')::integer <> 1600
     OR (first_claim #>> '{rewardVerdict,multiplier}')::numeric <> 2
     OR (SELECT entitlement_diamonds FROM public.training_streak_milestone_claims
         WHERE user_id = deferred_user AND milestone_days = 60) <> 1600
     OR (SELECT reward_multiplier FROM public.training_streak_milestone_claims
         WHERE user_id = deferred_user AND milestone_days = 60) <> 2
     OR (SELECT claim_count FROM public.training_streak_milestone_claims
         WHERE user_id = deferred_user AND milestone_days = 60) <> 0 THEN
    RAISE EXCEPTION '2x first-window deferral lost entitlement truth: %', first_claim;
  END IF;
  UPDATE public.diamond_transactions
  SET created_at = now() - interval '2 months'
  WHERE reference_id = 'phase6-deferred-family-cap';
  installment := public.fn_claim_training_streak_milestone_v2(deferred_user, 60);
  IF (installment ->> 'diamondsAwarded')::integer <> 1000
     OR (installment ->> 'diamondsAwardedTotal')::integer <> 1000
     OR (installment ->> 'diamondsRemaining')::integer <> 600
     OR (installment ->> 'entitlementDiamonds')::integer <> 1600
     OR (installment ->> 'rewardMultiplier')::numeric <> 2 THEN
    RAISE EXCEPTION '2x deferred first installment was incoherent: %', installment;
  END IF;
  UPDATE public.diamond_transactions
  SET created_at = now() - interval '3 months'
  WHERE reference_id = 'streak_' || deferred_user::text || '_60_part_1';
  installment := public.fn_claim_training_streak_milestone_v2(deferred_user, 60);
  IF (installment ->> 'diamondsAwarded')::integer <> 600
     OR (installment ->> 'diamondsAwardedTotal')::integer <> 1600
     OR (installment ->> 'diamondsRemaining')::integer <> 0
     OR (installment ->> 'entitlementDiamonds')::integer <> 1600
     OR (installment ->> 'rewardMultiplier')::numeric <> 2 THEN
    RAISE EXCEPTION '2x deferred completion was incoherent: %', installment;
  END IF;
  replay_claim := public.fn_claim_training_streak_milestone_v2(deferred_user, 60);
  IF (replay_claim ->> 'diamondsAwarded')::integer <> 0
     OR (replay_claim ->> 'diamondsAwardedTotal')::integer <> 1600
     OR (replay_claim ->> 'entitlementDiamonds')::integer <> 1600
     OR (replay_claim ->> 'rewardMultiplier')::numeric <> 2
     OR (SELECT count(*) FROM public.diamond_transactions
         WHERE user_id = deferred_user) <> 3 THEN
    RAISE EXCEPTION '2x deferred replay was not exact: %', replay_claim;
  END IF;

  first_claim := public.fn_claim_training_streak_milestone_v2(
    '44444444-4444-4444-8444-444444444444', 3
  );
  replay_claim := public.fn_claim_training_streak_milestone_v2(
    '44444444-4444-4444-8444-444444444444', 3
  );
  IF (first_claim ->> 'diamondsAwardedTotal')::integer <> 50
     OR (first_claim ->> 'entitlementDiamonds')::integer <> 50
     OR (first_claim ->> 'rewardMultiplier')::numeric <> 2
     OR (replay_claim ->> 'diamondsAwardedTotal')::integer <> 50
     OR (SELECT count(*) FROM public.diamond_transactions
         WHERE user_id = '44444444-4444-4444-8444-444444444444') <> 1 THEN
    RAISE EXCEPTION '2x below-cap entitlement or replay failed: %, %', first_claim, replay_claim;
  END IF;

  first_claim := public.fn_claim_training_streak_milestone_v2(
    '55555555-5555-4555-8555-555555555555', 3
  );
  replay_claim := public.fn_claim_training_streak_milestone_v2(
    '55555555-5555-4555-8555-555555555555', 3
  );
  IF (first_claim ->> 'diamondsAwardedTotal')::integer <> 250
     OR (first_claim ->> 'entitlementDiamonds')::integer <> 250
     OR (first_claim ->> 'rewardMultiplier')::numeric <> 10
     OR (replay_claim ->> 'diamondsAwardedTotal')::integer <> 250
     OR (SELECT count(*) FROM public.diamond_transactions
         WHERE user_id = '55555555-5555-4555-8555-555555555555') <> 1 THEN
    RAISE EXCEPTION '10x below-cap entitlement or replay failed: %, %', first_claim, replay_claim;
  END IF;

  FOR part IN 1..4 LOOP
    installment := public.fn_claim_training_streak_milestone_v2(multi_user, 100);
    IF (installment ->> 'diamondsAwarded')::integer <> 1000
       OR (installment ->> 'diamondsAwardedTotal')::integer <> part * 1000
       OR (installment ->> 'entitlementDiamonds')::integer <> 4000
       OR (installment ->> 'diamondsRemaining')::integer <> (4 - part) * 1000
       OR (installment ->> 'rewardMultiplier')::numeric <> 2 THEN
      RAISE EXCEPTION '2x installment % failed: %', part, installment;
    END IF;
    UPDATE public.diamond_transactions
    SET created_at = now() - (part || ' months')::interval
    WHERE reference_id = 'streak_' || multi_user::text || '_100_part_' || part::text;
  END LOOP;
  replay_claim := public.fn_claim_training_streak_milestone_v2(multi_user, 100);
  IF (replay_claim ->> 'diamondsAwardedTotal')::integer <> 4000
     OR (replay_claim ->> 'entitlementDiamonds')::integer <> 4000
     OR (SELECT count(*) FROM public.diamond_transactions WHERE user_id = multi_user) <> 4
     OR (SELECT sum(amount) FROM public.diamond_transactions WHERE user_id = multi_user) <> 4000 THEN
    RAISE EXCEPTION '2x multi-window entitlement replay failed: %', replay_claim;
  END IF;
END $$;

SELECT jsonb_build_object(
  'oneXTotal', (SELECT diamonds_awarded FROM public.training_streak_milestone_claims
    WHERE user_id = '33333333-3333-4333-8333-333333333333' AND milestone_days = 3),
  'twoXTotal', (SELECT diamonds_awarded FROM public.training_streak_milestone_claims
    WHERE user_id = '44444444-4444-4444-8444-444444444444' AND milestone_days = 3),
  'tenXTotal', (SELECT diamonds_awarded FROM public.training_streak_milestone_claims
    WHERE user_id = '55555555-5555-4555-8555-555555555555' AND milestone_days = 3),
  'multiWindowTotal', (SELECT diamonds_awarded FROM public.training_streak_milestone_claims
    WHERE user_id = '66666666-6666-4666-8666-666666666666' AND milestone_days = 100),
  'deferredTwoXTotal', (SELECT diamonds_awarded FROM public.training_streak_milestone_claims
    WHERE user_id = '13131313-1313-4313-8313-131313131313' AND milestone_days = 60)
);
`));

  // Missing catalog/profile failures leave attempts open; an explicit family
  // cap settles at zero; and a duplicate only settles after the exact positive
  // transaction is reconciled.
  const missingCatalogAttempt = seedAttempt(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'phase6-missing-catalog',
  );
  sql("DELETE FROM public.diamond_reward_catalog WHERE action_key = 'training_reward';");
  const missingCatalog = callJson(
    `SELECT public.fn_complete_training_attempt_v2(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${missingCatalogAttempt}'
    )::text;`,
  );
  if (missingCatalog.success !== false || missingCatalog.code !== 'TRAINING_REWARD_NOT_SETTLED') {
    throw new Error(`Missing catalog did not fail closed: ${JSON.stringify(missingCatalog)}`);
  }
  sql(`
    INSERT INTO public.diamond_reward_catalog(
      action_key, diamonds, max_per_day, counts_toward_daily_cap,
      lifetime, category, active
    ) VALUES ('training_reward', 0, NULL, false, false, 'training', true);
  `);

  const missingProfileAttempt = seedAttempt(
    '77777777-7777-4777-8777-777777777777',
    'phase6-missing-profile',
  );
  const missingProfile = callJson(
    `SELECT public.fn_complete_training_attempt_v2(
      '77777777-7777-4777-8777-777777777777', '${missingProfileAttempt}'
    )::text;`,
  );
  if (missingProfile.success !== false || missingProfile.code !== 'TRAINING_REWARD_NOT_SETTLED') {
    throw new Error(`Missing profile did not fail closed: ${JSON.stringify(missingProfile)}`);
  }
  sql("INSERT INTO public.profiles(id) VALUES ('77777777-7777-4777-8777-777777777777');");
  const missingProfileRetry = callJson(
    `SELECT public.fn_complete_training_attempt_v2(
      '77777777-7777-4777-8777-777777777777', '${missingProfileAttempt}'
    )::text;`,
  );
  if (missingProfileRetry.success !== true || missingProfileRetry.newCompletion !== true) {
    throw new Error(`Restored profile did not allow retry: ${JSON.stringify(missingProfileRetry)}`);
  }

  const capAttempt = seedAttempt('88888888-8888-4888-8888-888888888888', 'phase6-cap-settled');
  sql(`
    UPDATE public.profiles SET diamonds = 1500, diamond_balance = 1500
    WHERE id = '88888888-8888-4888-8888-888888888888';
    INSERT INTO public.diamond_transactions(
      user_id, amount, transaction_type, type, reference_id, balance_after
    ) VALUES (
      '88888888-8888-4888-8888-888888888888', 1500,
      'training_reward', 'training_reward', 'phase6-cap-seed', 1500
    );
  `);
  const capSettled = callJson(
    `SELECT public.fn_complete_training_attempt_v2(
      '88888888-8888-4888-8888-888888888888', '${capAttempt}'
    )::text;`,
  );
  if (capSettled.success !== true || capSettled.diamondsEarned !== 0) {
    throw new Error(`Explicit cap did not settle at zero: ${JSON.stringify(capSettled)}`);
  }

  const duplicateAttempt = seedAttempt('99999999-9999-4999-8999-999999999999', 'phase6-duplicate');
  sql(`
    UPDATE public.profiles SET diamonds = 13, diamond_balance = 13
    WHERE id = '99999999-9999-4999-8999-999999999999';
    INSERT INTO public.diamond_transactions(
      user_id, amount, transaction_type, type, reference_id, balance_after
    ) VALUES (
      '99999999-9999-4999-8999-999999999999', 13,
      'training_reward', 'training_reward', 'training_attempt:${duplicateAttempt}', 13
    );
  `);
  const duplicateReconciled = callJson(
    `SELECT public.fn_complete_training_attempt_v2(
      '99999999-9999-4999-8999-999999999999', '${duplicateAttempt}'
    )::text;`,
  );
  if (
    duplicateReconciled.success !== true
    || duplicateReconciled.diamondsEarned !== 13
    || duplicateReconciled.rewardVerdict?.reconciled !== true
  ) {
    throw new Error(`Duplicate reward was not reconciled: ${JSON.stringify(duplicateReconciled)}`);
  }

  const malformedAttempt = seedAttempt(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'phase6-malformed-award',
    'adv-011',
  );
  sql(String.raw`
    CREATE OR REPLACE FUNCTION public.award_diamonds_v2(
      p_user_id uuid,
      p_action_key text,
      p_reference_id text DEFAULT NULL,
      p_target_id text DEFAULT NULL,
      p_metadata jsonb DEFAULT '{}'
    ) RETURNS jsonb LANGUAGE sql SECURITY DEFINER
    SET search_path = public AS $$ SELECT '[]'::jsonb $$;
  `);
  const malformed = run(tool('psql'), psqlArgs, {
    quiet: true,
    allowFailure: true,
    input: `SET statement_timeout = '8s';\nSELECT public.fn_complete_training_attempt_v2(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '${malformedAttempt}'
    )::text;\n`,
  });
  if (malformed.status === 0 || !malformed.stderr.includes('TRAINING_REWARD_RESPONSE_INVALID')) {
    throw new Error(`Malformed reward response did not abort completion:\n${malformed.stdout}\n${malformed.stderr}`);
  }
  run(tool('psql'), ['-X', '-v', 'ON_ERROR_STOP=1', ...connection, '-f', AWARD_MIGRATION], { quiet: true });

  const finalEvidence = jsonLine(sql(String.raw`
DO $$
BEGIN
  IF (SELECT status FROM public.training_attempts
      WHERE client_nonce = 'phase6-missing-catalog') <> 'open'
     OR EXISTS (SELECT 1 FROM public.training_level_history
        WHERE attempt_id = '${missingCatalogAttempt}')
     OR (SELECT status FROM public.training_attempts
        WHERE client_nonce = 'phase6-malformed-award') <> 'open'
     OR EXISTS (SELECT 1 FROM public.training_level_history
        WHERE attempt_id = '${malformedAttempt}')
     OR (SELECT status FROM public.training_attempts
        WHERE id = '${capAttempt}') <> 'completed'
     OR (SELECT diamonds_earned FROM public.training_level_history
        WHERE attempt_id = '${capAttempt}') <> 0
     OR (SELECT status FROM public.training_attempts
        WHERE id = '${duplicateAttempt}') <> 'completed'
     OR (SELECT diamonds_earned FROM public.training_level_history
        WHERE attempt_id = '${duplicateAttempt}') <> 13
     OR (SELECT count(*) FROM public.diamond_transactions
        WHERE reference_id = 'training_attempt:${duplicateAttempt}') <> 1
     OR has_function_privilege('authenticated',
        'public.fn_training_leaderboard_record(uuid,text,text,integer,integer,boolean,integer,numeric,numeric)',
        'EXECUTE')
     OR has_function_privilege('authenticated',
        'public.fn_training_verified_leaderboard_record_v2(uuid,text,text,text,integer,integer,boolean,integer,numeric,numeric)',
        'EXECUTE')
     OR has_function_privilege('authenticated',
        'public.fn_training_verified_leaderboard_rank_v2(uuid,text,text,text,text)',
        'EXECUTE')
     OR has_table_privilege('authenticated', 'public.training_verified_leaderboard', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_question_cache', 'SELECT')
     OR NOT has_function_privilege('service_role',
        'public.fn_training_leaderboard_record(uuid,text,text,integer,integer,boolean,integer,numeric,numeric)',
        'EXECUTE')
     OR NOT has_function_privilege('service_role',
        'public.fn_training_verified_leaderboard_record_v2(uuid,text,text,text,integer,integer,boolean,integer,numeric,numeric)',
        'EXECUTE')
     OR NOT has_function_privilege('service_role',
        'public.fn_training_verified_leaderboard_rank_v2(uuid,text,text,text,text)',
        'EXECUTE') THEN
    RAISE EXCEPTION 'Phase 6 cross-RPC final invariant failed';
  END IF;
END $$;
SELECT jsonb_build_object(
  'crossRpcNoDeadlock', true,
  'oneXTotal', ${entitlementEvidence.oneXTotal},
  'twoXTotal', ${entitlementEvidence.twoXTotal},
  'tenXTotal', ${entitlementEvidence.tenXTotal},
  'multiWindowTotal', ${entitlementEvidence.multiWindowTotal},
  'deferredTwoXTotal', ${entitlementEvidence.deferredTwoXTotal},
  'missingCatalogRetryable', true,
  'missingProfileRetried', true,
  'capSettledAtZero', true,
  'duplicateReconciled', true,
  'malformedResponseRolledBack', true,
  'leaderboardRpcBlocked', true,
  'cacheAnswerKeysBlocked', true
);
`));
  console.log(
    `Phase 6 cross-RPC PostgreSQL verification passed: ${JSON.stringify(finalEvidence)}`,
  );
} finally {
  if (gateHolder) {
    try { await gateHolder.release(); } catch {}
  }
  if (started) {
    spawnSync(tool('pg_ctl'), ['-D', dataDir, '-m', 'fast', 'stop'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  }
  if (tempRoot.startsWith(`${tmpdir()}${path.sep}sp-training-cross-rpc-`)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
