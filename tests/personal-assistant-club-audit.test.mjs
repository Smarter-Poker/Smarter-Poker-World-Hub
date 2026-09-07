import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  auditParsedHands,
  cardCode,
  normalizeClubArenaHand,
  syncClubArenaHandsForAudit,
} from '../src/lib/training/handAuditEngine.js';
import { canonicalCacheRowFixture } from './helpers/canonicalTrainingPolicyFixture.mjs';

const require = createRequire(import.meta.url);
const { HandHistoryRecorder } = require('../src/lib/poker-engine/HandHistory.js');
const { GameStateMachine, GAME_VARIANT } = require('../src/lib/poker-engine/GameStateMachine.js');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    failed++;
    process.stderr.write(`FAIL ${name}: ${error.message}\n`);
  }
}

const userId = '00000000-0000-4000-8000-000000000001';
const villainId = '00000000-0000-4000-8000-000000000002';
const solverProvenance = Object.freeze({
  verified: true,
  scenarioHash: 'club-audit-fixture',
  solverVersion: 'fixture-1',
  solverBinaryChecksum: 'a'.repeat(64),
  machineId: 'M1',
  pipelineCommit: 'b'.repeat(40),
  manifestVersion: 'fixture-1',
  manifestChecksum: 'c'.repeat(64),
  sourceArtifactChecksum: 'd'.repeat(64),
  qualityStatus: 'validated',
  auditedAt: '2026-08-31T12:00:00.000Z',
});
const clubRow = {
  id: 'hand-42',
  hand_number: 42,
  game_variant: 'nlhe',
  big_blind: 1,
  players: [{ userId, seat: 0 }, { userId: villainId, seat: 1 }],
  board: [],
  summary: JSON.stringify({
    id: 'table_42',
    format: 'cash',
    bigBlind: 1,
    buttonSeat: 0,
    players: [
      { id: userId, displayName: 'Hero', seatIndex: 0, holeCards: [51, 46] },
      { id: villainId, displayName: 'Villain', seatIndex: 1, holeCards: [0, 5] },
    ],
    streets: {
      preflop: {
        actions: [
          { playerId: userId, type: 'raise', amount: 2.5, potBefore: 1.5, sizingPct: 66 },
          { playerId: villainId, type: 'fold' },
        ],
      },
      flop: { cards: [], actions: [] },
      turn: { cards: [], actions: [] },
      river: { cards: [], actions: [] },
    },
  }),
};

function cacheRow(question, questionId = 'context-q', gameId = 'cash-postflop') {
  return canonicalCacheRowFixture(question, {
    id: questionId,
    questionId,
    gameId,
  });
}

