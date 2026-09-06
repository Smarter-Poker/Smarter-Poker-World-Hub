import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  SOLVER_POLICY_CONSUMERS,
  SolverPolicyService,
  normalizeSolvedPolicyRecord,
} from '../src/services/SolverPolicyService.js';
import {
  POLICY_KIND,
  QUALITY_SEAL,
  SOLVER_POLICY_SCHEMA_SHA256,
  createSolverPolicyArtifactBundle,
  createSolverPolicyAnswer,
  createSolverPolicyKey,
  policyKeyCompleteness,
  stablePolicyJson,
  validateSolverPolicyAnswer,
  validateSolverPolicyArtifactBundle,
} from '../src/lib/training/solverPolicyContract.js';

const SHA256 = 'a'.repeat(64);
const COMMIT = 'b'.repeat(40);
const CHART_FIXTURE_ROW = {
  chart_id: 'chart-fixture-1', game_type: 'Tournament', stack_depth: 10,
  hero_position: 'BTN', villain_action: 'fold_to_hero',
  created_at: '2026-09-06T12:00:00.000Z',
  hand_matrix: {
    AA: { push: 1, fold: 0 },
    AKs: { push: 0.75, fold: 0.25 },
    QJs: { push: null, fold: 0.2 },
    '72o': { push: 0, fold: 1 },
  },
};

test('published schema checksum is pinned to the exact contract bytes', () => {
  const bytes = fs.readFileSync('contracts/solver-policy/solver-policy.v1.schema.json');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), SOLVER_POLICY_SCHEMA_SHA256);
});

function completeKey(overrides = {}) {
  return createSolverPolicyKey({
    variant: 'nlh',
    bettingStructure: 'no_limit',
    tableSize: 2,
    positions: { hero: 'BB', villains: ['BTN'], button: 'BTN', smallBlind: 'BTN', bigBlind: 'BB' },
    stackVector: [
      { seat: 0, position: 'BB', stackBb: 100, active: true },
      { seat: 1, position: 'BTN', stackBb: 100, active: true },
    ],
    blinds: { smallBlind: 1, bigBlind: 2, ante: 0, straddles: [], complete: true },
    rake: { percent: 5, capBb: 2, complete: true },
    tournamentUtility: { mode: 'cash', complete: true },
    payouts: [],
    bounties: [],
    street: 'flop',
    board: ['2c', '7d', 'Jh'],
    holding: ['As', 'Ks'],
    publicActionHistory: { complete: true, actions: [] },
    legalActions: [
      { action: 'check', exactChips: 0 },
      { action: 'bet', exactChips: 525 },
    ],
    sidePotEligibility: {
      complete: true,
      pots: [{ id: 'main', amountChips: 700, eligibleSeats: [0, 1], heroEligible: true }],
    },
    ...overrides,
  });
}

function v2Row(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    scenario_hash: 'hu_cash_BB_100bb_Jh7d2c',
    street: 'flop',
    stack_depth: 100,
    game_type: 'hu_cash',
    strategy_matrix: null,
    strategy_matrix_v2: {
      actions: [
        { key: 'check', code: 'c', size_pct: 0 },
        { key: 'bet_75', code: 'b525', size_pct: 75 },
      ],
      frequencies: {
        c: new Array(1326).fill(0.6),
        b525: new Array(1326).fill(0.4),
      },
      hand_evs_bb: new Array(1326).fill(1.25),
      pot_bb: 7,
      node: 'r:0',
      board: ['Jh', '7d', '2c'],
      street: 'flop',
      hero: 'OOP',
      position: 'BB',
      oop_player: 'BB',
      ip_player: 'BTN',
      eff_stack_bb: 100,
    },
    solver_version: 'PioSOLVER 3.0',
    solver_binary_checksum: SHA256,
    machine_id: 'M1',
    pipeline_commit: COMMIT,
    manifest_version: 'solver-pack.2026-09-06',
    manifest_checksum: SHA256,
    source_artifact_checksum: SHA256,
    quality_status: 'validated',
    audited_at: '2026-09-06T12:00:00.000Z',
    ...overrides,
  };
}

