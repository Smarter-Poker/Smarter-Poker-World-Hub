import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { TextDecoder } from 'node:util';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

import {
  decodeSolverWorkerSecret,
  signSolverWorkerRequest,
  solverWorkerBodySha256,
  solverWorkerEnvelopeIsValid,
  verifySolverWorkerRequest,
} from '../src/lib/training/solverWorkerAuth.mjs';
import {
  parseSolverScenarioHash,
  SOLVER_POSITIONS,
} from '../src/lib/training/solverRowIdentity.mjs';

const API_SOURCE = fs.readFileSync('pages/api/training/solver-worker.js', 'utf8');
const ORCHESTRATOR_SOURCE = fs.readFileSync('scripts/preflop-deep/orchestrate.py', 'utf8');
const LAUNCHER_SOURCE = fs.readFileSync('scripts/preflop-deep/run_machine.py', 'utf8');
const ENV_EXAMPLE_SOURCE = fs.readFileSync('.env.example', 'utf8');
const WORKER_MIGRATION_SOURCE = fs.readFileSync(
  'supabase/migrations/20260907204100_training_solver_worker_signed_ingestion.sql',
  'utf8',
);
const BOUNDED_CANARY_MIGRATION_SOURCE = fs.readFileSync(
  'supabase/migrations/20260910120000_training_solver_bounded_canary_authority.sql',
  'utf8',
);
const M1_SECRET_HEX = '1'.repeat(64);
const M2_SECRET_HEX = '2'.repeat(64);
const FORBIDDEN_WORKER_DATABASE_ENV = [
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_KEY',
  'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'SUPABASE_CONNECTION_POOL_URL', 'SUPABASE_DB_HOST', 'SUPABASE_DB_PORT',
  'SUPABASE_DB_USER', 'SUPABASE_DB_PASSWORD', 'SUPABASE_DB_NAME',
  'SUPABASE_DB_SSL', 'SUPABASE_DB_CA', 'SUPABASE_JWT_SECRET',
  'SUPABASE_PROJECT_REF', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
  'FALLBACK_SUPABASE_URL', 'SUPABASE_URL_FALLBACK', 'SUPABASE_URL_WITH_PASS',
  'DATABASE_URL', 'DIRECT_URL',
  'POSTGRES_URL', 'POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING',
  'POSTGRES_PASSWORD', 'PG_PASSWORD', 'PGHOST', 'PGPORT', 'PGDATABASE',
  'PGUSER', 'PGPASSWORD',
];

function cleanWorkerEnvironment(overrides = {}) {
  const environment = { ...process.env };
  for (const name of FORBIDDEN_WORKER_DATABASE_ENV) delete environment[name];
  return { ...environment, ...overrides };
}

function worker(machineId = 'M1') {
  return {
    machine_id: machineId,
    solver_version: 'PioSOLVER 3.0',
    solver_binary_checksum: 'a'.repeat(64),
    pipeline_commit: 'b'.repeat(40),
    manifest_version: 'training-v2',
    manifest_checksum: 'c'.repeat(64),
  };
}

function artifact(solvedAt = new Date().toISOString()) {
  return {
    audited_at: solvedAt,
    game_type: 'hu_cash',
    id: '90000000-0000-4000-8000-000000000009',
    machine_id: 'M1',
    manifest_checksum: 'c'.repeat(64),
    manifest_version: 'training-v2',
    pipeline_commit: 'b'.repeat(40),
    quality_status: 'validated',
    scenario_hash: 'hu_cash_BB_100bb_Jh7d2c',
    solved_v2_at: solvedAt,
    solver_binary_checksum: 'a'.repeat(64),
    solver_version: 'PioSOLVER 3.0',
    source_artifact_checksum: 'd'.repeat(64),
    stack_depth: 100,
    strategy_matrix_v2: { sealed: true },
    street: 'flop',
  };
}

