/**
 * Phase 6F: real-geometry regression for the production attestation
 * continuation cohort (cash-002 Level 8, `public-three-quarter-pot-aggression-v1`).
 *
 * NO LOGIC MOCKS. Every module under test is the real one: the 17k-line
 * DeterministicGTOEngine, its runtime patches, SolverPolicyService, the v2
 * bridge, the question and difficulty contracts, the continuation eligibility
 * resolver, cache-truth persistence, attempt delivery, the grading receipt and
 * the `batch-preload` route itself.
 *
 * The only substitutions are infrastructure boundaries that cannot exist in a
 * unit process, and each one sits OUTSIDE the logic under test:
 *   - the Supabase client (an in-memory fake implementing exactly the
 *     PostgREST/RPC calls the real code issues; the solver-catalog RPC applies
 *     the same filters, ordering and page limit as
 *     `training_solver_spot_candidates_v1`),
 *   - request authentication, the rate limiter and the error reporter.
 *
 * Earlier suites hid the defects pinned here because they replaced
 * `enforceSolverClaimHonesty`, `isTrainingQuestionValid` and the policy reader
 * with permissive stubs and used a fixture that paired `potFraction: 0.75`
 * with a 412-chip bet. The canonical tree never produces that pair: b412 into
 * a 550-chip pot is 74.909%.
 *
 * Pristine-baseline record (2026-09-22, before this change): 10 of 11 tests
 * failed. The real engine downgraded every provenance-complete row to
 * `verified: false`, the public rule returned null for `bet_74_91pct`, the
 * shared sizing module did not exist, and the four-action geometry could not
 * admit a single parent.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ROOT,
  createInMemorySupabase as createHarnessSupabase,
  invokeBatchPreload,
  load,
} from '../tests/helpers/trainingBatchPreloadHarness.mjs';

const { deterministicEngine, selectExactContinuationBetSourceAction } =
  await load('src/engines/DeterministicGTOEngine.js');
const { applyDeterministicEnginePatches } = await load('src/engines/deterministicEnginePatches.js');
applyDeterministicEnginePatches(deterministicEngine);
const { pioQueryService } = await load('src/services/PIOQueryService.js');
const v2Matrix = await load('src/utils/v2Matrix.js');
const questionContract = await load('src/lib/training/questionContract.mjs');
const difficultyContract = await load('src/lib/training/difficultyQuestionContract.mjs');
const continuation = await load('src/lib/training/trainingContinuationEligibility.mjs');
const attestationContract = await load('src/lib/training/trainingAttestationContinuationContract.mjs');
const cacheTruth = await load('src/lib/training/cacheTruthContract.mjs');
const customSpot = await load('src/lib/training/customSolverSpotContract.mjs');
const gradingReceipt = await load('src/lib/training/gradingReceipt.mjs');
const policyContract = await load('src/lib/training/solverPolicyContract.js');
// Optional so a pristine checkout reports the individual failing assertions
// instead of dying on a missing module.
const sizingContract = await load('src/lib/training/continuationSizingContract.mjs').catch(() => ({}));
const cohortDiagnostics = await load('src/lib/training/trainingAttestationCohortDiagnostics.mjs')
  .catch(() => ({}));
const enginePatches = await load('src/engines/deterministicEnginePatches.js');

const GAME_ID = 'cash-002';
const LEVEL = 8;
const AUDIT_USER_ID = '7b0f5d0e-4c1a-4a5e-9f3b-2d6c8e1a9b47';
const GAME_CONFIG = pioQueryService.getGameConfig(GAME_ID);

// ── Canonical tree geometry ────────────────────────────────────────────────
// scripts/preflop-deep/tree_gen.py: pot 550 chips, effective stack 9750 chips.
// Flop sizes are int(round(pot * 0.33)) = 182 and int(round(pot * 0.75)) = 412.
// After b412 is called the turn pot is 550 + 2 * 412 = 1374 and the 75% bet is
// 1030 chips, exported as the CUMULATIVE target b1442 (= 412 + 1030).
const ROOT_POT_CHIPS = 550;
const ROOT_POT_BB = 5.5;
const EFFECTIVE_STACK_BB = 97.5;
const TURN_POT_CHIPS = 1374;
const PRODUCTION_GEOMETRY = Object.freeze({
  name: 'production srp_parameterized_v2',
  flop: ['c', 'b182', 'b412'],
  turn: ['c', 'b1442'],
});
// The smallest tree that satisfies the Training four-answer contract at both
// decision nodes: it adds a 125%-pot overbet on the flop (688 chips) and a
// 33% (453 -> b865) and 125% (1718 -> b2130) bet on the turn. It is used here
// only to prove that the CODE pipeline is green once the tree is rich enough.
const FOUR_ACTION_GEOMETRY = Object.freeze({
  name: 'four-action recommendation',
  flop: ['c', 'b182', 'b412', 'b688'],
  turn: ['c', 'b865', 'b1442', 'b2130'],
});
const FREQUENCY_PATTERNS = Object.freeze({
  2: [[0.6, 0.4], [0.3, 0.7], [0.45, 0.55]],
  3: [[0.6, 0.25, 0.15], [0.2, 0.5, 0.3], [0.1, 0.2, 0.7]],
  4: [[0.4, 0.3, 0.2, 0.1], [0.1, 0.2, 0.6, 0.1], [0.15, 0.15, 0.2, 0.5]],
});
const FLOP_BOARDS = Object.freeze([
  ['Ks', '7d', '2c'], ['Ah', 'Td', '4s'], ['Qc', '8h', '3d'], ['Jd', '6s', '2h'],
  ['Ts', '5c', '3h'], ['9d', '8c', '2s'], ['Kh', 'Qd', '5s'], ['Ac', '7h', '6d'],
  ['Jh', 'Tc', '4d'], ['Qs', '6h', '5d'], ['Kd', '9c', '4h'], ['As', '9h', '3c'],
  ['8s', '7c', '3s'], ['Jc', '5h', '2d'], ['Th', '6c', '4c'], ['Qh', 'Js', '7s'],
  ['Kc', '8d', '6h'], ['Ad', '5s', '2s'], ['9s', '6d', '3h'], ['Td', '7s', '5h'],
  ['Qd', '9h', '2h'], ['Jd', '8s', '4s'],
]);
const CHILD_TURN_CARDS = Object.freeze(['9h', '4d', 'Jc']);

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const cardIndex = (card) => RANKS.indexOf(card[0]) * 4 + SUITS.indexOf(card[1]);

function deterministicUuid(label) {
  const hex = createHash('sha256').update(label).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** One fully provenanced solved_spots_gold v2 row, exactly as the RPC returns it. */
