import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  SOLVER_POLICY_CONSUMERS,
  SOLVER_POLICY_INTEGRATION,
  SOLVER_POLICY_SURFACES,
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
  chart_id: 'chart-fixture-1',
  game_type: 'Tournament',
  stack_depth: 10,
  hero_position: 'BTN',
  villain_action: 'fold_to_hero',
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
    blinds: { smallBlind: 50, bigBlind: 100, ante: 0, straddles: [], complete: true },
    rake: { percent: 5, capBb: 2, complete: true },
    tournamentUtility: { mode: 'cash', complete: true },
    payouts: [],
    bounties: [],
    street: 'flop',
    board: ['2c', '7d', 'Jh'],
    holding: ['As', 'Ks'],
    publicActionHistory: {
      complete: true,
      actions: [
        {
          sequence: 0,
          street: 'preflop',
          actor: 'BTN',
          action: 'small_blind',
          amountChips: 50,
          amountBb: 0.5,
        },
        {
          sequence: 1,
          street: 'preflop',
          actor: 'BB',
          action: 'big_blind',
          amountChips: 100,
          amountBb: 1,
        },
        {
          sequence: 2,
          street: 'preflop',
          actor: 'BTN',
          action: 'raise',
          amountChips: 300,
          amountBb: 3,
        },
        {
          sequence: 3,
          street: 'preflop',
          actor: 'BB',
          action: 'call',
          amountChips: 200,
          amountBb: 2,
        },
      ],
    },
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
      rake: '5 2 0.5 1',
      tree_geometry: 'hu_cash_100bb_standard',
      solver: 'PioSOLVER',
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
    'variant',
    'bettingStructure',
    'tableSize',
    'positions',
    'stackVector',
    'blinds',
    'rake',
    'tournamentUtility',
    'payouts',
    'bounties',
    'street',
    'board',
    'holding',
    'publicActionHistory',
    'legalActions',
    'sidePotEligibility',
  ])
    assert.ok(Object.hasOwn(key, field), field);
  assert.equal(stablePolicyJson(key), stablePolicyJson(structuredClone(key)));
  assert.deepEqual(
    policyKeyCompleteness(completeKey({ tournamentUtility: { mode: 'cash', complete: false } })),
    { complete: false, missing: ['tournamentUtility'] }
  );
});

test('a complete exact V2 decision exposes canonical semantics, mix, size, EV, and provenance', () => {
  const service = new SolverPolicyService();
  const record = normalizeSolvedPolicyRecord(v2Row());
  assert.equal(record.valid, true);
  const answer = service.answerFromRecord(record, completeKey(), {
    match: 'exact',
    sourceKeyVerified: true,
    exactMatchDimensions: ['all'],
  });
  assert.equal(answer.kind, POLICY_KIND.EXACT);
  assert.equal(answer.qualitySeal, QUALITY_SEAL.SOLVER_EXACT);
  assert.equal(answer.node.semantics, 'check_or_bet');
  assert.deepEqual(
    answer.actions.map((action) => [action.id, action.frequency]),
    [
      ['check', 0.6],
      ['bet_75pct', 0.4],
    ]
  );
  assert.deepEqual(answer.legalSizes, [
    {
      actionId: 'bet_75pct',
      unit: 'pot_fraction',
      chips: 525,
      bigBlinds: 5.25,
      potFraction: 0.75,
      exact: true,
    },
  ]);
  assert.equal(answer.chipEv.policy, 1.25);
  assert.equal(answer.sourceArtifact.provenanceComplete, true);
  assert.deepEqual(validateSolverPolicyAnswer(answer), { valid: true, errors: [] });
  const fixture = JSON.parse(
    fs.readFileSync('contracts/solver-policy/fixtures/exact-policy.v1.json', 'utf8')
  );
  assert.equal(stablePolicyJson(answer), stablePolicyJson(fixture));
});