function signedRequest(operation, payload, {
  machineId = 'M1',
  nonce = randomUUID(),
  timestamp = String(Math.floor(Date.now() / 1000)),
  secretHex = M1_SECRET_HEX,
} = {}) {
  const envelope = {
    operation,
    payload,
    protocol: 'smarter-poker.solver-worker.v1',
    worker: worker(machineId),
  };
  const rawBody = Buffer.from(JSON.stringify(envelope));
  const bodySha256 = solverWorkerBodySha256(rawBody);
  const signature = signSolverWorkerRequest({
    workerId: machineId,
    timestamp,
    nonce,
    bodySha256,
    secret: Buffer.from(secretHex, 'hex'),
  });
  return {
    method: 'POST',
    url: '/api/training/solver-worker',
    body: rawBody,
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'identity',
      'x-real-ip': '203.0.113.10',
      'x-sp-solver-worker': machineId,
      'x-sp-solver-timestamp': timestamp,
      'x-sp-solver-nonce': nonce,
      'x-sp-solver-content-sha256': bodySha256,
      'x-sp-solver-signature': signature,
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    headersSent: false,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

function boundedResult(result, observations, label) {
  return {
    abortSignal(signal) {
      observations.abortSignals.push({ label, signal });
      return Promise.resolve(result);
    },
  };
}

async function loadApi({ claim = true, rowStateMutator = null } = {}) {
  const observations = { rpc: [], tables: [], abortSignals: [] };
  const client = {
    rpc(name, args) {
      observations.rpc.push([name, args]);
      if (name === 'check_rate_limit_strict') {
        return boundedResult({ data: true, error: null }, observations, name);
      }
      if (name === 'training_claim_solver_worker_request_v1') {
        return boundedResult({ data: claim, error: null }, observations, name);
      }
      if (name === 'training_ingest_solver_artifact_v1') {
        return boundedResult({
          data: [{
            artifact_id: args.p_artifact.id,
            scenario_hash: args.p_artifact.scenario_hash,
            source_artifact_checksum: args.p_artifact.source_artifact_checksum,
            replayed: false,
          }],
          error: null,
        }, observations, name);
      }
      if (name === 'training_solver_worker_row_states_v2') {
        let rows = args.p_scenario_hashes.map((scenarioHash) => ({
          id: artifact().id,
          scenario_hash: scenarioHash,
          game_type: 'hu_cash',
          stack_depth: 100,
          street: 'flop',
          node: 'r:0',
          hero_position: 'BB',
          solved_v2_at: artifact().solved_v2_at,
          quality_status: 'validated',
          solver_version: 'PioSOLVER 3.0',
          solver_binary_checksum: 'a'.repeat(64),
          machine_id: 'M1',
          pipeline_commit: 'b'.repeat(40),
          manifest_version: 'training-v2',
          manifest_checksum: 'c'.repeat(64),
          source_artifact_checksum: 'd'.repeat(64),
          audited_at: artifact().audited_at,
          admitted: true,
          admission_mode: 'backlog',
          partition_count: null,
          partition_index: null,
          canary_target_role: null,
          authorized_node: null,
          authorized_hero_position: null,
          canary_authorized: false,
        }));
        if (rowStateMutator) rows = rowStateMutator(rows);
        return boundedResult({
          data: rows,
          error: null,
        }, observations, name);
      }
      if (name === 'training_solver_worker_board_page_v1') {
        return boundedResult({
          data: [{ scenario_hash: 'hu_cash_BB_100bb_Jh7d2c' }],
          error: null,
        }, observations, name);
      }
      throw new Error(`unexpected RPC ${name}`);
    },
    from(table) {
      const state = { table, filters: [] };
      observations.tables.push(state);
      const builder = {
        select(columns) { state.select = columns; return builder; },
        in(column, value) { state.filters.push(['in', column, value]); return builder; },
        eq(column, value) { state.filters.push(['eq', column, value]); return builder; },
        like(column, value) { state.filters.push(['like', column, value]); return builder; },
        gte(column, value) { state.filters.push(['gte', column, value]); return builder; },
        lt(column, value) { state.filters.push(['lt', column, value]); return builder; },
        gt(column, value) { state.filters.push(['gt', column, value]); return builder; },
        order(column, options) { state.order = [column, options]; return builder; },
        limit(limit) {
          state.limit = limit;
          const data = table === 'solved_spots_gold'
            ? [{ scenario_hash: 'hu_cash_BB_100bb_Jh7d2c' }]
            : [];
          return boundedResult({ data, error: null }, observations, `${table}:limit`);
        },
        upsert(value, options) {
          state.upsert = [value, options];
          return boundedResult({ data: null, error: null }, observations, `${table}:upsert`);
        },
      };
      return builder;
    },
  };
  const environment = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key',
    SOLVER_WORKER_M1_HMAC_SECRET: M1_SECRET_HEX,
    SOLVER_WORKER_M2_HMAC_SECRET: M2_SECRET_HEX,
  };
  const dependencies = {
    'node:util': { TextDecoder },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true },
    '../../../src/lib/sentryWrap': { reportApiError: () => {} },
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/training/solverRowIdentity.mjs': {
      parseSolverScenarioHash,
      SOLVER_POSITIONS,
    },
    '../../../src/lib/training/solverWorkerAuth.mjs': {
      decodeSolverWorkerSecret: (workerId) => decodeSolverWorkerSecret(workerId, environment),
      SOLVER_WORKER_MAX_BODY_BYTES: 2 * 1024 * 1024,
      solverWorkerEnvelopeIsValid,
      verifySolverWorkerRequest,
    },
  };
  const context = createContext({
    AbortController,
    Buffer,
    console,
    Date,
    process: { env: environment },
    setTimeout,
    clearTimeout,
  });
  const module = new SourceTextModule(API_SOURCE, { identifier: 'solver-worker.js', context });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected solver-worker dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  return { handler: module.namespace.default, observations };
}

test('per-worker HMAC binds exact bytes, identity, timestamp, and nonce', () => {
  const req = signedRequest('heartbeat', {
    bad: 0, board: '', note: 'idle', phase: 'idle', rows_written: 0, spots_done: 0,
  });
  const fields = {
    workerId: req.headers['x-sp-solver-worker'],
    timestamp: req.headers['x-sp-solver-timestamp'],
    nonce: req.headers['x-sp-solver-nonce'],
    bodySha256: req.headers['x-sp-solver-content-sha256'],
    signature: req.headers['x-sp-solver-signature'],
    rawBody: req.body,
    secret: Buffer.from(M1_SECRET_HEX, 'hex'),
  };
  assert.equal(verifySolverWorkerRequest(fields), true);
  assert.equal(verifySolverWorkerRequest({ ...fields, rawBody: Buffer.from(`${req.body} `) }), false);
  assert.equal(verifySolverWorkerRequest({
    ...fields,
    timestamp: String(Number(fields.timestamp) - 301),
  }), false);
  assert.ok(decodeSolverWorkerSecret('M1', {
    SOLVER_WORKER_M1_HMAC_SECRET: M1_SECRET_HEX,
    SOLVER_WORKER_M2_HMAC_SECRET: M2_SECRET_HEX,
  }));
  assert.equal(decodeSolverWorkerSecret('M1', {
    SOLVER_WORKER_M1_HMAC_SECRET: M1_SECRET_HEX,
    SOLVER_WORKER_M2_HMAC_SECRET: M1_SECRET_HEX,
  }), null, 'one shared secret cannot impersonate two worker identities');
});