function solverRow({
  board, street, node, actions, hero = 'IP', label = '', overrides = {},
}) {
  const dead = new Set(board.map(cardIndex));
  const patterns = FREQUENCY_PATTERNS[actions.length];
  const frequencies = Object.fromEntries(actions.map((code) => [code, new Array(1326).fill(0)]));
  const handEvs = new Array(1326).fill(0);
  for (let high = 1; high < 52; high += 1) {
    for (let low = 0; low < high; low += 1) {
      const index = (high * (high - 1)) / 2 + low;
      handEvs[index] = 2 + (index % 97) / 100;
      // Board-dead combos carry zero strategy mass, as the harvest exports them.
      if (dead.has(low) || dead.has(high)) continue;
      const pattern = patterns[index % patterns.length];
      actions.forEach((code, position) => { frequencies[code][index] = pattern[position]; });
    }
  }
  const position = hero === 'IP' ? 'BTN' : 'BB';
  const scenarioHash = `${street === 'flop' ? '' : `${street}_`}hu_cash_${position}_100bb_${board.join('')}`;
  return {
    id: deterministicUuid(`${label}|${scenarioHash}|${node}`),
    scenario_hash: scenarioHash,
    game_type: 'hu_cash',
    stack_depth: 100,
    street,
    solver_version: 'PioSOLVER 3.0.1',
    solver_binary_checksum: 'a1'.repeat(32),
    machine_id: 'M1',
    pipeline_commit: 'b2'.repeat(20),
    manifest_version: '4',
    manifest_checksum: 'c3'.repeat(32),
    source_artifact_checksum: createHash('sha256').update(`${scenarioHash}|${node}`).digest('hex'),
    quality_status: 'validated',
    audited_at: '2026-09-20T00:00:00.000Z',
    ...overrides,
    strategy_matrix_v2: {
      solver: 'PioSOLVER',
      combo_order: v2Matrix.V2_COMBO_ORDER,
      range_combo_order: v2Matrix.V2_COMBO_ORDER,
      source_combo_order_schema: v2Matrix.V2_SOURCE_COMBO_ORDER_SCHEMA,
      // The two authority seal keys joined by training_solver_spot_candidates_v1.
      source_combo_order_sha256: 'd4'.repeat(32),
      training_game_contracts_sha256: 'e5'.repeat(32),
      oop_range_checksum: 'f6'.repeat(32),
      ip_range_checksum: '07'.repeat(32),
      rake: '0 0',
      tree_geometry: 'srp_parameterized_v2',
      pot_bb: ROOT_POT_BB,
      eff_stack_bb: EFFECTIVE_STACK_BB,
      exploitability_pct: 0.4,
      board: [...board],
      street,
      position,
      oop_player: 'BB',
      ip_player: 'BTN',
      hero,
      node,
      convergence: {
        schema: 'piosolver.calc-results.v1',
        source_command: 'calc_results',
        accuracy_fraction: 0.005,
        starting_pot_chips: ROOT_POT_CHIPS,
        achieved_exploitability_chips: 2.2,
        achieved_exploitability_fraction: 0.004,
      },
      actions: actions.map((code) => (code === 'c'
        ? { code }
        : {
          code,
          size_chips: Number(code.slice(1)),
          size_semantics: v2Matrix.V2_ACTION_SIZE_SEMANTICS,
        })),
      frequencies,
      hand_evs_bb: handEvs,
    },
  };
}

function parentRow(geometry, board = FLOP_BOARDS[0]) {
  return solverRow({
    board, street: 'flop', node: 'r:0:c', actions: geometry.flop, label: geometry.name,
  });
}

/**
 * The out-of-position half of the same catalog: the Big Blind acting first at
 * r:0 with the same flop sizes. Legal, provenance-complete, and never a
 * continuation parent, because the certified contract requires hero in
 * position. `idPrefix` pins the UUID order so these rows page BEFORE the IP
 * parent in the catalog scan.
 */
function oopParentRow(geometry, board, idPrefix) {
  return solverRow({
    board,
    street: 'flop',
    node: 'r:0',
    actions: geometry.flop,
    hero: 'OOP',
    label: `${geometry.name} oop`,
    overrides: idPrefix ? { id: `${idPrefix}-${deterministicUuid(`oop|${board.join('')}`).slice(9)}` } : {},
  });
}