test('missing provenance or a missing decision dimension can never be exact', () => {
  const service = new SolverPolicyService();
  const unsealed = normalizeSolvedPolicyRecord(v2Row({ solver_version: null }));
  const missingKey = completeKey({ rake: { complete: false } });
  const byProvenance = service.answerFromRecord(unsealed, completeKey(), { match: 'exact' });
  const byKey = service.answerFromRecord(normalizeSolvedPolicyRecord(v2Row()), missingKey, {
    match: 'exact',
  });
  assert.equal(byProvenance.kind, POLICY_KIND.DERIVED);
  assert.equal(byProvenance.fallbackReason, 'source_provenance_incomplete');
  assert.equal(byKey.kind, POLICY_KIND.DERIVED);
  assert.equal(byKey.fallbackReason, 'decision_key_incomplete');
  assert.throws(
    () =>
      createSolverPolicyAnswer({
        key: missingKey,
        kind: POLICY_KIND.EXACT,
        qualitySeal: QUALITY_SEAL.SOLVER_EXACT,
        sourceArtifact: { provenanceComplete: true },
      }),
    /complete key/
  );
});

test('solver-exact is impossible when solve geometry or row identity provenance is incomplete', () => {
  const service = new SolverPolicyService();
  const incompleteRows = [
    ['rake', (row) => { delete row.strategy_matrix_v2.rake; }],
    ['tree geometry', (row) => { delete row.strategy_matrix_v2.tree_geometry; }],
    ['solver identity', (row) => { row.strategy_matrix_v2.solver = 'UnknownSolver'; }],
    ['embedded actor identity', (row) => { row.strategy_matrix_v2.node = 'r:0:c'; }],
  ];

  for (const [label, mutate] of incompleteRows) {
    const row = structuredClone(v2Row());
    mutate(row);
    const record = normalizeSolvedPolicyRecord(row);
    const answer = service.answerFromRecord(record, completeKey(), {
      match: 'exact',
      sourceKeyVerified: true,
      exactMatchDimensions: ['all'],
    });
    assert.notEqual(answer.kind, POLICY_KIND.EXACT, label);
    assert.notEqual(answer.qualitySeal, QUALITY_SEAL.SOLVER_EXACT, label);
  }
});

test('resolve never upgrades an artifact or board lookup to exact without a verified source key', async () => {
  const service = new SolverPolicyService({ solvedRowReader: async () => [v2Row()] });
  const { answer } = await service.resolve({
    key: completeKey(),
    artifactId: v2Row().id,
    gameTypes: ['hu_cash'],
  });
  assert.equal(answer.kind, POLICY_KIND.DERIVED);
  assert.equal(answer.qualitySeal, QUALITY_SEAL.SOLVER_DERIVED_RESPONSE);
  assert.equal(answer.fallbackReason, 'source_decision_key_unverified');
});

