import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

import {
  normalizeSolvedPolicyRecord,
  SolverPolicyService,
} from '../src/services/SolverPolicyService.js';
import { v2ToAppMatrix as realV2ToAppMatrix } from '../src/utils/v2Matrix.js';
import {
  customSolverProvenanceIsComplete as realCustomSolverProvenanceIsComplete,
} from '../src/lib/training/customSolverSpotContract.mjs';
import {
  parseSolverScenarioHash as realParseSolverScenarioHash,
  SOLVER_POSITIONS as REAL_SOLVER_POSITIONS,
} from '../src/lib/training/solverRowIdentity.mjs';
import {
  buildTrainingCacheRow as realBuildTrainingCacheRow,
} from '../src/lib/training/cacheTruthPersistence.mjs';
import {
  enforceTrainingQuestionContract,
  isTrainingQuestionValid,
} from '../src/lib/training/questionContract.mjs';

const ROOT = process.cwd();
const source = fs.readFileSync(path.join(ROOT, 'pages/hub/training/spot-trainer.js'), 'utf8');
const api = fs.readFileSync(path.join(ROOT, 'pages/api/training/spot-drill.js'), 'utf8');
const CATALOG_MIGRATION_SOURCE = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260907201000_training_solver_artifact_catalog.sql'),
  'utf8',
);
const CATALOG_VERIFIER_SOURCE = fs.readFileSync(
  path.join(ROOT, 'scripts/verify-training-solver-catalog-postgres.mjs'),
  'utf8',
);
const SPOT_SECURITY_HARDENING_SOURCE = fs.readFileSync(
  path.join(ROOT, 'supabase/migrations/20260907204000_training_solver_spot_security_hardening.sql'),
  'utf8',
);
const PIVOT = '80000000-0000-4000-8000-000000000000';
const CANDIDATE_LIMIT = Number(api.match(/const CANDIDATE_LIMIT = (\d+);/)?.[1]);
const MAX_CANDIDATE_PAGES = Number(api.match(/const MAX_CANDIDATE_PAGES = (\d+);/)?.[1]);
const LOOKUP_DEADLINE_MS = Number(api.match(/const LOOKUP_DEADLINE_MS = (\d+);/)?.[1]);
const FAKE_HAND_EVS = new Array(1326).fill(1.25);
const TEST_RANKS = '23456789TJQKA';
const TEST_SUITS = 'cdhs';

function testCardFromIndex(index) {
  return `${TEST_RANKS[Math.floor(index / 4)]}${TEST_SUITS[index % 4]}`;
}

function comboVector(board, liveValue) {
  const dead = new Set(board);
  const values = new Array(1326).fill(0);
  for (let high = 1; high < 52; high += 1) {
    for (let low = 0; low < high; low += 1) {
      const index = (high * (high - 1)) / 2 + low;
      if (!dead.has(testCardFromIndex(low)) && !dead.has(testCardFromIndex(high))) {
        values[index] = liveValue;
      }
    }
  }
  return values;
}

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    headersSent: false,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

function rowId(index, prefix = '9') {
  return `${prefix}${String(index).padStart(7, '0')}-0000-4000-8000-000000000000`;
}

function solverRow({
  id,
  gameType = 'hu_cash',
  provenanceComplete = false,
} = {}) {
  const board = ['Qs', 'Jh', '2d'];
  return {
    id,
    scenario_hash: `scenario:${id}`,
    game_type: gameType,
    stack_depth: 100,
    street: 'flop',
    strategy_matrix_v2: {
      id,
      position: 'BTN',
      actions: [
        { code: 'c', key: 'check', size_pct: 0 },
        {
          code: 'b200',
          key: 'bet_chips_200',
          size_chips: 200,
          size_semantics: 'cumulative_postflop_contribution_target',
        },
      ],
      frequencies: { c: comboVector(board, 0.25), b200: comboVector(board, 0.75) },
      hand_evs_bb: FAKE_HAND_EVS,
      pot_bb: 3,
      eff_stack_bb: 100,
      rake: '0.05 10',
      exploitability_pct: 0.05,
      convergence: {
        schema: 'piosolver.calc-results.v1',
        source_command: 'calc_results',
        accuracy_fraction: 0.001,
        starting_pot_chips: 300,
        achieved_exploitability_chips: 0.15,
        achieved_exploitability_fraction: 0.0005,
      },
      combo_order: 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325',
      range_combo_order: 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325',
      source_combo_order_schema: 'piosolver.show_hand_order.v1',
      source_combo_order_sha256: '1'.repeat(64),
      oop_range_checksum: '2'.repeat(64),
      ip_range_checksum: '3'.repeat(64),
      training_game_contracts_sha256: '4'.repeat(64),
      node: 'r:0:c',
      board,
      street: 'flop',
      hero: 'IP',
      oop_player: 'BB',
      ip_player: 'BTN',
    },
    solver_version: 'PioSOLVER-3.0',
    solver_binary_checksum: 'a'.repeat(64),
    machine_id: 'M1',
    pipeline_commit: 'b'.repeat(40),
    manifest_version: '5',
    manifest_checksum: 'c'.repeat(64),
    source_artifact_checksum: 'd'.repeat(64),
    quality_status: 'validated',
    audited_at: '2026-09-07T00:00:00.000Z',
    provenanceComplete,
  };
}

function catalogEntry(row) {
  return {
    artifact_id: row.id,
    scenario_hash: row.scenario_hash,
    game_type: row.game_type,
    stack_depth: row.stack_depth,
    street: row.street,
    hero_position: row.strategy_matrix_v2?.position,
  };
}

function realSolverRow({ id = rowId(1), checkFrequency = 0.4 } = {}) {
  const board = ['Jh', '7d', '2c'];
  return {
    id,
    scenario_hash: 'hu_cash_BB_100bb_Jh7d2c',
    game_type: 'hu_cash',
    stack_depth: 100,
    street: 'flop',
    strategy_matrix_v2: {
      actions: [
        { key: 'check', code: 'c', size_pct: 0 },
        { key: 'bet_chips_525', code: 'b525', size_chips: 525, size_pct: null,
          size_semantics: 'cumulative_postflop_contribution_target' },
      ],
      frequencies: {
        c: comboVector(board, checkFrequency),
        b525: comboVector(board, 1 - checkFrequency),
      },
      hand_evs_bb: new Array(1326).fill(1.25),
      pot_bb: 7,
      node: 'r:0',
      board,
      street: 'flop',
      hero: 'OOP',
      position: 'BB',
      oop_player: 'BB',
      ip_player: 'BTN',
      eff_stack_bb: 100,
      rake: '0.05 10',
      ev_oop_bb: 0.75,
      ev_ip_bb: 1.25,
      exploitability_pct: 0.05,
      convergence: {
        schema: 'piosolver.calc-results.v1',
        source_command: 'calc_results',
        accuracy_fraction: 0.001,
        starting_pot_chips: 700,
        achieved_exploitability_chips: 0.35,
        achieved_exploitability_fraction: 0.0005,
      },
      tree_geometry: 'hu_cash_100bb_standard',
      solver: 'PioSOLVER',
      combo_order: 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325',
      range_combo_order: 'card=rank*4+suit; combo=b*(b-1)/2+a; 2c2d=0..AhAs=1325',
      source_combo_order_schema: 'piosolver.show_hand_order.v1',
      source_combo_order_sha256: '1'.repeat(64),
      oop_range_checksum: '2'.repeat(64),
      ip_range_checksum: '3'.repeat(64),
      training_game_contracts_sha256: '4'.repeat(64),
      training_game_contracts_sha256: '4'.repeat(64),
    },
    solver_version: 'PioSOLVER 3.0',
    solver_binary_checksum: 'a'.repeat(64),
    machine_id: 'M1',
    pipeline_commit: 'b'.repeat(40),
    manifest_version: 'solver-pack.2026-09-07',
    manifest_checksum: 'c'.repeat(64),
    source_artifact_checksum: 'd'.repeat(64),
    quality_status: 'validated',
    audited_at: '2026-09-07T00:00:00.000Z',
  };
}

