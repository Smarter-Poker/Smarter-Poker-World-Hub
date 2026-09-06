import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  filterCachedRowsForGame,
  hydrateMissingPIOScenarioContract,
} from '../src/lib/training/cacheContract.mjs';
import { isCustomTrainerConfig } from '../src/lib/training/trainerConfigMode.mjs';
import { buildQuestionConfusion } from '../src/lib/training/questionAnalytics.mjs';
import { isVerifiedSolverQuestion } from '../src/lib/training/solverDecisionEvidence.js';
import { handNotationToRepresentativeCards } from '../src/lib/training/representativeCards.mjs';
import { isRetryable } from '../src/lib/supabaseRetry.js';
import {
  isTrainingPersistenceUnavailable,
  runTrainingPersistenceQuery,
  trainingPersistenceUnavailableBody,
} from '../src/lib/training/trainingPersistence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('session preferences do not replace catalog drills with custom cash spots', () => {
  assert.equal(isCustomTrainerConfig({
    difficulty: 'standard',
    timer: 'relaxed',
    mode: 'trainer',
    scope: 'all',
    tables: '1',
    feedbackRule: 'every',
    handSelection: 'all',
  }), false);

  assert.equal(isCustomTrainerConfig({
    gameType: 'mtt',
    stackDepth: 20,
    position: 'BTN',
  }), true);
});

test('chart games reject postflop cache pollution', () => {
  const rows = [
    {
      id: 'wrong',
      engine_type: 'PIO',
      question_data: {
        type: 'PIO',
        scenario: { street: 'flop' },
        boardCards: ['2d', '3c', '7d'],
        options: [{ id: 'x', text: 'Check' }, { id: 'b', text: 'Bet' }],
      },
    },
    {
      id: 'right',
      engine_type: 'CHART',
      question_data: {
        type: 'CHART',
        scenario: { street: 'preflop' },
        boardCards: [],
        options: [{ id: 'push', text: 'Push All-In' }, { id: 'fold', text: 'Fold' }],
      },
    },
  ];

  assert.deepEqual(
    filterCachedRowsForGame(rows, { sourceOfTruth: 'ICMIZER' }).map((row) => row.id),
    ['right']
  );
});

test('psychology games reject poker-solver cache rows', () => {
  const rows = [
    { id: 'pio', engine_type: 'PIO', question_data: { scenario: { street: 'river' } } },
    {
      id: 'mental',
      engine_type: 'SCENARIO',
      question_data: { scenario: { isPsychology: true } },
    },
  ];
  assert.deepEqual(
    filterCachedRowsForGame(rows, { sourceOfTruth: 'SCENARIO' }).map((row) => row.id),
    ['mental']
  );
});

test('PIO games reject a cached solver row from the wrong family or stack', () => {
  const rows = [
    { id: 'wrong-family', engine_type: 'PIO', question_data: { scenario: { street: 'flop', gameType: 'hu_cash', stackDepth: 100 } } },
    { id: 'wrong-stack', engine_type: 'PIO', question_data: { scenario: { street: 'flop', gameType: 'postflop_complete', stackDepth: 40 } } },
    { id: 'right', engine_type: 'PIO', question_data: { source: 'POSTFLOP_ENGINE', scenario: { street: 'flop', gameType: 'postflop_complete', stackDepth: 100 } } },
  ];
  assert.deepEqual(
    filterCachedRowsForGame(rows, {
      sourceOfTruth: 'PioSOLVER', pioGameType: 'postflop_complete', pioStackDepth: 100,
    }).map((row) => row.id),
    ['right'],
  );
});

test('generated questions inherit the missing server-side PIO family and stack contract', () => {
  const question = {
    source: 'POSTFLOP_ENGINE',
    scenario: { street: 'flop', pot: 20.5 },
  };
  const gameConfig = {
    sourceOfTruth: 'PioSOLVER',
    pioGameType: 'hu_cash',
    pioStackDepth: 100,
  };
  assert.equal(hydrateMissingPIOScenarioContract(question, gameConfig), question);
  assert.deepEqual(question.scenario, {
    street: 'flop', pot: 20.5, gameType: 'hu_cash', stackDepth: 100,
  });
  assert.deepEqual(
    filterCachedRowsForGame([{ engine_type: 'PIO', question_data: question }], gameConfig),
    [{ engine_type: 'PIO', question_data: question }],
  );

  const authored = { scenario: { gameType: 'wrong_family', stackDepth: 40 } };
  hydrateMissingPIOScenarioContract(authored, gameConfig);
  assert.deepEqual(authored.scenario, { gameType: 'wrong_family', stackDepth: 40 });
});

test('postflop generation rejects missing pot geometry instead of inventing a six-BB pot', () => {
  const engine = fs.readFileSync('src/engines/DeterministicGTOEngine.js', 'utf8');
  assert.match(engine, /const postflopPot = Number\(scenario\.potSize\)/);
  assert.match(engine, /!Number\.isFinite\(postflopPot\) \|\| postflopPot <= 0/);
  assert.match(engine, /pot: postflopPot/);
  assert.doesNotMatch(engine, /pot: scenario\.potSize \|\| 6/);
});

test('unsealed warehouse cache rows cannot bypass live matrix and EV validation', () => {
  const rows = [
    { id: 'missing-source', engine_type: 'PIO', question_data: { scenario: { street: 'flop', gameType: 'hu_cash', stackDepth: 100 } } },
    { id: 'legacy-label', engine_type: 'PIO', question_data: { source: 'DETERMINISTIC_SOLVER', gtoFrequencies: { x: 70, b50: 30 }, scenario: { street: 'flop', gameType: 'hu_cash', stackDepth: 100 } } },
  ];
  assert.deepEqual(
    filterCachedRowsForGame(rows, {
      sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100,
    }),
    [],
  );
});

