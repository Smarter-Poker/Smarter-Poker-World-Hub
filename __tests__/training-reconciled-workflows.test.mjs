import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  createSignedTrainingDuelToken,
  verifyTrainingDuelToken,
} from '../src/lib/training/gradingReceipt.mjs';
import {
  generateCuratedPokerConceptBatch,
} from '../src/lib/training/curatedPokerConcepts.js';
import {
  normalizeTrainingSessionConfig,
  normalizeTrainingVariant,
} from '../src/lib/training/sessionConfigContract.mjs';
import {
  evaluateTrainingSpotWithHorseBrain,
  validateDealAndPotLimitBounds,
} from '../src/lib/training/horseBrainTrainingAdapter.js';
import {
  resolveSyncedHandForTrainingDrill,
} from '../src/lib/training/syncedHandDrillResolver.js';
import {
  isTrainingQuestionCampaignEligible,
} from '../src/lib/training/trainingAttemptDelivery.mjs';
import {
  buildCustomTrainingArenaHref,
} from '../src/lib/training/customTrainingLaunchContract.mjs';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('PLO selector normalizes Holdem, PLO4, PLO5, and PLO6 and deals exact hole card counts with legal actions', () => {
  assert.equal(normalizeTrainingVariant('nlh'), 'nlh');
  assert.equal(normalizeTrainingVariant('plo4'), 'plo4');
  assert.equal(normalizeTrainingVariant('plo5'), 'plo5');
  assert.equal(normalizeTrainingVariant('plo6'), 'plo6');

  const sessionCfg = normalizeTrainingSessionConfig({
    variant: 'plo5',
    duelToken: 'signed.duel.token',
  });
  assert.equal(sessionCfg.variant, 'plo5');
  assert.equal(sessionCfg.duelToken, 'signed.duel.token');

  const variants = [
    { key: 'nlh', expectedCards: 2, expectedStructure: 'no_limit' },
    { key: 'plo4', expectedCards: 4, expectedStructure: 'pot_limit' },
    { key: 'plo5', expectedCards: 5, expectedStructure: 'pot_limit' },
    { key: 'plo6', expectedCards: 6, expectedStructure: 'pot_limit' },
  ];

  for (const { key, expectedCards, expectedStructure } of variants) {
    const [q] = generateCuratedPokerConceptBatch({
      gameId: 'cash-005',
      level: 1,
      count: 1,
      gameConfig: {
        pioGameType: 'plo_6max',
        pioStackDepth: 100,
        variant: key,
      },
      targetStreet: 'flop',
    });
    assert.ok(q, `Expected curated question for variant ${key}`);
    assert.equal(q.heroCards.length, expectedCards, `Expected ${expectedCards} hole cards for ${key}`);
    assert.equal(q.scenario.variant, key);
    assert.equal(q.scenario.holeCardCount, expectedCards);
    assert.equal(q.scenario.bettingStructure, expectedStructure);

    // Ensure zero card collisions between heroCards and boardCards
    const allDealt = [...q.heroCards, ...(q.boardCards || [])].map((c) => c.toUpperCase());
    assert.equal(new Set(allDealt).size, allDealt.length, `Duplicate card dealt in ${key}`);

    if (expectedStructure === 'pot_limit') {
      assert.ok(
        q.options.some((opt) => /Pot/i.test(opt.text)),
        `Expected Pot-Limit legal action sizing in ${key}`,
      );
    }
  }
});