function databaseHarness(rows, {
  catalogRows = null,
  errorPage = null,
  malformedPage = null,
  waitForAbortPage = null,
  ignoreIdBounds = false,
  ignoreFamilyFilter = false,
} = {}) {
  const calls = [];
  let pageNumber = 0;
  const orderedRows = [...rows].sort((left, right) => left.id.localeCompare(right.id));
  const orderedCatalog = [...(catalogRows || rows.map(catalogEntry))]
    .sort((left, right) => left.artifact_id.localeCompare(right.artifact_id));

  const client = {
    rpc(name, args) {
      const pairs = Array.isArray(args?.p_family_stacks) ? args.p_family_stacks : [];
      const families = [...new Set(pairs.map((pair) => pair.game_type))];
      const state = {
        table: name,
        args,
        filters: [
          ['in', 'game_type', families],
          ...(args?.p_position ? [['eq', 'hero_position', args.p_position]] : []),
          ...(args?.p_lower_exclusive
            ? [['gt', 'artifact_id', args.p_lower_exclusive]]
            : args?.p_lower_inclusive
              ? [['gte', 'artifact_id', args.p_lower_inclusive]]
              : []),
          ...(args?.p_upper_exclusive ? [['lt', 'artifact_id', args.p_upper_exclusive]] : []),
        ],
      };
      return {
        abortSignal(signal) {
          calls.push(state);
          pageNumber += 1;
          if (pageNumber === waitForAbortPage) {
            return new Promise((_resolve, reject) => {
              const abort = () => {
                const error = new Error('database request aborted');
                error.name = 'AbortError';
                reject(error);
              };
              if (signal.aborted) abort();
              else signal.addEventListener('abort', abort, { once: true });
            });
          }
          if (pageNumber === errorPage) {
            return Promise.resolve({ data: null, error: new Error(`database page ${pageNumber} failed`) });
          }
          if (pageNumber === malformedPage) {
            return Promise.resolve({ data: { malformed: true }, error: null });
          }

          const catalogIds = new Set(orderedCatalog.map((entry) => String(entry.artifact_id)));
          let data = orderedRows.filter((row) => catalogIds.has(String(row.id)));
          if (!ignoreFamilyFilter) {
            const exactPairs = new Set(pairs.map(
              (pair) => `${pair.game_type}:${Number(pair.stack_depth)}`,
            ));
            data = data.filter((row) => exactPairs.has(`${row.game_type}:${Number(row.stack_depth)}`));
          }
          if (args?.p_position) {
            data = data.filter((row) => row.strategy_matrix_v2?.position === args.p_position);
          }
          if (!ignoreIdBounds && args?.p_lower_inclusive) {
            data = data.filter((row) => row.id >= args.p_lower_inclusive);
          }
          if (!ignoreIdBounds && args?.p_lower_exclusive) {
            data = data.filter((row) => row.id > args.p_lower_exclusive);
          }
          if (!ignoreIdBounds && args?.p_upper_exclusive) {
            data = data.filter((row) => row.id < args.p_upper_exclusive);
          }
          return Promise.resolve({ data: data.slice(0, args?.p_limit || 12), error: null });
        },
      };
    },
    from(table) {
      const state = { table, filters: [] };
      const builder = {
        select(columns) { state.columns = columns; return builder; },
        in(column, values) { state.filters.push(['in', column, values]); return builder; },
        not(column, operator, value) {
          state.filters.push(['not', column, operator, value]);
          return builder;
        },
        eq(column, value) { state.filters.push(['eq', column, value]); return builder; },
        gte(column, value) { state.filters.push(['gte', column, value]); return builder; },
        gt(column, value) { state.filters.push(['gt', column, value]); return builder; },
        lt(column, value) { state.filters.push(['lt', column, value]); return builder; },
        order(column, options) { state.order = [column, options]; return builder; },
        limit(limit) {
          state.limit = limit;
          return builder;
        },
        abortSignal(signal) {
          calls.push(state);
          pageNumber += 1;
          if (pageNumber === waitForAbortPage) {
            return new Promise((_resolve, reject) => {
              const abort = () => {
                const error = new Error('database request aborted');
                error.name = 'AbortError';
                reject(error);
              };
              if (signal.aborted) abort();
              else signal.addEventListener('abort', abort, { once: true });
            });
          }
          if (pageNumber === errorPage) {
            return Promise.resolve({ data: null, error: new Error(`database page ${pageNumber} failed`) });
          }
          if (pageNumber === malformedPage) {
            return Promise.resolve({ data: { malformed: true }, error: null });
          }

          let data = state.table === 'training_solver_artifact_catalog'
            ? [...orderedCatalog]
            : [...orderedRows];
          for (const [operator, column, value] of state.filters) {
            if (!ignoreFamilyFilter && operator === 'in' && column === 'game_type') {
              data = data.filter((row) => value.includes(row.game_type));
            } else if (operator === 'eq' && column === 'quality_status') {
              data = data.filter((row) => row.quality_status === value);
            } else if (operator === 'eq' && column === 'stack_depth') {
              data = data.filter((row) => row.stack_depth === value);
            } else if (operator === 'eq' && column === 'hero_position') {
              data = data.filter((row) => row.hero_position === value);
            } else if (operator === 'in' && column === 'id') {
              data = data.filter((row) => value.includes(row.id));
            } else if (!ignoreIdBounds && column === 'artifact_id' && operator === 'gte') {
              data = data.filter((row) => row.artifact_id >= value);
            } else if (!ignoreIdBounds && column === 'artifact_id' && operator === 'gt') {
              data = data.filter((row) => row.artifact_id > value);
            } else if (!ignoreIdBounds && column === 'artifact_id' && operator === 'lt') {
              data = data.filter((row) => row.artifact_id < value);
            }
          }
          return Promise.resolve({ data: data.slice(0, state.limit), error: null });
        },
      };
      return builder;
    },
  };
  return { client, calls };
}