function childRow(geometry, board, turnCard) {
  return solverRow({
    board: [...board, turnCard],
    street: 'turn',
    node: `r:0:c:b412:c:${turnCard}:c`,
    actions: geometry.turn,
    label: geometry.name,
  });
}

function catalogFor(geometry, { parents = 1, childBoards = 1 } = {}) {
  const rows = [];
  FLOP_BOARDS.slice(0, parents).forEach((board, index) => {
    rows.push(parentRow(geometry, board));
    if (index < childBoards) {
      for (const turnCard of CHILD_TURN_CARDS) rows.push(childRow(geometry, board, turnCard));
    }
  });
  return rows;
}

// ── In-memory Supabase client boundary (shared harness) ────────────────────
const createInMemorySupabase = (options) => createHarnessSupabase(options);

function buildPrecommit(sessionId) {
  return attestationContract.buildTrainingAttestationContinuationPrecommit({
    selectionRule: attestationContract.TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE,
    sessionId,
    gameId: GAME_ID,
    level: LEVEL,
    targetHands: 20,
  });
}

/** Issue the exact request the production attestation harness sends. */
async function requestAttestationCohort({
  catalogRows, difficulty = 'standard', failCatalogRpc = false, mutateQuery = null,
}) {
  const db = createInMemorySupabase({ catalogRows, failCatalogRpc });
  const sessionId = `phase6f-${randomUUID()}`;
  const precommit = buildPrecommit(sessionId);
  const query = {
    gameId: GAME_ID,
    level: String(LEVEL),
    count: '20',
    difficulty,
    gameMode: 'street',
    targetStreet: 'flop',
    sessionId,
    attestationContinuationRule: precommit.selectionRule,
    attestationContinuationPrecommit: precommit.commitment,
  };
  if (mutateQuery) mutateQuery(query);
  const { response, serverLog, diagnostics } = await invokeBatchPreload({
    db,
    query,
    authUserId: AUDIT_USER_ID,
    env: { TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID: AUDIT_USER_ID },
    diagnosticsPrefix: cohortDiagnostics.TRAINING_ATTESTATION_COHORT_LOG_PREFIX,
  });
  return { response, db, precommit, serverLog, diagnostics };
}

// ── Shared helpers ─────────────────────────────────────────────────────────
async function quietly(operation) {
  const originals = [console.warn, console.debug, console.log];
  console.warn = () => {};
  console.debug = () => {};
  console.log = () => {};
  try {
    return await operation();
  } finally {
    [console.warn, console.debug, console.log] = originals;
  }
}

/** Build the canonical parent the engine really produces for one catalog row. */
function buildParent(row, questionIndex = 1) {
  return deterministicEngine.buildQuestionFromScenario(
    structuredClone(row), GAME_CONFIG, LEVEL, questionIndex,
  );
}

function publicPayload(question, difficultyMode) {
  return gradingReceipt.toPublicTrainingQuestion(
    difficultyContract.applyDifficultyToQuestion(structuredClone(question), difficultyMode),
  );
}

