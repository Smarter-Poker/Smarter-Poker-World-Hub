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
import {
  parseStakesToBlinds,
  convertBbToTableChips,
  formatTableDisplayUnit,
  computeMainAndSidePots,
  computeClubArenaParityState,
  applyClubArenaAction,
  evaluateCustomRaiseSizing,
} from '../src/lib/training/clubArenaTableParity.js';
import {
  analyzeVerifiedTrainingWeaknesses,
} from '../src/lib/training/weaknessAnalysis.mjs';

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
    for (const targetStreet of ['preflop', 'flop']) {
      const [q] = generateCuratedPokerConceptBatch({
        gameId: 'cash-005',
        level: 1,
        count: 1,
        gameConfig: {
          pioGameType: 'plo_6max',
          pioStackDepth: 100,
          variant: key,
        },
        targetStreet,
      });
      assert.ok(q, `Expected curated question for variant ${key} on ${targetStreet}`);
      assert.equal(q.heroCards.length, expectedCards, `Expected ${expectedCards} hole cards for ${key}`);
      assert.equal(q.scenario.variant, key);
      assert.equal(q.scenario.holeCardCount, expectedCards);
      assert.equal(q.scenario.bettingStructure, expectedStructure);
      assert.doesNotMatch(String(q.scenario.madeHandCategory || ''), /undefined/i, `madeHandCategory must not contain undefined in ${key} ${targetStreet}`);
      assert.doesNotMatch(String(q.explanation || ''), /undefined/i, `explanation must not contain undefined in ${key} ${targetStreet}`);
      if (key === 'nlh' && targetStreet === 'preflop' && q.heroCards[0][0] !== q.heroCards[1][0]) {
        assert.doesNotMatch(String(q.scenario.madeHandCategory || ''), /^Pocket Pair/i, 'Non-paired NLH preflop hand must not be labeled Pocket Pair');
      }

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
  assert.doesNotMatch(handHistoryUpload, /syncedHeroCards/);
  assert.doesNotMatch(handHistoryUpload, /syncedBoard/);

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
    { format: 'cash', variant: 'plo5', streets: ['flop'], positions: ['BB'] },
    'weakness-scanner',
  );
  assert.equal(plo5Href, '/hub/training/arena/cash-005?level=1&source=weakness-scanner&variant=plo5&street=flop&position=BB');

  const equityApi = read('pages/api/training/equity.js');
  assert.match(equityApi, /function bestOmaha5/);
  assert.match(equityApi, /horseBrainAnalysis/);

  const equityCalcUi = read('pages/hub/training/equity-calculator.js');
  assert.match(equityCalcUi, /data-equity-variant-selector="true"/);
  assert.match(equityCalcUi, /data-equity-brain-panel="true"/);
  assert.match(equityCalcUi, /data-equity-seq=/);

  const drillBuilderUi = read('pages/hub/training/drill-builder.js');
  assert.match(drillBuilderUi, /data-drill-variant-selector="true"/);

  const handLabUi = read('pages/hub/training/hand-lab.js');
  assert.match(handLabUi, /data-handlab-brain-panel="true"/);

  // 8. Phase 3 Upgrades: 1:1 Club Arena Table Play Clone Parity + Multi-Table Variants + Specialty Brain Panels + Study Tools Server Sync
  const universalTable = read('src/components/training/games/UniversalDynamicTable.jsx');
  assert.match(universalTable, /data-club-arena-action-bar="true"/);
  assert.match(universalTable, /data-club-arena-raise-panel="true"/);
  assert.match(universalTable, /data-club-arena-raise-slider="true"/);
  assert.match(universalTable, /data-club-arena-preset=/);
  assert.match(universalTable, /data-club-arena-raise-confirm="true"/);
  assert.match(universalTable, /data-pot-display-mode-toggle="true"/);
  assert.match(universalTable, /data-display-toggle-source="toolbar"/);
  assert.match(universalTable, /data-display-toggle-source="pot-pill"/);
  assert.match(universalTable, /data-display-toggle-source="seat-stack"/);
  assert.match(universalTable, /data-display-toggle-source="settings"/);
  assert.match(universalTable, /data-training-stakes-badge="true"/);
  assert.match(universalTable, /data-custom-sizing-disclosure="true"/);
  assert.match(universalTable, /data-club-arena-pot-pill="true"/);
  assert.match(universalTable, /data-club-arena-street-pot-pill="true"/);
  assert.match(universalTable, /data-seat-stack-display="true"/);

  const multiTableUi = read('pages/hub/training/multi-table.js');
  assert.match(multiTableUi, /data-multitable-variant-selector="true"/);
  assert.match(multiTableUi, /tool_id:\s*'multi-table'/);

  const finalTableSimUi = read('pages/hub/training/final-table-sim.js');
  assert.match(finalTableSimUi, /data-icm-brain-panel="true"/);
  assert.match(finalTableSimUi, /evaluateTrainingSpotWithHorseBrain/);
  assert.match(finalTableSimUi, /tool_id:\s*'final-table-sim'/);

  const icmSimUi = read('pages/hub/training/icm-simulator.js');
  assert.match(icmSimUi, /data-icm-brain-panel="true"/);
  assert.match(icmSimUi, /evaluateTrainingSpotWithHorseBrain/);
  assert.match(icmSimUi, /tool_id:\s*'icm-simulator'/);

  const weaknessScannerUi = read('pages/hub/training/weakness-scanner.js');
  assert.match(weaknessScannerUi, /data-leak-brain-panel="true"/);
  assert.match(weaknessScannerUi, /data-fix-top-leak-cta="true"/);
  assert.match(weaknessScannerUi, /data-leak-basis=/);
  assert.match(weaknessScannerUi, /data-leak-sample-count=/);
  assert.match(weaknessScannerUi, /data-leak-ev-loss-bb=/);
  assert.match(weaknessScannerUi, /data-exploit-tendency-selector="true"/);

  const spotTrainerUi = read('pages/hub/training/spot-trainer.js');
  assert.match(spotTrainerUi, /data-pot-geometry-simulator="true"/);

  const flashcardsUi = read('pages/hub/training/flashcards.js');
  assert.match(flashcardsUi, /tool_id:\s*'flashcards'/);

  const quizBuilderUi = read('pages/hub/training/quiz-builder.js');
  assert.match(quizBuilderUi, /tool_id:\s*'quiz-builder'/);

  const focusTimerUi = read('pages/hub/training/focus-timer.js');
  assert.match(focusTimerUi, /tool_id:\s*'focus-timer'/);
  assert.match(focusTimerUi, /tool_id=focus-timer/);

  const sessionWarmupUi = read('pages/hub/training/session-warmup.js');
  assert.match(sessionWarmupUi, /tool_id:\s*'session-warmup'/);
  assert.match(sessionWarmupUi, /tool_id=session-warmup/);

  const sessionNotesUi = read('pages/hub/training/session-notes.js');
  assert.match(sessionNotesUi, /tool_id:\s*'session-notes'/);
  assert.match(sessionNotesUi, /tool_id=session-notes/);

  const glossaryUi = read('pages/hub/training/glossary.js');
  assert.match(glossaryUi, /tool_id:\s*'glossary'/);
  assert.match(glossaryUi, /tool_id=glossary/);

  const gtoNewsUi = read('pages/hub/training/gto-news.js');
  assert.match(gtoNewsUi, /tool_id:\s*'gto-news'/);
  assert.match(gtoNewsUi, /tool_id=gto-news/);
});