async function loadSpotRoute({
  rows,
  catalogRows = null,
  errorPage = null,
  malformedPage = null,
  waitForAbortPage = null,
  ignoreIdBounds = false,
  ignoreFamilyFilter = false,
  realAdapter = false,
  immediateTimers = false,
  durableRateLimitResults = [true, true],
  authResult = { user: { id: 'user-1' }, error: null },
  advanceClockAfterMatrixMs = 0,
} = {}) {
  const database = databaseHarness(rows, {
    catalogRows,
    errorPage,
    malformedPage,
    waitForAbortPage,
    ignoreIdBounds,
    ignoreFamilyFilter,
  });
  const observations = {
    policyCalls: [],
    cacheInputs: [],
    cacheRows: [],
    persisted: [],
    durableRateLimits: [],
    events: [],
  };
  let fakeClockMs = 0;
  let deterministicEngine;
  if (realAdapter) {
    const solverPolicyService = new SolverPolicyService();
    deterministicEngine = {
      solverPolicyService,
      setSupabaseClient() {},
      canonicalPolicyForValidatedSolvedRow(row, holding) {
        observations.policyCalls.push([row?.id, holding]);
        const record = normalizeSolvedPolicyRecord(row);
        if (!record.valid || !record.provenanceComplete || !record.sourceV2) return null;
        const policy = solverPolicyService.answerFromRecord(
          record,
          solverPolicyService.keyForRecord(record, { holding }),
        );
        return policy?.kind === 'unavailable'
          ? null
          : solverPolicyService.consumerEnvelope(policy, 'get-question');
      },
    };
  } else {
    deterministicEngine = {
      setSupabaseClient() {},
      canonicalPolicyForValidatedSolvedRow(row, holding) {
        observations.policyCalls.push([row.id, holding]);
        return {
          kind: 'exact_solver_policy',
          policyVersion: 'solver-policy-v1',
          qualitySeal: 'exact_solver',
          key: { holding },
          node: { semantics: 'facing_bet' },
          sourceArtifact: { artifactId: row.id },
          actions: [
            { id: 'check', sourceCode: 'x', label: 'Check', frequency: 0.25 },
            {
              id: 'bet_75pct',
              sourceCode: 'b200',
              label: 'Bet 75% Pot',
              frequency: 0.75,
            },
          ],
        };
      },
    };
  }
  const buildTrainingCacheRow = (input) => {
    observations.cacheInputs.push(input);
    const row = realAdapter
      ? realBuildTrainingCacheRow(input)
      : { question_data: input.question };
    observations.cacheRows.push(row);
    return row;
  };
  const dependencies = {
    'node:crypto': {
      createHash,
      randomInt: () => 0,
      randomUUID: () => PIVOT,
    },
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => {
        observations.events.push('auth');
        return authResult;
      },
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => database.client },
    '../../../src/lib/apiRateLimit': {
      applyRateLimit: () => true,
      applyDurableRateLimit: async (_client, res, options) => {
        observations.events.push(`durable:${options.key}`);
        observations.durableRateLimits.push(options);
        const allowed = durableRateLimitResults[observations.durableRateLimits.length - 1] !== false;
        if (!allowed) {
          res.status(429).json({ success: false, error: 'Too many requests' });
        }
        return allowed;
      },
      LIMITS: { read: {} },
    },
    '../../../src/utils/trainingApiUtils': {
      sanitizeParam: (value, max) => String(value || '').trim().slice(0, max),
      withTiming: () => {},
    },
    '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
    '../../../src/utils/v2Matrix': {
      v2ToAppMatrix: realAdapter ? (value) => {
        const matrix = realV2ToAppMatrix(value);
        fakeClockMs += advanceClockAfterMatrixMs;
        return matrix;
      } : () => ({
        node_state_exact: true,
        actions: ['x', 'b200'],
        frequencies: { x: { AsKs: 0.25 }, b200: { AsKs: 0.75 } },
        hand_evs: { AsKs: 1.25 },
        node: 'node-1',
        hero: 'IP',
        position: 'BTN',
        oop_player: 'BB',
        ip_player: 'BTN',
        pot_bb: 3,
        facing_bet_bb: 0,
        eff_stack_bb: 97,
      }),
    },
    '../../../src/lib/training/customSolverSpotContract.mjs': {
      customSolverProvenanceIsComplete: realAdapter
        ? realCustomSolverProvenanceIsComplete
        : (row) => row.provenanceComplete === true,
    },
    '../../../src/lib/training/solverRowIdentity.mjs': {
      SOLVER_POSITIONS: realAdapter ? REAL_SOLVER_POSITIONS : ['BTN', 'BB'],
      parseSolverScenarioHash: realAdapter ? realParseSolverScenarioHash : () => ({
        ok: true,
        identity: {
          boardCards: ['Qs', 'Jh', '2d'],
          street: 'flop',
          heroPosition: 'BTN',
        },
      }),
    },
    '../../../src/engines/DeterministicGTOEngine': { deterministicEngine },
    '../../../src/engines/deterministicEnginePatches': {
      applyDeterministicEnginePatches: (engine) => engine,
    },
    '../../../src/lib/training/cacheTruthPersistence.mjs': {
      buildTrainingCacheRow,
      persistCanonicalTrainingQuestions: async (_client, input) => {
        observations.persisted.push(input);
        return [{
          ...input.questions[0],
          id: 'persisted-question',
          policyChecksum: 'e'.repeat(64),
          sourceClassification: input.questions[0].sourceClassification || 'SOLVER_DERIVED_RESPONSE',
        }];
      },
    },
    '../../../src/lib/training/trainingPersistence.mjs': {
      trainingPersistenceUnavailableBody: () => ({
        success: false,
        code: 'TRAINING_PERSISTENCE_UNAVAILABLE',
        retryable: true,
      }),
    },
  };
  const contextSetTimeout = immediateTimers
    ? (callback) => {
        queueMicrotask(callback);
        return 1;
      }
    : setTimeout;
  const contextClearTimeout = immediateTimers ? () => {} : clearTimeout;
  const context = createContext({
    console,
    AbortController,
    Date: advanceClockAfterMatrixMs > 0
      ? class TestDate extends Date { static now() { return fakeClockMs; } }
      : Date,
    setTimeout: contextSetTimeout,
    clearTimeout: contextClearTimeout,
    process: {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      },
    },
  });
  const module = new SourceTextModule(api, { identifier: 'spot-drill.js', context });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected spot-drill dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  return {
    handler: module.namespace.default,
    database,
    observations,
  };
}

async function requestSpot(route, query = {}) {
  const res = response();
  await route.handler({
    method: 'GET',
    headers: { authorization: 'Bearer test-token', 'x-real-ip': '203.0.113.8' },
    socket: { remoteAddress: '127.0.0.1' },
    query,
  }, res);
  return res;
}