test('Node gateway and Python worker share one byte-exact HMAC vector', () => {
  const body = Buffer.from('{"nested":{"z":-0.0,"a":1e-7},"unicode":"é😀"}', 'utf8');
  const bodySha256 = solverWorkerBodySha256(body);
  const fields = {
    workerId: 'M1',
    timestamp: '1788750000',
    nonce: '123e4567-e89b-42d3-a456-426614174000',
    bodySha256,
    secret: Buffer.from(M1_SECRET_HEX, 'hex'),
  };
  const nodeSignature = signSolverWorkerRequest(fields);
  const pythonSignature = execFileSync('python3', ['-c', String.raw`
import hashlib, hmac
body = '{"nested":{"z":-0.0,"a":1e-7},"unicode":"é😀"}'.encode('utf-8')
digest = hashlib.sha256(body).hexdigest()
message = '\n'.join(('smarter-poker.solver-worker.v1', 'M1', '1788750000',
                     '123e4567-e89b-42d3-a456-426614174000', digest)).encode('utf-8')
print(hmac.new(bytes.fromhex('1' * 64), message, hashlib.sha256).hexdigest())
`], { encoding: 'utf8' }).trim();
  assert.equal(pythonSignature, nodeSignature);
});

test('signed API ingests one exact artifact only through the transactional RPC', async () => {
  const runtime = await loadApi();
  const req = signedRequest('ingest_artifact', { artifact: artifact() });
  const res = response();
  await runtime.handler(req, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.success, true);
  assert.equal(res.body.operation, 'ingest_artifact');
  assert.equal(runtime.observations.tables.length, 0, 'the API cannot patch the warehouse directly');
  assert.deepEqual(runtime.observations.rpc.map(([name]) => name), [
    'check_rate_limit_strict',
    'training_ingest_solver_artifact_v1',
  ]);
  assert.equal(runtime.observations.abortSignals.length, 2,
    'both rate-limit and ingest persistence calls must be cancellable and bounded');
  const ingestArgs = runtime.observations.rpc[1][1];
  assert.equal(ingestArgs.p_machine_id, 'M1');
  assert.equal(ingestArgs.p_nonce, req.headers['x-sp-solver-nonce']);
  assert.equal(ingestArgs.p_body_sha256, req.headers['x-sp-solver-content-sha256']);
  assert.equal(ingestArgs.p_artifact.id, artifact().id);
});

test('tampering and unsealed ICM fail before any database call', async () => {
  const tamperedRuntime = await loadApi();
  const tampered = signedRequest('heartbeat', {
    bad: 0, board: '', note: 'idle', phase: 'idle', rows_written: 0, spots_done: 0,
  });
  tampered.body = Buffer.from(`${tampered.body} `);
  const tamperedResponse = response();
  await tamperedRuntime.handler(tampered, tamperedResponse);
  assert.equal(tamperedResponse.statusCode, 401);
  assert.equal(tamperedRuntime.observations.rpc.length, 0);

  const icmRuntime = await loadApi();
  const icmArtifact = artifact();
  icmArtifact.game_type = 'mtt_6max_icm';
  icmArtifact.scenario_hash = 'mtt_6max_icm_BB_100bb_Jh7d2c';
  const icmResponse = response();
  await icmRuntime.handler(
    signedRequest('ingest_artifact', { artifact: icmArtifact }),
    icmResponse,
  );
  assert.equal(icmResponse.statusCode, 400);
  assert.equal(icmRuntime.observations.rpc.length, 0);
});