function auditDb(question, captured = []) {
  return {
    rpc: async (_name, args) => {
      captured.push(...args.p_rows);
      return { data: { success: true, upserted: args.p_rows.length, removed: 0 }, error: null };
    },
    from(table) {
      if (table === 'training_question_cache') {
        const chain = {
          select: () => chain,
          like: () => chain,
          in: () => chain,
          eq: () => chain,
          limit: async () => ({ data: [cacheRow(question)], error: null }),
        };
        return chain;
      }
      if (table === 'hand_audit_decisions') {
        return { upsert: async () => ({ error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

await test('converts Club Arena integer cards to canonical solver cards', () => {
  assert.equal(cardCode(51), 'As');
  assert.equal(cardCode(46), 'Kh');
  assert.equal(cardCode({ rank: '10', suit: 'diamonds' }), 'Td');
});

await test('normalizes a modern Club Arena row into a solver-auditable hand', () => {
  const hand = normalizeClubArenaHand(clubRow, userId);
  assert.ok(hand);
  assert.equal(hand.site, 'smarter-poker-club-arena');
  assert.equal(hand.hero.position, 'BTN');
  assert.deepEqual(hand.hero.holeCards, ['As', 'Kh']);
  assert.equal(hand.streets.preflop.actions[0].action, 'raise');
  assert.equal(hand.streets.preflop.actions[0].isHero, true);
});

await test('supports legacy player id membership rows during normalization', () => {
  const legacy = { ...clubRow, players: [{ id: userId }, { id: villainId }] };
  assert.ok(normalizeClubArenaHand(legacy, userId));
});

await test('refuses to grade a Club Arena hand when private hero cards are unavailable', () => {
  const summary = JSON.parse(clubRow.summary);
  summary.players[0].holeCards = null;
  assert.equal(normalizeClubArenaHand({ ...clubRow, summary: JSON.stringify(summary) }, userId), null);
});

await test('uses only the authenticated hero private fact to recover a folded hand', async () => {
  const privateOnly = {
    ...clubRow,
    summary: null,
    players: [{ userId, seat: 0 }, { userId: villainId, seat: 1 }],
    actions: [{ userId, street: 'preflop', action: 'raise', amount: 2.5, potBefore: 1.5, sizingPct: 66 }],
    hole_cards: {},
    created_at: '2026-08-30T12:00:00.000Z',
  };
  const queriedUsers = [];
  const db = {
    rpc: async () => ({ data: { success: true, upserted: 1, removed: 0 }, error: null }),
    from(table) {
      if (table === 'hand_history') {
        let membership = null;
        const chain = {
          select: () => chain,
          contains: (_column, value) => { membership = value; return chain; },
          in: () => chain, order: () => chain, lte: () => chain, or: () => chain,
          range: async () => ({ data: JSON.parse(membership || '[]')?.[0]?.userId ? [privateOnly] : [], error: null }),
        };
        return chain;
      }
      if (table === 'ca_hand_facts') {
        const chain = {
          select: () => chain,
          eq: (_column, value) => { queriedUsers.push(value); return chain; },
          in: () => chain,
          limit: async () => ({ data: [{ hand_id: privateOnly.id, hole_cards: [51, 46] }], error: null }),
        };
        return chain;
      }
      if (table === 'hand_audit_decisions') {
        const chain = { eq: () => chain, in: () => chain, limit: async () => ({ data: [], error: null }) };
        return { select: () => chain };
      }
      if (table === 'training_question_cache') {
        const chain = {
          select: () => chain, like: () => chain, in: () => chain, eq: () => chain,
          limit: async () => ({ data: [cacheRow({
              source: 'DETERMINISTIC_SOLVER',
              solverProvenance,
              scenario: { street: 'preflop', heroPosition: 'BTN', villainPosition: 'BB', heroHand: 'AKo', nodeType: 'preflop_open', boardCards: [], potSize: 1.5, actionHistory: [] },
              options: [{ id: 'raise', text: 'Raise' }], correctAnswer: 'raise', gtoFrequencies: { raise: 100 },
            }, 'private-fact-q', 'cash-rfi')], error: null }),
        };
        return chain;
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  const result = await syncClubArenaHandsForAudit(db, userId);
  assert.deepEqual(queriedUsers, [userId]);
  assert.equal(result.privateFactsAvailable, true);
  assert.equal(result.privateCardsRecovered, 1);
  assert.equal(result.handsMissingPrivateCards, 0);
  assert.equal(result.decisionsAnalyzed, 1);
});

await test('uses the shared training question and persists an exact audit decision', async () => {
  const upserts = [];
  const question = {
    source: 'DETERMINISTIC_SOLVER',
    solverProvenance,
    scenario: {
      street: 'preflop',
      heroPosition: 'BTN',
      heroHand: 'AKo',
      nodeType: 'preflop_open',
      boardCards: [],
      villainPosition: 'BB',
      potSize: 1.5,
      actionHistory: [],
    },
    options: [{ id: 'raise', text: 'Raise' }, { id: 'fold', text: 'Fold' }],
    correctAnswer: 'raise',
    gtoFrequencies: { raise: 100, fold: 0 },
  };
  const db = {
    rpc: async (_name, args) => {
      upserts.push(...args.p_rows);
      return { data: { success: true, upserted: args.p_rows.length, removed: 0 }, error: null };
    },
    from(table) {
      if (table === 'training_question_cache') {
        const chain = {
          select: () => chain,
          like: () => chain,
          in: () => chain,
          eq: () => chain,
          limit: async () => ({ data: [cacheRow(question, 'q-1', 'cash-rfi')], error: null }),
        };
        return chain;
      }
      if (table === 'hand_audit_decisions') {
        return {
          upsert: async (rows) => { upserts.push(...rows); return { error: null }; },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  const hand = normalizeClubArenaHand(clubRow, userId);
  const result = await auditParsedHands(db, userId, [hand], { reconcileExisting: false });
  assert.equal(result.handsParsed, 1);
  assert.equal(result.decisionsAnalyzed, 1);
  assert.equal(result.solverVerified, 1);
  assert.equal(result.persisted, true);
  assert.equal(upserts[0].hand_external_id, 'club-arena:hand-42');
  assert.equal(upserts[0].hero_hand, 'AKo');
  assert.equal(upserts[0].classification, 'best');
});

await test('maps a recorder-backed pot-sized bet to one exact solver action', async () => {
  const summary = JSON.parse(clubRow.summary);
  summary.bigBlind = 1;
  summary.streets.preflop = { actions: [] };
  summary.streets.flop = {
    cards: ['Qs', '7h', '2c'],
    actions: [{ playerId: userId, type: 'bet', amount: 2, potBefore: 6 }],
  };
  const hand = normalizeClubArenaHand({ ...clubRow, big_blind: 1, summary: JSON.stringify(summary) }, userId);
  const question = {
    source: 'DETERMINISTIC_SOLVER',
    solverProvenance,
    heroCards: ['As', 'Kh'],
    scenario: {
      street: 'flop', heroPosition: 'BTN', villainPosition: 'BB', heroHand: 'AKo',
      nodeType: 'hero_bets_or_checks', boardCards: ['Qs', '7h', '2c'], potSize: 6,
      actionHistory: [],
    },
    options: [{ id: 'b33', text: 'Bet 33%' }, { id: 'b75', text: 'Bet 75%' }],
    correctAnswer: 'b33',
    gtoFrequencies: { b33: 100, b75: 0 },
  };
  const result = await auditParsedHands(auditDb(question), userId, [hand], { reconcileExisting: false });
  const flop = result.analyses[0].decisions.find(decision => decision.street === 'flop');
  assert.equal(flop.solverVerified, true);
  assert.equal(flop.playerAction, 'bet');
  assert.equal(flop.classification, 'best');
});

await test('grades an explicitly sized raise only with the exact pot, villain, and action line', async () => {
  const summary = JSON.parse(clubRow.summary);
  summary.bigBlind = 1;
  summary.streets.preflop = { actions: [] };
  summary.streets.flop = {
    cards: ['Qs', '7h', '2c'],
    actions: [
      { playerId: villainId, type: 'bet', amount: 3, potBefore: 6 },
      { playerId: userId, type: 'raise', amount: 9, potBefore: 9, sizingPct: 75 },
    ],
  };
  const hand = normalizeClubArenaHand({ ...clubRow, big_blind: 1, summary: JSON.stringify(summary) }, userId);
  const baseQuestion = {
    source: 'DETERMINISTIC_SOLVER',
    solverProvenance,
    heroCards: ['As', 'Kh'],
    scenario: {
      street: 'flop', heroPosition: 'BTN', villainPosition: 'BB', heroHand: 'AKo',
      nodeType: 'hero_faces_bet', boardCards: ['Qs', '7h', '2c'], potSize: 9,
      actionHistory: [{ street: 'flop', position: 'BB', action: 'bet_50' }],
    },
    options: [{ id: 'raise_50', text: 'Raise 50%' }, { id: 'raise_75', text: 'Raise 75%' }],
    correctAnswer: 'raise_75',
    gtoFrequencies: { raise_50: 0, raise_75: 100 },
  };
  const exact = await auditParsedHands(auditDb(baseQuestion), userId, [hand], { reconcileExisting: false });
  assert.equal(exact.solverVerified, 1);

  for (const scenarioOverride of [
    { potSize: 8 },
    { potSize: undefined },
    { villainPosition: 'SB' },
    { actionHistory: undefined },
    { actionHistory: [{ street: 'flop', position: 'BB', action: 'bet_33' }] },
  ]) {
    const mismatch = {
      ...baseQuestion,
      scenario: { ...baseQuestion.scenario, ...scenarioOverride },
    };
    const result = await auditParsedHands(auditDb(mismatch), userId, [hand], { reconcileExisting: false });
    assert.equal(result.solverVerified, 0);
    assert.equal(result.unpriced, 1, 'the mismatched flop decision remains unpriced');
  }

  const noSizingSummary = structuredClone(summary);
  delete noSizingSummary.streets.flop.actions[1].sizingPct;
  const ambiguousHand = normalizeClubArenaHand({ ...clubRow, big_blind: 1, summary: JSON.stringify(noSizingSummary) }, userId);
  const ambiguous = await auditParsedHands(auditDb(baseQuestion), userId, [ambiguousHand], { reconcileExisting: false });
  assert.equal(ambiguous.solverVerified, 0, 'raise amount alone cannot prove a solver percentage');
});

await test('bounds and parallelizes independent solver-cache lookups', async () => {
  const pairs = [
    { cards: [51, 48], hand: 'AA' },
    { cards: [47, 44], hand: 'KK' },
    { cards: [43, 40], hand: 'QQ' },
    { cards: [39, 36], hand: 'JJ' },
    { cards: [35, 32], hand: 'TT' },
    { cards: [31, 28], hand: '99' },
    { cards: [27, 24], hand: '88' },
  ];
  const questions = pairs.map(({ hand }, index) => cacheRow({
      source: 'DETERMINISTIC_SOLVER',
      solverProvenance,
      scenario: { street: 'preflop', heroPosition: 'BTN', villainPosition: 'BB', heroHand: hand, nodeType: 'preflop_open', boardCards: [], potSize: 1.5, actionHistory: [] },
      options: [{ id: 'raise', text: 'Raise' }],
      correctAnswer: 'raise',
      gtoFrequencies: { raise: 100 },
    }, `parallel-${index}`, 'cash-rfi'));
  let active = 0;
  let maxActive = 0;
  let lookups = 0;
  const db = {
    rpc: async () => ({ data: { success: true, upserted: 1, removed: 0 }, error: null }),
    from(table) {
      if (table === 'training_question_cache') {
        const chain = {
          select: () => chain,
          like: () => chain,
          in: () => chain,
          eq: () => chain,
          limit: async () => {
            lookups++;
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise(resolve => setTimeout(resolve, 5));
            active--;
            return { data: questions, error: null };
          },
        };
        return chain;
      }
      if (table === 'hand_audit_decisions') return { upsert: async () => ({ error: null }) };
      throw new Error(`Unexpected table ${table}`);
    },
  };
  const hands = pairs.map(({ cards: heroCards }, index) => {
    const summary = JSON.parse(clubRow.summary);
    summary.id = `parallel-hand-${index}`;
    summary.players[0].holeCards = heroCards;
    return normalizeClubArenaHand({ ...clubRow, id: `parallel-hand-${index}`, summary: JSON.stringify(summary) }, userId);
  });
  const result = await auditParsedHands(db, userId, hands, { queryConcurrency: 3, reconcileExisting: false });
  assert.equal(result.solverVerified, pairs.length);
  assert.equal(lookups, pairs.length);
  assert.ok(maxActive > 1);
  assert.ok(maxActive <= 3);
});

await test('batches atomic replacement at the database hand-id ceiling', async () => {
  const rpcBatches = [];
  const question = {
    source: 'DETERMINISTIC_SOLVER',
    solverProvenance,
    scenario: { street: 'preflop', heroPosition: 'BTN', villainPosition: 'BB', heroHand: 'AKo', nodeType: 'preflop_open', boardCards: [], potSize: 1.5, actionHistory: [] },
    options: [{ id: 'raise', text: 'Raise' }], correctAnswer: 'raise', gtoFrequencies: { raise: 100 },
  };
  const db = {
    rpc: async (_name, args) => {
      rpcBatches.push(args.p_hand_ids.length);
      return { data: { success: true, removed: 0 }, error: null };
    },
    from(table) {
      if (table !== 'training_question_cache') throw new Error(`Unexpected table ${table}`);
      const chain = {
        select: () => chain, like: () => chain, in: () => chain, eq: () => chain,
        limit: async () => ({ data: [cacheRow(question, 'batch-q', 'cash-rfi')], error: null }),
      };
      return chain;
    },
  };
  const hands = Array.from({ length: 101 }, (_, index) => ({
    ...normalizeClubArenaHand(clubRow, userId),
    id: `club-arena:atomic-${index}`,
  }));
  const result = await auditParsedHands(db, userId, hands, { maxDecisions: 500 });
  assert.equal(result.persisted, true);
  assert.equal(result.handsParsed, 101);
  assert.deepEqual(rpcBatches, [100, 1]);
});

await test('wires Leak Finder sync before solver evidence aggregation', () => {
  const source = readFileSync(resolve('pages/api/assistant/leaks/detect.js'), 'utf8');
  const syncAt = source.indexOf('syncClubArenaHandsForAudit');
  const evidenceAt = source.indexOf('const solverEvidence = await getSolverTrainingEvidence');
  assert.ok(syncAt >= 0);
  assert.ok(evidenceAt > syncAt);
  assert.ok(source.includes('clubArenaSync'));
});

await test('limits automatic leak ingestion to authoritative Club Arena recorder rows', () => {
  const source = readFileSync(resolve('src/lib/training/handAuditEngine.js'), 'utf8');
  assert.ok(source.includes(".in('source', ['manual', 'wh-engine', 'engine-api'])"));
});

await test('syncs a Club Arena row through normalization, solver grading, and idempotent persistence', async () => {
  const upserts = [];
  const sourceFilters = [];
  const question = {
    source: 'DETERMINISTIC_SOLVER',
    solverProvenance,
    scenario: { street: 'preflop', heroPosition: 'BTN', villainPosition: 'BB', heroHand: 'AKo', nodeType: 'preflop_open', boardCards: [], potSize: 1.5, actionHistory: [] },
    options: [{ id: 'raise', text: 'Raise' }, { id: 'fold', text: 'Fold' }],
    correctAnswer: 'raise',
    gtoFrequencies: { raise: 100, fold: 0 },
  };
  const db = {
    rpc: async (_name, args) => {
      upserts.push(...args.p_rows);
      return { data: { success: true, upserted: args.p_rows.length, removed: 0 }, error: null };
    },
    from(table) {
      if (table === 'hand_history') {
        let membership = null;
        const chain = {
          select: () => chain,
          contains: (_column, value) => { membership = value; return chain; },
          in: (_column, values) => { sourceFilters.push(values); return chain; },
          order: () => chain,
          lte: () => chain,
          or: () => chain,
          range: async () => ({ data: JSON.parse(membership || '[]')?.[0]?.userId ? [clubRow] : [], error: null }),
        };
        return chain;
      }
      if (table === 'training_question_cache') {
        const chain = {
          select: () => chain,
          like: () => chain,
          in: () => chain,
          eq: () => chain,
          limit: async () => ({ data: [cacheRow(question, 'sync-q-1', 'cash-rfi')], error: null }),
        };
        return chain;
      }
      if (table === 'hand_audit_decisions') {
        const readChain = {
          eq: () => readChain,
          in: () => readChain,
          limit: async () => ({ data: [], error: null }),
        };
        return {
          select: () => readChain,
          upsert: async (rows) => { upserts.push(...rows); return { error: null }; },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  const result = await syncClubArenaHandsForAudit(db, userId);
  assert.equal(result.handsFound, 1);
  assert.equal(result.handsEligible, 1);
  assert.equal(result.handsAudited, 1);
  assert.equal(result.solverVerified, 1);
  assert.equal(result.persisted, true);
  assert.equal(upserts.length, 1);
  assert.deepEqual(sourceFilters, [
    ['manual', 'wh-engine', 'engine-api'],
    ['manual', 'wh-engine', 'engine-api'],
  ]);
});

await test('skips a complete, current Club Arena audit without repeating solver queries', async () => {
  let solverQueries = 0;
  let writes = 0;
  const db = {
    from(table) {
      if (table === 'hand_history') {
        let membership = null;
        const chain = {
          select: () => chain,
          contains: (_column, value) => { membership = value; return chain; },
          in: () => chain,
          order: () => chain,
          lte: () => chain,
          or: () => chain,
          range: async () => ({ data: JSON.parse(membership || '[]')?.[0]?.userId ? [clubRow] : [], error: null }),
        };
        return chain;
      }
      if (table === 'hand_audit_decisions') {
        const readChain = {
          eq: () => readChain,
          in: () => readChain,
          limit: async () => ({
            data: [{
              hand_external_id: 'club-arena:hand-42',
              solver_verified: true,
              solver_source: 'DETERMINISTIC_SOLVER|hand-audit-v3',
              classification: 'best',
              updated_at: '2026-08-29T12:00:00.000Z',
            }],
            error: null,
          }),
        };
        return {
          select: () => readChain,
          upsert: async () => { writes++; return { error: null }; },
        };
      }
      if (table === 'training_question_cache') {
        solverQueries++;
        throw new Error('A current audit must not query the solver cache');
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  const result = await syncClubArenaHandsForAudit(db, userId, {
    nowMs: new Date('2026-08-29T13:00:00.000Z').getTime(),
  });
  assert.equal(result.handsAudited, 0);
  assert.equal(result.handsAlreadyCurrent, 1);
  assert.equal(result.handsQueuedForRetry, 0);
  assert.equal(solverQueries, 0);
  assert.equal(writes, 0);
});

await test('does not re-audit recorder rows that contain no hero decision', async () => {
  const noDecisionSummary = JSON.parse(clubRow.summary);
  noDecisionSummary.streets.preflop.actions = [
    { playerId: villainId, type: 'fold', amount: 0 },
  ];
  const noDecisionRow = { ...clubRow, id: 'no-hero-decision', summary: JSON.stringify(noDecisionSummary) };
  let solverQueries = 0;
  let replacements = 0;
  const db = {
    rpc: async () => { replacements += 1; return { data: { success: true }, error: null }; },
    from(table) {
      if (table === 'hand_history') {
        let membership = null;
        const chain = {
          select: () => chain,
          contains: (_column, value) => { membership = value; return chain; },
          in: () => chain,
          order: () => chain,
          lte: () => chain,
          or: () => chain,
          range: async () => ({ data: JSON.parse(membership || '[]')?.[0]?.userId ? [noDecisionRow] : [], error: null }),
        };
        return chain;
      }
      if (table === 'hand_audit_decisions') {
        const chain = {
          eq: () => chain,
          in: () => chain,
          limit: async () => ({ data: [], error: null }),
        };
        return { select: () => chain };
      }
      if (table === 'training_question_cache') {
        solverQueries += 1;
        throw new Error('A hand without a hero decision must not query the solver cache');
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const result = await syncClubArenaHandsForAudit(db, userId);
  assert.equal(result.handsFound, 1);
  assert.equal(result.handsEligible, 0);
  assert.equal(result.handsSkippedNoHeroDecisions, 1);
  assert.equal(result.handsAudited, 0);
  assert.equal(result.decisionsAnalyzed, 0);
  assert.equal(solverQueries, 0);
  assert.equal(replacements, 0);
});

await test('reconciles obsolete decision evidence when a corrected hand has no hero action', async () => {
  const noDecisionSummary = JSON.parse(clubRow.summary);
  noDecisionSummary.streets.preflop.actions = [];
  const noDecisionRow = { ...clubRow, id: 'corrected-no-decision', summary: JSON.stringify(noDecisionSummary) };
  let replacementArgs = null;
  const db = {
    rpc: async (_name, args) => {
      replacementArgs = args;
      return { data: { success: true, removed: 1 }, error: null };
    },
    from(table) {
      if (table === 'hand_history') {
        let membership = null;
        const chain = {
          select: () => chain,
          contains: (_column, value) => { membership = value; return chain; },
          in: () => chain,
          order: () => chain,
          lte: () => chain,
          or: () => chain,
          range: async () => ({ data: JSON.parse(membership || '[]')?.[0]?.userId ? [noDecisionRow] : [], error: null }),
        };
        return chain;
      }
      if (table === 'hand_audit_decisions') {
        const chain = {
          eq: () => chain,
          in: () => chain,
          limit: async () => ({
            data: [{ hand_external_id: 'club-arena:corrected-no-decision', solver_verified: true }],
            error: null,
          }),
        };
        return { select: () => chain };
      }
      if (table === 'training_question_cache') throw new Error('No solver lookup expected');
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const result = await syncClubArenaHandsForAudit(db, userId);
  assert.equal(result.handsEligible, 0);
  assert.equal(result.handsSkippedNoHeroDecisions, 0);
  assert.equal(result.handsQueuedForRetry, 1);
  assert.equal(result.handsAudited, 1);
  assert.equal(result.obsoleteDecisionsRemoved, 1);
  assert.deepEqual(replacementArgs.p_rows, []);
  assert.deepEqual(replacementArgs.p_hand_ids, ['club-arena:corrected-no-decision']);
});

await test('pages beyond 100 reconciled Club Arena hands and reaches a complete audit', async () => {
  const hands = Array.from({ length: 101 }, (_, index) => ({
    ...clubRow,
    id: `hand-${index + 1}`,
    hand_number: index + 1,
    created_at: '2026-08-30T12:00:00.000Z',
  }));
  let handQueries = 0;
  const db = {
    from(table) {
      if (table === 'hand_history') {
        let membership = null;
        let continued = false;
        const chain = {
          select: () => chain,
          contains: (_column, value) => { membership = JSON.parse(value); return chain; },
          in: () => chain,
          order: () => chain,
          lte: () => chain,
          or: () => { continued = true; return chain; },
          range: async () => {
            handQueries += 1;
            return {
              data: membership?.[0]?.userId ? (continued ? hands.slice(100) : hands.slice(0, 101)) : [],
              error: null,
            };
          },
        };
        return chain;
      }
      if (table === 'hand_audit_decisions') {
        let ids = [];
        const chain = {
          eq: () => chain,
          in: (_column, values) => { ids = values; return chain; },
          limit: async () => ({
            data: ids.map(handExternalId => ({
              hand_external_id: handExternalId,
              solver_verified: true,
              solver_source: 'DETERMINISTIC_SOLVER|hand-audit-v3',
              classification: 'best',
              updated_at: '2026-08-30T12:00:00.000Z',
            })),
            error: null,
          }),
        };
        return { select: () => chain };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const first = await syncClubArenaHandsForAudit(db, userId, {
    limit: 100,
    nowMs: new Date('2026-08-30T13:00:00.000Z').getTime(),
  });
  assert.equal(first.handsFound, 100);
  assert.equal(first.handsAlreadyCurrent, 100);
  assert.equal(first.complete, false);
  assert.ok(first.continuation);
  assert.equal(handQueries, 2);

  const second = await syncClubArenaHandsForAudit(db, userId, {
    limit: 100,
    nowMs: new Date('2026-08-30T13:01:00.000Z').getTime(),
    cursor: first.continuation,
  });
  assert.equal(second.handsFound, 1);
  assert.equal(second.handsAlreadyCurrent, 1);
  assert.equal(second.handsAudited, 0);
  assert.equal(second.truncated, false);
  assert.equal(second.complete, true);
  assert.equal(second.continuation, null);
  // Both recorder membership shapes share one boundary and are queried on
  // every page; this prevents a sparse legacy stream from being skipped.
  assert.equal(handQueries, 4);
});

await test('retries stale unpriced audits and fresh audits from an older matcher', async () => {
  const question = {
    source: 'DETERMINISTIC_SOLVER',
    solverProvenance,
    scenario: { street: 'preflop', heroPosition: 'BTN', villainPosition: 'BB', heroHand: 'AKo', nodeType: 'preflop_open', boardCards: [], potSize: 1.5, actionHistory: [] },
    options: [{ id: 'raise', text: 'Raise' }],
    correctAnswer: 'raise',
    gtoFrequencies: { raise: 100 },
  };
  for (const existingDecision of [
    {
      hand_external_id: 'club-arena:hand-42',
      solver_verified: false,
      solver_source: 'hand-audit-v3:unpriced',
      updated_at: '2026-08-27T12:00:00.000Z',
    },
    {
      hand_external_id: 'club-arena:hand-42',
      solver_verified: false,
      solver_source: 'hand-audit-v2:unpriced',
      updated_at: '2026-08-29T12:30:00.000Z',
    },
  ]) {
    let solverQueries = 0;
    const db = {
    rpc: async () => ({ data: { success: true, upserted: 1, removed: 0 }, error: null }),
    from(table) {
      if (table === 'hand_history') {
        let membership = null;
        const chain = {
          select: () => chain,
          contains: (_column, value) => { membership = value; return chain; },
          in: () => chain,
          order: () => chain,
          lte: () => chain,
          or: () => chain,
          range: async () => ({ data: JSON.parse(membership || '[]')?.[0]?.userId ? [clubRow] : [], error: null }),
        };
        return chain;
      }
      if (table === 'hand_audit_decisions') {
        const readChain = {
          eq: () => readChain,
          in: () => readChain,
          limit: async () => ({ data: [existingDecision], error: null }),
        };
        return { select: () => readChain, upsert: async () => ({ error: null }) };
      }
      if (table === 'training_question_cache') {
        solverQueries++;
        const chain = {
          select: () => chain,
          like: () => chain,
          in: () => chain,
          eq: () => chain,
          limit: async () => ({ data: [cacheRow(question, 'retry-q-1', 'cash-rfi')], error: null }),
        };
        return chain;
      }
      throw new Error(`Unexpected table ${table}`);
    },
    };
    const result = await syncClubArenaHandsForAudit(db, userId, {
      nowMs: new Date('2026-08-29T13:00:00.000Z').getTime(),
    });
    assert.equal(result.handsAudited, 1);
    assert.equal(result.handsQueuedForRetry, 1);
    assert.equal(result.solverVerified, 1);
    assert.equal(result.unpriced, 0);
    assert.equal(solverQueries, 1);
  }
});

await test('keeps healthy solver evidence when either evidence store is degraded', () => {
  const source = readFileSync(resolve('pages/api/assistant/leaks/detect.js'), 'utf8');
  assert.ok(source.includes('available: trainingAvailable || auditAvailable'));
  assert.ok(source.includes("handAudit: solverEvidence.sources?.handAudit?.available === true"));
  assert.ok(!source.includes('Math.max(currentHands, liveHands + solverDecisions)'));
  assert.ok(source.includes('Math.max(currentHands, auditedHandTotal)'));
});

await test('renders an inspectable audit receipt with coverage and retry telemetry', () => {
  const page = readFileSync(resolve('pages/hub/personal-assistant/leaks.js'), 'utf8');
  assert.ok(page.includes('Deterministic Audit Receipt'));
  assert.ok(page.includes('Retried For Coverage'));
  assert.ok(page.includes('Private Hands Recovered'));
  assert.ok(page.includes('<AuditReceipt result={detectionResult || (auditJob ? {'));
  assert.ok(page.includes('reconciliation: auditJob.reconciliation'));
});

await test('persists authoritative Club Arena cards, board, payouts, rake, and pot', async () => {
  const inserts = [];
  const supabase = {
    from(table) {
      assert.equal(table, 'hand_history');
      return {
        insert: async (row) => { inserts.push(row); return { error: null }; },
      };
    },
  };
  const recorder = new HandHistoryRecorder({
    supabase,
    tableId: 'table-1',
    clubId: 'club-1',
    variant: 'nlhe',
    format: 'cash',
    bettingStructure: 'no-limit',
    smallBlind: 0.5,
    bigBlind: 1,
  });
  recorder.beginHand({
    handId: 'engine-hand-1',
    handNumber: 1,
    buttonSeat: 0,
    players: [
      { id: userId, displayName: 'Hero', seatIndex: 0, stack: 100 },
      { id: villainId, displayName: 'Villain', seatIndex: 1, stack: 100 },
    ],
  });
  recorder.recordHoleCards(userId, [51, 46]);
  recorder.recordHoleCards(villainId, [0, 5]);
  recorder.recordCommunityCards('flop', [48, 44, 40]);
  recorder.recordAction('preflop', {
    playerId: userId, type: 'raise', amount: 2.5,
    potBefore: 1.5, currentBetBefore: 1, raiseTo: 2.5, sizingPct: 75,
  });
  recorder.recordShowdown({ shownCards: [{ playerId: userId, cards: [51, 46] }] });
  recorder.recordShowdown({
    winners: [{ playerId: userId, amount: 5 }],
    pots: [{ amount: 5 }],
    rake: 0.25,
  });

  const result = await recorder.completeHand([
    { playerId: userId, stack: 102.5 },
    { playerId: villainId, stack: 97.5 },
  ]);
  assert.equal(result.success, true);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].source, 'wh-engine');
  assert.deepEqual(inserts[0].board, [48, 44, 40]);
  assert.equal(inserts[0].pot_size, 5);
  assert.equal(inserts[0].rake_amount, 0.25);
  const persistedSummary = JSON.parse(inserts[0].summary);
  assert.deepEqual(persistedSummary.players[0].holeCards, [51, 46]);
  assert.equal(persistedSummary.winners[0].playerId, userId);
  assert.equal(persistedSummary.format, 'cash');
  assert.deepEqual(
    Object.fromEntries(Object.entries(persistedSummary.streets.preflop.actions[0])
      .filter(([key]) => ['potBefore', 'currentBetBefore', 'raiseTo', 'sizingPct'].includes(key))),
    { potBefore: 1.5, currentBetBefore: 1, raiseTo: 2.5, sizingPct: 75 },
  );
});

await test('carries a real engine raise size through recorder persistence into exact audit grading', async () => {
  const inserts = [];
  const supabase = {
    from: () => ({ insert: async row => { inserts.push(row); return { error: null }; } }),
  };
  const recorder = new HandHistoryRecorder({
    supabase, tableId: 'engine-table', clubId: 'club-1', variant: 'nlhe', format: 'cash',
    bettingStructure: 'no-limit', smallBlind: 1, bigBlind: 2,
  });
  recorder.beginHand({
    handId: 'engine-sized-raise', handNumber: 2, buttonSeat: 0,
    players: [
      { id: userId, displayName: 'Hero', seatIndex: 0, stack: 100 },
      { id: villainId, displayName: 'Villain', seatIndex: 1, stack: 100 },
    ],
  });
  recorder.recordHoleCards(userId, [51, 46]);
  recorder.recordHoleCards(villainId, [0, 5]);

  const game = new GameStateMachine({ variant: GAME_VARIANT.HOLDEM, smallBlind: 1, bigBlind: 2 });
  game.on('action_processed', data => recorder.recordAction(data.street, {
    playerId: data.playerId,
    type: data.action.type,
    amount: data.action.amount,
    potBefore: data.potBefore,
    currentBetBefore: data.currentBetBefore,
    raiseTo: data.currentBet,
    sizingPct: data.sizingPct,
  }));
  game.startHand([
    { id: userId, stack: 100, seatIndex: 0 },
    { id: villainId, stack: 100, seatIndex: 1 },
  ]);
  assert.equal(game.processAction(userId, { type: 'raise', amount: 8 }).success, true);
  await recorder.completeHand([
    { playerId: userId, stack: 93 },
    { playerId: villainId, stack: 98 },
  ]);

  const persisted = JSON.parse(inserts[0].summary);
  const recordedRaise = persisted.streets.preflop.actions[0];
  assert.equal(recordedRaise.sizingPct, 150);
  assert.equal(recordedRaise.potBefore, 3);
  const hand = normalizeClubArenaHand(inserts[0], userId);
  const question = {
    source: 'DETERMINISTIC_SOLVER', solverProvenance,
    scenario: {
      street: 'preflop', heroPosition: 'BTN', villainPosition: 'BB', heroHand: 'AKo',
      nodeType: 'preflop_open', boardCards: [], potSize: 1.5, actionHistory: [],
    },
    options: [{ id: 'r100', text: 'Raise 100%' }, { id: 'r150', text: 'Raise 150%' }],
    correctAnswer: 'r150', gtoFrequencies: { r100: 0, r150: 100 },
  };
  const audit = await auditParsedHands(auditDb(question), userId, [hand], { reconcileExisting: false });
  assert.equal(audit.solverVerified, 1);
  assert.equal(audit.analyses[0].decisions[0].classification, 'best');
});

await test('makes each Personal Assistant tool card one full-card button', () => {
  const source = readFileSync(resolve('pages/hub/personal-assistant/index.js'), 'utf8');
  assert.ok(source.includes('className={styles.systemCardTrigger}'));
  assert.ok(source.includes('onClick={() => openGuardedRoute(system.route)}'));
  assert.equal((source.match(/className=\{styles\.systemCardTrigger\}/g) || []).length, 1);
});

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