test('the answer-revealed solver utility cannot self-grade or author progress', () => {
  assert.match(source, /Solver Spot Study/);
  assert.match(source, /Answer-Revealed Study/);
  assert.match(source, /intentionally not scored/i);
  assert.doesNotMatch(source, /useTrainingFeedback|QuizAnswer|FeedbackCard/);
  assert.doesNotMatch(source, /savePracticeSession|saveSession\s*\(/);
  assert.doesNotMatch(source, /isCorrect|correctDrills|training:spot-drilled/);
  assert.doesNotMatch(source, /handleAnswer|selectedAnswer|setShowResult/);
});

test('solver spot loading is abortable and has a finite retry budget', () => {
  assert.match(source, /MAX_SPOT_RETRIES\s*=\s*3/);
  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /requestAbortRef\.current\?\.abort\(\)/);
  assert.match(source, /attempt\s*>=\s*MAX_SPOT_RETRIES/);
  assert.match(source, /Audited Solver Lookup Failed After/);
  assert.doesNotMatch(source, /setTimeout\(fetchSpot/);
});

test('spot study serves only identity-valid provenance-complete v2 artifacts', () => {
  assert.match(api, /strategy_matrix_v2/);
  assert.match(api, /training_solver_spot_candidates_v1/);
  assert.match(api, /\.rpc\(SOLVER_CANDIDATE_RPC/);
  assert.doesNotMatch(api, /\.from\(['"]solved_spots_gold['"]\)/,
    'the request path must fetch candidates only through the bounded database RPC');
  assert.doesNotMatch(api, /['"]strategy_matrix['"]/);
  assert.match(api, /customSolverProvenanceIsComplete/);
  assert.match(api, /parseSolverScenarioHash/);
  assert.match(api, /v2ToAppMatrix/);
  assert.match(api, /customSolverProvenanceIsComplete/);
  assert.match(api, /AUDITED_SOLVER_ARTIFACT_NOT_FOUND/);
  assert.match(api, /authoritativeTrainingProgress:\s*false/);
  assert.doesNotMatch(api, /Math\.random|generateOptions|ACTION_POOL/);
});

test('spot study uses cross-instance IP and authenticated-user limits before heavy lookup', async () => {
  const route = await loadSpotRoute({ rows: [realSolverRow()], realAdapter: true });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(route.observations.durableRateLimits.length, 2);
  assert.match(route.observations.durableRateLimits[0].key, /^training:spot-study:preauth:[0-9a-f]{64}$/);
  assert.equal(route.observations.durableRateLimits[0].max, 24);
  assert.equal(route.observations.durableRateLimits[0].windowSeconds, 60);
  assert.equal(route.observations.durableRateLimits[1].key, 'training:spot-study:user:user-1');
  assert.equal(route.observations.durableRateLimits[1].max, 12);
  assert.ok(
    route.observations.events[0].startsWith('durable:training:spot-study:preauth:'),
    'the shared pre-auth bucket must run before token verification',
  );
  assert.equal(route.observations.events[1], 'auth');
  assert.equal(route.observations.events[2], 'durable:training:spot-study:user:user-1');
});

test('solver catalog admission requires complete payloads and centrally approved provenance', () => {
  assert.match(
    SPOT_SECURITY_HARDENING_SOURCE,
    /CREATE TABLE IF NOT EXISTS public\.training_solver_provenance_authority/,
  );
  assert.match(
    SPOT_SECURITY_HARDENING_SOURCE,
    /REVOKE ALL ON public\.training_solver_provenance_authority[\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    SPOT_SECURITY_HARDENING_SOURCE,
    /public\.training_solver_provenance_authority'[\s\S]*\('REFERENCES'\), \('TRIGGER'\), \('MAINTAIN'\)[\s\S]*has_table_privilege/,
    'the authority ledger assertion must cover every PostgreSQL 17 table privilege',
  );
  assert.match(
    SPOT_SECURITY_HARDENING_SOURCE,
    /pg_catalog\.aclexplode\(attributes\.attacl\)[\s\S]*pg_catalog\.to_regrole\('service_role'\)/,
    'the authority ledger assertion must detect residual column ACLs',
  );
  assert.match(
    SPOT_SECURITY_HARDENING_SOURCE,
    /CREATE OR REPLACE FUNCTION public\.fn_training_solver_artifact_servable_v2[\s\S]*jsonb_array_length\(p_matrix -> 'hand_evs_bb'\) <> 1326[\s\S]*v_live_combos > 0/,
  );
  assert.match(
    SPOT_SECURITY_HARDENING_SOURCE,
    /size_semantics'[\s\S]*cumulative_postflop_contribution_target/,
  );
  assert.match(
    SPOT_SECURITY_HARDENING_SOURCE,
    /v_round_state[\s\S]*facing_wager[\s\S]*all_in_terminal[\s\S]*v_low_card = ANY\(v_board\)/,
  );
  assert.match(
    SPOT_SECURITY_HARDENING_SOURCE,
    /CREATE OR REPLACE FUNCTION public\.training_solver_spot_candidates_v1[\s\S]*CROSS JOIN LATERAL[\s\S]*authority\.retired_at IS NULL/,
  );
  assert.match(
    SPOT_SECURITY_HARDENING_SOURCE,
    /REVOKE ALL ON FUNCTION public\.training_solver_spot_candidates_v1[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    SPOT_SECURITY_HARDENING_SOURCE,
    /CREATE TRIGGER training_solver_provenance_authority_invalidate_v1[\s\S]*AFTER UPDATE OR DELETE/,
  );
  assert.match(
    SPOT_SECURITY_HARDENING_SOURCE,
    /REVOKE ALL ON FUNCTION public\.analyze_spots_by_game_type\(text, integer\)[\s\S]*FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    SPOT_SECURITY_HARDENING_SOURCE,
    /idx_training_solver_artifact_catalog_family_cursor[\s\S]*idx_training_solver_artifact_catalog_exact_cursor/,
  );
  assert.equal(
    [...CATALOG_VERIFIER_SOURCE.matchAll(/'-f', HARDENING_MIGRATION/g)].length,
    2,
    'the disposable PostgreSQL verifier must prove the security follow-up is idempotent',
  );
  assert.match(
    CATALOG_VERIFIER_SOURCE,
    /ALTER DEFAULT PRIVILEGES IN SCHEMA public[\s\S]*GRANT ALL ON TABLES TO anon, authenticated, service_role;[\s\S]*GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;[\s\S]*GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;/,
    'the solver verifier must reproduce the live Supabase default ACLs',
  );
  assert.match(
    CATALOG_VERIFIER_SOURCE,
    /skeletal or unapproved self-attested artifact entered[\s\S]*illegal node grammar:[\s\S]*authenticated could execute the 80 GB solver aggregate[\s\S]*retired solver provenance left/,
  );
});

test('spot study fails closed at the shared pre-auth limiter before auth or catalog work', async () => {
  const route = await loadSpotRoute({
    rows: [realSolverRow()],
    realAdapter: true,
    durableRateLimitResults: [false],
  });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 429);
  assert.equal(route.observations.events.length, 1);
  assert.ok(route.observations.events[0].startsWith('durable:training:spot-study:preauth:'));
  assert.equal(route.database.calls.length, 0);
  assert.equal(route.observations.persisted.length, 0);
});

test('the request-path solver catalog is narrow, future-synchronized, private, and permanently verified', () => {
  assert.match(
    CATALOG_MIGRATION_SOURCE,
    /CREATE TABLE IF NOT EXISTS public\.training_solver_artifact_catalog[\s\S]*artifact_id uuid PRIMARY KEY[\s\S]*REFERENCES public\.solved_spots_gold\(id\) ON DELETE CASCADE/,
  );
  assert.match(
    CATALOG_MIGRATION_SOURCE,
    /CREATE TRIGGER training_solver_artifact_catalog_sync_v1[\s\S]*AFTER INSERT OR UPDATE OF[\s\S]*ON public\.solved_spots_gold/,
  );
  assert.match(
    CATALOG_MIGRATION_SOURCE,
    /NEW\.quality_status = 'validated'[\s\S]*NEW\.solver_binary_checksum[\s\S]*NEW\.pipeline_commit[\s\S]*NEW\.source_artifact_checksum[\s\S]*NEW\.audited_at IS NOT NULL/,
  );
  assert.doesNotMatch(
    CATALOG_MIGRATION_SOURCE,
    /INSERT INTO public\.training_solver_artifact_catalog[\s\S]*SELECT[\s\S]*FROM public\.solved_spots_gold/,
    'deploying a request-path index must never launch an unbounded 80 GB warehouse backfill',
  );
  assert.match(
    CATALOG_MIGRATION_SOURCE,
    /REVOKE ALL ON public\.training_solver_artifact_catalog[\s\S]*FROM PUBLIC, anon, authenticated, service_role;[\s\S]*GRANT SELECT[\s\S]*TO service_role[\s\S]*REVOKE INSERT, UPDATE, DELETE, TRUNCATE/,
  );
  assert.match(
    CATALOG_MIGRATION_SOURCE,
    /REVOKE ALL ON public\.solved_spots_gold FROM service_role;[\s\S]*GRANT SELECT ON public\.solved_spots_gold TO service_role/,
    'PR A retains only the predecessor read needed for rollback compatibility',
  );
  assert.doesNotMatch(
    CATALOG_MIGRATION_SOURCE,
    /GRANT\s+(?:ALL|[^;]*(?:INSERT|UPDATE|DELETE|TRUNCATE))[^;]*ON\s+(?:TABLE\s+)?public\.solved_spots_gold\s+TO\s+service_role/i,
    'the service role cannot mutate the solver warehouse directly',
  );
  assert.match(
    CATALOG_MIGRATION_SOURCE,
    /DROP POLICY IF EXISTS "Public read access" ON public\.solved_spots_gold/,
  );
  assert.match(
    CATALOG_MIGRATION_SOURCE,
    /pg_policy[\s\S]*polpermissive[\s\S]*polcmd IN \('r', '\*'\)[\s\S]*'authenticated'::regrole::oid/,
  );
  assert.match(CATALOG_MIGRATION_SOURCE, /ORDER BY entry\.key COLLATE "C"/);
  assert.match(CATALOG_MIGRATION_SOURCE, /SET search_path TO 'pg_catalog'/);
  assert.match(
    CATALOG_MIGRATION_SOURCE,
    /has_function_privilege\([\s\S]*'anon', 'public\.fn_training_canonical_jsonb_text_v1\(jsonb\)', 'EXECUTE'[\s\S]*'anon', 'public\.sp_require_solver_write_provenance\(\)', 'EXECUTE'[\s\S]*'anon', 'public\.fn_training_solver_artifact_catalog_sync_v1\(\)', 'EXECUTE'/,
  );
  assert.ok(
    [...CATALOG_VERIFIER_SOURCE.matchAll(/'-f', MIGRATION/g)].length >= 2,
    'the disposable PG17 verifier must prove catalog migration idempotency',
  );
  assert.match(
    CATALOG_VERIFIER_SOURCE,
    /catalog migration inferred an unproven historical warehouse row[\s\S]*validated future solver artifact was not registered[\s\S]*quarantined artifact remained[\s\S]*invalid hero position remained[\s\S]*deleted solver artifact left/,
  );
  assert.match(
    CATALOG_VERIFIER_SOURCE,
    /negative_zero[\s\S]*1e-7[\s\S]*1e20[\s\S]*crossRuntimeCanonicalVectors[\s\S]*serviceAclLeastPrivilege/,
  );
  assert.match(
    CATALOG_VERIFIER_SOURCE,
    /CREATE POLICY "Public read access"[\s\S]*legacy public warehouse read policy survived migration[\s\S]*legacyPublicReadPolicyRemoved/,
  );
});

test('spot study labels solver action targets in big blinds instead of fake percentages', () => {
  assert.match(api, /action === 'c'.*facing_bet_bb/s);
  assert.match(api, /Call.*Check/s);
  assert.match(api, /const verb = Number\(matrix\?\.facing_bet_bb\) > 0 \? 'Raise' : 'Bet'/);
  assert.match(api, /streetTargetChips = rawTargetChips - Number\(matrix\?\.street_baseline_chips \|\| 0\)/);
  assert.match(api, /`\$\{verb\} To \$\{formatBbTarget\(streetTargetChips\)\} BB`/);
  assert.match(api, /`Raise To \$\{formatBbTarget\(streetTargetChips\)\} BB`/);
  assert.doesNotMatch(api, /Bet \$\{.*\}%|Raise \$\{.*\}%/);
});

test('spot study visibly exposes decision-node and provenance evidence', () => {
  assert.match(source, /Audited PioSOLVER Artifact/);
  assert.match(source, /Decision Node/);
  assert.match(source, /Current Pot/);
  assert.match(source, /Facing/);
  assert.match(source, /Machine/);
  assert.match(source, /Manifest/);
  assert.match(source, /Pipeline:/);
  assert.match(source, /Audited:/);
});

test('spot study traverses past twelve invalid rows and serves the later canonical artifact', async () => {
  const rows = Array.from({ length: 12 }, (_, index) => solverRow({
    id: rowId(index + 1),
  }));
  rows.push(solverRow({ id: rowId(13), provenanceComplete: true }));
  const route = await loadSpotRoute({ rows });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.success, true);
  assert.equal(res.body.mode, 'answer_revealed_reference');
  assert.equal(res.body.authoritativeTrainingProgress, false);
  assert.equal(route.observations.persisted.length, 1);
  assert.equal(route.observations.policyCalls.length, 1);
  assert.equal(route.database.calls.length, 2);
  assert.deepEqual(
    route.database.calls[0].filters.find(([operator, column]) => operator === 'gte' && column === 'artifact_id'),
    ['gte', 'artifact_id', PIVOT],
  );
  assert.deepEqual(
    route.database.calls[1].filters.find(([operator, column]) => operator === 'gt' && column === 'artifact_id'),
    ['gt', 'artifact_id', rowId(12)],
    'the second page must advance strictly beyond the prior terminal id',
  );
});

test('a real two-action c/b525 artifact persists under the answer-revealed study contract', async () => {
  const route = await loadSpotRoute({ rows: [realSolverRow()], realAdapter: true });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(route.observations.policyCalls.length, 1);
  assert.equal(route.observations.policyCalls[0][1].length, 2);
  assert.deepEqual(route.observations.policyCalls[0][1], res.body.spot.heroCards);
  assert.equal(new Set([...res.body.spot.heroCards, ...res.body.spot.board]).size, 5,
    'the physical holding must contain two distinct cards that do not collide with the board');
  assert.equal(route.observations.cacheRows.length, 1,
    'the real canonical cache-row validator must accept the reference-study question');
  assert.equal(route.observations.persisted.length, 1);
  assert.equal(route.observations.cacheRows[0].question_data.options.length, 2);
  assert.equal(
    route.observations.cacheRows[0].question_data.referenceStudyContract.version,
    'smarter-poker.answer-revealed-solver-study.v1',
  );
  assert.equal(route.observations.cacheRows[0].question_data.authoritativeTrainingProgress, false);

  const unscoredReferenceQuestion = route.observations.cacheInputs[0].question;
  assert.equal(isTrainingQuestionValid(unscoredReferenceQuestion), false,
    'the scored Training contract must remain strict for an ordinary two-choice decision');
  const scoredContractQuestion = enforceTrainingQuestionContract(unscoredReferenceQuestion);
  assert.equal(scoredContractQuestion.options.length, 2,
    'the scored contract must not invent actions missing from a sealed solver action tree');
  assert.equal(scoredContractQuestion.questionContract.valid, false);
  assert.ok(scoredContractQuestion.questionContract.issues.some(
    (issue) => /Expected 4 answer choices; received 2/.test(issue),
  ), 'the shared scored contract remains strict and rejects the two-action question');

  assert.equal(res.body.spot.gtoAction, 'Bet 5.25 BB');
  assert.equal(res.body.spot.gtoSourceCode, 'b525');
  assert.equal(res.body.spot.gtoFrequency, 60);
  assert.equal(res.body.spot.actionBreakdown.Check, 40);
  assert.equal(res.body.spot.actionBreakdown['Bet 5.25 BB'], 60);
  assert.equal(res.body.spot.actions.length, 2);
  assert.equal('comboIndex' in res.body.spot, false,
    'the private 1,326-array offset must not leak into the public study DTO');
  assert.deepEqual(
    { ...res.body.spot.actions[1] },
    {
      id: 'bet_75pct',
      sourceCode: 'b525',
      label: 'Bet 5.25 BB',
      frequency: 60,
      targetBigBlinds: 5.25,
      incrementBigBlinds: 5.25,
      solverTargetBigBlinds: 5.25,
      solverTargetChips: 525,
    },
  );
  assert.doesNotMatch(JSON.stringify(res.body.spot), /Bet 75% Pot/,
    'the public response must not replace an exact 5.25 BB target with a percent-pot label');
});

test('in-process admission rejects illegal betting grammar and board-dead strategy mass', async () => {
  const cases = [];

  const underCall = structuredClone(realSolverRow());
  underCall.strategy_matrix_v2.node = 'r:0:b500:b200';
  cases.push(['under-call encoded as aggression', underCall]);

  const shortRaise = structuredClone(realSolverRow());
  shortRaise.strategy_matrix_v2.node = 'r:0:b500:b800';
  cases.push(['non-all-in raise below the prior full-raise increment', shortRaise]);

  const subMinimumOpen = structuredClone(realSolverRow());
  subMinimumOpen.strategy_matrix_v2.actions = [
    { code: 'c', key: 'check', size_pct: 0 },
    {
      code: 'b50', key: 'sub-minimum-open', size_chips: 50,
      size_semantics: 'cumulative_postflop_contribution_target',
    },
  ];
  subMinimumOpen.strategy_matrix_v2.frequencies = {
    c: comboVector(subMinimumOpen.strategy_matrix_v2.board, 0.4),
    b50: comboVector(subMinimumOpen.strategy_matrix_v2.board, 0.6),
  };
  cases.push(['non-all-in opening wager below one big blind', subMinimumOpen]);

  const afterCheckCheck = structuredClone(realSolverRow());
  afterCheckCheck.scenario_hash = 'hu_cash_BTN_100bb_Jh7d2c';
  afterCheckCheck.strategy_matrix_v2.node = 'r:0:c:c:c';
  afterCheckCheck.strategy_matrix_v2.hero = 'IP';
  afterCheckCheck.strategy_matrix_v2.position = 'BTN';
  cases.push(['action after check-check', afterCheckCheck]);

  for (const [label, node] of [
    ['premature runout', 'r:0:Ts'],
    ['post-all-in runout', 'r:0:b10000:c:Ts'],
  ]) {
    const row = structuredClone(realSolverRow());
    const board = ['Jh', '7d', '2c', 'Ts'];
    row.scenario_hash = 'turn_hu_cash_BB_100bb_Jh7d2cTs';
    row.street = 'turn';
    row.strategy_matrix_v2.street = 'turn';
    row.strategy_matrix_v2.board = board;
    row.strategy_matrix_v2.node = node;
    row.strategy_matrix_v2.frequencies.c = comboVector(board, 0.4);
    row.strategy_matrix_v2.frequencies.b525 = comboVector(board, 0.6);
    cases.push([label, row]);
  }

  const foldWithoutWager = structuredClone(realSolverRow());
  foldWithoutWager.strategy_matrix_v2.actions = [
    { code: 'c', key: 'check', size_pct: 0 },
    { code: 'f', key: 'fold', size_pct: 0 },
  ];
  foldWithoutWager.strategy_matrix_v2.frequencies = {
    c: comboVector(foldWithoutWager.strategy_matrix_v2.board, 0.4),
    f: comboVector(foldWithoutWager.strategy_matrix_v2.board, 0.6),
  };
  cases.push(['fold without facing a wager', foldWithoutWager]);

  const duplicateTarget = structuredClone(realSolverRow());
  duplicateTarget.strategy_matrix_v2.actions = [
    { code: 'c', key: 'check', size_pct: 0 },
    {
      code: 'b525', key: 'bet', size_chips: 525,
      size_semantics: 'cumulative_postflop_contribution_target',
    },
    {
      code: 'r525', key: 'raise', size_chips: 525,
      size_semantics: 'cumulative_postflop_contribution_target',
    },
  ];
  duplicateTarget.strategy_matrix_v2.frequencies = {
    c: comboVector(duplicateTarget.strategy_matrix_v2.board, 0.4),
    b525: comboVector(duplicateTarget.strategy_matrix_v2.board, 0.3),
    r525: comboVector(duplicateTarget.strategy_matrix_v2.board, 0.3),
  };
  cases.push(['duplicate-equivalent wager target', duplicateTarget]);

  const boardDeadMass = structuredClone(realSolverRow());
  const deadComboIndex = (38 * 37) / 2; // 2cJh includes board card Jh.
  boardDeadMass.strategy_matrix_v2.frequencies.c[deadComboIndex] = 0.4;
  boardDeadMass.strategy_matrix_v2.frequencies.b525[deadComboIndex] = 0.6;
  cases.push(['strategy mass on a board-dead combo', boardDeadMass]);

  for (const [label, row] of cases) {
    const route = await loadSpotRoute({ rows: [row], realAdapter: true });
    const res = await requestSpot(route);
    assert.equal(res.statusCode, 404, `${label}: ${JSON.stringify(res.body)}`);
    assert.equal(route.observations.policyCalls.length, 0, label);
    assert.equal(route.observations.persisted.length, 0, label);
  }
});

test('standalone turn and river roots remain eligible when Pio loads the full board at r:0', async () => {
  for (const [street, board] of [
    ['turn', ['Jh', '7d', '2c', 'Ts']],
    ['river', ['Jh', '7d', '2c', 'Ts', '9d']],
  ]) {
    const row = structuredClone(realSolverRow({ id: rowId(street === 'turn' ? 710 : 711) }));
    row.scenario_hash = `${street}_hu_cash_BB_100bb_${board.join('')}`;
    row.street = street;
    row.strategy_matrix_v2.street = street;
    row.strategy_matrix_v2.board = board;
    row.strategy_matrix_v2.node = 'r:0';
    row.strategy_matrix_v2.frequencies.c = comboVector(board, 0.4);
    row.strategy_matrix_v2.frequencies.b525 = comboVector(board, 0.6);

    const runtime = await loadSpotRoute({ rows: [row], realAdapter: true });
    const res = await requestSpot(runtime);
    assert.equal(res.statusCode, 200, `${street} root should remain usable`);
    assert.equal(res.body.spot.street, street);
    assert.equal(res.body.spot.decisionNode.node, 'r:0');
  }
});

test('the CPU candidate loop stops at its hard deadline before policy or persistence', async () => {
  const route = await loadSpotRoute({
    rows: [realSolverRow()],
    realAdapter: true,
    advanceClockAfterMatrixMs: LOOKUP_DEADLINE_MS + 1,
  });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 503, JSON.stringify(res.body));
  assert.equal(res.body.code, 'SOLVER_LOOKUP_INCOMPLETE');
  assert.match(res.body.error, /wall-clock deadline/);
  assert.equal(route.observations.policyCalls.length, 0);
  assert.equal(route.observations.persisted.length, 0);
});

test('an exact-stack short all-in raise remains a legal decision node', async () => {
  const row = realSolverRow();
  row.strategy_matrix_v2.node = 'r:0:b500:b800';
  row.strategy_matrix_v2.eff_stack_bb = 8;
  row.strategy_matrix_v2.actions = [
    { code: 'c', key: 'call', size_pct: 0 },
    { code: 'f', key: 'fold', size_pct: 0 },
  ];
  row.strategy_matrix_v2.frequencies = {
    c: comboVector(row.strategy_matrix_v2.board, 0.6),
    f: comboVector(row.strategy_matrix_v2.board, 0.4),
  };
  const route = await loadSpotRoute({ rows: [row], realAdapter: true });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.spot.actions.map(({ sourceCode }) => sourceCode), ['c', 'f']);
  assert.equal(res.body.spot.decisionNode.facingBetBb, 3);
});

test('a real harvested multi-sizing artifact preserves every distinct action', async () => {
  const row = realSolverRow({ checkFrequency: 0.3 });
  row.strategy_matrix_v2.actions = [
    { key: 'check', code: 'c', size_pct: 0 },
    { key: 'bet_chips_231', code: 'b231', size_chips: 231, size_pct: null,
      size_semantics: 'cumulative_postflop_contribution_target' },
    { key: 'bet_chips_525', code: 'b525', size_chips: 525, size_pct: null,
      size_semantics: 'cumulative_postflop_contribution_target' },
  ];
  row.strategy_matrix_v2.frequencies = {
    c: comboVector(row.strategy_matrix_v2.board, 0.3),
    b231: comboVector(row.strategy_matrix_v2.board, 0.25),
    b525: comboVector(row.strategy_matrix_v2.board, 0.45),
  };
  const route = await loadSpotRoute({ rows: [row], realAdapter: true });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.spot.actions.map(({ id, sourceCode, label, frequency }) => ({
    id, sourceCode, label, frequency,
  })), [
    { id: 'check', sourceCode: 'c', label: 'Check', frequency: 30 },
    { id: 'bet_33pct', sourceCode: 'b231', label: 'Bet 2.31 BB', frequency: 25 },
    { id: 'bet_75pct', sourceCode: 'b525', label: 'Bet 5.25 BB', frequency: 45 },
  ]);
  assert.equal(res.body.spot.gtoSourceCode, 'b525');
  assert.equal(res.body.spot.gtoFrequency, 45);
});

test('Spot Study subtracts prior-street contributions from a cumulative turn target', async () => {
  const row = realSolverRow({ checkFrequency: 0.4 });
  row.scenario_hash = 'turn_hu_cash_BB_100bb_Jh7d2cTs';
  row.street = 'turn';
  row.strategy_matrix_v2 = {
    ...row.strategy_matrix_v2,
    actions: [
      { key: 'check', code: 'c', size_pct: 0 },
      { key: 'bet_chips_1442', code: 'b1442', size_chips: 1442, size_pct: null,
        size_semantics: 'cumulative_postflop_contribution_target' },
    ],
    frequencies: {
      c: comboVector(['Jh', '7d', '2c', 'Ts'], 0.4),
      b1442: comboVector(['Jh', '7d', '2c', 'Ts'], 0.6),
    },
    node: 'r:0:c:b412:c:Ts',
    board: ['Jh', '7d', '2c', 'Ts'],
    street: 'turn',
    pot_bb: 5.5,
    convergence: { ...row.strategy_matrix_v2.convergence, starting_pot_chips: 550, achieved_exploitability_chips: 0.275 },
  };
  const route = await loadSpotRoute({ rows: [row], realAdapter: true });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.spot.decisionNode.potBb, 13.74);
  assert.equal(res.body.spot.decisionNode.facingBetBb, 0);
  const bet = res.body.spot.actions.find(({ sourceCode }) => sourceCode === 'b1442');
  assert.deepEqual({ ...bet }, {
    id: 'bet_74_96pct',
    sourceCode: 'b1442',
    label: 'Bet 10.3 BB',
    frequency: 60,
    targetBigBlinds: 10.3,
    incrementBigBlinds: 10.3,
    solverTargetBigBlinds: 14.42,
    solverTargetChips: 1442,
  });
  assert.equal(res.body.spot.gtoAction, 'Bet 10.3 BB');
});

test('Spot Study exposes a current-street Raise-To target and labels the cumulative cap All-In', async () => {
  const row = realSolverRow();
  row.scenario_hash = 'turn_hu_cash_BTN_100bb_Jh7d2cTs';
  row.street = 'turn';
  row.strategy_matrix_v2 = {
    ...row.strategy_matrix_v2,
    actions: [
      { key: 'call', code: 'c', size_pct: 0 },
      { key: 'fold', code: 'f', size_pct: 0 },
      { key: 'raise_chips_3502', code: 'b3502', size_chips: 3502, size_pct: null,
        size_semantics: 'cumulative_postflop_contribution_target' },
      { key: 'raise_chips_9750', code: 'b9750', size_chips: 9750, size_pct: null,
        size_semantics: 'cumulative_postflop_contribution_target' },
    ],
    frequencies: {
      c: comboVector(['Jh', '7d', '2c', 'Ts'], 0.15),
      f: comboVector(['Jh', '7d', '2c', 'Ts'], 0.05),
      b3502: comboVector(['Jh', '7d', '2c', 'Ts'], 0.5),
      b9750: comboVector(['Jh', '7d', '2c', 'Ts'], 0.3),
    },
    node: 'r:0:c:b412:c:Ts:b1442',
    board: ['Jh', '7d', '2c', 'Ts'],
    street: 'turn',
    pot_bb: 5.5,
    convergence: { ...row.strategy_matrix_v2.convergence, starting_pot_chips: 550, achieved_exploitability_chips: 0.275 },
    eff_stack_bb: 97.5,
    hero: 'IP',
    position: 'BTN',
    oop_player: 'BB',
    ip_player: 'BTN',
  };
  const route = await loadSpotRoute({ rows: [row], realAdapter: true });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.spot.decisionNode.potBb, 24.04);
  assert.equal(res.body.spot.decisionNode.facingBetBb, 10.3);
  assert.deepEqual(
    res.body.spot.actions.map(({ id, sourceCode, label }) => ({ id, sourceCode, label })),
    [
      { id: 'call', sourceCode: 'c', label: 'Call' },
      { id: 'fold', sourceCode: 'f', label: 'Fold' },
      { id: 'raise_128_54pct', sourceCode: 'b3502', label: 'Raise To 30.9 BB' },
      { id: 'all_in', sourceCode: 'b9750', label: 'All-In' },
    ],
  );
  const raise = res.body.spot.actions.find(({ sourceCode }) => sourceCode === 'b3502');
  assert.equal(raise.targetBigBlinds, 30.9);
  assert.equal(raise.incrementBigBlinds, 30.9);
  assert.equal(raise.solverTargetBigBlinds, 35.02);
  assert.equal(raise.solverTargetChips, 3502);
  const allIn = res.body.spot.actions.find(({ sourceCode }) => sourceCode === 'b9750');
  assert.equal(allIn.targetBigBlinds, 93.38);
  assert.equal(allIn.incrementBigBlinds, 93.38);
  assert.equal(allIn.solverTargetBigBlinds, 97.5);
  assert.equal(allIn.solverTargetChips, 9750);
});

test('Spot Study separates a re-raise target from chips added after hero already bet', async () => {
  const row = realSolverRow();
  row.scenario_hash = 'turn_hu_cash_BB_100bb_Jh7d2cTs';
  row.street = 'turn';
  row.strategy_matrix_v2 = {
    ...row.strategy_matrix_v2,
    actions: [
      { key: 'call', code: 'c', size_pct: 0 },
      { key: 'fold', code: 'f', size_pct: 0 },
      { key: 'raise_chips_6000', code: 'b6000', size_chips: 6000, size_pct: null,
        size_semantics: 'cumulative_postflop_contribution_target' },
      { key: 'raise_chips_9750', code: 'b9750', size_chips: 9750, size_pct: null,
        size_semantics: 'cumulative_postflop_contribution_target' },
    ],
    frequencies: {
      c: comboVector(['Jh', '7d', '2c', 'Ts'], 0.15),
      f: comboVector(['Jh', '7d', '2c', 'Ts'], 0.05),
      b6000: comboVector(['Jh', '7d', '2c', 'Ts'], 0.5),
      b9750: comboVector(['Jh', '7d', '2c', 'Ts'], 0.3),
    },
    node: 'r:0:c:b412:c:Ts:b1442:b3502',
    board: ['Jh', '7d', '2c', 'Ts'],
    street: 'turn',
    pot_bb: 5.5,
    convergence: { ...row.strategy_matrix_v2.convergence, starting_pot_chips: 550, achieved_exploitability_chips: 0.275 },
    eff_stack_bb: 97.5,
    hero: 'OOP',
    position: 'BB',
    oop_player: 'BB',
    ip_player: 'BTN',
  };
  const route = await loadSpotRoute({ rows: [row], realAdapter: true });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.spot.decisionNode.potBb, 54.94);
  assert.equal(res.body.spot.decisionNode.facingBetBb, 20.6);
  const raise = res.body.spot.actions.find(({ sourceCode }) => sourceCode === 'b6000');
  assert.deepEqual({ ...raise }, {
    id: 'raise_82_96pct',
    sourceCode: 'b6000',
    label: 'Raise To 55.88 BB',
    frequency: 50,
    targetBigBlinds: 55.88,
    incrementBigBlinds: 45.58,
    solverTargetBigBlinds: 60,
    solverTargetChips: 6000,
  });
  assert.equal(res.body.spot.actions.find(({ sourceCode }) => sourceCode === 'b9750').label, 'All-In');
});

test('Spot Study keeps cumulative contribution state through both turn and river', async () => {
  const row = realSolverRow({ checkFrequency: 0.4 });
  row.scenario_hash = 'river_hu_cash_BTN_100bb_Jh7d2cTs9d';
  row.street = 'river';
  row.strategy_matrix_v2 = {
    ...row.strategy_matrix_v2,
    actions: [
      { key: 'check', code: 'c', size_pct: 0 },
      { key: 'bet_chips_4018', code: 'b4018', size_chips: 4018, size_pct: null,
        size_semantics: 'cumulative_postflop_contribution_target' },
    ],
    frequencies: {
      c: comboVector(['Jh', '7d', '2c', 'Ts', '9d'], 0.4),
      b4018: comboVector(['Jh', '7d', '2c', 'Ts', '9d'], 0.6),
    },
    node: 'r:0:c:b412:c:Ts:b1442:c:9d:c',
    board: ['Jh', '7d', '2c', 'Ts', '9d'],
    street: 'river',
    pot_bb: 5.5,
    convergence: { ...row.strategy_matrix_v2.convergence, starting_pot_chips: 550, achieved_exploitability_chips: 0.275 },
    hero: 'IP',
    position: 'BTN',
    oop_player: 'BB',
    ip_player: 'BTN',
  };
  const route = await loadSpotRoute({ rows: [row], realAdapter: true });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.spot.decisionNode.potBb, 34.34);
  assert.equal(res.body.spot.decisionNode.facingBetBb, 0);
  const bet = res.body.spot.actions.find(({ sourceCode }) => sourceCode === 'b4018');
  assert.equal(bet.label, 'Bet 25.76 BB');
  assert.equal(bet.targetBigBlinds, 25.76);
  assert.equal(bet.incrementBigBlinds, 25.76);
  assert.equal(bet.solverTargetBigBlinds, 40.18);
  assert.equal(bet.solverTargetChips, 4018);
});