test('metadata reads consume a durable nonce and remain keyset/row bounded', async () => {
  const runtime = await loadApi();
  const res = response();
  await runtime.handler(signedRequest('board_page', {
    after_scenario: 'hu_cash_BB_100bb_AsKdQc',
    game_type: 'hu_cash',
    limit: 500,
    position: 'BB',
    stack_depth: 100,
    street: 'flop',
  }), res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(runtime.observations.rpc.map(([name]) => name), [
    'check_rate_limit_strict',
    'training_claim_solver_worker_request_v1',
    'training_solver_worker_board_page_v1',
  ]);
  assert.equal(runtime.observations.tables.length, 0,
    'board discovery must not grant the service key raw warehouse access');
  const boardArgs = runtime.observations.rpc[2][1];
  assert.deepEqual({
    gameType: boardArgs.p_game_type,
    stackDepth: boardArgs.p_stack_depth,
    street: boardArgs.p_street,
    position: boardArgs.p_position,
    after: boardArgs.p_after_scenario,
    limit: boardArgs.p_limit,
  }, {
    gameType: 'hu_cash',
    stackDepth: 100,
    street: 'flop',
    position: 'BB',
    after: 'hu_cash_BB_100bb_AsKdQc',
    limit: 500,
  });
  assert.equal(runtime.observations.abortSignals.length, 3);

  const rowRuntime = await loadApi();
  const rowResponse = response();
  await rowRuntime.handler(signedRequest('row_states', {
    scenario_hashes: ['hu_cash_BB_100bb_Jh7d2c'],
  }), rowResponse);
  assert.equal(rowResponse.statusCode, 200, JSON.stringify(rowResponse.body));
  assert.equal(rowResponse.body.rows[0].admitted, true);
  assert.equal(rowResponse.body.rows[0].node, 'r:0');
  assert.equal(rowResponse.body.rows[0].hero_position, 'BB');
  assert.deepEqual(rowRuntime.observations.rpc.map(([name]) => name), [
    'check_rate_limit_strict',
    'training_claim_solver_worker_request_v1',
    'training_solver_worker_row_states_v2',
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(rowRuntime.observations.rpc[2][1])), {
    p_machine_id: 'M1',
    p_solver_version: 'PioSOLVER 3.0',
    p_solver_binary_checksum: 'a'.repeat(64),
    p_pipeline_commit: 'b'.repeat(40),
    p_manifest_version: 'training-v2',
    p_manifest_checksum: 'c'.repeat(64),
    p_scenario_hashes: ['hu_cash_BB_100bb_Jh7d2c'],
  });
  assert.equal(rowRuntime.observations.tables.length, 0,
    'resume certification must come from the catalog+authority RPC');
  assert.equal(rowRuntime.observations.abortSignals.length, 3);

  const replayRuntime = await loadApi({ claim: false });
  const replayResponse = response();
  await replayRuntime.handler(signedRequest('row_states', {
    scenario_hashes: ['hu_cash_BB_100bb_Jh7d2c'],
  }), replayResponse);
  assert.equal(replayResponse.statusCode, 409);
  assert.equal(replayRuntime.observations.tables.length, 0,
    'a consumed nonce cannot execute its metadata operation again');
});

test('caller-bound canary row-state proof fails closed on an invalid partition', async () => {
  const runtime = await loadApi({
    rowStateMutator: (rows) => rows.map((row) => ({
      ...row,
      admission_mode: 'bounded_canary',
      partition_count: 2,
      partition_index: 1,
      canary_target_role: 'parent',
      authorized_node: 'r:0',
      authorized_hero_position: 'BB',
      canary_authorized: true,
    })),
  });
  const res = response();
  await runtime.handler(signedRequest('row_states', {
    scenario_hashes: ['hu_cash_BB_100bb_Jh7d2c'],
  }), res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), {
    success: false,
    error: 'Solver worker request unavailable',
  });
  assert.equal(runtime.observations.tables.length, 0);
});