test('legacy V1 fold channel fails closed and no V1 policy can be exact', () => {
  const unsafe = normalizeSolvedPolicyRecord({
    strategy_matrix: {
      actions: ['c', 'f'],
      frequencies: { c: { AKs: 0.6 }, f: { AKs: 0.4 } },
      hand_evs: { AKs: 1 },
    },
  });
  assert.equal(unsafe.valid, false);
  assert.equal(unsafe.reason, 'untrusted_legacy_v1');

  const safe = normalizeSolvedPolicyRecord({
    id: 'legacy',
    scenario_hash: 'hu_cash_BB_100bb_Jh7d2c',
    street: 'flop',
    stack_depth: 100,
    game_type: 'hu_cash',
    strategy_matrix: {
      actions: ['c', 'b33'],
      frequencies: { c: { AKs: 0.7 }, b33: { AKs: 0.3 } },
      hand_evs: { AKs: 0.5 },
      position: 'BB',
      oop_player: 'BB',
      ip_player: 'BTN',
    },
  });
  const answer = new SolverPolicyService().answerFromRecord(safe, completeKey(), {
    match: 'exact',
    holdingClass: 'AKs',
  });
  assert.equal(answer.kind, POLICY_KIND.DERIVED);
  assert.equal(answer.qualitySeal, QUALITY_SEAL.LEGACY_UNVERIFIED);
  assert.equal(answer.fallbackReason, 'legacy_v1_unsealed');

  const exactFixture = JSON.parse(
    fs.readFileSync('contracts/solver-policy/fixtures/exact-policy.v1.json', 'utf8')
  );
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
  const chart = new SolverPolicyService().answerFromChart(
    CHART_FIXTURE_ROW,
    {},
    { mode: 'aggregate' }
  );

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

test('exact policies require explicit legal action families and exact non-negative sizes', () => {
  const exact = JSON.parse(
    fs.readFileSync('contracts/solver-policy/fixtures/exact-policy.v1.json', 'utf8')
  );

  const missingSize = structuredClone(exact);
  delete missingSize.actions[0].size;
  assert.doesNotThrow(() => validateSolverPolicyAnswer(missingSize));
  assert.equal(validateSolverPolicyAnswer(missingSize).valid, false);

  const ambiguous = structuredClone(exact);
  ambiguous.actions[1].size = {
    unit: 'unknown',
    chips: null,
    bigBlinds: null,
    potFraction: null,
    exact: false,
  };
  ambiguous.legalSizes[0] = { actionId: ambiguous.actions[1].id, ...ambiguous.actions[1].size };
  assert.ok(validateSolverPolicyAnswer(ambiguous).errors.includes('exactActionSizes'));

  const illegalFamily = structuredClone(exact);
  illegalFamily.actions[1].family = 'raise';
  assert.ok(validateSolverPolicyAnswer(illegalFamily).errors.includes('exactLegalActions'));

  const negativeSize = structuredClone(exact);
  negativeSize.actions[1].size.potFraction = -0.75;
  negativeSize.legalSizes[0].potFraction = -0.75;
  assert.equal(validateSolverPolicyAnswer(negativeSize).valid, false);

  const uncheckableUnit = structuredClone(exact);
  uncheckableUnit.actions[1].size.chips = null;
  uncheckableUnit.legalSizes[0].chips = null;
  assert.ok(validateSolverPolicyAnswer(uncheckableUnit).errors.includes('exactActionSizes'));

  for (const mutate of [
    (candidate) => {
      candidate.actions[1].size.bigBlinds = 6;
    },
    (candidate) => {
      candidate.actions[1].size.potFraction = 1.75;
    },
  ]) {
    const inconsistent = structuredClone(exact);
    mutate(inconsistent);
    inconsistent.legalSizes[0] = {
      actionId: inconsistent.actions[1].id,
      ...inconsistent.actions[1].size,
    };
    assert.ok(validateSolverPolicyAnswer(inconsistent).errors.includes('exactActionUnits'));
  }

  const consistentOverbet = structuredClone(exact);
  consistentOverbet.actions[1].size = {
    unit: 'pot_fraction',
    chips: 1225,
    bigBlinds: 12.25,
    potFraction: 1.75,
    exact: true,
  };
  consistentOverbet.legalSizes[0] = {
    actionId: consistentOverbet.actions[1].id,
    ...consistentOverbet.actions[1].size,
  };
  consistentOverbet.key.legalActions[0].exactChips = 1225;
  assert.deepEqual(validateSolverPolicyAnswer(consistentOverbet), { valid: true, errors: [] });

  const exactAllIn = structuredClone(exact);
  exactAllIn.actions[1].family = 'all_in';
  exactAllIn.actions[1].size.unit = 'all_in';
  exactAllIn.legalSizes[0] = {
    actionId: exactAllIn.actions[1].id,
    ...exactAllIn.actions[1].size,
  };
  exactAllIn.key.legalActions[0].action = 'all_in';
  exactAllIn.key.legalActions[0].allIn = true;
  assert.deepEqual(validateSolverPolicyAnswer(exactAllIn), { valid: true, errors: [] });
  exactAllIn.actions[1].size.chips = null;
  exactAllIn.legalSizes[0].chips = null;
  assert.ok(validateSolverPolicyAnswer(exactAllIn).errors.includes('exactActionSizes'));

  const unknownFamily = structuredClone(exact);
  unknownFamily.actions[1].family = 'teleport';
  unknownFamily.key.legalActions[0].action = 'teleport';
  assert.ok(validateSolverPolicyAnswer(unknownFamily).errors.includes('exactActionSizes'));
});

test('policy keys reject impossible physical values and incomplete postflop histories', () => {
  const exact = JSON.parse(
    fs.readFileSync('contracts/solver-policy/fixtures/exact-policy.v1.json', 'utf8')
  );
  const mutations = [
    (candidate) => {
      candidate.key.stackVector[0].committedChips = -1;
    },
    (candidate) => {
      candidate.key.blinds.ante = -1;
    },
    (candidate) => {
      candidate.key.rake.capBb = -1;
    },
    (candidate) => {
      candidate.key.publicActionHistory.actions[1].sequence = 0;
    },
    (candidate) => {
      candidate.key.legalActions[0].exactChips = -1;
    },
    (candidate) => {
      candidate.key.legalActions[0].minChips = 600;
      candidate.key.legalActions[0].maxChips = 500;
    },
    (candidate) => {
      candidate.node.potBb = -1;
    },
    (candidate) => {
      candidate.key.publicActionHistory.actions = [];
    },
    (candidate) => {
      candidate.key.stackVector[0].position = 'CO';
    },
    (candidate) => {
      candidate.key.positions.hero = 'CO';
    },
    (candidate) => {
      candidate.key.positions.villains = ['SB'];
    },
    (candidate) => {
      candidate.key.blinds.straddles = [{ seat: 2, amount: 200 }];
    },
    (candidate) => {
      candidate.key.sidePotEligibility.pots[0].eligibleSeats = [0, 2];
    },
    (candidate) => {
      candidate.key.sidePotEligibility.pots[0].eligibleSeats = [0, 0];
    },
    (candidate) => {
      candidate.key.sidePotEligibility.pots.push(
        structuredClone(candidate.key.sidePotEligibility.pots[0])
      );
    },
    (candidate) => {
      candidate.key.publicActionHistory.actions[0].amountBb = 9;
    },
    (candidate) => {
      candidate.key.stackVector[0].stackChips = 9_900;
    },
    (candidate) => {
      candidate.key.rake.capChips = 300;
    },
    (candidate) => {
      candidate.key.publicActionHistory.actions[0].street = 'turn';
    },
    (candidate) => {
      candidate.key.publicActionHistory.actions[2].street = 'flop';
    },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(exact);
    mutate(candidate);
    assert.equal(validateSolverPolicyAnswer(candidate).valid, false);
  }
});

test('exact policies reject contradictory node and valid-domain claims', () => {
  const exact = JSON.parse(
    fs.readFileSync('contracts/solver-policy/fixtures/exact-policy.v1.json', 'utf8')
  );
  for (const [error, mutate] of [
    [
      'exactNode',
      (candidate) => {
        candidate.node.actor = 'BTN';
      },
    ],
    [
      'exactNode',
      (candidate) => {
        candidate.node.semantics = 'unknown';
      },
    ],
    [
      'exactNode',
      (candidate) => {
        candidate.node.facingBetBb = null;
      },
    ],
    [
      'exactDomain',
      (candidate) => {
        candidate.validDomain.exactMatchDimensions = [];
      },
    ],
    [
      'exactDomain',
      (candidate) => {
        candidate.validDomain.exactMatchDimensions = ['board'];
      },
    ],
    [
      'exactDomain',
      (candidate) => {
        candidate.validDomain.exclusions = ['unsupported'];
      },
    ],
  ]) {
    const candidate = structuredClone(exact);
    mutate(candidate);
    assert.ok(validateSolverPolicyAnswer(candidate).errors.includes(error));
  }
});

test('chart policies reject corrupt identity, actions, cells, and frequencies instead of folding silently', () => {
  const service = new SolverPolicyService();
  assert.throws(
    () =>
      service.answerFromChart(
        {
          ...CHART_FIXTURE_ROW,
          hand_matrix: { AA: { push: 1, fold: 0, call: 0 } },
        },
        {},
        { mode: 'aggregate' }
      ),
    /invalid_chart_policy_actions/
  );
  assert.throws(
    () =>
      service.answerFromChart(
        {
          ...CHART_FIXTURE_ROW,
          hand_matrix: [],
        },
        {},
        { mode: 'aggregate' }
      ),
    /invalid_chart_policy_row/
  );
  assert.throws(
    () =>
      service.answerFromChart(
        {
          ...CHART_FIXTURE_ROW,
          hand_matrix: { AA: { push: 1.1, fold: -0.1 } },
        },
        {},
        { mode: 'aggregate' }
      ),
    /invalid_chart_policy_frequency/
  );
  assert.throws(
    () =>
      service.answerFromChart(
        {
          ...CHART_FIXTURE_ROW,
          hand_matrix: { AA: { push: 0.7, fold: 0.4 } },
        },
        {},
        { mode: 'aggregate' }
      ),
    /invalid_chart_policy_mix/
  );
  assert.throws(
    () =>
      service.answerFromChart(
        {
          ...CHART_FIXTURE_ROW,
          villain_action: 'fold_to_hero',
          hero_position: 'BB',
        },
        {},
        { mode: 'aggregate' }
      ),
    /invalid_chart_policy_identity/
  );
  assert.throws(
    () =>
      service.answerFromChart({ ...CHART_FIXTURE_ROW, chart_id: 42 }, {}, { mode: 'aggregate' }),
    /invalid_chart_policy_row/
  );
  assert.throws(
    () =>
      service.answerFromChart(
        { ...CHART_FIXTURE_ROW, created_at: 'not-an-instant' },
        {},
        { mode: 'aggregate' }
      ),
    /invalid_chart_policy_row/
  );
});

test('chart, curated, heuristic, aggregated, and unavailable answers are explicit', () => {
  const service = new SolverPolicyService();
  const chart = {
    chart_id: 'chart-1',
    game_type: 'Tournament',
    stack_depth: 10,
    hero_position: 'BTN',
    villain_action: 'fold_to_hero',
    created_at: '2026-09-06T00:00:00.000Z',
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
  const expected = JSON.parse(
    fs.readFileSync('contracts/solver-policy/fixtures/chart-policy.v1.json', 'utf8')
  );
  const actual = new SolverPolicyService().answerFromChart(
    CHART_FIXTURE_ROW,
    {},
    { mode: 'aggregate' }
  );
  assert.equal(stablePolicyJson(actual), stablePolicyJson(expected));
  assert.deepEqual(actual.rangeDistribution['J4o'], { all_in: 0, fold: 1 });
  assert.deepEqual(actual.rangeDistribution.QJs, { all_in: 0.8, fold: 0.2 });
});

test('World Hub publishes the exact versioned artifact envelope consumed by Club Arena', () => {
  const policy = new SolverPolicyService().answerFromChart(
    CHART_FIXTURE_ROW,
    {},
    { mode: 'aggregate' }
  );
  const actual = createSolverPolicyArtifactBundle([policy], {
    generatedAt: '2026-09-06T12:00:00.000Z',
    sourceArtifact: 'world-hub-chart-fixture',
  });
  const expected = JSON.parse(
    fs.readFileSync('contracts/solver-policy/fixtures/chart-policy-artifact.v1.json', 'utf8')
  );
  assert.equal(stablePolicyJson(actual), stablePolicyJson(expected));
  assert.deepEqual(validateSolverPolicyArtifactBundle(actual), {
    valid: true,
    errors: [],
    bundle: actual,
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
  assert.throws(
    () =>
      createSolverPolicyArtifactBundle([policy, policy], {
        sourceArtifact: 'duplicate-test',
      }),
    /duplicate_scenario_hash/
  );
});

test('omitted numeric filters never become a stack-depth-zero warehouse predicate', async () => {
  const calls = [];
  const result = { data: [], error: null, count: 0 };
  const query = {
    select() {
      calls.push(['select']);
      return this;
    },
    eq(...args) {
      calls.push(['eq', ...args]);
      return this;
    },
    in(...args) {
      calls.push(['in', ...args]);
      return this;
    },
    ilike(...args) {
      calls.push(['ilike', ...args]);
      return this;
    },
    gte(...args) {
      calls.push(['gte', ...args]);
      return this;
    },
    lte(...args) {
      calls.push(['lte', ...args]);
      return this;
    },
    order(...args) {
      calls.push(['order', ...args]);
      return this;
    },
    limit(...args) {
      calls.push(['limit', ...args]);
      return this;
    },
    then(resolve) {
      resolve(result);
    },
  };
  const db = {
    from(table) {
      calls.push(['from', table]);
      return query;
    },
  };
  await new SolverPolicyService({ db }).readSolvedRows({ gameTypes: ['hu_cash'] });
  assert.equal(
    calls.some((call) => call[0] === 'eq' && call[1] === 'stack_depth'),
    false
  );
});

test('policy resolution uses the hero stack and requires a proved in-scope chart node', async () => {
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
      variant: 'nlh',
      bettingStructure: 'no_limit',
      street: 'preflop',
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
      variant: 'nlh',
      bettingStructure: 'no_limit',
      street: 'preflop',
      tournamentUtility: { mode: 'unknown', complete: false },
      positions: { hero: 'BTN', villains: [] },
      stackVector: [],
    },
    gameTypes: ['mtt'],
  });
  assert.equal(chartFilters, undefined, 'an incomplete state must not trigger a chart lookup');

  await service.resolve({
    key: {
      variant: 'nlh',
      bettingStructure: 'no_limit',
      street: 'preflop',
      tournamentUtility: { mode: 'cash', complete: true },
      positions: { hero: 'BTN', villains: ['SB', 'BB'] },
      stackVector: [{ seat: 0, position: 'BTN', stackBb: 10 }],
      publicActionHistory: {
        complete: true,
        actions: [
          { sequence: 0, street: 'preflop', actor: 'SB', action: 'small_blind', amountChips: 1 },
          { sequence: 1, street: 'preflop', actor: 'BB', action: 'big_blind', amountChips: 2 },
        ],
      },
      legalActions: ['fold', { action: 'all_in', allIn: true }],
    },
    gameTypes: ['hu_cash'],
  });
  assert.equal(chartFilters.gameType, 'Cash');
  assert.equal(chartFilters.villainAction, 'fold_to_hero');
  assert.equal(chartFilters.minStackDepth, 5);
  assert.equal(chartFilters.maxStackDepth, 15);
});

test('BB-vs-SB chart proof rejects wrong-actor and multiway jams and uses effective depth', async () => {
  const chartCalls = [];
  const service = new SolverPolicyService({
    solvedRowReader: async () => [],
    chartRowReader: async (filters) => {
      chartCalls.push(filters);
      return [];
    },
  });
  const key = {
    variant: 'nlh',
    bettingStructure: 'no_limit',
    street: 'preflop',
    blinds: { bigBlind: 100, complete: true },
    tournamentUtility: { mode: 'cash', complete: true },
    positions: { hero: 'BB', villains: ['SB'] },
    stackVector: [
      { seat: 0, position: 'BB', stackBb: 100 },
      { seat: 1, position: 'SB', stackBb: 0, allIn: true },
    ],
    publicActionHistory: {
      complete: true,
      actions: [
        {
          sequence: 0,
          street: 'preflop',
          actor: 'SB',
          action: 'small_blind',
          amountChips: 50,
          amountBb: 0.5,
        },
        {
          sequence: 1,
          street: 'preflop',
          actor: 'BB',
          action: 'big_blind',
          amountChips: 100,
          amountBb: 1,
        },
        {
          sequence: 2,
          street: 'preflop',
          actor: 'SB',
          action: 'raise',
          amountChips: 800,
          amountBb: 8,
          allIn: true,
        },
      ],
    },
    legalActions: ['fold', 'call'],
  };

  await service.resolve({ key, gameTypes: ['hu_cash'] });
  assert.equal(chartCalls.length, 1);
  assert.equal(chartCalls[0].villainAction, 'sb_push');
  assert.equal(chartCalls[0].minStackDepth, 3);
  assert.equal(chartCalls[0].maxStackDepth, 13);

  await service.resolve({
    key: {
      ...key,
      publicActionHistory: {
        ...key.publicActionHistory,
        actions: key.publicActionHistory.actions.map((action, index) =>
          index === 2 ? { ...action, actor: 'BTN' } : action
        ),
      },
    },
    gameTypes: ['hu_cash'],
  });
  assert.equal(chartCalls.length, 1, 'a BTN jam must not be relabeled as an SB open-jam');

  await service.resolve({
    key: { ...key, positions: { hero: 'BB', villains: ['SB', 'BTN'] } },
    gameTypes: ['hu_cash'],
  });
  assert.equal(chartCalls.length, 1, 'the heads-up SB chart must not answer a multiway call-off');
});

test('every declared consumer receives byte-identical canonical semantics', () => {
  const service = new SolverPolicyService();
  const answer = service.answerFromRecord(normalizeSolvedPolicyRecord(v2Row()), completeKey(), {
    match: 'exact',
    sourceKeyVerified: true,
    exactMatchDimensions: ['all'],
  });
  const baseline = service.consumerEnvelope(answer, SOLVER_POLICY_CONSUMERS[0]);
  for (const consumer of SOLVER_POLICY_CONSUMERS) {
    assert.deepEqual(service.consumerEnvelope(answer, consumer), baseline, consumer);
  }
});

test('runtime surface registry matches the real service, strict-reader, delegated, and retired graph', () => {
  const expected = [
    ['deterministic-get-question', 'service_consumer', 'src/engines/DeterministicGTOEngine.js', 'get-question'],
    ['admin-inspection', 'service_consumer', 'pages/api/admin/inspect-pio-data.js', 'admin-inspection'],
    ['horse-poker-gto', 'service_consumer', 'src/content-engine/services/HorsePokerGTO.js', 'horse-poker-gto'],
    ['god-mode-library', 'service_consumer', 'lib/god-mode-service.ts', 'god-mode'],
    ['get-question-route', 'delegated_service', 'pages/api/training/get-question.js', null],
    ['batch-preload', 'delegated_service', 'pages/api/training/batch-preload.js', null],
    ['next-street', 'delegated_service', 'pages/api/training/next-street.js', null],
    ['get-question-exact-reader', 'strict_direct_reader', 'src/engines/deterministicEnginePatches.js', null],
    ['spot-drill', 'strict_direct_reader', 'pages/api/training/spot-drill.js', null],
    ['custom-trainer', 'strict_direct_reader', 'pages/api/training/custom-train.js', null],
    ['solver-api', 'strict_direct_reader', 'pages/api/training/solver-api.js', null],
    ['browse-solutions', 'strict_direct_reader', 'pages/api/training/browse-solutions.js', null],
    ['preflop-ranges', 'authored_reference', 'pages/api/training/preflop-ranges.js', null],
    ['tree-navigation', 'retired_endpoint', 'pages/api/training/tree-navigate.js', null],
    ['runout-report', 'retired_endpoint', 'pages/api/training/runout-report.js', null],
    ['aggregate-report', 'retired_endpoint', 'pages/api/training/aggregate-report.js', null],
    ['post-session-analysis', 'retired_endpoint', 'pages/api/assistant/sandbox/analyze.js', null],
    ['god-mode-submit-action', 'retired_endpoint', 'pages/api/god-mode/submit-action.js', null],
    ['gto-analysis', 'retired_endpoint', 'pages/api/gto/gto-analysis.js', null],
  ];
  assert.deepEqual(
    SOLVER_POLICY_SURFACES.map(({ id, integration, file, consumer }) => [
      id,
      integration,
      file,
      consumer ?? null,
    ]),
    expected,
  );
  assert.deepEqual(Object.values(SOLVER_POLICY_INTEGRATION).sort(), [
    'authored_reference',
    'delegated_service',
    'retired_endpoint',
    'service_consumer',
    'strict_direct_reader',
  ]);
  assert.deepEqual(
    SOLVER_POLICY_SURFACES
      .filter(({ integration }) => integration === SOLVER_POLICY_INTEGRATION.DELEGATED_SERVICE)
      .map(({ id }) => id)
      .sort(),
    ['batch-preload', 'get-question-route', 'next-street'],
    'every API route that delegates canonical policy authority is registered',
  );
});

test('only proved direct consumers can request a canonical service envelope', () => {
  const direct = SOLVER_POLICY_SURFACES.filter(
    ({ integration }) => integration === SOLVER_POLICY_INTEGRATION.SERVICE_CONSUMER,
  );
  assert.deepEqual(
    [...SOLVER_POLICY_CONSUMERS].sort(),
    direct.map(({ consumer }) => consumer).sort(),
  );

  for (const { consumer, file } of direct) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(
      source,
      /import\s*\{[^}]*\bSolverPolicyService\b[^}]*\}\s*from/s,
      consumer + ': ' + file + ' imports the service implementation',
    );
    assert.match(
      source,
      new RegExp("\\.consumerEnvelope\\([\\s\\S]{0,800}['\"]" + consumer + "['\"]"),
      consumer + ': ' + file + ' emits its declared canonical envelope',
    );
  }

  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = directory + '/' + entry.name;
    if (entry.isDirectory()) return walk(file);
    return /\.(?:js|mjs|cjs|ts|tsx|jsx)$/.test(entry.name) ? [file] : [];
  });
  const discovered = ['pages', 'src', 'lib'].flatMap(walk).filter((file) => {
    if (file === 'src/services/SolverPolicyService.js') return false;
    return /import\s*\{[^}]*\bSolverPolicyService\b[^}]*\}\s*from/s.test(
      fs.readFileSync(file, 'utf8'),
    );
  });
  assert.deepEqual(discovered.sort(), direct.map(({ file }) => file).sort());

  const pageServiceLocators = walk('pages').filter((file) => (
    /\.solverPolicyService\b/.test(fs.readFileSync(file, 'utf8'))
  ));
  assert.deepEqual(
    pageServiceLocators,
    [],
    'page routes must delegate through registered engine methods, not reach through the engine service locator',
  );
  assert.match(
    fs.readFileSync('src/engines/deterministicEnginePatches.js', 'utf8'),
    /\.solverPolicyService\b/,
    'the service-locator guard is intentionally scoped to pages and permits engine internals',
  );
  assert.throws(
    () => new SolverPolicyService().consumerEnvelope({ kind: 'unavailable' }, 'solver-agreement'),
    /Unknown solver policy consumer/,
    'a phantom consumer cannot be treated as a live service integration',
  );
});