test('the sealed combo order maps one known physical holding to its exact vector cell', async () => {
  const row = realSolverRow();
  row.strategy_matrix_v2.frequencies = {
    c: comboVector(row.strategy_matrix_v2.board, 0.8),
    b525: comboVector(row.strategy_matrix_v2.board, 0.2),
  };
  // With 2c dead on the board, triangular combo index 2 (2d2h) is the first
  // selectable physical holding in the declared rank-major/suit-minor order.
  row.strategy_matrix_v2.frequencies.c[2] = 0.1;
  row.strategy_matrix_v2.frequencies.b525[2] = 0.9;
  row.strategy_matrix_v2.hand_evs_bb[2] = 4.75;
  const route = await loadSpotRoute({ rows: [row], realAdapter: true });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(Array.from(res.body.spot.heroCards), ['2d', '2h']);
  assert.equal(res.body.spot.heroHand, '22');
  assert.equal(res.body.spot.handEvBb, 4.75);
  assert.equal(res.body.spot.actionBreakdown.Check, 10);
  assert.equal(res.body.spot.actionBreakdown['Bet 5.25 BB'], 90);
  assert.equal(new Set([...res.body.spot.heroCards, ...res.body.spot.board]).size, 5);
});

test('an otherwise shaped artifact without the canonical combo-order seal fails closed', async () => {
  const row = realSolverRow();
  delete row.strategy_matrix_v2.combo_order;
  const route = await loadSpotRoute({ rows: [row], realAdapter: true });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 404, JSON.stringify(res.body));
  assert.equal(route.observations.policyCalls.length, 0);
});