test('Decision-level Club Arena parity: short all-in reopening rules, pot-limit raise math, multiway side pots, stakes-aware chip units, and custom raise disclosure', () => {
  // 1. Stakes-aware chip units (0.25/0.50 -> bigBlind = 0.50)
  const parsedStakes = parseStakesToBlinds('0.25/0.50');
  assert.equal(parsedStakes.hasExplicitStakes, true);
  assert.equal(parsedStakes.smallBlind, 0.25);
  assert.equal(parsedStakes.bigBlind, 0.5);
  assert.equal(convertBbToTableChips(10, '0.25/0.50'), 5);
  assert.equal(formatTableDisplayUnit(10, 'chips', '0.25/0.50'), '5 Chips');
  assert.equal(formatTableDisplayUnit(10, 'bb', '0.25/0.50'), '10 BB');

  // 2. Short all-in that does NOT reopen raising when hero already acted
  // Hero opened to 3 BB, Villain A raised to 10 BB (full raise increment = 7 BB), Villain B shoved all-in for 14 BB (increment = 4 BB < 7 BB)
  const shortAllInState = computeClubArenaParityState({
    variant: 'nlh',
    street: 'preflop',
    stakes: '1/2',
    potBb: 27,
    heroPosition: 'BTN',
    heroStackBb: 87,
    heroCommittedBb: 3,
    facingBetBb: 14,
    previousBetBb: 10,
    lastFullRaiseIncrementBb: 7,
    heroAlreadyActedOnStreet: true,
    seats: [
      { position: 'BTN', stackRemainingBb: 87, committedBb: 3, allIn: false, folded: false },
      { position: 'SB', stackRemainingBb: 90, committedBb: 10, allIn: false, folded: false },
      { position: 'BB', stackRemainingBb: 0, committedBb: 14, allIn: true, folded: false },
    ],
  });
  assert.equal(shortAllInState.isShortAllInRaise, true);
  assert.equal(shortAllInState.reopensAction, false, 'Short all-in increment (4 BB < 7 BB) must not reopen raising for hero who already acted');
  assert.deepEqual(shortAllInState.legalActions, ['fold', 'call']);
  assert.equal(shortAllInState.callAmountBb, 11);

  // Applying call transitions to next actor SB who still faces the 4 BB increment
  const afterHeroCall = applyClubArenaAction(shortAllInState, { type: 'call' });
  assert.equal(afterHeroCall.additionalPutInBb, 11);
  assert.equal(afterHeroCall.submittedTotalBb, 14);
  assert.equal(afterHeroCall.resultingStacks.BTN, 76);
  assert.equal(afterHeroCall.nextActor, 'SB');

  // 3. Pot-Limit raise facing a prior bet: maxRaiseToBb = potBeforeCall + 2 * callAmount + heroCommitted
  const ploFacingBet = computeClubArenaParityState({
    variant: 'plo5',
    street: 'flop',
    stakes: '0.25/0.50',
    potBb: 12,
    deadPotBb: 12,
    heroPosition: 'BTN',
    heroStackBb: 100,
    heroCommittedBb: 0,
    facingBetBb: 8,
    previousBetBb: 0,
    lastFullRaiseIncrementBb: 8,
    heroAlreadyActedOnStreet: false,
  });
  assert.equal(ploFacingBet.isPotLimit, true);
  assert.equal(ploFacingBet.minRaiseToBb, 16); // 8 + 8
  assert.equal(ploFacingBet.maxRaiseToBb, 36); // currentPotBeforeCallBb (12 dead + 8 villain bet = 20) + 2 * 8 = 36 BB
  assert.deepEqual(ploFacingBet.legalActions, ['fold', 'call', 'raise']);

  // 4. Multiway split / main + side pot calculation
  // Note: when 3 players commit 25, 60, and 60 (or 4 players commit 25, 60, 100, 100), all pots are contested
  const pots = computeMainAndSidePots([
    { position: 'SB', committedBb: 25, stackRemainingBb: 0, allIn: true, folded: false },
    { position: 'BB', committedBb: 60, stackRemainingBb: 0, allIn: true, folded: false },
    { position: 'UTG', committedBb: 100, stackRemainingBb: 20, allIn: false, folded: false },
    { position: 'BTN', committedBb: 100, stackRemainingBb: 40, allIn: false, folded: false },
  ]);
  assert.equal(pots.totalPotBb, 285);
  assert.equal(pots.mainPotBb, 100); // 25 * 4
  assert.equal(pots.sidePots.length, 2);
  assert.equal(pots.sidePots[0].amountBb, 105); // (60 - 25) * 3
  assert.deepEqual(pots.sidePots[0].eligiblePositions, ['BB', 'UTG', 'BTN']);
  assert.equal(pots.sidePots[1].amountBb, 80); // (100 - 60) * 2
  assert.deepEqual(pots.sidePots[1].eligiblePositions, ['UTG', 'BTN']);

  // 5. Custom raise sizing evaluation preserves chosen size and exposes graded reference size
  const customSizing = evaluateCustomRaiseSizing({
    chosenSizingBb: 9.5,
    potBb: 12,
    callBb: 0,
    stakes: '0.25/0.50',
    gradedOption: { id: 'c', text: 'Bet 8 BB (66% Pot)', sizingBb: 8, frequency: 45, ev: '1.25' },
  });
  assert.equal(customSizing.chosenSizingBb, 9.5);
  assert.equal(customSizing.chosenSizingChips, 4.75);
  assert.equal(customSizing.gradedOptionId, 'c');
  assert.equal(customSizing.gradedSizingBb, 8);
  assert.equal(customSizing.isExactMatch, false);
  assert.match(customSizing.exactSizeVerdict, /9\.5 BB.*8 BB/i);
});