test('strict direct readers prove v2 identity and provenance; retired surfaces fail closed', () => {
  const strictProofs = new Map([
    ['get-question-exact-reader', [/isSolverRowIdentityValid/, /provenanceIsComplete/]],
    ['spot-drill', [/customSolverProvenanceIsComplete/, /parseSolverScenarioHash/]],
    ['custom-trainer', [/applyDeterministicEnginePatches/, /solverProvenance\?\.verified\s*===\s*true/]],
    ['solver-api', [/customSolverRowMatchesRequest/, /status:\s*'ambiguous'/]],
    ['browse-solutions', [/customSolverProvenanceIsComplete/, /parseSolverScenarioHash/]],
  ]);
  const strict = SOLVER_POLICY_SURFACES.filter(
    ({ integration }) => integration === SOLVER_POLICY_INTEGRATION.STRICT_DIRECT_READER,
  );
  assert.deepEqual(strict.map(({ id }) => id).sort(), [...strictProofs.keys()].sort());
  for (const { id, file } of strict) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /\.from\(['"]solved_spots_gold['"]\)/, id + ': direct read is explicit');
    assert.match(source, /strategy_matrix_v2/, id + ': reads v2 only');
    for (const proof of strictProofs.get(id)) assert.match(source, proof, id + ': ' + proof);
  }

  const delegated = SOLVER_POLICY_SURFACES.filter(
    ({ integration }) => integration === SOLVER_POLICY_INTEGRATION.DELEGATED_SERVICE,
  );
  for (const { id, file } of delegated) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /deterministicEngine/i, id + ': delegates to the canonical engine');
    assert.doesNotMatch(source, /\.from\(['"]solved_spots_gold['"]\)/, id + ': no hidden direct read');
  }

  const retired = SOLVER_POLICY_SURFACES.filter(
    ({ integration }) => integration === SOLVER_POLICY_INTEGRATION.RETIRED_ENDPOINT,
  );
  for (const { id, file } of retired) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /res\.status\(410\)/, id + ': responds Gone');
    assert.doesNotMatch(source, /\.from\(['"](?:solved_spots_gold|memory_charts_gold)['"]\)/);
    assert.doesNotMatch(source, /\bSolverPolicyService\b/);
  }

  const authored = SOLVER_POLICY_SURFACES.find(({ id }) => id === 'preflop-ranges');
  const authoredSource = fs.readFileSync(authored.file, 'utf8');
  assert.match(authoredSource, /solverExact:\s*false/);
  assert.match(authoredSource, /authored_reference/);
  assert.doesNotMatch(authoredSource, /\.from\(['"](?:solved_spots_gold|memory_charts_gold)['"]\)/);
});