test('Signed Asynchronous Duel tokens lock identical scenario sequences and reject tampering', () => {
  const secret = 'unit-test-duel-secret-key-2026-smarter-poker';
  const questionIds = ['q_duel_1', 'q_duel_2', 'q_duel_3', 'q_duel_4', 'q_duel_5'];
  const token = createSignedTrainingDuelToken({
    duelId: 'duel_unit_01',
    gameId: 'mtt-015',
    level: 2,
    variant: 'plo4',
    targetHands: 5,
    questionIds,
    challengerId: 'user_challenger_1',
    challengerName: 'HeroChallenger',
    challengerAttemptId: 'attempt_challenger_1',
    secret,
  });

  const verified = verifyTrainingDuelToken(token, { secret });
  assert.ok(verified, 'Valid signed duel token must verify');
  assert.equal(verified.duelId, 'duel_unit_01');
  assert.equal(verified.gameId, 'mtt-015');
  assert.equal(verified.level, 2);
  assert.equal(verified.variant, 'plo4');
  assert.deepEqual(verified.questionIds, questionIds);
  assert.equal(verified.challengerAttemptId, 'attempt_challenger_1');

  // Tamper signature
  const tampered = `${token.slice(0, -4)}xxxx`;
  assert.equal(verifyTrainingDuelToken(tampered, { secret }), null);

  // Wrong secret
  assert.equal(verifyTrainingDuelToken(token, { secret: 'wrong-secret' }), null);
});

test('Tournament and opponent scenario telemetry attaches authoritative PKO, ICM, and Villain HUD values', () => {
  const pkoBatch = generateCuratedPokerConceptBatch({
    gameId: 'mtt-005',
    level: 1,
    count: 3,
    gameConfig: { pioGameType: 'mtt_pko', pioStackDepth: 40 },
  });
  assert.equal(pkoBatch.length, 3);
  for (const q of pkoBatch) {
    assert.equal(q.scenario.isPKO, true);
    assert.ok(Number.isFinite(q.scenario.bountyBb) && q.scenario.bountyBb > 0);
    assert.ok(Number.isFinite(q.scenario.bubbleFactor) && q.scenario.bubbleFactor > 1);
    assert.ok(typeof q.scenario.payoutPressure === 'string' && q.scenario.payoutPressure.length > 0);
  }

  const exploitBatch = generateCuratedPokerConceptBatch({
    gameId: 'adv-003',
    level: 1,
    count: 3,
    gameConfig: { pioGameType: 'cash_6max', pioStackDepth: 100 },
  });
  assert.equal(exploitBatch.length, 3);
  for (const q of exploitBatch) {
    assert.ok(q.scenario.villainStats, 'Expected villainStats on exploitative game');
    assert.ok(Number.isFinite(q.scenario.villainStats.vpip));
    assert.ok(Number.isFinite(q.scenario.villainStats.pfr));
    assert.ok(Number.isFinite(q.scenario.villainStats.threeBet));
  }
});

test('Live Hand Sync, Multi-Table Focus, and Telemetry UI contracts are wired end-to-end', () => {
  const auditApi = read('pages/api/training/audit-hand-history.js');
  assert.match(auditApi, /PARTICIPANT_ACCESS_DENIED/);
  assert.match(auditApi, /buildDrillHrefForHand/);

  const liveHudSync = read('pages/hub/training/live-hud-sync.js');
  assert.match(liveHudSync, /data-live-hand-sync-panel="true"/);
  assert.match(liveHudSync, /data-train-this-hand="true"/);

  const handHistoryUpload = read('pages/hub/training/hand-history-upload.js');
  assert.match(handHistoryUpload, /data-train-this-hand="true"/);

  const multiTable = read('pages/hub/training/multi-table.js');
  assert.match(multiTable, /onTableStateChange=\{handleTableStateChange\}/);
  assert.match(multiTable, /data-multitable-focused/);
  assert.match(multiTable, /data-multitable-status/);

  const universalTable = read('src/components/training/games/UniversalDynamicTable.jsx');
  assert.match(universalTable, /if \(!isFocused\) return;/);
  assert.match(universalTable, /data-training-variant-selector="true"/);
  assert.match(universalTable, /data-telemetry-bounty/);
  assert.match(universalTable, /data-telemetry-icm/);
  assert.match(universalTable, /data-telemetry-hud/);
  assert.match(universalTable, /data-matrix-provenance=/);
  assert.match(universalTable, /data-training-attempt-coaching="true"/);
});