test('Personalized leak-to-drill loop identifies highest-EV-loss (variant, street, position) and targets Question #1', async () => {
  const analysis = analyzeVerifiedTrainingWeaknesses({
    sessions: [
      {
        id: 'sess-plo5-1',
        game_id: 'cash-005',
        hands_played: 10,
        correct_count: 4,
        total_ev_loss: 8.4,
        session_config: { variant: 'plo5', targetStreet: 'turn' },
      },
    ],
    answers: [
      { game_id: 'cash-005', variant: 'plo5', street: 'turn', position: 'BB', is_correct: false, ev_loss: 2.4 },
      { game_id: 'cash-005', variant: 'plo5', street: 'turn', position: 'BB', is_correct: false, ev_loss: 2.1 },
      { game_id: 'cash-005', variant: 'plo5', street: 'turn', position: 'BB', is_correct: false, ev_loss: 1.9 },
      { game_id: 'cash-005', variant: 'plo5', street: 'turn', position: 'BB', is_correct: true, ev_loss: 0 },
      { game_id: 'cash-001', variant: 'nlh', street: 'flop', position: 'BTN', is_correct: false, ev_loss: 0.4 },
    ],
  });

  assert.ok(analysis.topSpotLeak, 'Expected topSpotLeak to be identified');
  assert.equal(analysis.topSpotLeak.variant, 'plo5');
  assert.equal(analysis.topSpotLeak.street, 'turn');
  assert.equal(analysis.topSpotLeak.position, 'BB');
  assert.equal(analysis.topSpotLeak.sampleCount, 4);
  assert.equal(analysis.topSpotLeak.evLossBb, 6.4);
  assert.equal(analysis.topSpotLeak.basis, 'verified-history');

  const launchHref = buildCustomTrainingArenaHref(
    {
      gameId: analysis.topSpotLeak.gameId,
      variant: analysis.topSpotLeak.variant,
      streets: [analysis.topSpotLeak.street],
      positions: [analysis.topSpotLeak.position],
    },
    'weakness-scanner',
  );
  assert.equal(
    launchHref,
    '/hub/training/arena/cash-005?level=1&source=weakness-scanner&variant=plo5&street=turn&position=BB',
  );

  // Verify arena launch config for weakness-scanner routes to batch-preload (isCustomTrainerConfig === false)
  const { isCustomTrainerConfig } = await import('../src/lib/training/trainerConfigMode.mjs');
  const arenaTargetedConfig = {
    variant: 'plo5',
    targetStreet: 'turn',
    gameMode: 'street',
    targetPositions: 'BB',
  };
  assert.equal(isCustomTrainerConfig(arenaTargetedConfig), false);

  // Verify curated batch generator produces a PLO5 BB turn question on Question #1
  const [firstQuestion] = generateCuratedPokerConceptBatch({
    gameId: 'cash-005',
    level: 1,
    count: 1,
    gameConfig: {
      variant: 'plo5',
      targetPositions: ['BB'],
    },
    targetStreet: 'turn',
  });
  assert.equal(firstQuestion.scenario.variant, 'plo5');
  assert.equal(firstQuestion.scenario.street, 'turn');
  assert.equal(firstQuestion.scenario.heroPosition, 'BB');
  assert.equal(firstQuestion.heroCards.length, 5);
  assert.equal(firstQuestion.boardCards.length, 4);

  // Verify weakness-scanner Horse Brain remediation cards/boards have zero card collisions across all 16 (variant x street) pairs
  const heroCardsByVariant = {
    nlh: ['Kh', 'Jc'],
    plo4: ['As', 'Ks', 'Qh', 'Jd'],
    plo5: ['As', 'Ks', 'Qh', 'Jd', 'Tc'],
    plo6: ['As', 'Ks', 'Qh', 'Jd', 'Tc', '9h'],
  };
  const boardByStreet = {
    preflop: [],
    flop: ['8d', '5c', '2s'],
    turn: ['8d', '5c', '2s', '6h'],
    river: ['8d', '5c', '2s', '6h', '3d'],
  };
  for (const [v, hCards] of Object.entries(heroCardsByVariant)) {
    for (const [st, bCards] of Object.entries(boardByStreet)) {
      const evalResult = evaluateTrainingSpotWithHorseBrain({
        gameId: 'cash-005',
        variant: v,
        heroCards: hCards,
        boardCards: bCards,
        street: st,
        pot: 6.5,
        toCall: 0,
        stackDepth: 100,
        heroPosition: 'BB',
        villainPosition: 'BTN',
      });
      assert.equal(evalResult.ok, true, `Expected ${v} ${st} to evaluate without card collision`);
    }
  }
});