const PRIVATE_KEY_RE = /^(?:correct|gtofrequenc|frequenc|rawfrequenc|solverpolicy|nextstreetcontinuation|explanation|evdata|_difficulty|_original|contractdistractor|distribution)/;
function privateKeysIn(value, trail = '$') {
  if (Array.isArray(value)) return value.flatMap((item, index) => privateKeysIn(item, `${trail}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(PRIVATE_KEY_RE.test(key.toLowerCase().replace(/[^a-z0-9_]/g, '')) ? [`${trail}.${key}`] : []),
    ...privateKeysIn(child, `${trail}.${key}`),
  ]);
}

function canonicalBetId(chips, potChips) {
  const percent = Math.round((chips / potChips) * 10000) / 100;
  return `bet_${String(percent).replace('.', '_')}pct`;
}

// ── Fixture truth ──────────────────────────────────────────────────────────
test('the fixture is the real production geometry and a legal provenance-complete v2 pair', () => {
  const parent = parentRow(PRODUCTION_GEOMETRY);
  const child = childRow(PRODUCTION_GEOMETRY, FLOP_BOARDS[0], '9h');
  assert.deepEqual(
    parent.strategy_matrix_v2.actions.map(({ code }) => code),
    ['c', 'b182', 'b412'],
  );
  assert.deepEqual(child.strategy_matrix_v2.actions.map(({ code }) => code), ['c', 'b1442']);
  assert.equal(child.strategy_matrix_v2.node, 'r:0:c:b412:c:9h:c');
  for (const row of [parent, child, oopParentRow(PRODUCTION_GEOMETRY, FLOP_BOARDS[0], '00000000')]) {
    assert.equal(customSpot.customSolverProvenanceIsComplete(row), true, row.scenario_hash);
    assert.ok(v2Matrix.v2ToAppMatrix(row.strategy_matrix_v2), `${row.scenario_hash} must bridge`);
  }
  const turn = v2Matrix.v2ToAppMatrix(child.strategy_matrix_v2);
  assert.equal(turn.pot, TURN_POT_CHIPS);
  assert.equal(turn.actor_contribution_chips, 412);
  // The numbers every other assertion depends on: neither bet is exactly 75%.
  assert.equal((412 / ROOT_POT_CHIPS).toFixed(4), '0.7491');
  assert.equal(((1442 - 412) / TURN_POT_CHIPS).toFixed(4), '0.7496');
});

// ── (e) provenance survives the real engine ────────────────────────────────
test('a provenance-complete catalog row stays provenance-verified through the real engine', () => {
  const question = buildParent(parentRow(PRODUCTION_GEOMETRY));
  assert.ok(question, 'the real engine must build a question from the real geometry');
  // Before this change `stampSolverProvenance` ran `enforceSolverClaimHonesty`
  // ahead of the canonical policy, and since 2026-09-07 that predicate is a
  // projection of the policy envelope, so every sealed row was downgraded.
  assert.equal(question.solverProvenance?.verified, true,
    'a provenance-complete row must not be downgraded before its canonical policy is attached');
  assert.equal(question.solverProvenance.source, 'PioSOLVER');
  assert.notEqual(question.source, 'LEGACY_STRATEGY_ARCHIVE');
  assert.equal(cacheTruth.sourceClassificationForQuestion(question), 'SOLVER_DERIVED_RESPONSE');
  assert.equal(question.dataQuality, 'SOLVER_DERIVED_RESPONSE');
  assert.equal(question.solverPolicy.sourceArtifact.provenanceComplete, true);
  assert.equal(question.solverPolicy.fallbackReason, 'decision_key_incomplete');
  assert.doesNotMatch(String(question.explanation), /legacy strategy data/i);
  assert.ok(question.scenario.solverLineage, 'the tree lineage must be retained for the child lookup');
});

test('an incomplete-provenance row is never relaxed into a continuation parent', () => {
  const unsealed = parentRow(PRODUCTION_GEOMETRY);
  unsealed.machine_id = null;
  const question = buildParent(unsealed);
  assert.ok(question);
  assert.equal(question.solverProvenance.verified, false);
  assert.equal(question.solverPolicy.sourceArtifact.provenanceComplete, false);
  assert.equal(question.solverPolicy.fallbackReason, 'source_provenance_incomplete');
  assert.equal(question.scenario.solverLineage, null);
  assert.equal(
    continuation.validatePersistedContinuationDecision(question, 'bet_74_91pct').code,
    'TRAINING_CONTINUATION_ACTION_INVALID',
    'provenance must never be relaxed to obtain a continuation parent',
  );
  assert.equal(
    continuation.selectPublicAttestationContinuationAnswerForStrictParent(
      question, buildPrecommit('unsealed'), 'exact',
    ),
    null,
  );
});

// ── (b) one sizing tolerance, canonical and public ─────────────────────────
test('the canonical branch and the sealed policy describe the real 74.9% bet', () => {
  const question = buildParent(parentRow(PRODUCTION_GEOMETRY));
  assert.equal(question.scenario.nextStreetContinuationAction, 'b412');
  const bet = question.solverPolicy.actions.find(({ sourceCode }) => sourceCode === 'b412');
  assert.equal(bet.id, 'bet_74_91pct');
  assert.equal(bet.label, 'Bet 74.9% Pot');
  assert.equal(bet.size.chips, 412);
  assert.equal(bet.size.potFraction, 412 / ROOT_POT_CHIPS);
  assert.deepEqual(
    { ...continuation.validatePersistedContinuationDecision(question, 'bet_74_91pct') },
    { ok: true, action: 'b412', answerId: 'bet_74_91pct' },
  );
});

test('exact mode: the public three-quarter-pot rule selects the real 74.9% answer', () => {
  const question = buildParent(parentRow(PRODUCTION_GEOMETRY));
  const served = publicPayload(question, 'exact');
  assert.deepEqual(privateKeysIn(served), []);
  assert.equal(
    attestationContract.selectPublicAttestationContinuationAnswer(served),
    'bet_74_91pct',
    'the public rule must accept the same +/-0.03 band as the canonical selector',
  );
  assert.equal(
    continuation.selectPublicAttestationContinuationAnswerForStrictParent(
      question, buildPrecommit('exact-mode'), 'exact',
    ),
    'bet_74_91pct',
  );
});

test('grouped mode: the public rule still resolves to the one canonical b412 branch', () => {
  for (const geometry of [PRODUCTION_GEOMETRY, FOUR_ACTION_GEOMETRY]) {
    const question = buildParent(parentRow(geometry));
    const publicAnswer = continuation.selectPublicAttestationContinuationAnswerForStrictParent(
      question, buildPrecommit(`grouped-${geometry.name}`), 'standard',
    );
    assert.ok(publicAnswer, `${geometry.name}: no public continuation answer was selected`);
    const decision = continuation.validatePersistedContinuationDecisionForDifficulty(
      question, publicAnswer, 'standard',
    );
    assert.equal(decision.ok, true, JSON.stringify(decision));
    assert.equal(decision.action, 'b412');
    assert.equal(decision.answerId, 'bet_74_91pct');
    assert.equal(
      attestationContract.selectPublicAttestationContinuationAnswer(publicPayload(question, 'standard')),
      publicAnswer,
      'the harness sees only the public payload and must select the same answer as the server',
    );
  }
  // Three real actions collapse to three bands, so grouped mode falls back to
  // the exact solver actions rather than inventing a fourth band.
  const productionServed = difficultyContract.applyDifficultyToQuestion(
    structuredClone(buildParent(parentRow(PRODUCTION_GEOMETRY))), 'standard',
  );
  assert.equal(productionServed._difficultyFallback, 'exact-solver-actions');
  assert.equal(
    attestationContract.selectPublicAttestationContinuationAnswer(productionServed),
    'bet_74_91pct',
  );
  assert.equal(
    continuation.selectPublicAttestationContinuationAnswerForStrictParent(
      buildParent(parentRow(FOUR_ACTION_GEOMETRY)), buildPrecommit('grouped-band'), 'standard',
    ),
    'grouped_medium',
  );
});

test('canonical and public sizing share one constant and agree on every nearby bet size', () => {
  assert.equal(sizingContract.TRAINING_CONTINUATION_TARGET_POT_FRACTION, 0.75);
  assert.equal(sizingContract.TRAINING_CONTINUATION_POT_FRACTION_TOLERANCE, 0.03);
  const engineSource = fs.readFileSync(path.join(ROOT, 'src/engines/DeterministicGTOEngine.js'), 'utf8');
  const publicSource = fs.readFileSync(
    path.join(ROOT, 'src/lib/training/trainingAttestationContinuationContract.mjs'), 'utf8',
  );
  for (const [name, source] of [['engine', engineSource], ['public rule', publicSource]]) {
    assert.match(source, /continuationSizingContract\.mjs/, `${name} must import the shared module`);
    assert.match(source, /selectUniqueTrainingContinuationCandidate\(/, `${name} must use the shared selector`);
  }
  assert.doesNotMatch(engineSource, /distance <= 0\.03/, 'the canonical side must not keep a private tolerance');
  assert.doesNotMatch(publicSource, /0\.75\) <= Number\.EPSILON/, 'the public side must not require an exact 0.75');

  const matrix = {
    node_state_exact: true, hero: 'IP', node_actor: 1, pot: ROOT_POT_CHIPS,
    actor_contribution_chips: 0, facing_bet_bb: 0, eff_stack_bb: EFFECTIVE_STACK_BB,
  };
  const publicQuestion = (chipsList) => ({
    options: [
      { id: 'check', text: 'Check' },
      ...chipsList.map((chips) => ({
        id: canonicalBetId(chips, ROOT_POT_CHIPS),
        text: `Bet ${Math.round((chips / ROOT_POT_CHIPS) * 1000) / 10}% Pot`,
      })),
    ],
  });
  let accepted = 0;
  for (let chips = 370; chips <= 460; chips += 1) {
    const canonical = selectExactContinuationBetSourceAction(matrix, ['c', `b${chips}`]);
    const publicAnswer = attestationContract.selectPublicAttestationContinuationAnswer(
      publicQuestion([chips]),
    );
    assert.equal(
      Boolean(publicAnswer), Boolean(canonical),
      `b${chips} (${(chips / ROOT_POT_CHIPS).toFixed(4)} pot): canonical=${canonical} public=${publicAnswer}`,
    );
    if (canonical) accepted += 1;
  }
  // 396 (72.0%) through 429 (78.0%) inclusive.
  assert.equal(accepted, 34, `unexpected tolerance width: ${accepted} chip sizes`);

  // Two aggressive actions inside the band are not interchangeable: fail closed.
  assert.equal(selectExactContinuationBetSourceAction(matrix, ['c', 'b405', 'b420']), null);
  assert.equal(
    attestationContract.selectPublicAttestationContinuationAnswer(publicQuestion([405, 420])),
    null,
  );
  // A lone 33% or 125% bet is never the three-quarter-pot answer.
  assert.equal(attestationContract.selectPublicAttestationContinuationAnswer(publicQuestion([182])), null);
  assert.equal(attestationContract.selectPublicAttestationContinuationAnswer(publicQuestion([688])), null);
  // Raw Pio cumulative tokens carry chips, not percents, and are never parsed.
  assert.equal(attestationContract.publicOptionPotFraction({ id: 'b412', text: 'b412' }), null);
  assert.equal(attestationContract.publicOptionPotFraction({ id: 'grouped_medium', text: 'Medium Bet' }), null);
  // Historical fixture ids and labels still resolve.
  assert.equal(attestationContract.publicOptionPotFraction({ id: 'bet_75pct' }), 0.75);
  assert.equal(attestationContract.publicOptionPotFraction({ id: 'b75', text: 'Bet 75% Pot' }), 0.75);
});

// ── (a) the four-answer contract against the canonical tree ────────────────
test('the production 3-action flop node fails the four-answer contract closed, with nothing fabricated', () => {
  const question = buildParent(parentRow(PRODUCTION_GEOMETRY));
  for (const mode of ['exact', 'standard', 'beginner']) {
    const served = difficultyContract.applyDifficultyToQuestion(structuredClone(question), mode);
    assert.deepEqual(
      served.options.filter((option) => option.contractDistractor === true), [],
      `${mode}: a provenance-sealed node must never receive an invented answer choice`,
    );
    assert.deepEqual(served.options.map(({ id }) => id), ['check', 'bet_33_09pct', 'bet_74_91pct'], mode);
    assert.equal(served.questionContract.valid, false, mode);
    assert.deepEqual(served.questionContract.issues, ['Expected 4 answer choices; received 3.'], mode);
  }
});

test('the production 2-action turn child fails the four-answer contract closed', async () => {
  const db = createInMemorySupabase({ catalogRows: catalogFor(PRODUCTION_GEOMETRY) });
  deterministicEngine.setSupabaseClient(db);
  const parent = buildParent(parentRow(PRODUCTION_GEOMETRY));
  const resolution = await quietly(() => continuation.resolveStrictTrainingContinuation({
    parentQuestion: parent,
    persistedAnswerId: 'bet_74_91pct',
    gameConfig: GAME_CONFIG,
    queryNextStreet: (request) => deterministicEngine.queryNextStreet(request),
    requireProvenanceCompleteParent: true,
    difficultyMode: 'exact',
    parentSeal: 'preflight',
  }));
  assert.equal(resolution.ok, false);
  assert.equal(resolution.code, 'TRAINING_CONTINUATION_QUESTION_INVALID', JSON.stringify(resolution));
});

// ── (f) the cohort preflight runs before the database seal exists ──────────
test('the live resolver still requires a sealed parent; only the preflight may evaluate an unsealed one', async () => {
  const db = createInMemorySupabase({ catalogRows: catalogFor(FOUR_ACTION_GEOMETRY) });
  deterministicEngine.setSupabaseClient(db);
  const parent = buildParent(parentRow(FOUR_ACTION_GEOMETRY));
  assert.equal(parent.policyChecksum, undefined, 'an engine-built parent carries no database seal');
  const resolve = (overrides) => quietly(() => continuation.resolveStrictTrainingContinuation({
    parentQuestion: parent,
    persistedAnswerId: 'bet_74_91pct',
    gameConfig: GAME_CONFIG,
    queryNextStreet: (request) => deterministicEngine.queryNextStreet(request),
    requireProvenanceCompleteParent: true,
    difficultyMode: 'exact',
    ...overrides,
  }));
  const live = await resolve({});
  assert.equal(live.code, 'TRAINING_CONTINUATION_LINEAGE_INVALID', JSON.stringify(live));
  const unknownSeal = await resolve({ parentSeal: 'anything-goes' });
  assert.equal(unknownSeal.code, 'TRAINING_CONTINUATION_LINEAGE_INVALID');
  const preflight = await resolve({ parentSeal: 'preflight' });
  assert.equal(preflight.ok, true, JSON.stringify(preflight));
  const sealed = await resolve({
    parentQuestion: {
      ...parent,
      policyChecksum: createHash('sha256')
        .update(policyContract.stablePolicyJson(parent.solverPolicy)).digest('hex'),
    },
  });
  assert.equal(sealed.ok, true, JSON.stringify(sealed));
  assert.equal(sealed.canonicalQuestion.scenario.solverNode, preflight.canonicalQuestion.scenario.solverNode);
  const tamperedSeal = await resolve({
    parentSeal: 'preflight',
    parentQuestion: { ...parent, policyChecksum: 'not-a-seal' },
  });
  assert.equal(tamperedSeal.code, 'TRAINING_CONTINUATION_LINEAGE_INVALID',
    'a present but malformed seal is refused even in preflight');
});

// ── (d) the catalog scan asks only for the seat that can be a parent ───────
test('heads-up families scan only the in-position seat; multiway families keep the full scan', () => {
  assert.equal(enginePatches.headsUpInPositionSeat('hu_cash'), 'BTN');
  assert.equal(enginePatches.headsUpInPositionSeat('mtt_hu_chipev'), 'BTN');
  assert.equal(enginePatches.headsUpInPositionSeat('spin_hu_chipev'), 'BTN');
  assert.equal(enginePatches.headsUpInPositionSeat('mtt_6max_chipev'), null);
  assert.equal(enginePatches.headsUpInPositionSeat('postflop_complete'), null);
  assert.equal(enginePatches.headsUpInPositionSeat('hunt_cash'), null);
  assert.equal(enginePatches.headsUpInPositionSeat(''), null);
});

// ── The pipeline is green once every node has four real actions ────────────
for (const difficultyMode of ['standard', 'exact']) {
  test(`${difficultyMode}: a four-action parent resolves its exactly linked four-action turn child`, async () => {
    // Every OOP row sorts before the one IP parent. Without the seat filter the
    // scan would have to page through all of them first.
    const oopRows = FLOP_BOARDS.slice(0, 6).map((board) => (
      oopParentRow(FOUR_ACTION_GEOMETRY, board, '00000000')
    ));
    const db = createInMemorySupabase({
      catalogRows: [...oopRows, ...catalogFor(FOUR_ACTION_GEOMETRY)],
    });
    deterministicEngine.setSupabaseClient(db);
    const precommit = buildPrecommit(`module-${difficultyMode}`);
    const parents = await quietly(() => deterministicEngine.generateAttestationContinuationParentCandidates({
      gameConfig: GAME_CONFIG,
      level: LEVEL,
      count: 25,
      targetStreet: 'flop',
      acceptQuestion: (question) => Boolean(
        continuation.selectPublicAttestationContinuationAnswerForStrictParent(
          question, precommit, difficultyMode,
        ),
      ),
    }));
    assert.equal(parents.length, 1, 'the admitted parent must be eligible');
    assert.ok(db.calls.catalogRequests.length >= 1);
    for (const request of db.calls.catalogRequests) {
      assert.equal(request.p_position, 'BTN', 'a heads-up parent scan must request the in-position seat');
      assert.equal(request.p_street, 'flop');
    }
    const parent = parents[0];
    assert.equal(parent.scenario.heroPosition, 'BTN');
    const served = difficultyContract.applyDifficultyToQuestion(structuredClone(parent), difficultyMode);
    assert.equal(served.questionContract.valid, true, JSON.stringify(served.questionContract));
    assert.equal(served.options.length, 4);
    assert.equal(new Set(served.options.map(({ text }) => text)).size, 4);
    assert.deepEqual(served.options.filter((option) => option.contractDistractor), []);

    const publicAnswer = attestationContract.selectPublicAttestationContinuationAnswer(
      publicPayload(parent, difficultyMode),
    );
    assert.equal(publicAnswer, difficultyMode === 'exact' ? 'bet_74_91pct' : 'grouped_medium');

    const resolution = await quietly(() => continuation.resolveStrictTrainingContinuation({
      parentQuestion: parent,
      persistedAnswerId: publicAnswer,
      gameConfig: GAME_CONFIG,
      queryNextStreet: (request) => deterministicEngine.queryNextStreet(request),
      requireProvenanceCompleteParent: true,
      difficultyMode,
      parentSeal: 'preflight',
    }));
    assert.equal(resolution.ok, true, JSON.stringify(resolution));
    const child = resolution.canonicalQuestion;
    const turnCard = resolution.nextBoard.at(-1);
    assert.ok(CHILD_TURN_CARDS.includes(turnCard));
    assert.equal(child.scenario.solverNode, `r:0:c:b412:c:${turnCard}:c`);
    assert.equal(child.scenario.scenarioHash, `turn_hu_cash_BTN_100bb_${resolution.nextBoard.join('')}`);
    assert.equal(child.scenario.continuationParentScenarioHash, parent.scenario.scenarioHash);
    assert.equal(child.scenario.continuationParentNode, 'r:0:c');
    assert.equal(child.scenario.continuationParentAction, 'b412');
    assert.deepEqual(child.heroCards, parent.heroCards);
    assert.equal(child.scenario.pot, TURN_POT_CHIPS / 100);
    assert.equal(child.scenario.stackDepth, EFFECTIVE_STACK_BB);
    assert.equal(child.solverProvenance.verified, true);
    assert.equal(child.solverProvenance.manifestChecksum, parent.solverProvenance.manifestChecksum);
    assert.equal(questionContract.isTrainingQuestionValid(child), true);
    assert.equal(child.options.length, 4);
    assert.deepEqual(child.options.filter((option) => option.contractDistractor), []);
    assert.deepEqual(
      child.solverPolicy.actions.map(({ sourceCode }) => sourceCode),
      ['c', 'b865', 'b1442', 'b2130'],
    );
    assert.deepEqual(privateKeysIn(publicPayload(child, difficultyMode)), []);
    // Snapshot re-verification is the persisted path: it needs the parent's
    // database seal, exactly as next-street and the admin collector see it.
    const sealedParent = {
      ...parent,
      policyChecksum: createHash('sha256')
        .update(policyContract.stablePolicyJson(parent.solverPolicy)).digest('hex'),
    };
    assert.equal(
      continuation.validateStrictTrainingContinuationSnapshotPair({
        parentQuestion: parent,
        childQuestion: child,
        persistedAnswerId: publicAnswer,
        difficultyMode,
        gameConfig: GAME_CONFIG,
      }).code,
      'TRAINING_CONTINUATION_CHILD_NOT_EXACT',
      'an unsealed parent must not re-verify as a persisted snapshot pair',
    );
    assert.equal(
      continuation.validateStrictTrainingContinuationSnapshotPair({
        parentQuestion: sealedParent,
        childQuestion: child,
        persistedAnswerId: publicAnswer,
        difficultyMode,
        gameConfig: GAME_CONFIG,
      }).ok,
      true,
    );
  });
}

// ── (c) the real route: one public 422, one distinct server-only stage each ─
const REFUSAL_BODY = Object.freeze({
  success: false,
  error: 'No exact 20-hand continuation cohort is available for this public precommit.',
  code: 'TRAINING_ATTESTATION_CONTINUATION_COHORT_UNAVAILABLE',
});
// Keys that would name a private value, plus the shapes of the values
// themselves: a canonical or raw action id, a UUID, a hash, a receipt.
const PRIVATE_LOG_RE = new RegExp([
  '"(?:answers?|options?|questionids?|question_ids?|snapshots?|receipts?|secrets?|tokens?|correctanswer|selectedanswer|publicanswer)":',
  '\\bb\\d{2,4}\\b',
  '\\bbet_\\d',
  '\\bgrouped_',
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
  '[0-9a-f]{64}',
  'eyJ[A-Za-z0-9_-]{10,}',
].join('|'), 'i');

function assertRefusal({ response, diagnostics }, stage) {
  assert.equal(response.statusCode, 422, JSON.stringify(response.body));
  assert.deepEqual(response.body, REFUSAL_BODY, 'the public refusal body must never vary by stage');
  const refusals = diagnostics.filter((record) => record.stage !== 'solver_engine_failed');
  assert.equal(refusals.length, 1, JSON.stringify(diagnostics));
  const [record] = refusals;
  assert.equal(record.stage, stage, JSON.stringify(record));
  assert.equal(record.gameId, GAME_ID);
  assert.equal(record.level, LEVEL);
  assert.equal(record.questionCount, 20);
  assert.doesNotMatch(JSON.stringify(record), PRIVATE_LOG_RE, 'the server log must carry counts only');
  return record;
}

test('route: every cohort refusal branch reports a distinct server-only stage', async () => {
  assert.deepEqual(
    cohortDiagnostics.TRAINING_ATTESTATION_COHORT_STAGES,
    [
      'precommit_rejected',
      'solver_engine_failed',
      'no_candidate_questions',
      'configured_candidate_shortfall',
      'canonical_pair_shortfall',
      'cohort_unavailable',
      'selected_pair_shortfall',
    ],
  );
  assert.throws(
    () => cohortDiagnostics.buildTrainingAttestationCohortRecord({ stage: 'made_up' }),
    /Unknown attestation cohort diagnostic stage/,
  );

  // 1. A precommit that does not bind this session, game and level.
  const rejected = await requestAttestationCohort({
    catalogRows: [],
    mutateQuery: (query) => { query.attestationContinuationPrecommit = 'f'.repeat(64); },
  });
  const rejectedRecord = assertRefusal(rejected, 'precommit_rejected');
  assert.equal(rejectedRecord.precommitValid, 0);
  assert.equal(rejected.db.calls.catalogPages, 0, 'a rejected precommit must not touch the catalog');

  // 2. An empty serving catalog (production today: zero admitted artifacts).
  const empty = await requestAttestationCohort({ catalogRows: [] });
  const emptyRecord = assertRefusal(empty, 'no_candidate_questions');
  assert.deepEqual(
    [emptyRecord.cachedQuestions, emptyRecord.generatedParentCandidates, emptyRecord.solverQuestions],
    [0, 0, 0],
  );
  assert.ok(empty.db.calls.catalogPages >= 1, 'the catalog must actually have been consulted');

  // 3. The catalog RPC failing: the engine fails closed and says so.
  const failing = await requestAttestationCohort({
    catalogRows: catalogFor(FOUR_ACTION_GEOMETRY, { parents: 22 }),
    failCatalogRpc: true,
  });
  const failingRecord = assertRefusal(failing, 'no_candidate_questions');
  assert.equal(failingRecord.generatedParentCandidates, 0);
  assert.ok(
    failing.serverLog.some((args) => /catalog query failed closed/.test(String(args[0]))),
    'a refused catalog page must be logged, not swallowed',
  );

  // 4. The real production tree: parents are built, then dropped by the
  //    four-choice contract before they can become candidates. (a) at the route.
  const production = await requestAttestationCohort({
    catalogRows: catalogFor(PRODUCTION_GEOMETRY, { parents: 22 }),
  });
  const productionRecord = assertRefusal(production, 'no_candidate_questions');
  assert.equal(productionRecord.generatedParentCandidates, 22,
    'the 3-action parents must reach the route before the four-choice contract rejects them');
  assert.equal(productionRecord.solverQuestions, 0);

  // 5. Too few eligible parents for a 20-hand attempt.
  const sparse = await requestAttestationCohort({
    catalogRows: catalogFor(FOUR_ACTION_GEOMETRY, { parents: 1 }),
  });
  const sparseRecord = assertRefusal(sparse, 'configured_candidate_shortfall');
  assert.equal(sparseRecord.generatedParentCandidates, 1);
  assert.equal(sparseRecord.solverQuestions, 1);
  assert.equal(sparseRecord.configuredCandidates, 1);

  // 6. Enough parents, but no exact turn child exists for any of them.
  const childless = await requestAttestationCohort({
    catalogRows: catalogFor(FOUR_ACTION_GEOMETRY, { parents: 22, childBoards: 0 }),
  });
  const childlessRecord = assertRefusal(childless, 'cohort_unavailable');
  assert.equal(childlessRecord.canonicalPairs, 22);
  assert.equal(childlessRecord.candidates, 22);
  assert.equal(childlessRecord.publicAnswerMissing, 0);
  assert.equal(childlessRecord.qualified, 0);
  assert.deepEqual(childlessRecord.resolutionFailures, { TRAINING_CONTINUATION_SOLVER_MISS: 22 });
});

for (const difficulty of ['standard', 'exact']) {
  test(`route (${difficulty}): a complete four-action catalog delivers the signed 20-hand cohort`, async () => {
    const { response, db, precommit, diagnostics } = await requestAttestationCohort({
      catalogRows: catalogFor(FOUR_ACTION_GEOMETRY, { parents: 22, childBoards: 1 }),
      difficulty,
    });
    assert.equal(response.statusCode, 200, JSON.stringify(response.body).slice(0, 600));
    assert.deepEqual(diagnostics, [], 'a delivered cohort writes no refusal record');
    const body = response.body;
    assert.equal(body.success, true);
    assert.equal(body.count, 20);
    assert.equal(body.questions.length, 20);
    assert.equal(body.targetHands, 20);
    assert.deepEqual(body.attestationContinuationCohort, { ...precommit });
    assert.deepEqual(privateKeysIn(body.questions), [], 'no private grading data may leave the route');
    assert.equal(new Set(body.questions.map((question) => question.id)).size, 20);
    assert.equal(new Set(body.questions.map((question) => question._gradingContext?.receipt)).size, 20);
    const publicSelections = body.questions
      .map((question) => attestationContract.selectPublicAttestationContinuationAnswer(question, precommit.selectionRule))
      .filter(Boolean);
    assert.equal(publicSelections.length, 20, 'every served hand exposes the public rule answer');
    assert.ok(
      publicSelections.every((answer) => answer === (difficulty === 'exact' ? 'bet_74_91pct' : 'grouped_medium')),
    );
    // The qualifying parent is inside the manifest, and nothing in the public
    // payload distinguishes it from the other nineteen.
    const qualifyingHash = parentRow(FOUR_ACTION_GEOMETRY, FLOP_BOARDS[0]).scenario_hash;
    const servedHashes = body.questions.map((question) => question.scenario?.scenarioHash);
    assert.ok(servedHashes.includes(qualifyingHash));
    assert.equal(new Set(body.questions.map((question) => JSON.stringify(Object.keys(question).sort()))).size, 1);
    // Persistence received exactly the served rows: one immutable snapshot and
    // one attempt hand per question, all through the real delivery contract.
    assert.equal(db.tables.get('training_question_cache').length, 20);
    assert.equal(db.tables.get('training_question_snapshots').length, 20);
    assert.equal(db.tables.get('training_attempt_hands').length, 20);
    assert.ok(db.calls.rpc.includes('fn_start_training_attempt_v2'));
    assert.ok(db.calls.rpc.includes('fn_training_attempt_record_served_batch_v1'));
  });
}