test('legacy questions are canonicalized only for server grading and remain ineligible for cache serving', () => {
  const record = fs.readFileSync('pages/api/training/record-question.js', 'utf8');
  const reseeder = fs.readFileSync('scripts/reseed-deterministic-cache.js', 'utf8');
  assert.match(record, /is_correct: canonicalGrade \? canonicalGrade\.isCorrect : !!isCorrect/);
  assert.match(record, /solver_verified: verified/);
  assert.match(record, /allowSanitizedLegacyArchive: true/);
  assert.match(record, /TRAINING_QUESTION_REFRESH_REQUIRED/);
  assert.match(record, /const persistedEVLoss = verified && canonicalGrade\.evLossMeasured[\s\S]*:\s*0;/);
  assert.doesNotMatch(record, /typeof evLoss === 'number'/);
  assert.match(reseeder, /q\.dataQuality !== 'LEGACY_UNVERIFIED'/);
});

test('only a fully contracted sanitized legacy envelope is grade-eligible', () => {
  const config = {
    sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100,
  };
  const base = {
    engine_type: 'PIO',
    question_data: {
      source: 'LEGACY_STRATEGY_ARCHIVE',
      dataQuality: 'LEGACY_UNVERIFIED',
      scenario: { street: 'flop', gameType: 'hu_cash', stackDepth: 100 },
      solverProvenance: { verified: false, source: 'solved_spots_gold_legacy' },
      evidenceDisclosure: 'Legacy strategy archive; writer provenance is unavailable.',
      questionContract: { version: 1, valid: true },
    },
  };
  assert.deepEqual(filterCachedRowsForGame([base], config), []);
  assert.equal(filterCachedRowsForGame(
    [base], config, { allowSanitizedLegacyArchive: true },
  ).length, 1);
  const incomplete = structuredClone(base);
  delete incomplete.question_data.evidenceDisclosure;
  assert.deepEqual(filterCachedRowsForGame(
    [incomplete], config, { allowSanitizedLegacyArchive: true },
  ), []);
});

test('declared preflop PIO games accept only the audited local-range cache', () => {
  const rows = [
    { id: 'wrong', engine_type: 'PIO', question_data: { source: 'DETERMINISTIC_SOLVER', scenario: { street: 'flop', gameType: 'hu_cash', stackDepth: 100 } } },
    { id: 'right', engine_type: 'PIO', question_data: { source: 'local_solver_ranges', scenario: { street: 'preflop', stackDepth: 100 } } },
  ];
  assert.deepEqual(
    filterCachedRowsForGame(rows, {
      sourceOfTruth: 'PioSOLVER', pioGameType: 'hu_cash', pioStackDepth: 100, pioStreet: 'preflop',
    }).map((row) => row.id),
    ['right'],
  );
});