test('a replaced solver artifact receives a distinct canonical question identity', async () => {
  const original = realSolverRow();
  const replacement = realSolverRow();
  replacement.source_artifact_checksum = 'e'.repeat(64);
  replacement.manifest_checksum = 'f'.repeat(64);

  const firstRoute = await loadSpotRoute({ rows: [original], realAdapter: true });
  const secondRoute = await loadSpotRoute({ rows: [replacement], realAdapter: true });
  const first = await requestSpot(firstRoute);
  const second = await requestSpot(secondRoute);

  assert.equal(first.statusCode, 200, JSON.stringify(first.body));
  assert.equal(second.statusCode, 200, JSON.stringify(second.body));
  assert.notEqual(
    firstRoute.observations.cacheInputs[0].question.id,
    secondRoute.observations.cacheInputs[0].question.id,
  );
});

test('a catalog row outside its exact family and stack contract is never served', async () => {
  const row = realSolverRow();
  row.stack_depth = 40;
  row.strategy_matrix_v2.eff_stack_bb = 40;
  row.game_type = 'postflop_complete';
  const route = await loadSpotRoute({ rows: [row], realAdapter: true });

  const res = await requestSpot(route, { format: 'cash' });

  assert.equal(res.statusCode, 404, JSON.stringify(res.body));
  assert.equal(route.observations.policyCalls.length, 0);
  assert.equal(route.observations.persisted.length, 0);
});