test('Omaha 2-hole + 3-board rule, duplicate-card rejection, Pot-Limit sizing, and Horse Brain engine routing', () => {
  // 1. Duplicate cards between hole and board must be rejected
  const dupCheck = validateDealAndPotLimitBounds({
    variant: 'plo4',
    street: 'flop',
    heroCards: ['As', 'Ks', 'Qs', 'Js'],
    boardCards: ['As', '7d', '2c'],
  });
  assert.equal(dupCheck.ok, false);
  assert.equal(dupCheck.code, 'DUPLICATE_CARD_DETECTED');

  // 2. Omaha 4-spade hole hand on a 2-spade board MUST NOT evaluate as a flush (requires 2 hole + 3 board)
  const fourSpadesTwoBoard = evaluateTrainingSpotWithHorseBrain({
    variant: 'plo4',
    street: 'turn',
    heroCards: ['As', 'Ks', 'Qs', 'Js'],
    boardCards: ['9s', '2s', '7d', '4c'],
    heroPosition: 'BTN',
    villainPosition: 'BB',
    pot: 12,
    stackDepth: 100,
    facingBetBb: 0,
  });
  assert.equal(fourSpadesTwoBoard.brainEvaluation.engineModule, 'plo-core.js');
  assert.notEqual(
    fourSpadesTwoBoard.madeHandCategory,
    'flush',
    '4 spades in hand + 2 spades on board is NOT a flush in Omaha (must use exactly 2 hole + 3 board)',
  );

  // 3. Omaha 2-spade hole hand on a 3-spade board MUST evaluate as a flush using exactly 2 hole + 3 board
  const twoSpadesThreeBoard = evaluateTrainingSpotWithHorseBrain({
    variant: 'plo4',
    street: 'flop',
    heroCards: ['As', 'Ks', 'Qd', 'Jc'],
    boardCards: ['9s', '5s', '2s'],
    heroPosition: 'BTN',
    villainPosition: 'BB',
    pot: 12,
    stackDepth: 100,
    facingBetBb: 0,
  });
  assert.equal(twoSpadesThreeBoard.brainEvaluation.engineModule, 'plo-core.js');
  assert.ok(
    /flush/i.test(twoSpadesThreeBoard.madeHandCategory),
    `Expected flush category for 2 hole spades + 3 board spades, got ${twoSpadesThreeBoard.madeHandCategory}`,
  );
  assert.equal(twoSpadesThreeBoard.brainEvaluation.omahaBestTwoHole.length, 2);
  assert.equal(twoSpadesThreeBoard.brainEvaluation.omahaBestThreeBoard.length, 3);

  // 4. Pot-Limit max bet formula: pot + 2 * call
  const plUnopened = validateDealAndPotLimitBounds({
    variant: 'plo4',
    street: 'flop',
    heroCards: ['As', 'Ks', 'Qd', 'Jc'],
    boardCards: ['9s', '5s', '2s'],
    pot: 12,
    toCall: 0,
    effectiveStack: 100,
  });
  assert.equal(plUnopened.potLimitBounds.maxPotBetOrRaise, 12);
  const plFacingBet = validateDealAndPotLimitBounds({
    variant: 'plo4',
    street: 'flop',
    heroCards: ['As', 'Ks', 'Qd', 'Jc'],
    boardCards: ['9s', '5s', '2s'],
    pot: 12,
    toCall: 6,
    effectiveStack: 100,
  });
  assert.equal(plFacingBet.potLimitBounds.maxPotBetOrRaise, 24); // 12 + 2*6 = 24 BB

  // 5. PLO5 and PLO6 route to plo5-brain.js and plo6-brain.js
  const plo5Eval = evaluateTrainingSpotWithHorseBrain({
    variant: 'plo5',
    street: 'flop',
    heroCards: ['As', 'Ks', 'Qs', 'Jd', 'Tc'],
    boardCards: ['9s', '8s', '2d'],
    pot: 10,
    stackDepth: 100,
  });
  assert.equal(plo5Eval.brainEvaluation.engineModule, 'plo5-brain.js');

  const plo6Eval = evaluateTrainingSpotWithHorseBrain({
    variant: 'plo6',
    street: 'flop',
    heroCards: ['As', 'Ks', 'Qs', 'Jd', 'Tc', '9h'],
    boardCards: ['8s', '7s', '2d'],
    pot: 10,
    stackDepth: 100,
  });
  assert.equal(plo6Eval.brainEvaluation.engineModule, 'plo6-brain.js');

  // 6. ICM, PKO, and Villain HUD input sensitivity
  const mttEval = evaluateTrainingSpotWithHorseBrain({
    variant: 'nlh',
    street: 'flop',
    heroCards: ['As', 'Kd'],
    boardCards: ['Qs', '7d', '2c'],
    pot: 8,
    stackDepth: 35,
    facingBetBb: 4,
    isMTT: true,
    isPKO: true,
    bountyBb: 15,
    bubbleFactor: 1.85,
    villainStats: { vpip: 46, pfr: 12, threeBet: 3, archetype: 'Calling Station' },
  });
  assert.equal(mttEval.brainEvaluation.engineModule, 'holdem-brain.js');
  assert.ok(mttEval.brainEvaluation.icmAdjustment, 'Expected ICM adjustment metadata');
  assert.ok(mttEval.brainEvaluation.pkoBountyAdjustment, 'Expected PKO bounty adjustment metadata');
  assert.ok(mttEval.brainEvaluation.hudExploitAdjustment, 'Expected Villain HUD exploit metadata');
  assert.match(mttEval.explanation, /ICM \/ Payout Pressure/i);
  assert.match(mttEval.explanation, /PKO Bounty/i);
  assert.match(mttEval.explanation, /Calling Station/i);
});