test('both cache readers select engine_type and apply the exact cache contract', () => {
  const single = fs.readFileSync(path.join(ROOT, 'pages/api/training/get-question.js'), 'utf8');
  const batch = fs.readFileSync(path.join(ROOT, 'pages/api/training/batch-preload.js'), 'utf8');
  assert.match(single, /select\('question_data, question_id, engine_type'\)/);
  assert.match(single, /filterCachedRowsForGame/);
  assert.match(batch, /select\('id, question_data, engine_type'\)/);
  assert.match(batch, /filterCachedRowsForGame/);
  assert.doesNotMatch(single, /\.not\('question_id', 'in'/);
  assert.match(single, /filter\(\(row\) => !seenQuestionIds\.includes\(row\.question_id\)\)/);
});

test('single-question canonicalization preserves mastery levels eleven and twelve', () => {
  const source = fs.readFileSync('pages/api/training/get-question.js', 'utf8');
  const migration = fs.readFileSync('supabase/migrations/20260901130000_training_levels_one_through_twelve.sql', 'utf8');
  assert.match(source, /Math\.min\(12, Math\.max\(1, parseInt\(level, 10\) \|\| 1\)\)/);
  assert.doesNotMatch(source, /level: Math\.min\(10,/);
  assert.match(migration, /valid_level CHECK \(level BETWEEN 1 AND 12\)/);
  assert.match(migration, /current_level BETWEEN 1 AND 12/);
  assert.match(migration, /highest_level_completed BETWEEN 0 AND 12/);
  assert.match(migration, /arena_sessions_level_check[\s\S]*level BETWEEN 1 AND 12/);
});

test('both question endpoints persist the exact post-contract envelope used for grading', () => {
  const single = fs.readFileSync('pages/api/training/get-question.js', 'utf8');
  const batch = fs.readFileSync('pages/api/training/batch-preload.js', 'utf8');
  assert.match(single, /Existing legacy rows[\s\S]*\.upsert\(canonicalPayload/);
  assert.match(single, /defaultToNull: false/);
  assert.match(single, /Refusing to serve an uncanonicalized question/);
  assert.match(single, /status\(503\)\.json\(trainingPersistenceUnavailableBody\(\)\)/);
  assert.match(batch, /const canonicalRows = Array\.from\(new Map\(enrichedBatch/);
  assert.match(batch, /new Map\(enrichedBatch[\s\S]*String\(q\.id\)\.slice\(0, 180\)/);
  assert.match(batch, /\.upsert\(cachedCanonicalRows, \{[\s\S]*defaultToNull: false/);
  assert.match(batch, /\.upsert\(generatedCanonicalRows, \{[\s\S]*defaultToNull: false/);
  assert.match(batch, /Refusing to serve uncanonicalized questions/);
  assert.match(batch, /status\(503\)\.json\(trainingPersistenceUnavailableBody\(\)\)/);
  assert.doesNotMatch(batch, /\.upsert\((?:cached|generated)CanonicalRows, \{[^}]*ignoreDuplicates: true/);
  const recorder = fs.readFileSync('pages/api/training/record-question.js', 'utf8');
  assert.match(recorder, /async function getEligibleCanonicalQuestion/);
  assert.match(recorder, /attempt < 4/);
  assert.match(recorder, /100 \* \(2 \*\* attempt\)/);
  assert.doesNotMatch(recorder, /req\.body\.(?:question|correctAnswer)/);
  assert.match(batch, /hydrateMissingPIOScenarioContract\(qData, declaredCfg\)/);
  const hook = fs.readFileSync('src/hooks/useGTOTrainer.js', 'utf8');
  assert.match(hook, /TRAINING_QUESTION_REFRESH_REQUIRED/);
  assert.match(hook, /pendingAnswerPersistenceRef\.current/);
  assert.match(hook, /refreshRequiredQuestionIdsRef\.current\.delete/);
  assert.match(hook, /await fetchSingleQuestion\(level\)/);
  assert.match(hook, /const answerPersisted = pendingPersistence \? await pendingPersistence : true/);
  assert.match(hook, /if \(nextQuestionInFlightRef\.current\) return;[\s\S]*nextQuestionInFlightRef\.current = true/);
  assert.match(hook, /finally \{[\s\S]*nextQuestionInFlightRef\.current = false/);
  assert.match(hook, /if \(answerPersisted === false\)[\s\S]*setError\('Your answer could not be saved\./);
  assert.match(hook, /setError\('Your answer could not be saved[\s\S]*return;[\s\S]*setShowFeedback\(false\)/);
});

test('Training persistence retries an invalid HTTP2 session with a fresh bounded query', async () => {
  let calls = 0;
  const result = await runTrainingPersistenceQuery(
    () => ({
      async abortSignal(signal) {
        assert.ok(signal instanceof AbortSignal);
        calls += 1;
        if (calls === 1) {
          return {
            data: null,
            error: { code: 'ERR_HTTP2_INVALID_SESSION', message: 'The session has been destroyed' },
          };
        }
        return { data: [{ id: 'canonical' }], error: null };
      },
    }),
    { label: 'Test:HTTP2', baseDelay: 0, timeoutMs: 100 },
  );

  assert.equal(calls, 2);
  assert.deepEqual(result.data, [{ id: 'canonical' }]);
  assert.equal(isRetryable({ cause: { code: 'ERR_HTTP2_INVALID_SESSION' } }), true);
});

test('Training persistence fails closed with one stable retryable API contract', async () => {
  await assert.rejects(
    runTrainingPersistenceQuery(
      () => ({
        async abortSignal() {
          return { data: null, error: { code: '23514', message: 'contract rejected' } };
        },
      }),
      { label: 'Test:Failure', maxRetries: 0, timeoutMs: 100 },
    ),
    (error) => isTrainingPersistenceUnavailable(error) && error.code === '23514',
  );
  assert.deepEqual(trainingPersistenceUnavailableBody(), {
    success: false,
    error: 'Training data is temporarily unavailable. Please retry this hand.',
    code: 'TRAINING_PERSISTENCE_UNAVAILABLE',
    retryable: true,
  });

  const record = fs.readFileSync('pages/api/training/record-question.js', 'utf8');
  assert.match(record, /runTrainingPersistenceQuery/);
  assert.match(record, /isTrainingPersistenceUnavailable/);
  assert.match(record, /status\(503\)\.json\(trainingPersistenceUnavailableBody\(\)\)/);
  assert.doesNotMatch(record, /withRetry/);
});

test('Training persistence aborts a stalled PostgREST attempt at its deadline', async () => {
  let abortObserved = false;
  await assert.rejects(
    runTrainingPersistenceQuery(
      () => ({
        abortSignal(signal) {
          return new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => {
              abortObserved = true;
              const error = new Error('request deadline elapsed');
              error.name = 'AbortError';
              reject(error);
            }, { once: true });
          });
        },
      }),
      { label: 'Test:Deadline', maxRetries: 0, timeoutMs: 5 },
    ),
    (error) => isTrainingPersistenceUnavailable(error) && error.cause?.name === 'AbortError',
  );
  assert.equal(abortObserved, true);
});

test('an explicit street target filters warm cache rows before generation', () => {
  const batch = fs.readFileSync(path.join(ROOT, 'pages/api/training/batch-preload.js'), 'utf8');
  assert.match(batch, /import \{ streetOfCachedRow \} from '[^']+declaredStreet'/);
  assert.match(batch, /targetStreet\s*\? contractedRows\.filter\(\(row\) => streetOfCachedRow\(row\) === targetStreet\)/);
});

test('warehouse source labels are unverified without the complete export seal', () => {
  const legacy = {
    source: 'DETERMINISTIC_SOLVER',
    gtoFrequencies: { x: 40, b50: 60 },
  };
  assert.equal(isVerifiedSolverQuestion(legacy), false);
  assert.equal(isVerifiedSolverQuestion({
    ...legacy,
    dataQuality: 'SOLVER_EXACT',
    solverProvenance: { verified: true },
  }), false);
  assert.equal(isVerifiedSolverQuestion({
    ...legacy,
    dataQuality: 'SOLVER_EXACT',
    solverProvenance: {
      verified: true,
      scenarioHash: 'hu_cash_BTN_100bb_AsKd2c',
      solverVersion: 'PioSOLVER-edge',
      solverBinaryChecksum: 'd'.repeat(64),
      machineId: 'M1',
      pipelineCommit: 'a'.repeat(40),
      manifestVersion: '4',
      manifestChecksum: 'b'.repeat(64),
      sourceArtifactChecksum: 'c'.repeat(64),
      qualityStatus: 'validated',
      auditedAt: '2026-08-31T17:00:00Z',
    },
  }), true);
});

test('both question endpoints reject solver-card fabrication and share subject routing', () => {
  const single = fs.readFileSync(path.join(ROOT, 'pages/api/training/get-question.js'), 'utf8');
  const batch = fs.readFileSync(path.join(ROOT, 'pages/api/training/batch-preload.js'), 'utf8');
  assert.match(single, /getGameScenarioConfig/);
  assert.match(single, /generated = await deterministicEngine\.generateBatch/);
  assert.match(single, /if \(cards\.length < 3 && isWarehouseSolver\) return null/);
  assert.match(single, /if \(isWarehouseSolver\) return null;[\s\S]*gtoFrequencies/);
  assert.match(batch, /if \(cards\.length < 3 && isWarehouseSolver\) return null/);
  assert.match(single, /'LEGACY_STRATEGY_ARCHIVE'\]\.includes\(sourceName\)/);
  assert.match(batch, /'LEGACY_STRATEGY_ARCHIVE'\]/);
  assert.match(batch, /No source distribution means there is no honest bar to/);
  assert.doesNotMatch(batch, /const dominance = 55/);
  assert.match(batch, /LEGACY_UNVERIFIED/);
  assert.doesNotMatch(batch, /String\(q\.engine_type \|\| ''\)\.toUpperCase\(\) === 'PIO'[\s\S]{0,120}isWarehouseSolver/);
});

test('multi-street progression follows only the exact exported continuation', async () => {
  const { MultiStreetHand } = await import('../src/engines/MultiStreetHandManager.js');
  const exactQuestion = {
    heroHand: 'AKs', heroCards: ['As', 'Ks'],
    scenario: {
      board: 'Qh 7d 2c', street: 'flop', pot: 5.5, stackDepth: 100,
      heroPosition: 'BTN', villainPosition: 'BB',
      solverActionUnits: 'chips', nextStreetContinuationAction: 'b412',
    },
  };
  const hand = new MultiStreetHand(exactQuestion);
  hand.recordAction('b412', 'best', 0);
  assert.equal(hand.currentStreet, 'flop');
  assert.equal(hand.pot, 13.74);

  const offTree = new MultiStreetHand(exactQuestion);
  offTree.recordAction('c', 'correct', 0);
  assert.equal(offTree.currentStreet, 'done');

  const authored = new MultiStreetHand({
    ...exactQuestion,
    scenario: { ...exactQuestion.scenario, nextStreetContinuationAction: null },
  });
  authored.recordAction('b75', 'best', 0);
  assert.equal(authored.currentStreet, 'done');

  const trainer = fs.readFileSync('src/hooks/useGTOTrainer.js', 'utf8');
  assert.match(trainer, /const continuationAction = scenario\.nextStreetContinuationAction \|\| null/);
  assert.match(trainer, /gameMode === 'full'[\s\S]{0,160}continuationAction[\s\S]{0,160}street === 'flop'/);
  assert.match(trainer, /if \(isMultiStreetActive \|\| multiStreetHandRef\.current\)[\s\S]{0,180}setIsMultiStreetActive\(false\)/);
});

test('curated fallback honors the exact game stack and excludes cached identities', async () => {
  const { generateCuratedPokerConceptBatch } = await import('../src/lib/training/curatedPokerConcepts.js');
  const first = generateCuratedPokerConceptBatch({
    gameId: 'spins-001', level: 1, count: 4,
    gameConfig: { pioGameType: 'spin_3max_chipev', pioStackDepth: 20 },
    spotTypes: ['rfi'], stackDepths: [20],
  });
  const second = generateCuratedPokerConceptBatch({
    gameId: 'spins-001', level: 1, count: 4,
    gameConfig: { pioGameType: 'spin_3max_chipev', pioStackDepth: 20 },
    spotTypes: ['rfi'], stackDepths: [20], seenIds: first.map((question) => question.id),
  });
  assert.equal(first.length, 4);
  assert.equal(second.length, 4);
  assert.deepEqual(new Set([...first, ...second].map((question) => question.id)).size, 8);
  assert.deepEqual([...first, ...second].every((question) => question.scenario.stackDepth === 20), true);
  const turnOnly = generateCuratedPokerConceptBatch({
    gameId: 'mtt-021', level: 1, count: 8,
    gameConfig: { pioGameType: 'mtt_postflop', pioStackDepth: 100 },
    spotTypes: ['cbet', 'turn_barrel', 'river_bluff'], targetStreet: 'turn',
  });
  assert.equal(turnOnly.length, 8);
  assert.equal(turnOnly.every((question) => question.scenario.street === 'turn'), true);
  assert.equal(turnOnly.every((question) => question.boardCards.length === 4), true);

  const engine = fs.readFileSync('src/engines/DeterministicGTOEngine.js', 'utf8');
  const batch = fs.readFileSync('pages/api/training/batch-preload.js', 'utf8');
  assert.match(engine, /stackDepths: Number\.isFinite\(Number\(gameConfig\?\.pioStackDepth\)\)/);
  assert.match(engine, /seenIds,/);
  assert.match(engine, /positions: targetPositions,[\s\S]{0,80}targetStreet,/);
  assert.match(batch, /const generationSeenIds = Array\.from\(new Set/);
  assert.match(batch, /seenIds: generationSeenIds/);
});

test('next-street API sends and validates exact cards, positions, and unrounded pot', () => {
  const trainer = fs.readFileSync('src/hooks/useGTOTrainer.js', 'utf8');
  const api = fs.readFileSync('pages/api/training/next-street.js', 'utf8');
  assert.match(trainer, /pot: hand\.pot\.toString\(\)/);
  assert.match(trainer, /heroPosition: hand\.heroPosition/);
  assert.match(trainer, /villainPosition: hand\.villainPosition/);
  assert.doesNotMatch(trainer, /pot: Math\.round\(hand\.pot\)\.toString\(\)/);
  assert.match(api, /Exact game, hand, board, and position state is required/);
  assert.match(api, /new Set\(exactCards\)\.size !== exactCards\.length/);
  assert.match(api, /toHandClass\(parsedHeroCards\) !== toHandClass\(String\(heroHand\)\)/);
  assert.match(api, /Invalid exact next-street state/);
  assert.doesNotMatch(api, /heroHand \|\| 'AKs'/);
});

test('chart hand classes render a matching legal representative combo', () => {
  assert.deepEqual(handNotationToRepresentativeCards('AKs'), ['As', 'Ks']);
  assert.deepEqual(handNotationToRepresentativeCards('AKo'), ['As', 'Kh']);
  assert.deepEqual(handNotationToRepresentativeCards('QQ'), ['Qs', 'Qh']);
  assert.deepEqual(
    handNotationToRepresentativeCards('AKs', ['As', 'Kh']),
    ['Ad', 'Kd'],
  );
  assert.equal(handNotationToRepresentativeCards('AhAh'), null);
  assert.equal(handNotationToRepresentativeCards('not-a-hand'), null);
});

test('audited push-fold charts are canonical preflop decisions with no board', async () => {
  const batchEndpoint = fs.readFileSync(
    path.join(ROOT, 'pages/api/training/batch-preload.js'),
    'utf8',
  );
  const { normalizeAuditedChartQuestion } = await import('../src/lib/training/solverDecisionEvidence.js');
  const question = {
    type: 'CHART',
    scenario: { street: 'flop', board: 'Qs 7d 2c' },
    boardCards: ['Qs', '7d', '2c'],
    options: [
      { id: 'push', text: 'Push', frequency: 35 },
      { id: 'fold', text: 'Fold', frequency: 65 },
    ],
  };
  normalizeAuditedChartQuestion(question);
  assert.equal(question.scenario.street, 'preflop');
  assert.equal(question.street, 'preflop');
  assert.deepEqual(question.scenario.boardCards, []);
  assert.deepEqual(question.boardCards, []);
  assert.match(batchEndpoint, /if \(String\(qData\.type \|\| ''\)\.toUpperCase\(\) === 'CHART'\)/);
  assert.doesNotMatch(batchEndpoint, /q\.engine_type[\s\S]{0,120}normalizeAuditedChartQuestion\(qData\)/);
});

test('runtime uses canonical auth and fails closed on progress API errors', () => {
  const levelSelector = fs.readFileSync(
    path.join(ROOT, 'src/components/training/LevelSelector.tsx'),
    'utf8'
  );
  const trainer = fs.readFileSync(path.join(ROOT, 'src/hooks/useGTOTrainer.js'), 'utf8');

  assert.match(levelSelector, /authToken = getSessionToken\(\)/);
  assert.doesNotMatch(levelSelector, /sb-kuklfnapbkmacvwxktbh-auth-token/);
  assert.match(trainer, /import \{ authedFetch, getAuthUser \} from '\.\.\/lib\/authUtils'/);
  assert.doesNotMatch(trainer, /\bfetch\(/);
  assert.match(trainer, /authedFetch\(`\/api\/training\/batch-preload\?\$\{params\}`\)/);
  assert.match(trainer, /if \(!response\.ok \|\| data\?\.success === false\)/);
  assert.match(trainer, /isCustomTrainerConfig\(trainerConfig\)/);
  assert.match(trainer, /level: selectedLevel/);
});

test('training hub keeps its signed-out primary action live and uses canonical login routing', () => {
  const hub = fs.readFileSync(path.join(ROOT, 'pages/hub/training.js'), 'utf8');

  assert.match(hub, /pathname: '\/auth\/login'/);
  assert.match(hub, /query: \{ redirect: '\/hub\/training' \}/);
  assert.doesNotMatch(hub, /pathname: '\/login'|query: \{ next: '\/hub\/training' \}/);
  assert.match(hub, /startDrill\(jarvisPick \|\| TRAINING_LIBRARY\[0\]\)/);
  assert.doesNotMatch(hub, /disabled=\{!jarvisPick\}/);
  assert.match(hub, /Build Better Decisions, One Hand At A Time\./);
  assert.match(hub, /label: 'Cash Games'/);
  assert.match(hub, /label: 'Mental Game'/);
});

test('per-question confusion analytics identify repeated wrong choices', () => {
  const result = buildQuestionConfusion([
    { game_id: 'mtt-001', question_id: 'q1', answer_id: 'fold', is_correct: false, ev_loss: 1.2, solver_verified: true, evidence_metadata: { optimalAction: 'push' }, answered_at: '2026-08-29T10:00:00Z' },
    { game_id: 'mtt-001', question_id: 'q1', answer_id: 'fold', is_correct: false, ev_loss: 0.8, solver_verified: true, evidence_metadata: { optimalAction: 'push' }, answered_at: '2026-08-29T11:00:00Z' },
    { game_id: 'mtt-001', question_id: 'q1', answer_id: 'push', is_correct: true, ev_loss: 0, solver_verified: true, evidence_metadata: { optimalAction: 'push' }, answered_at: '2026-08-29T12:00:00Z' },
  ]);
  assert.equal(result[0].attempts, 3);
  assert.equal(result[0].wrong, 2);
  assert.equal(result[0].confusionRate, 67);
  assert.deepEqual(result[0].mostCommonWrongAnswer, { answerId: 'fold', count: 2 });
  assert.equal(result[0].optimalAction, 'push');
});

test('both poker and psychology feedback expose canonical question reporting', () => {
  const router = fs.readFileSync(path.join(ROOT, 'src/components/training/GameUIRouter.jsx'), 'utf8');
  const table = fs.readFileSync(
    path.join(ROOT, 'src/components/training/games/UniversalDynamicTable.jsx'),
    'utf8'
  );
  const psychology = fs.readFileSync(
    path.join(ROOT, 'src/components/training/games/PsychologyTiltControlUI.jsx'),
    'utf8'
  );
  const questionCard = fs.readFileSync(
    path.join(ROOT, 'src/components/training/GTOQuestionCard.jsx'),
    'utf8'
  );
  const reportApi = fs.readFileSync(
    path.join(ROOT, 'pages/api/training/report-question.js'),
    'utf8'
  );

  assert.match(router, /<PsychologyTiltControlUI[\s\S]*gameId=\{gameId\}/);
  assert.match(psychology, /<GTOQuestionCard[\s\S]*gameId=\{gameId\}/);
  assert.match(table, /<TrainingQuestionReport[\s\S]*gameId=\{gameId\}/);
  assert.match(questionCard, /<TrainingQuestionReport gameId=\{gameId\} question=\{question\}/);
  assert.match(reportApi, /canonicalQuestionExists/);
  assert.match(reportApi, /user_id,game_id,question_id,reason/);
});

test('every poker game reaches the shared Club Arena table surface', () => {
  const arena = fs.readFileSync(path.join(ROOT, 'src/components/training/GodModeArena.jsx'), 'utf8');
  const router = fs.readFileSync(path.join(ROOT, 'src/components/training/GameUIRouter.jsx'), 'utf8');
  const table = fs.readFileSync(
    path.join(ROOT, 'src/components/training/games/UniversalDynamicTable.jsx'),
    'utf8'
  );

  assert.doesNotMatch(arena, /gameId === 'adv-011'|gameId === 'quiz-gauntlet'/);
  assert.match(router, /<UniversalDynamicTable[\s\S]*gameId=\{gameId\}/);
  assert.match(table, /data-training-ui="club-arena-table"/);
});

test('runtime matrix workers claim a game before yielding to page creation', () => {
  const audit = fs.readFileSync(
    path.join(ROOT, 'scripts/training-runtime-surface-audit.mjs'),
    'utf8'
  );
  const claimIndex = audit.indexOf('const game = queue.shift()');
  const pageIndex = audit.indexOf('const page = await context.newPage()', claimIndex);

  assert.ok(claimIndex >= 0, 'runtime matrix must claim a queued game');
  assert.ok(pageIndex > claimIndex, 'game ownership must be claimed before an awaited page creation');
  assert.doesNotMatch(audit, /auditGame\(page, queue\.shift\(\)/);
});

test('mobile arena launch remains tappable on the footerless safe-area edge', () => {
  const trainingCss = fs.readFileSync(path.join(ROOT, 'src/styles/worlds/training.css'), 'utf8');
  const notificationPrompt = fs.readFileSync(
    path.join(ROOT, 'src/components/notifications/FirstRunNotificationPrompt.jsx'),
    'utf8'
  );

  assert.match(
    trainingCss,
    /sp-arena-lobby__launch[\s\S]*bottom:\s*calc\(10px \+ env\(safe-area-inset-bottom, 0px\)\)/
  );
  assert.match(notificationPrompt, /'\/hub\/training\/arena'/);
  assert.match(notificationPrompt, /'\/hub\/club-arena'/);
});

test('campaign level maps fail open when remote enrichment stalls', () => {
  const levelSelector = fs.readFileSync(
    path.join(ROOT, 'src/components/training/LevelSelector.tsx'),
    'utf8'
  );

  assert.match(levelSelector, /const LEVEL_DATA_TIMEOUT_MS = 8_000/);
  assert.match(levelSelector, /Promise\.race\(\[request\(controller\.signal\), deadline\]\)/);
  assert.match(levelSelector, /fetch\(`\/api\/games\/\$\{gameId\}`,[\s\S]*?\{ signal \}/);
  assert.match(levelSelector, /authedFetch\(`\/api\/training\/progress\?userId=\$\{userId\}&gameId=\$\{gameId\}`,[\s\S]*?\{ signal \}/);
  assert.match(levelSelector, /getGameById\(gameId\)/);
  assert.match(levelSelector, /Progress fetch failed, showing default levels/);
  assert.match(levelSelector, /finally \{\s*setLoading\(false\)/);
});

test('campaign resume consumes game and progress bodies before aborting deadlines', () => {
  const selector = fs.readFileSync(path.join(ROOT, 'src/components/training/LevelSelector.tsx'), 'utf8');
  assert.match(selector, /withLevelDataDeadline\(async \(signal\) => \{[\s\S]*return gameRes\.json\(\);/);
  assert.match(selector, /withLevelDataDeadline\(async \(signal\) => \{[\s\S]*return progressRes\.json\(\);/);
  assert.doesNotMatch(selector, /const progressRes = await withLevelDataDeadline[\s\S]{0,180}progressRes\.json/);
});

test('batch preload retries transient upstream failures before single-question fallback', () => {
  const trainer = fs.readFileSync(path.join(ROOT, 'src/hooks/useGTOTrainer.js'), 'utf8');
  assert.match(trainer, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  assert.match(trainer, /response\.status === 429 \|\| response\.status >= 500/);
  assert.match(trainer, /if \(response\.ok \|\| !retryable \|\| attempt === 2\) break/);
  assert.match(trainer, /return fetchSingleQuestion\(effectiveLevel\)/);
});

test('offline packs cache real questions and are consumed by the arena', () => {
  const preloader = fs.readFileSync(path.join(ROOT, 'pages/hub/training/gto-preloader.js'), 'utf8');
  const trainer = fs.readFileSync(path.join(ROOT, 'src/hooks/useGTOTrainer.js'), 'utf8');

  assert.match(preloader, /batch-preload\?gameId=/);
  assert.match(preloader, /setOfflineQuestions\(tree\.gameId, level, payload\.questions\)/);
  assert.doesNotMatch(preloader, /Float32Array|binaryStub|Math\.random/);
  assert.match(trainer, /getOfflineQuestions\(gameId, effectiveLevel\)/);
  assert.match(trainer, /setOfflineQuestions\(gameId, effectiveLevel, data\.questions\)/);
});

test('reports and custom solve do not manufacture successful activity', () => {
  const reports = fs.readFileSync(path.join(ROOT, 'pages/hub/training/gto-reports.js'), 'utf8');
  const customSolve = fs.readFileSync(path.join(ROOT, 'pages/hub/training/custom-solve.js'), 'utf8');
  const solverApi = fs.readFileSync(path.join(ROOT, 'pages/api/training/solver-api.js'), 'utf8');

  assert.match(reports, /No GTO Report Data Yet/);
  assert.doesNotMatch(reports, /Demo data for illustration|Sample data is being displayed/);
  assert.match(customSolve, /data\?\.solution\?\.actions/);
  assert.doesNotMatch(customSolve, /gameId: 'custom-solve'|accuracy: 100/);
  assert.match(solverApi, /source: 'solved_spots_gold'/);
  assert.match(solverApi, /source: 'modeled_baseline'/);
  assert.doesNotMatch(solverApi, /from\('solver_queue'\)|status: 'queued'|queued for precise solving/);
});

test('Phase 11 progress reads the canonical session and daily result stores', () => {
  const challenges = fs.readFileSync(path.join(ROOT, 'pages/api/training/challenges.js'), 'utf8');
  const dailyApi = fs.readFileSync(path.join(ROOT, 'pages/api/training/hand-of-the-day.js'), 'utf8');
  const dailyPage = fs.readFileSync(path.join(ROOT, 'pages/hub/training/daily-challenge.js'), 'utf8');

  assert.match(challenges, /from\('training_sessions'\)/);
  assert.doesNotMatch(challenges, /from\('jarvis_training_sessions'\)/);
  assert.match(dailyApi, /selected_action/);
  assert.match(dailyApi, /completedDays/);
  assert.match(dailyPage, /data\.completion\.selected_action/);
  assert.match(dailyPage, /await authedFetch\('\/api\/training\/hand-of-the-day'/);
});

test('secondary analytics and community rooms never invent player results', () => {
  const positionMastery = fs.readFileSync(
    path.join(ROOT, 'pages/hub/training/position-mastery.js'),
    'utf8'
  );
  const studyGroup = fs.readFileSync(
    path.join(ROOT, 'pages/hub/training/study-group.js'),
    'utf8'
  );

  assert.match(positionMastery, /No Position-Tagged Decisions Have Been Recorded Yet/);
  assert.doesNotMatch(positionMastery, /Distribute overall accuracy|realistic position variance/);
  assert.match(studyGroup, /Open Hand History Upload/);
  assert.doesNotMatch(studyGroup, /loadDemoHand|local-demo|Solver says: CALL is \+1\.2 EV/);
});

test('non-graded tools cannot manufacture perfect training sessions', () => {
  const nonGradedRoutes = [
    'focus-timer',
    'gto-news',
    'hand-comparison',
    'qre-explorer',
    'rake-solutions',
    'risk-analyzer',
    'session-warmup',
  ];

  for (const route of nonGradedRoutes) {
    const source = fs.readFileSync(path.join(ROOT, `pages/hub/training/${route}.js`), 'utf8');
    assert.doesNotMatch(source, /api\/training\/save-session|training:session-complete/, `${route} writes false graded activity`);
  }

  const sessionApi = fs.readFileSync(path.join(ROOT, 'pages/api/training/save-session.js'), 'utf8');
  assert.match(sessionApi, /req\.body\.questionsAnswered/);
  assert.match(sessionApi, /req\.body\.questionsCorrect/);
  assert.match(sessionApi, /parsedHandsPlayed < 1/);
  assert.doesNotMatch(sessionApi, /req\.body\.gtowScore \?\? req\.body\.accuracy \?\? 100/);
});

test('the retired XP compatibility stub is absent from the active arena contract', () => {
  const trainer = fs.readFileSync(path.join(ROOT, 'src/hooks/useGTOTrainer.js'), 'utf8');
  const arena = fs.readFileSync(path.join(ROOT, 'src/components/training/GodModeArena.jsx'), 'utf8');
  const table = fs.readFileSync(
    path.join(ROOT, 'src/components/training/games/UniversalDynamicTable.jsx'),
    'utf8'
  );

  for (const source of [trainer, arena, table]) assert.doesNotMatch(source, /\btotalXP\b/);
});

test('training components do not export fabricated solver-result fixtures', () => {
  const feedback = fs.readFileSync(
    path.join(ROOT, 'src/components/training/FeedbackCard.tsx'),
    'utf8'
  );

  assert.doesNotMatch(feedback, /generateDemoSolverResult|DEMO DATA GENERATOR/);
});

test('journal, playbook, and tournament planner use isolated durable tool records', () => {
  const api = fs.readFileSync(path.join(ROOT, 'pages/api/training/tool-records.js'), 'utf8');
  const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260829121500_training_tool_records.sql'), 'utf8');
  const journal = fs.readFileSync(path.join(ROOT, 'pages/hub/training/mental-journal.js'), 'utf8');
  const playbook = fs.readFileSync(path.join(ROOT, 'pages/hub/training/my-playbook.js'), 'utf8');
  const planner = fs.readFileSync(path.join(ROOT, 'pages/hub/training/tournament-prep.js'), 'utf8');

  assert.match(migration, /create table if not exists public\.training_tool_records/i);
  assert.match(migration, /unique \(user_id, tool_id, record_key\)/i);
  assert.match(api, /\.eq\('user_id', user\.id\)/);
  assert.match(api, /onConflict: 'user_id,tool_id,record_key'/);
  assert.match(api, /\.maybeSingle\(\)/);
  assert.match(api, /if \(!saved\) throw new Error/);
  for (const source of [journal, playbook, planner]) {
    assert.match(source, /api\/training\/tool-records/);
    assert.doesNotMatch(source, /api\/training\/save-session|training:session-complete/);
  }
});

test('training writes fail closed without unsafe single-row coercion', () => {
  const messagesApi = fs.readFileSync(
    path.join(ROOT, 'pages/api/training/study-groups/[groupId]/messages.js'),
    'utf8'
  );
  const toolRecordsApi = fs.readFileSync(
    path.join(ROOT, 'pages/api/training/tool-records.js'),
    'utf8'
  );

  for (const source of [messagesApi, toolRecordsApi]) {
    assert.doesNotMatch(source, /\.single\(\)/);
    assert.match(source, /\.maybeSingle\(\)/);
  }
  assert.match(messagesApi, /error \|\| !message/);
});

test('retired heuristic trainers route to the matching authored Club Arena games', () => {
  const routes = {
    'bounty-trainer': 'mtt-005',
    'icm-final-table': 'mtt-004',
    'pot-geometry': 'adv-011',
    'range-advisor': 'adv-004',
    'player-profiles': 'adv-015',
    'three-way-postflop': 'cash-016',
    'frequency-locking': 'adv-005',
    'bluff-catcher': 'cash-005',
    'spr-trainer': 'adv-011',
    'preflop-advisor': 'cash-001',
    'villain-range': 'adv-008',
    'mixed-strategy-lab': 'mixed-strategy-lab',
    'ev-trainer': 'adv-006',
  };

  for (const [route, gameId] of Object.entries(routes)) {
    const source = fs.readFileSync(path.join(ROOT, `pages/hub/training/${route}.js`), 'utf8');
    assert.match(source, new RegExp(`arena/${gameId.replace('-', '\\-')}\\?level=1`));
    assert.doesNotMatch(source, /Math\.random|save-session|session-complete/);
  }
});

test('legacy simulated reports and play surfaces route to verified data or Club Arena', () => {
  const routes = {
    'range-explorer': '/hub/training/preflop-charts',
    'gto-scorecard': '/hub/training/gto-reports',
    'performance-heatmap': '/hub/training/gto-reports',
    'play-mode': '/hub/training/arena/cash-001?level=1',
  };

  for (const [route, href] of Object.entries(routes)) {
    const source = fs.readFileSync(path.join(ROOT, `pages/hub/training/${route}.js`), 'utf8');
    assert.ok(source.includes(`href="${href}"`), `${route} must route to ${href}`);
    assert.doesNotMatch(source, /Math\.random|simulate position|heuristic GTO|GTO_BASELINES/);
  }

  const godMode = fs.readFileSync(path.join(ROOT, 'src/components/training/GodModeArena.jsx'), 'utf8');
  assert.doesNotMatch(godMode, /CustomSpotDrillBuilder|GTOReportsDashboard|AggregatedFlopReport|PopupHUDOverlay|ActionFilterAnalyzer|EVComparisonTool|MassDataAnalysis|MarkTheSpot|StrategyNodeInspector/);
  assert.match(godMode, /source="Solved Spots Gold"/);
  assert.match(godMode, /source="Authenticated Training Sessions"/);
  assert.match(godMode, /source="Authenticated Hand History"/);
  assert.match(godMode, /source="Production Integration State"/);
});