test('spot study wraps below the pivot and serves a valid lower-id artifact', async () => {
  const route = await loadSpotRoute({
    rows: [solverRow({ id: rowId(1, '1'), provenanceComplete: true })],
  });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(route.database.calls.length, 2);
  assert.ok(route.database.calls[0].filters.some(
    ([operator, column, value]) => operator === 'gte' && column === 'artifact_id' && value === PIVOT,
  ));
  assert.ok(route.database.calls[1].filters.some(
    ([operator, column, value]) => operator === 'lt' && column === 'artifact_id' && value === PIVOT,
  ));
});

test('spot study returns terminal 404 only after pivot-to-end and start-to-pivot exhaustion', async () => {
  const rows = [
    ...Array.from({ length: 13 }, (_, index) => solverRow({ id: rowId(index + 1) })),
    solverRow({ id: rowId(1, '1') }),
    solverRow({ id: rowId(2, '1') }),
  ];
  const route = await loadSpotRoute({ rows });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'AUDITED_SOLVER_ARTIFACT_NOT_FOUND');
  assert.equal(res.body.retryable, false);
  assert.equal(route.database.calls.filter(
    (call) => call.table === 'training_solver_spot_candidates_v1',
  ).length, 3);
  assert.ok(
    route.database.calls.some((call) => call.filters.some(
      ([operator, column, value]) => operator === 'lt' && column === 'artifact_id' && value === PIVOT,
    )),
    'the wrapped segment below the pivot must be inspected before 404',
  );
  assert.equal(route.observations.persisted.length, 0);
});