test('Train This Hand resolves strictly from server storage, enforces participant-only access, and ignores URL tampering', async () => {
  const mockHandRow = {
    id: 'hand-server-auth-901',
    user_id: 'user-owner-1',
    tool_id: 'synced-hand-history',
    record_key: 'hand-server-auth-901',
    data: {
      handId: 'hand-server-auth-901',
      heroCards: ['As', 'Kd'],
      board: 'Qs 7d 2c',
      heroPosition: 'BTN',
      villainPosition: 'BB',
      street: 'flop',
      variant: 'nlh',
      pot: 6.5,
      stackDepth: 100,
    },
  };

  function createMockSupabase(row) {
    return {
      from(table) {
        return {
          select() {
            return {
              eq(_col, val) {
                if (table === 'training_tool_records' && val === 'synced-hand-history') {
                  return {
                    order() {
                      return {
                        limit() {
                          return Promise.resolve({ data: row ? [row] : [], error: null });
                        },
                      };
                    },
                  };
                }
                return {
                  maybeSingle() {
                    if (table === 'training_tool_records' && row && val === row.id) {
                      return Promise.resolve({ data: row, error: null });
                    }
                    return Promise.resolve({ data: null, error: null });
                  },
                };
              },
              limit() {
                return {
                  eq() {
                    return Promise.resolve({ data: [], error: null });
                  },
                };
              },
            };
          },
        };
      },
    };
  }

  // 1. Authorized owner resolves server-stored AsKd on Qs 7d 2c (even if URL had tampered params)
  // Omit solverPolicyService so default dynamic SolverPolicyService attaches curated policy seals
  const ownerResult = await resolveSyncedHandForTrainingDrill({
    supabase: createMockSupabase(mockHandRow),
    syncedHandId: 'hand-server-auth-901',
    userId: 'user-owner-1',
    gameId: 'cash-002',
    level: 1,
  });
  assert.equal(ownerResult.ok, true);
  assert.equal(ownerResult.questions.length, 10);
  assert.deepEqual(ownerResult.questions[0].heroCards, ['As', 'Kd']);
  assert.deepEqual(ownerResult.questions[0].boardCards, ['Qs', '7d', '2c']);
  assert.equal(ownerResult.questions[0].scenario.syncedHandId, 'hand-server-auth-901');
  assert.equal(ownerResult.questions[0].solverPolicy?.kind, 'curated');
  assert.equal(
    isTrainingQuestionCampaignEligible(ownerResult.questions[0]),
    true,
    'Synced hand primary question must pass campaign eligibility check',
  );
  assert.equal(ownerResult.syncedHand.participantVerified, true);
  assert.equal(ownerResult.syncedHand.optimalAction, undefined, 'Pre-answer syncedHand metadata must not leak optimalAction');

  // 2. Non-participant User B is rejected with 403 PARTICIPANT_ACCESS_DENIED
  const forbiddenResult = await resolveSyncedHandForTrainingDrill({
    supabase: createMockSupabase(mockHandRow),
    syncedHandId: 'hand-server-auth-901',
    userId: 'user-intruder-2',
    gameId: 'cash-001',
    level: 1,
  });
  assert.equal(forbiddenResult.ok, false);
  assert.equal(forbiddenResult.status, 403);
  assert.equal(forbiddenResult.code, 'PARTICIPANT_ACCESS_DENIED');

  // 3. Missing hand is rejected with 404 HAND_NOT_FOUND
  const missingResult = await resolveSyncedHandForTrainingDrill({
    supabase: createMockSupabase(null),
    syncedHandId: 'hand-does-not-exist',
    userId: 'user-owner-1',
    gameId: 'cash-001',
    level: 1,
  });
  assert.equal(missingResult.ok, false);
  assert.equal(missingResult.status, 404);
  assert.equal(missingResult.code, 'HAND_NOT_FOUND');

  // 4. Unsupported/corrupted hand is rejected with 422 HAND_DRILL_UNSUPPORTED
  const corruptedRow = {
    ...mockHandRow,
    id: 'hand-corrupted-902',
    record_key: 'hand-corrupted-902',
    data: {
      handId: 'hand-corrupted-902',
      heroCards: ['As', 'As'], // Duplicate card
      board: 'Qs 7d 2c',
      street: 'flop',
      variant: 'nlh',
    },
  };
  const unsupportedResult = await resolveSyncedHandForTrainingDrill({
    supabase: createMockSupabase(corruptedRow),
    syncedHandId: 'hand-corrupted-902',
    userId: 'user-owner-1',
    gameId: 'cash-001',
    level: 1,
  });
  assert.equal(unsupportedResult.ok, false);
  assert.equal(unsupportedResult.status, 422);
  assert.equal(unsupportedResult.code, 'HAND_DRILL_UNSUPPORTED');

  // 5. Verify audit-hand-history.js emits clean server-authoritative URL without client card params
  const auditApi = read('pages/api/training/audit-hand-history.js');
  assert.doesNotMatch(auditApi, /syncedHeroCards/);
  assert.doesNotMatch(auditApi, /syncedBoard/);
  assert.match(auditApi, /source:\s*'live-hand-sync'/);
  assert.match(auditApi, /syncedHandId:/);

  // 6. Verify tool-records.js requires both players to reach requiredHands (10/10) before marking duel completed
  const toolRecordsApi = read('pages/api/training/tool-records.js');
  assert.match(toolRecordsApi, /challengerSummary\.handsAnswered >= requiredHands/);
  assert.match(toolRecordsApi, /opponentSummary\.handsAnswered >= requiredHands/);

  // 7. Phase 2 Upgrades: Equity Calculator PLO4/PLO5/PLO6 2-hole+3-board evaluator, Custom Drill Builder variants, and Hand Lab Brain Panel
  const plo5Href = buildCustomTrainingArenaHref(
    { format: 'cash', variant: 'plo5', streets: ['flop'] },
    'drill-builder',
  );
  assert.equal(plo5Href, '/hub/training/arena/cash-005?level=1&source=drill-builder&variant=plo5');

  const equityApi = read('pages/api/training/equity.js');
  assert.match(equityApi, /function bestOmaha5/);
  assert.match(equityApi, /horseBrainAnalysis/);

  const equityCalcUi = read('pages/hub/training/equity-calculator.js');
  assert.match(equityCalcUi, /data-equity-variant-selector="true"/);
  assert.match(equityCalcUi, /data-equity-brain-panel="true"/);

  const drillBuilderUi = read('pages/hub/training/drill-builder.js');
  assert.match(drillBuilderUi, /data-drill-variant-selector="true"/);

  const handLabUi = read('pages/hub/training/hand-lab.js');
  assert.match(handLabUi, /data-handlab-brain-panel="true"/);
});