test('canonical key is stable, complete, and contains every decision dimension', () => {
  const key = completeKey();
  assert.deepEqual(policyKeyCompleteness(key), { complete: true, missing: [] });
  for (const field of [
    'variant', 'bettingStructure', 'tableSize', 'positions', 'stackVector', 'blinds',
    'rake', 'tournamentUtility', 'payouts', 'bounties', 'street', 'board', 'holding',
    'publicActionHistory', 'legalActions', 'sidePotEligibility',
  ]) assert.ok(Object.hasOwn(key, field), field);
  assert.equal(stablePolicyJson(key), stablePolicyJson(structuredClone(key)));
  assert.deepEqual(
    policyKeyCompleteness(completeKey({ tournamentUtility: { mode: 'cash', complete: false } })),
    { complete: false, missing: ['tournamentUtility'] },
  );
});

test('a complete exact V2 decision exposes canonical semantics, mix, size, EV, and provenance', () => {
  const service = new SolverPolicyService();
  const record = normalizeSolvedPolicyRecord(v2Row());
  assert.equal(record.valid, true);
  const answer = service.answerFromRecord(record, completeKey(), {
    match: 'exact', sourceKeyVerified: true, exactMatchDimensions: ['all'],
  });
  assert.equal(answer.kind, POLICY_KIND.EXACT);
  assert.equal(answer.qualitySeal, QUALITY_SEAL.SOLVER_EXACT);
  assert.equal(answer.node.semantics, 'check_or_bet');
  assert.deepEqual(answer.actions.map((action) => [action.id, action.frequency]), [
    ['check', 0.6], ['bet_75pct', 0.4],
  ]);
  assert.deepEqual(answer.legalSizes, [{
    actionId: 'bet_75pct', unit: 'pot_fraction', chips: 525,
    bigBlinds: 5.25, potFraction: 0.75, exact: true,
  }]);
  assert.equal(answer.chipEv.policy, 1.25);
  assert.equal(answer.sourceArtifact.provenanceComplete, true);
  assert.deepEqual(validateSolverPolicyAnswer(answer), { valid: true, errors: [] });
  const fixture = JSON.parse(fs.readFileSync(
    'contracts/solver-policy/fixtures/exact-policy.v1.json', 'utf8',
  ));
  assert.equal(stablePolicyJson(answer), stablePolicyJson(fixture));
});

test('missing provenance or a missing decision dimension can never be exact', () => {
  const service = new SolverPolicyService();
  const unsealed = normalizeSolvedPolicyRecord(v2Row({ solver_version: null }));
  const missingKey = completeKey({ rake: { complete: false } });
  const byProvenance = service.answerFromRecord(unsealed, completeKey(), { match: 'exact' });
  const byKey = service.answerFromRecord(normalizeSolvedPolicyRecord(v2Row()), missingKey, { match: 'exact' });
  assert.equal(byProvenance.kind, POLICY_KIND.DERIVED);
  assert.equal(byProvenance.fallbackReason, 'source_provenance_incomplete');
  assert.equal(byKey.kind, POLICY_KIND.DERIVED);
  assert.equal(byKey.fallbackReason, 'decision_key_incomplete');
  assert.throws(() => createSolverPolicyAnswer({
    key: missingKey, kind: POLICY_KIND.EXACT, qualitySeal: QUALITY_SEAL.SOLVER_EXACT,
    sourceArtifact: { provenanceComplete: true },
  }), /complete key/);
});

