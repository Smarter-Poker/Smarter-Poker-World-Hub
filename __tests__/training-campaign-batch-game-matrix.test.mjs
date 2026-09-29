/**
 * Campaign batch-preload across every canonical Training game, in-process,
 * through the REAL route (tests/helpers/trainingBatchPreloadHarness.mjs) with
 * an empty database: no cached questions, no admitted solver artifact, no
 * chart rows. That is the state in which the route must generate or fail
 * closed honestly, and it is the state the 2026-09-22 production smoke found
 * for cash-001 (engine generated 40, route answered 404).
 *
 * Expectations come from each game's own config, not from a wish list:
 *   - SCENARIO games generate from local authored banks and must deliver a
 *     full signed campaign batch;
 *   - the two declared-preflop PioSOLVER games (cash-001, cash-008) generate
 *     local static range frequencies, which the Phase 6 authority contract
 *     (trainingAttemptDelivery.mjs, `local_range_provenance_missing`, pinned
 *     by training-question-delivery-authority) keeps out of progress-bearing
 *     attempts. With no cache they therefore fail closed - and the route must
 *     now SAY SO in its server log instead of only "engines returned empty";
 *   - every other PioSOLVER game reads the admitted solver catalog and every
 *     ICMIZER game reads audited chart rows; with an empty database they have
 *     nothing to generate and must fail closed without a 500.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  createInMemorySupabase,
  invokeBatchPreload,
  load,
} from '../tests/helpers/trainingBatchPreloadHarness.mjs';

const { TRAINING_LIBRARY } = await load('src/data/TRAINING_LIBRARY.js');
const { pioQueryService } = await load('src/services/PIOQueryService.js');
const { getGameConfig } = await load('src/config/gameConfigs.js');
const gradingReceipt = await load('src/lib/training/gradingReceipt.mjs');

const USER_ID = '3f2b6c1e-8d4a-4b7f-9e2c-1a5d7f9b3c6e';
const GAME_IDS = TRAINING_LIBRARY.map((game) => game.id);
const PREFLOP_LOCAL_RANGE_GAMES = ['cash-001', 'cash-008'];

function classify(gameId) {
  const declared = pioQueryService.getGameConfig(gameId);
  const engine = getGameConfig(gameId)?.engine;
  if (declared?.sourceOfTruth === 'SCENARIO' || engine === 'SCENARIO') return 'scenario_bank';
  if (declared?.sourceOfTruth === 'ICMIZER') return 'chart_rows_required';
  if (declared?.sourceOfTruth === 'PioSOLVER' && declared.pioStreet === 'preflop') {
    return 'preflop_local_range';
  }
  if (declared?.sourceOfTruth === 'PioSOLVER') return 'solver_catalog_required';
  return 'unknown';
}

async function requestCampaignBatch(gameId, level, difficulty = 'grouped') {
  const db = createInMemorySupabase();
  const result = await invokeBatchPreload({
    db,
    authUserId: USER_ID,
    query: {
      gameId,
      level: String(level),
      count: '20',
      gameMode: 'full',
      handSelection: 'all',
      difficulty,
      sessionId: `matrix-${gameId}-${level}-${randomUUID()}`,
    },
  });
  const refusalLine = result.serverLog
    .map((args) => String(args[0]))
    .find((line) => /engine candidates for .* were refused by the campaign contract/.test(line)) || null;
  return { ...result, db, refusalLine };
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

test('the canonical library still has 107 games and every one is classified', () => {
  assert.equal(GAME_IDS.length, 107);
  assert.deepEqual(GAME_IDS.filter((gameId) => classify(gameId) === 'unknown'), []);
  assert.deepEqual(GAME_IDS.filter((gameId) => classify(gameId) === 'preflop_local_range'), PREFLOP_LOCAL_RANGE_GAMES);
});

const CURATED_DISCLOSURE = 'Expert-authored poker concept; no solver-exact frequency or EV is claimed.';

function assertHonestCuratedBatch({ response, db, refusalLine }, gameId, { street = null } = {}) {
  assert.equal(response.statusCode, 200, `${gameId}: ${JSON.stringify(response.body).slice(0, 300)} ${refusalLine || ''}`);
  assert.equal(refusalLine, null, `${gameId}: nothing should have been generated only to be refused`);
  const { questions } = response.body;
  assert.equal(questions.length, 20, gameId);
  assert.deepEqual(privateKeysIn(questions), [], gameId);
  for (const question of questions) {
    assert.equal(question.options?.length, 4, `${gameId}/${question.id}`);
    assert.equal(new Set(question.options.map((option) => option.text)).size, 4, `${gameId}/${question.id}`);
    assert.equal(question.sourceClassification, 'CURATED', `${gameId}/${question.id}`);
    assert.equal(question.dataQuality, 'CURATED', `${gameId}/${question.id}`);
    assert.equal(question.evidenceDisclosure, CURATED_DISCLOSURE, `${gameId}/${question.id}`);
    assert.notEqual(question.solverProvenance?.verified, true, `${gameId}/${question.id} must not claim a solve`);
    if (street) assert.equal(question.scenario?.street, street, `${gameId}/${question.id}`);
    assert.ok(question._gradingContext?.receipt, `${gameId}/${question.id}: no receipt`);
  }
  const cacheRows = db.tables.get('training_question_cache') || [];
  assert.equal(cacheRows.length, 20, gameId);
  assert.ok(cacheRows.every((row) => row.source_classification === 'CURATED'), gameId);
}

test('cash-001 Level 1 (the production smoke request) delivers a full honest campaign batch', async () => {
  // Before this change the route logged "engine generated 40 ... engines
  // returned empty" and answered 404: the preflop branch of generateBatch
  // returned forty local static range spots that the Phase 6 authority
  // contract refuses for progress-bearing attempts, and never reached the
  // authored-concept fallback the other 82 solver games take.
  const result = await requestCampaignBatch('cash-001', 1);
  assertHonestCuratedBatch(result, 'cash-001', { street: 'preflop' });
});

for (const gameId of PREFLOP_LOCAL_RANGE_GAMES) {
  for (const level of [1, 8]) {
    test(`${gameId} L${level}: a declared-preflop game takes the authored preflop fallback, not a refused range batch`, async () => {
      const result = await requestCampaignBatch(gameId, level);
      assertHonestCuratedBatch(result, gameId, { street: 'preflop' });
    });
  }
}

test('the local static range generator is untouched for callers that do not require campaign authority', async () => {
  const { deterministicEngine } = await load('src/engines/DeterministicGTOEngine.js');
  const { applyDeterministicEnginePatches } = await load('src/engines/deterministicEnginePatches.js');
  const { isTrainingQuestionCampaignEligible, trainingQuestionCampaignEligibility } = await load('src/lib/training/trainingAttemptDelivery.mjs');
  applyDeterministicEnginePatches(deterministicEngine);
  deterministicEngine.setSupabaseClient(createInMemorySupabase());
  const gameConfig = pioQueryService.getGameConfig('cash-001');
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const practice = await deterministicEngine.generateBatch({
      gameId: 'cash-001', level: 1, count: 20, gameConfig, difficulty: 'standard', seenIds: [],
    });
    assert.equal(practice.length, 20);
    assert.ok(practice.every((question) => question.scenario?.street === 'preflop'
      && String(question.legacySource || question.source).toUpperCase() === 'LOCAL_SOLVER_RANGES'
      && question.solverProvenance?.verified !== true));
    // The exact contract that keeps these out of a campaign attempt.
    assert.equal(trainingQuestionCampaignEligibility(practice[0]).eligible, false);

    const campaign = await deterministicEngine.generateBatch({
      gameId: 'cash-001', level: 1, count: 20, gameConfig, difficulty: 'standard', seenIds: [],
      admissibleForCaller: isTrainingQuestionCampaignEligible,
    });
    assert.equal(campaign.length, 20);
    assert.ok(campaign.every((question) => question.source === 'CURATED_SCENARIO'
      && question.scenario?.street === 'preflop'
      && isTrainingQuestionCampaignEligible(question)));

    // A predicate that admits the range spots keeps them: the fallback is a
    // consequence of the caller's contract, not a relabelling of the corpus.
    const admitted = await deterministicEngine.generateBatch({
      gameId: 'cash-001', level: 1, count: 20, gameConfig, difficulty: 'standard', seenIds: [],
      admissibleForCaller: () => true,
    });
    assert.ok(admitted.every((question) => String(question.legacySource || question.source).toUpperCase() === 'LOCAL_SOLVER_RANGES'));
  } finally {
    console.warn = originalWarn;
  }
});

test('every SCENARIO game: the authored bank is smaller than one 20-hand attempt, and the route says so honestly', async () => {
  // Pre-existing and unrelated to the solver work: getPsychologyQuestions pads
  // a short bank by repeating entries, the route de-duplicates canonical ids,
  // and an empty cache therefore yields fewer than 20 unique hands. The route
  // must answer the exact shortfall contract (never a 500 and never a padded
  // batch) and name every skipped duplicate in its server log.
  const scenarioGames = GAME_IDS.filter((gameId) => classify(gameId) === 'scenario_bank');
  assert.ok(scenarioGames.length >= 20, scenarioGames.join(','));
  const failures = [];
  for (const gameId of scenarioGames) {
    const { response, serverLog, refusalLine, db } = await requestCampaignBatch(gameId, 1);
    if (refusalLine) failures.push(`${gameId}: ${refusalLine}`);
    if (response.statusCode === 200) {
      if (response.body.questions.length !== 20) failures.push(`${gameId}: 200 with ${response.body.questions.length}`);
      continue;
    }
    if (response.statusCode !== 422 || response.body?.code !== 'TRAINING_ATTEMPT_QUESTION_SHORTFALL') {
      failures.push(`${gameId}: ${response.statusCode} ${JSON.stringify(response.body).slice(0, 160)}`);
      continue;
    }
    const skipped = serverLog.map((args) => String(args[0]))
      .find((line) => /could not be canonicalised and were skipped/.test(line));
    if (!skipped) failures.push(`${gameId}: shortfall without a canonicalisation log`);
    else if (!/Duplicate canonical question identifier/.test(skipped)) failures.push(`${gameId}: ${skipped.slice(0, 200)}`);
    if ((db.tables.get('training_question_cache') || []).length > 0) {
      failures.push(`${gameId}: a refused batch must not write cache rows`);
    }
  }
  assert.deepEqual(failures, []);
});

test('every other PioSOLVER game takes the same honest authored fallback with an empty catalog', async () => {
  const solverGames = GAME_IDS.filter((gameId) => classify(gameId) === 'solver_catalog_required');
  assert.equal(solverGames.length, 82, solverGames.join(','));
  for (const gameId of solverGames) {
    const result = await requestCampaignBatch(gameId, 1);
    assertHonestCuratedBatch(result, gameId);
    assert.ok(result.db.calls.catalogPages >= 1, `${gameId}: the admitted solver catalog must be consulted first`);
  }
});

test('chart games fail closed without audited chart rows and never 500', async () => {
  const chartGames = GAME_IDS.filter((gameId) => classify(gameId) === 'chart_rows_required');
  assert.deepEqual(chartGames, ['mtt-001', 'mtt-016']);
  for (const gameId of chartGames) {
    const { response, refusalLine, db } = await requestCampaignBatch(gameId, 1);
    assert.equal(response.statusCode, 404, `${gameId}: ${JSON.stringify(response.body).slice(0, 160)}`);
    assert.match(String(response.body.error), /No questions available/);
    assert.equal(refusalLine, null, gameId);
    assert.equal((db.tables.get('training_question_cache') || []).length, 0, gameId);
  }
});

test('the signed receipt binds the requested campaign identity and the public shape leaks no secret', async () => {
  const { response } = await requestCampaignBatch('cash-001', 1);
  assert.equal(response.statusCode, 200, JSON.stringify(response.body).slice(0, 200));
  const receipt = String(response.body.questions[0]._gradingContext.receipt);
  const payload = JSON.parse(Buffer.from(receipt.split('.')[0], 'base64url').toString('utf8'));
  assert.equal(payload.gameId, 'cash-001');
  assert.equal(payload.level, 1);
  assert.equal(payload.sub, USER_ID);
  assert.equal(payload.practiceOnly, false);
  assert.equal(payload.countsTowardCompletion, true);
  assert.equal(payload.sessionKind, 'campaign');
  assert.doesNotMatch(JSON.stringify(response.body), /TRAINING_GRADING_RECEIPT_SECRET|service_role/i);
  assert.equal(typeof gradingReceipt.toPublicTrainingQuestion, 'function');
});