test('worker transport is redirect-proof, service-key-free, bounded, and index-gated', () => {
  assert.match(ORCHESTRATOR_SOURCE, /class _NoWorkerRedirects\(urllib\.request\.HTTPRedirectHandler\)/);
  assert.match(ORCHESTRATOR_SOURCE, /return None/);
  assert.match(ORCHESTRATOR_SOURCE, /parsed_worker_url\.netloc != "smarter\.poker"/);
  assert.match(LAUNCHER_SOURCE, /worker_api_parts\.netloc != "smarter\.poker"/);
  assert.match(ORCHESTRATOR_SOURCE, /remove direct database configuration/);
  for (const name of FORBIDDEN_WORKER_DATABASE_ENV) {
    assert.match(ORCHESTRATOR_SOURCE, new RegExp(`['"]${name}['"]`));
    assert.match(LAUNCHER_SOURCE, new RegExp(`['"]${name}['"]`));
  }
  assert.doesNotMatch(ORCHESTRATOR_SOURCE, /\/rest\/v1\//);
  assert.doesNotMatch(ORCHESTRATOR_SOURCE, /Authorization.*Bearer/);
  assert.match(API_SOURCE, /const DB_OPERATION_TIMEOUT_MS = 12_000/);
  assert.equal((API_SOURCE.match(/executeBoundedDatabaseOperation\(/g) || []).length >= 7, true);
  assert.match(API_SOURCE, /training_solver_worker_row_states_v2/);
  assert.match(API_SOURCE, /training_solver_worker_board_page_v1/);
  assert.doesNotMatch(API_SOURCE, /\.from\('solved_spots_gold'\)/);
  assert.match(WORKER_MIGRATION_SOURCE,
    /ARRAY\['game_type', 'stack_depth', 'street', 'scenario_hash'\]::text\[\]/);
  assert.match(WORKER_MIGRATION_SOURCE, /index_row\.indnkeyatts = 4/);
  assert.match(WORKER_MIGRATION_SOURCE, /index_row\.indnatts = 4/);
  assert.match(WORKER_MIGRATION_SOURCE, /TRAINING_SOLVER_WORKER_BOARD_PAGE_INDEX_MISSING/);
  assert.match(WORKER_MIGRATION_SOURCE, /TRAINING_SOLVER_WORKER_SCENARIO_HASH_INDEX_MISSING/);
  assert.match(WORKER_MIGRATION_SOURCE, /ARRAY\['scenario_hash'\]::text\[\]/);
  assert.match(WORKER_MIGRATION_SOURCE, /index_row\.indnkeyatts = 1/);
  assert.match(WORKER_MIGRATION_SOURCE, /index_row\.indnatts = 1/);
  assert.match(WORKER_MIGRATION_SOURCE, /training_solver_worker_row_states_v1/);
  assert.match(WORKER_MIGRATION_SOURCE, /training_solver_worker_board_page_v1/);
  assert.match(WORKER_MIGRATION_SOURCE, /artifact\.scenario_hash >= v_prefix/);
  assert.match(WORKER_MIGRATION_SOURCE, /artifact\.scenario_hash < v_upper_bound/);
  assert.match(WORKER_MIGRATION_SOURCE, /artifact\.scenario_hash > p_after_scenario/);
  assert.match(WORKER_MIGRATION_SOURCE, /v_upper_bound := v_prefix \|\| 'Z'/);
  assert.doesNotMatch(WORKER_MIGRATION_SOURCE, /v_upper_bound := v_prefix \|\| chr\(127\)/);
  assert.match(WORKER_MIGRATION_SOURCE, /hu_cash_BTN_100bb_AsAhAd' < 'hu_cash_BTN_100bb_Z'/);
  assert.match(WORKER_MIGRATION_SOURCE, /AS admitted/);
  assert.match(WORKER_MIGRATION_SOURCE, /SOLVER_WORKER_REPLAY_ARTIFACT_NOT_CURRENT/);
  assert.equal((WORKER_MIGRATION_SOURCE.match(
    /MESSAGE = 'SOLVER_WORKER_REPLAY_ARTIFACT_NOT_CURRENT'/g,
  ) || []).length, 2, 'normal and concurrent replay paths must both revalidate current truth');
  assert.equal((WORKER_MIGRATION_SOURCE.match(
    /JOIN public\.training_solver_artifact_catalog catalog/g,
  ) || []).length >= 2, true);
  assert.match(WORKER_MIGRATION_SOURCE,
    /REVOKE ALL ON public\.solved_spots_gold FROM service_role/);
  assert.match(WORKER_MIGRATION_SOURCE,
    /REVOKE ALL PRIVILEGES \(%s\) ON public\.solved_spots_gold FROM service_role/);
  assert.match(WORKER_MIGRATION_SOURCE,
    /\('REFERENCES'\), \('TRIGGER'\), \('MAINTAIN'\)[\s\S]*has_table_privilege\([\s\S]*'service_role',[\s\S]*'public\.solved_spots_gold'/,
    'the worker migration must prove service_role has no PostgreSQL 17 warehouse table privilege');
  assert.match(WORKER_MIGRATION_SOURCE,
    /has_function_privilege\([\s\S]*'anon',[\s\S]*training_claim_solver_worker_request_v1[\s\S]*NOT has_function_privilege\([\s\S]*'service_role',[\s\S]*training_claim_solver_worker_request_v1/,
    'claim execution must be denied to browser roles and granted only to service_role');
  assert.equal((WORKER_MIGRATION_SOURCE.match(/FOR UPDATE SKIP LOCKED/g) || []).length, 2);
  assert.match(ENV_EXAMPLE_SOURCE, /^SOLVER_WORKER_M1_HMAC_SECRET=$/m);
  assert.match(ENV_EXAMPLE_SOURCE, /^SOLVER_WORKER_M2_HMAC_SECRET=$/m);
  for (const source of [ORCHESTRATOR_SOURCE, LAUNCHER_SOURCE, API_SOURCE, WORKER_MIGRATION_SOURCE]) {
    assert.doesNotMatch(source, /(?:eyJ[a-zA-Z0-9_-]{20,}|sb_secret_[a-zA-Z0-9_-]{20,})/,
      'no JWT, service-role token, or worker secret may be committed');
  }
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /CREATE TABLE IF NOT EXISTS public\.training_solver_ingest_scopes/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /CREATE TABLE IF NOT EXISTS public\.training_solver_bounded_canary_targets/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /CREATE TABLE IF NOT EXISTS public\.training_solver_scope_migration_state/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /admission_mode IN \('held', 'backlog', 'bounded_canary'\)/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /SOLVER_WORKER_CANARY_TARGET_NOT_AUTHORIZED/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /target\.node = p_artifact -> 'strategy_matrix_v2' ->> 'node'/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /target\.hero_position =\s*p_artifact -> 'strategy_matrix_v2' ->> 'position'/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /artifact\.strategy_matrix_v2 ->> 'node' AS node/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /artifact\.strategy_matrix_v2 ->> 'position' AS hero_position/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /training_solver_scope_hold_on_authority_v1/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /OLD\.admission_mode IS DISTINCT FROM 'held'/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /TRAINING_SOLVER_CANARY_TARGETS_IMMUTABLE/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /NEW\.machine_id IS DISTINCT FROM OLD\.machine_id[\s\S]*NEW\.target_role IS DISTINCT FROM OLD\.target_role/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /WHERE scope\.machine_id = OLD\.machine_id[\s\S]*WHERE scope\.machine_id = NEW\.machine_id/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /pg_advisory_xact_lock\([\s\S]*training-solver-ingest-scope:/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /other_scope\.admission_mode IN \('backlog', 'bounded_canary'\)[\s\S]*other_authority\.retired_at IS NULL/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /TRAINING_SOLVER_MACHINE_INGEST_SCOPE_ALREADY_ACTIVE/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /OLD\.retired_at IS NOT NULL AND NEW\.retired_at IS NULL/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /TRAINING_SOLVER_PROVENANCE_RETIREMENT_IMMUTABLE/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /CREATE TRIGGER training_solver_provenance_reactivation_guard_v1/);
  for (const marker of [
    'TRAINING_SOLVER_INGEST_SCOPES_CONTRACT_INCOMPLETE',
    'TRAINING_SOLVER_CANARY_TARGETS_CONTRACT_INCOMPLETE',
    'TRAINING_SOLVER_SCOPE_MIGRATION_STATE_CONTRACT_INCOMPLETE',
    'TRAINING_SOLVER_PRIVATE_SCOPE_ACL_INCOMPLETE',
  ]) {
    assert.match(BOUNDED_CANARY_MIGRATION_SOURCE, new RegExp(marker));
  }
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /REVOKE ALL PRIVILEGES \(%s\) ON TABLE public\.%I/);
  assert.equal((BOUNDED_CANARY_MIGRATION_SOURCE.match(
    /has_any_column_privilege\(/g,
  ) || []).length, 4);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /TRAINING_SOLVER_NEW_SCOPE_MUST_BE_HELD/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /training_solver_worker_row_states_v2/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /authorized_hero_position text/);
  assert.match(API_SOURCE, /rowStates\(supabase, envelope\.payload, envelope\.worker\)/);
  assert.match(BOUNDED_CANARY_MIGRATION_SOURCE,
    /REVOKE ALL ON FUNCTION public\.training_ingest_solver_artifact_unscoped_v1[\s\S]*service_role/);
  assert.doesNotMatch(BOUNDED_CANARY_MIGRATION_SOURCE,
    /(?:eyJ[a-zA-Z0-9_-]{20,}|sb_secret_[a-zA-Z0-9_-]{20,})/);
});

test('legacy service-role worker configuration aborts before transport or solver work', () => {
  const result = spawnSync('python3', ['-c', 'import orchestrate'], {
    cwd: 'scripts/preflop-deep',
    encoding: 'utf8',
    env: cleanWorkerEnvironment({
      SUPABASE_SERVICE_ROLE_KEY: 'legacy-key-must-never-be-used',
      SOLVER_WORKER_API_URL: 'https://smarter.poker/api/training/solver-worker',
      SOLVER_WORKER_HMAC_SECRET: M1_SECRET_HEX,
      PIPELINE_COMMIT: 'b'.repeat(40),
      PIO_SOLVER_VERSION: 'PioSOLVER 3.0',
      PIO_BINARY_CHECKSUM: 'a'.repeat(64),
      APPROVED_MANIFEST_CHECKSUM: 'c'.repeat(64),
      RANGE_DIRECTORY: '.',
    }),
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`,
    /remove direct database configuration \([^)]*SUPABASE_SERVICE_ROLE_KEY[^)]*\); solver workers must use scoped signed ingestion/);
});

test('worker manifest gate precedes and enforces the exact Training family/stack allowlist', () => {
  execFileSync('python3', ['-c', String.raw`
import copy, hashlib, json, os, sys
sys.path.insert(0, '.')
os.environ.pop('SUPABASE_SERVICE_ROLE_KEY', None)
os.environ.update({
    'SOLVER_WORKER_API_URL': 'https://smarter.poker/api/training/solver-worker',
    'SOLVER_WORKER_HMAC_SECRET': '1' * 64,
    'PIPELINE_COMMIT': 'b' * 40,
    'PIO_SOLVER_VERSION': 'PioSOLVER 3.0',
    'PIO_BINARY_CHECKSUM': 'a' * 64,
    'APPROVED_MANIFEST_CHECKSUM': 'c' * 64,
    'RANGE_DIRECTORY': '.',
})
import orchestrate as worker

held = open('phases.json', encoding='utf-8').read()
worker.APPROVED_MANIFEST_CHECKSUM = hashlib.sha256(held.encode()).hexdigest()
try:
    worker.validate_manifest(held)
    raise AssertionError('closed production manifest became launchable')
except SystemExit as error:
    assert 'manifest release gate is closed' in str(error)

phase = {
    'id': 'training_hu_cash_100bb', 'game_type': 'hu_cash', 'stack': 100,
    'street': 'flop', 'streets': ['flop'], 'objective': 'chip_ev',
    'pot_chips': 550, 'eff_chips': 9750, 'rake': '0.05 10',
    'accuracy_fraction': 0.005,
    'ip_range': 'ip.txt', 'ip_range_checksum': 'd' * 64,
    'oop_range': 'oop.txt', 'oop_range_checksum': 'e' * 64,
    'ip_player': 'BTN', 'oop_player': 'BB',
    'harvest': [{'node': 'r:0', 'hero': 'OOP', 'position': 'BB'}],
}
phases = []
for game_type, stacks in worker.TRAINING_SOLVER_CONTRACTS.items():
    for stack in sorted(stacks):
        candidate = copy.deepcopy(phase)
        candidate.update({
            'id': '%s_%dbb' % (game_type, stack),
            'game_type': game_type,
            'stack': stack,
            'eff_chips': stack * 100,
        })
        phases.append(candidate)
chip_ev_contracts = worker.canonical_contract_pairs(worker.TRAINING_SOLVER_CONTRACTS)
separate_icm_contracts = worker.canonical_contract_pairs(worker.TRAINING_ICM_CONTRACTS)
phase_contracts = worker.canonical_phase_contracts(phases)
game_contracts = worker.canonical_training_game_contracts(phases)
manifest = {
    'version': 4, 'pipeline_bundle_checksum': 'f' * 64,
    'range_combo_order': worker.h.COMBO_ORDER,
    'artifact_combo_order': worker.h.COMBO_ORDER,
    'source_combo_order_schema': worker.h.SOURCE_COMBO_ORDER_SCHEMA,
    'source_combo_order_sha256': '1' * 64,
    'release_gate': {'solver_ready': True}, 'phases': phases,
    'phase_contracts_schema': worker.PHASE_CONTRACT_SCHEMA,
    'phase_contracts': phase_contracts,
    'phase_contracts_sha256': worker.phase_contracts_checksum(phase_contracts),
    'training_game_contracts_schema': 'training-game-solver-contracts.v1',
    'training_game_contracts': game_contracts,
    'training_game_contracts_sha256': worker.training_game_contracts_checksum(game_contracts),
    'training_contract_scope': {
        'schema': 'training-solver-contract-scope.v1',
        'objective': 'chip_ev',
        'chip_ev_contract_count': 18,
        'chip_ev_contracts': chip_ev_contracts,
        'chip_ev_contracts_checksum': worker.contract_scope_checksum(chip_ev_contracts),
        'separate_icm_contract_count': 7,
        'separate_icm_contracts': separate_icm_contracts,
        'separate_icm_engine_required': True,
    },
    'self_test': {
        'board': 'AhKdQc', 'pot_chips': 550, 'eff_chips': 9750,
        'rake': '0.05 10', 'accuracy_fraction': 0.005,
        'oop_range': 'oop.txt',
        'oop_range_checksum': 'e' * 64, 'ip_range': 'ip.txt',
        'ip_range_checksum': 'd' * 64, 'oop_player': 'BB', 'ip_player': 'BTN',
        'ev_oop_min_bb': -20, 'ev_oop_max_bb': 20,
    },
}
def validate(candidate):
    candidate = copy.deepcopy(candidate)
    candidate['phase_contracts'] = worker.canonical_phase_contracts(candidate['phases'])
    candidate['phase_contracts_sha256'] = worker.phase_contracts_checksum(candidate['phase_contracts'])
    candidate['training_game_contracts'] = worker.canonical_training_game_contracts(candidate['phases'])
    candidate['training_game_contracts_sha256'] = worker.training_game_contracts_checksum(candidate['training_game_contracts'])
    raw = json.dumps(candidate, sort_keys=True, separators=(',', ':'))
    worker.APPROVED_MANIFEST_CHECKSUM = hashlib.sha256(raw.encode()).hexdigest()
    return worker.validate_manifest(raw)

validated, _ = validate(manifest)
assert len(validated['phases']) == 18

legacy = copy.deepcopy(manifest)
legacy['phases'][0]['game_type'] = '6max_cash'
try:
    validate(legacy)
    raise AssertionError('legacy non-Training family was accepted')
except SystemExit as error:
    assert 'outside the exact Training solver family/stack contracts' in str(error)

wrong_stack = copy.deepcopy(manifest)
wrong_stack['phases'][0]['stack'] = 60
try:
    validate(wrong_stack)
    raise AssertionError('out-of-contract stack was accepted')
except SystemExit as error:
    assert 'outside the exact Training solver family/stack contracts' in str(error)

noncanonical_rake = copy.deepcopy(manifest)
noncanonical_rake['phases'][0]['rake'] = '0.05\n10'
try:
    validate(noncanonical_rake)
    raise AssertionError('line-oriented phase rake injection was accepted')
except SystemExit as error:
    assert 'noncanonical rake contract' in str(error)

noncanonical_self_test = copy.deepcopy(manifest)
noncanonical_self_test['self_test']['rake'] = '0.05\t10'
try:
    validate(noncanonical_self_test)
    raise AssertionError('line-oriented self-test rake injection was accepted')
except SystemExit as error:
    assert 'self-test has a noncanonical rake contract' in str(error)

legacy_four_value_rake = copy.deepcopy(manifest)
legacy_four_value_rake['phases'][0]['rake'] = '0 0 0 0'
try:
    validate(legacy_four_value_rake)
    raise AssertionError('legacy four-value set_rake contract was accepted')
except SystemExit as error:
    assert 'noncanonical rake contract' in str(error)

icm = copy.deepcopy(manifest)
icm['phases'][0]['game_type'] = 'mtt_6max_icm'
try:
    validate(icm)
    raise AssertionError('unsealed ICM phase was accepted')
except SystemExit as error:
    assert 'cannot certify ICM phases' in str(error)

incomplete = copy.deepcopy(manifest)
incomplete['phases'].pop()
incomplete['phase_contracts'] = worker.canonical_phase_contracts(incomplete['phases'])
incomplete['phase_contracts_sha256'] = worker.phase_contracts_checksum(
    incomplete['phase_contracts']
)
try:
    validate(incomplete)
    raise AssertionError('an incomplete declared Training scope was accepted')
except SystemExit as error:
    assert 'phase coverage is incomplete' in str(error)

unordered_streets = copy.deepcopy(manifest)
unordered_streets['phases'][0]['streets'] = ['turn', 'flop']
try:
    validate(unordered_streets)
    raise AssertionError('an unordered street subset was accepted')
except SystemExit as error:
    assert 'ordered street prefix' in str(error)

duplicate_seats = copy.deepcopy(manifest)
duplicate_seats['phases'][0]['ip_player'] = duplicate_seats['phases'][0]['oop_player']
try:
    validate(duplicate_seats)
    raise AssertionError('a phase with duplicate OOP/IP seats was accepted')
except SystemExit as error:
    assert 'distinct canonical OOP/IP positions' in str(error)

mislabeled_target = copy.deepcopy(manifest)
mislabeled_target['phases'][0]['harvest'][0]['position'] = 'BTN'
try:
    validate(mislabeled_target)
    raise AssertionError('a harvest target labeled as the wrong actor was accepted')
except SystemExit as error:
    assert 'harvest position does not match its declared actor' in str(error)
`], {
    cwd: 'scripts/preflop-deep',
    encoding: 'utf8',
    env: cleanWorkerEnvironment(),
  });
});

test('range commands are single-line and invalid solver probabilities stop before backup', () => {
  const mainLoop = ORCHESTRATOR_SOURCE.slice(ORCHESTRATOR_SOURCE.indexOf('def main():'));
  assert.ok(
    mainLoop.indexOf('strict V2 validation failed; no backup or ingest')
      < mainLoop.indexOf('write_backup(backup_path, backup_payload)'),
    'strict V2 validation must precede local backup creation',
  );
  assert.ok(
    mainLoop.indexOf('strict V2 validation failed; no backup or ingest')
      < mainLoop.indexOf('receipt = patch_v2('),
    'strict V2 validation must precede signed ingestion',
  );
  execFileSync('python3', ['-c', String.raw`
import copy, hashlib, os, sys, tempfile
sys.path.insert(0, '.')
os.environ.pop('SUPABASE_SERVICE_ROLE_KEY', None)
os.environ.update({
    'SOLVER_WORKER_API_URL': 'https://smarter.poker/api/training/solver-worker',
    'SOLVER_WORKER_HMAC_SECRET': '1' * 64,
    'PIPELINE_COMMIT': 'b' * 40,
    'PIO_SOLVER_VERSION': 'PioSOLVER 3.0',
    'PIO_BINARY_CHECKSUM': 'a' * 64,
    'APPROVED_MANIFEST_CHECKSUM': 'c' * 64,
    'RANGE_DIRECTORY': '.',
})
import orchestrate as worker
import pio_harvest as harvest

with tempfile.TemporaryDirectory() as directory:
    values = ['1'] + ['0'] * 1325
    payload = ('\t'.join(values[:663]) + '\n' + ' \t'.join(values[663:])).encode()
    path = os.path.join(directory, 'range.txt')
    open(path, 'wb').write(payload)
    worker.RANGE_DIRECTORY = directory
    canonical = worker.load_range('range.txt', hashlib.sha256(payload).hexdigest())
    assert canonical == ' '.join(values)
    assert not any(separator in canonical for separator in ('\n', '\r', '\t'))
    commands = harvest.build_setup_commands(
        'AhKdQc', canonical, canonical, 550, 9750, '0.05 10', 0.005
    )
    range_commands = [command for command in commands if command.startswith('set_range ')]
    assert len(range_commands) == 2
    assert all(not any(separator in command for separator in ('\n', '\r', '\t'))
               for command in range_commands)

board = ['Ah', 'Kd', 'Qc']
dead = set(board)
live_mask = [not set(harvest._combo_cards(index)).intersection(dead) for index in range(1326)]
valid = {
    'node': 'r:0', 'board': board, 'street': 'flop', 'hero': 'OOP',
    'position': 'BB', 'oop_player': 'BB', 'ip_player': 'BTN',
    'pot_bb': 5.5, 'eff_stack_bb': 97.5, 'rake': '0.05 10',
    'actions': [harvest.action_meta('c'), harvest.action_meta('b525')],
    'frequencies': {
        'c': [0.4 if live else 0.0 for live in live_mask],
        'b525': [0.6 if live else 0.0 for live in live_mask],
    },
    'hand_evs_bb': [0.0 if live else None for live in live_mask],
    'ev_oop_bb': 0.0, 'ev_ip_bb': 0.0, 'exploitability_pct': 0.0,
    'convergence': {
        'schema': 'piosolver.calc-results.v1',
        'source_command': 'calc_results',
        'accuracy_fraction': 0.005,
        'starting_pot_chips': 550,
        'achieved_exploitability_chips': 0.0,
        'achieved_exploitability_fraction': 0.0,
    },
    'combo_order': harvest.COMBO_ORDER,
    'range_combo_order': harvest.COMBO_ORDER,
    'source_combo_order_schema': harvest.SOURCE_COMBO_ORDER_SCHEMA,
    'source_combo_order_sha256': '1' * 64,
    'oop_range_checksum': '2' * 64,
    'ip_range_checksum': '3' * 64,
    'training_game_contracts_sha256': '4' * 64,
    'tree_geometry': harvest.GEOMETRY_TAG,
    'solver': 'PioSOLVER',
}
assert harvest.validate_row(valid)['ev_ok'] is True
for invalid_probability in (-0.000001, 1.000001):
    invalid = copy.deepcopy(valid)
    invalid['frequencies']['c'][0] = invalid_probability
    assert harvest.validate_row(invalid)['ev_ok'] is False
    line = [str(invalid_probability)] + ['0'] * 1325
    try:
        harvest.parse_strategy(' '.join(line) + '\n' + ('1 ' * 1326), ['c', 'b525'])
        raise AssertionError('out-of-domain Pio probability was accepted')
    except ValueError as error:
        assert 'probabilities in [0, 1]' in str(error)

bad_sum = copy.deepcopy(valid)
bad_sum['frequencies']['b525'][0] = 0.600011
assert harvest.validate_row(bad_sum)['ev_ok'] is False
assert harvest.validate_row(bad_sum)['bad_sum_hands'] == 1
`], {
    cwd: 'scripts/preflop-deep',
    encoding: 'utf8',
    env: cleanWorkerEnvironment(),
  });
});