test('legacy V1 fold channel fails closed and no V1 policy can be exact', () => {
  const unsafe = normalizeSolvedPolicyRecord({
    strategy_matrix: {
      actions: ['c', 'f'], frequencies: { c: { AKs: 0.6 }, f: { AKs: 0.4 } },
      hand_evs: { AKs: 1 },
    },
  });
  assert.equal(unsafe.valid, false);
  assert.equal(unsafe.reason, 'untrusted_legacy_v1');

  const safe = normalizeSolvedPolicyRecord({
    id: 'legacy', scenario_hash: 'hu_cash_BB_100bb_Jh7d2c', street: 'flop',
    stack_depth: 100, game_type: 'hu_cash',
    strategy_matrix: {
      actions: ['c', 'b33'], frequencies: { c: { AKs: 0.7 }, b33: { AKs: 0.3 } },
      hand_evs: { AKs: 0.5 }, position: 'BB', oop_player: 'BB', ip_player: 'BTN',
    },
  });
  const answer = new SolverPolicyService().answerFromRecord(safe, completeKey(), {
    match: 'exact', holdingClass: 'AKs',
  });
  assert.equal(answer.kind, POLICY_KIND.DERIVED);
  assert.equal(answer.qualitySeal, QUALITY_SEAL.LEGACY_UNVERIFIED);
  assert.equal(answer.fallbackReason, 'legacy_v1_unsealed');

  const exactFixture = JSON.parse(fs.readFileSync(
    'contracts/solver-policy/fixtures/exact-policy.v1.json', 'utf8',
  ));
  for (const system of ['V1', 'PioSOLVER-v1', 'solved_spots_gold_v1']) {
    const forged = structuredClone(exactFixture);
    forged.sourceArtifact.system = system;
    assert.equal(validateSolverPolicyAnswer(forged).valid, false, system);
  }
  const laterVersion = structuredClone(exactFixture);
  laterVersion.sourceArtifact.system = 'solved_spots_gold_v10';
  assert.equal(validateSolverPolicyAnswer(laterVersion).valid, true);
});

test('contract validation rejects dishonest envelope relationships', () => {
  const chart = new SolverPolicyService().answerFromChart(CHART_FIXTURE_ROW, {}, { mode: 'aggregate' });

  const wrongSeal = structuredClone(chart);
  wrongSeal.qualitySeal = QUALITY_SEAL.SOLVER_EXACT;
  assert.ok(validateSolverPolicyAnswer(wrongSeal).errors.includes('kindQualitySeal'));

  const wrongSizes = structuredClone(chart);
  wrongSizes.legalSizes = [];
  assert.ok(validateSolverPolicyAnswer(wrongSizes).errors.includes('legalSizesMismatch'));

  const wrongConfidence = structuredClone(chart);
  wrongConfidence.confidence = { score: 0.2, level: 'high' };
  assert.ok(validateSolverPolicyAnswer(wrongConfidence).errors.includes('confidenceLevelMismatch'));

  const emptyAvailable = structuredClone(chart);
  emptyAvailable.actions = [];
  emptyAvailable.distribution = {};
  emptyAvailable.legalSizes = [];
  emptyAvailable.chipEv.byAction = {};
  emptyAvailable.tournamentUtilityEv.byAction = {};
  assert.ok(validateSolverPolicyAnswer(emptyAvailable).errors.includes('actionsEmpty'));

  assert.throws(() => createSolverPolicyArtifactBundle([]), /policies\.empty/);
});

test('chart, curated, heuristic, aggregated, and unavailable answers are explicit', () => {
  const service = new SolverPolicyService();
  const chart = {
    chart_id: 'chart-1', game_type: 'Tournament', stack_depth: 10,
    hero_position: 'BTN', villain_action: 'fold_to_hero', created_at: '2026-09-06',
    hand_matrix: { AKs: { push: 0.8, fold: 0.2 } },
  };
  assert.equal(service.answerFromChart(chart, { holding: ['As', 'Ks'] }).kind, POLICY_KIND.CHART);
  assert.equal(service.curatedAnswer({}, [{ id: 'fold', frequency: 1 }]).kind, POLICY_KIND.CURATED);
  const heuristic = service.heuristicAnswer({}, [{ id: 'check', frequency: 1, chipEvBb: 99 }]);
  assert.equal(heuristic.kind, POLICY_KIND.HEURISTIC);
  assert.equal(heuristic.actions[0].chipEvBb, null);
  assert.equal(heuristic.chipEv.measuredByAction, false);
  const record = normalizeSolvedPolicyRecord(v2Row());
  assert.equal(service.aggregateRecords([record]).kind, POLICY_KIND.AGGREGATED);
  assert.equal(service.aggregateRecords([]).kind, POLICY_KIND.UNAVAILABLE);
});

