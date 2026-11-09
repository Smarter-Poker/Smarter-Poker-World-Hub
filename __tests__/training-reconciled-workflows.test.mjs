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
});