test('spot study reports a malformed database page as retryable 503', async () => {
  const route = await loadSpotRoute({ rows: [], malformedPage: 1 });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'SOLVER_LOOKUP_UNAVAILABLE');
  assert.equal(res.body.retryable, true);
  assert.equal(route.database.calls.length, 1);
  assert.equal(route.observations.persisted.length, 0);
});

test('an empty authoritative registry returns terminal 404 without touching the 80 GB warehouse', async () => {
  const route = await loadSpotRoute({
    rows: [realSolverRow()],
    catalogRows: [],
  });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'AUDITED_SOLVER_ARTIFACT_NOT_FOUND');
  assert.equal(route.database.calls.length, 2,
    'both bounded catalog segments must prove exhaustion');
  assert.equal(route.database.calls.every(
    (call) => call.table === 'training_solver_spot_candidates_v1',
  ), true, 'an empty registry must be proven only by the bounded service RPC');
});

test('spot study reports a second-page database failure as retryable 503', async () => {
  const rows = Array.from({ length: 13 }, (_, index) => solverRow({ id: rowId(index + 1) }));
  const route = await loadSpotRoute({ rows, errorPage: 2 });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'SOLVER_LOOKUP_UNAVAILABLE');
  assert.equal(res.body.retryable, true);
  assert.equal(route.database.calls.length, 2);
  assert.equal(route.observations.persisted.length, 0);
});

test('a provenance-complete _icm row cannot yield a recommendation without sealed ICM inputs', async () => {
  for (const gameType of [
    'mtt_6max_icm',
    'mtt_9max_icm',
    'spin_3max_icm',
    'spin_hu_icm',
  ]) {
    const route = await loadSpotRoute({
      rows: [solverRow({
        id: rowId(1),
        gameType,
        provenanceComplete: true,
      })],
      // Simulate a data adapter violating the query predicate so the
      // in-process fail-closed boundary is exercised independently too.
      ignoreFamilyFilter: true,
    });

    const res = await requestSpot(route);

    assert.equal(res.statusCode, 404, gameType);
    assert.equal(res.body.code, 'AUDITED_SOLVER_ARTIFACT_NOT_FOUND', gameType);
    assert.equal(route.observations.policyCalls.length, 0,
      `${gameType} must be rejected before policy construction`);
    assert.equal(route.observations.persisted.length, 0, gameType);
    const queriedFamilies = route.database.calls[0].filters.find(
      ([operator, column]) => operator === 'in' && column === 'game_type',
    )?.[2];
    assert.ok(Array.isArray(queriedFamilies), gameType);
    assert.equal(queriedFamilies.some((family) => family.endsWith('_icm')), false,
      'the warehouse query must exclude every categorically unservable ICM family');
  }
});

test('a non-advancing database page fails retryably instead of looping or returning 404', async () => {
  const rows = Array.from({ length: 12 }, (_, index) => solverRow({ id: rowId(index + 1) }));
  const route = await loadSpotRoute({ rows, ignoreIdBounds: true });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'SOLVER_LOOKUP_INCOMPLETE');
  assert.equal(res.body.retryable, true);
  assert.equal(route.database.calls.length, 2,
    'the repeated page must be rejected immediately rather than looped');
});

test('bounded traversal reports an incomplete retryable result instead of false exhaustion', async () => {
  const rows = Array.from({
    length: (MAX_CANDIDATE_PAGES * CANDIDATE_LIMIT) + 1,
  }, (_, index) => solverRow({
    id: rowId(index + 1),
  }));
  const route = await loadSpotRoute({ rows });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'SOLVER_LOOKUP_INCOMPLETE');
  assert.equal(res.body.retryable, true);
  assert.equal(route.database.calls.length, MAX_CANDIDATE_PAGES);
});

test('the wall-clock deadline aborts a slow page and returns retryable incomplete', async () => {
  const route = await loadSpotRoute({
    rows: [],
    waitForAbortPage: 1,
    immediateTimers: true,
  });

  const res = await requestSpot(route);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'SOLVER_LOOKUP_INCOMPLETE');
  assert.equal(res.body.retryable, true);
  assert.match(res.body.error, /wall-clock deadline/);
  assert.equal(route.database.calls.length, 1);
});