test('World Hub chart adapter matches the committed cross-repository fixture byte for byte', () => {
  const expected = JSON.parse(fs.readFileSync(
    'contracts/solver-policy/fixtures/chart-policy.v1.json', 'utf8',
  ));
  const actual = new SolverPolicyService().answerFromChart(
    CHART_FIXTURE_ROW, {}, { mode: 'aggregate' },
  );
  assert.equal(stablePolicyJson(actual), stablePolicyJson(expected));
  assert.deepEqual(actual.rangeDistribution['J4o'], { all_in: 0, fold: 1 });
  assert.deepEqual(actual.rangeDistribution.QJs, { all_in: 0.8, fold: 0.2 });
});

test('World Hub publishes the exact versioned artifact envelope consumed by Club Arena', () => {
  const policy = new SolverPolicyService().answerFromChart(
    CHART_FIXTURE_ROW, {}, { mode: 'aggregate' },
  );
  const actual = createSolverPolicyArtifactBundle([policy], {
    generatedAt: '2026-09-06T12:00:00.000Z',
    sourceArtifact: 'world-hub-chart-fixture',
  });
  const expected = JSON.parse(fs.readFileSync(
    'contracts/solver-policy/fixtures/chart-policy-artifact.v1.json', 'utf8',
  ));
  assert.equal(stablePolicyJson(actual), stablePolicyJson(expected));
  assert.deepEqual(validateSolverPolicyArtifactBundle(actual), {
    valid: true, errors: [], bundle: actual,
  });

  const missingDistribution = structuredClone(actual);
  delete missingDistribution.policies[0].distribution.fold;
  assert.equal(validateSolverPolicyArtifactBundle(missingDistribution).valid, false);

  const malformedNode = structuredClone(actual);
  malformedNode.policies[0].node.unexpected = true;
  assert.equal(validateSolverPolicyArtifactBundle(malformedNode).valid, false);

  const unmeasuredEv = structuredClone(actual);
  unmeasuredEv.policies[0].actions[0].chipEvBb = 12;
  unmeasuredEv.policies[0].chipEv.byAction.all_in = 12;
  assert.equal(validateSolverPolicyArtifactBundle(unmeasuredEv).valid, false);

  const incompleteMeasuredEv = structuredClone(actual);
  incompleteMeasuredEv.policies[0].chipEv.measuredByAction = true;
  assert.equal(validateSolverPolicyArtifactBundle(incompleteMeasuredEv).valid, false);

  const contractDrift = { ...actual, unexpectedField: true };
  assert.deepEqual(validateSolverPolicyArtifactBundle(contractDrift).errors, ['artifact.shape']);
  assert.throws(() => createSolverPolicyArtifactBundle([policy, policy], {
    sourceArtifact: 'duplicate-test',
  }), /duplicate_scenario_hash/);
});

test('omitted numeric filters never become a stack-depth-zero warehouse predicate', async () => {
  const calls = [];
  const result = { data: [], error: null, count: 0 };
  const query = {
    select() { calls.push(['select']); return this; },
    eq(...args) { calls.push(['eq', ...args]); return this; },
    in(...args) { calls.push(['in', ...args]); return this; },
    ilike(...args) { calls.push(['ilike', ...args]); return this; },
    gte(...args) { calls.push(['gte', ...args]); return this; },
    lte(...args) { calls.push(['lte', ...args]); return this; },
    order(...args) { calls.push(['order', ...args]); return this; },
    limit(...args) { calls.push(['limit', ...args]); return this; },
    then(resolve) { resolve(result); },
  };
  const db = { from(table) { calls.push(['from', table]); return query; } };
  await new SolverPolicyService({ db }).readSolvedRows({ gameTypes: ['hu_cash'] });
  assert.equal(calls.some((call) => call[0] === 'eq' && call[1] === 'stack_depth'), false);
});

test('policy resolution uses the hero stack and never invents a zero-depth chart filter', async () => {
  let solvedFilters;
  let chartFilters;
  const service = new SolverPolicyService({
    solvedRowReader: async (filters) => {
      solvedFilters = filters;
      return [];
    },
    chartRowReader: async (filters) => {
      chartFilters = filters;
      return [];
    },
  });
  await service.resolve({
    key: {
      variant: 'nlh', bettingStructure: 'no_limit', street: 'preflop',
      tournamentUtility: { mode: 'cash', complete: true },
      positions: { hero: 'BTN', villains: ['BB'] },
      stackVector: [
        { seat: 0, position: 'BB', stackBb: 50 },
        { seat: 1, position: 'BTN', stackBb: 20 },
      ],
    },
    gameTypes: ['hu_cash'],
    allowStateApproximation: true,
  });
  assert.equal(solvedFilters.stackDepth, 20);

  await service.resolve({
    key: {
      variant: 'nlh', bettingStructure: 'no_limit', street: 'preflop',
      tournamentUtility: { mode: 'unknown', complete: false },
      positions: { hero: 'BTN', villains: [] }, stackVector: [],
    },
    gameTypes: ['mtt'],
  });
  assert.equal(chartFilters.minStackDepth, undefined);
  assert.equal(chartFilters.maxStackDepth, undefined);
});

test('every declared consumer receives byte-identical canonical semantics', () => {
  const service = new SolverPolicyService();
  const answer = service.answerFromRecord(normalizeSolvedPolicyRecord(v2Row()), completeKey(), {
    match: 'exact', sourceKeyVerified: true, exactMatchDimensions: ['all'],
  });
  const baseline = service.consumerEnvelope(answer, SOLVER_POLICY_CONSUMERS[0]);
  for (const consumer of SOLVER_POLICY_CONSUMERS) {
    assert.deepEqual(service.consumerEnvelope(answer, consumer), baseline, consumer);
  }
});

test('all required runtime consumers import the service and no Training route reads the warehouse', () => {
  const consumers = [
    'pages/api/training/get-question.js',
    'pages/api/training/batch-preload.js',
    'pages/api/training/spot-drill.js',
    'pages/api/training/custom-train.js',
    'pages/api/training/solver-api.js',
    'pages/api/training/tree-navigate.js',
    'pages/api/training/browse-solutions.js',
    'pages/api/training/runout-report.js',
    'pages/api/training/aggregate-report.js',
    'pages/api/assistant/sandbox/analyze.js',
    'pages/api/admin/inspect-pio-data.js',
    'src/engines/DeterministicGTOEngine.js',
    'src/services/PIOQueryService.js',
    'src/content-engine/services/HorsePokerGTO.js',
  ];
  for (const filename of consumers) {
    assert.match(fs.readFileSync(filename, 'utf8'), /SolverPolicyService/, filename);
  }
  const trainingRoutes = fs.readdirSync('pages/api/training')
    .filter((name) => name.endsWith('.js'));
  const offenders = trainingRoutes.filter((name) => (
    /\.from\(['"]solved_spots_gold['"]\)/.test(
      fs.readFileSync(`pages/api/training/${name}`, 'utf8'),
    )
  ));
  assert.deepEqual(offenders, []);
  assert.doesNotMatch(
    fs.readFileSync('src/content-engine/services/HorsePokerGTO.js', 'utf8'),
    /\.from\(['"](?:solved_spots_gold|memory_charts_gold)['"]\)/,
  );
});
