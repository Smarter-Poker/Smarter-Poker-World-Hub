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

const require = createRequire(import.meta.url);
const { HandHistoryRecorder } = require('../src/lib/poker-engine/HandHistory.js');

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
const clubRow = {
  id: 'hand-42',
  hand_number: 42,
  game_variant: 'nlhe',
  players: [{ userId, seat: 0 }, { userId: villainId, seat: 1 }],
  board: [],
  summary: JSON.stringify({
    id: 'table_42',
    format: 'cash',
    buttonSeat: 0,
    players: [
      { id: userId, displayName: 'Hero', seatIndex: 0, holeCards: [51, 46] },
      { id: villainId, displayName: 'Villain', seatIndex: 1, holeCards: [0, 5] },
    ],
    streets: {
      preflop: {
        actions: [
          { playerId: userId, type: 'raise', amount: 2.5 },
          { playerId: villainId, type: 'fold' },
        ],
      },
      flop: { cards: [], actions: [] },
      turn: { cards: [], actions: [] },
      river: { cards: [], actions: [] },
    },
  }),
};

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

await test('uses the shared training question and persists an exact audit decision', async () => {
  const upserts = [];
  const question = {
    source: 'DETERMINISTIC_SOLVER',
    scenario: {
      street: 'preflop',
      heroPosition: 'BTN',
      heroHand: 'AKo',
      nodeType: 'preflop_open',
      boardCards: [],
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
          eq: () => chain,
          limit: async () => ({ data: [{ question_id: 'q-1', game_id: 'cash-rfi', question_data: question }], error: null }),
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
  const questions = pairs.map(({ hand }, index) => ({
    question_id: `parallel-${index}`,
    game_id: 'cash-rfi',
    question_data: {
      source: 'DETERMINISTIC_SOLVER',
      scenario: { street: 'preflop', heroPosition: 'BTN', heroHand: hand, nodeType: 'preflop_open', boardCards: [] },
      options: [{ id: 'raise', text: 'Raise' }],
      correctAnswer: 'raise',
      gtoFrequencies: { raise: 100 },
    },
  }));
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
    scenario: { street: 'preflop', heroPosition: 'BTN', heroHand: 'AKo', nodeType: 'preflop_open', boardCards: [] },
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
          limit: async () => ({ data: JSON.parse(membership || '[]')?.[0]?.userId ? [clubRow] : [], error: null }),
        };
        return chain;
      }
      if (table === 'training_question_cache') {
        const chain = {
          select: () => chain,
          like: () => chain,
          eq: () => chain,
          limit: async () => ({ data: [{ question_id: 'sync-q-1', game_id: 'cash-rfi', question_data: question }], error: null }),
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
          limit: async () => ({ data: JSON.parse(membership || '[]')?.[0]?.userId ? [clubRow] : [], error: null }),
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
              solver_source: 'DETERMINISTIC_SOLVER|hand-audit-v2',
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

await test('retries a stale unpriced Club Arena audit after the solver refresh window', async () => {
  let solverQueries = 0;
  const question = {
    source: 'DETERMINISTIC_SOLVER',
    scenario: { street: 'preflop', heroPosition: 'BTN', heroHand: 'AKo', nodeType: 'preflop_open', boardCards: [] },
    options: [{ id: 'raise', text: 'Raise' }],
    correctAnswer: 'raise',
    gtoFrequencies: { raise: 100 },
  };
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
          limit: async () => ({ data: JSON.parse(membership || '[]')?.[0]?.userId ? [clubRow] : [], error: null }),
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
              solver_verified: false,
              updated_at: '2026-08-27T12:00:00.000Z',
            }],
            error: null,
          }),
        };
        return { select: () => readChain, upsert: async () => ({ error: null }) };
      }
      if (table === 'training_question_cache') {
        solverQueries++;
        const chain = {
          select: () => chain,
          like: () => chain,
          eq: () => chain,
          limit: async () => ({ data: [{ question_id: 'retry-q-1', game_id: 'cash-rfi', question_data: question }], error: null }),
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
});

await test('keeps healthy solver evidence when either evidence store is degraded', () => {
  const source = readFileSync(resolve('pages/api/assistant/leaks/detect.js'), 'utf8');
  assert.ok(source.includes('available: trainingAvailable || auditAvailable'));
  assert.ok(source.includes("handAudit: solverEvidence.sources?.handAudit?.available === true"));
  assert.ok(!source.includes('Math.max(currentHands, liveHands + solverDecisions)'));
  assert.ok(source.includes('Math.max(currentHands, liveHands, clubArenaSync.handsFound || 0)'));
});

await test('renders an inspectable audit receipt with coverage and retry telemetry', () => {
  const page = readFileSync(resolve('pages/hub/personal-assistant/leaks.js'), 'utf8');
  assert.ok(page.includes('Deterministic Audit Receipt'));
  assert.ok(page.includes('Retried For Coverage'));
  assert.ok(page.includes('<AuditReceipt result={detectionResult} />'));
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
  recorder.recordAction('preflop', { playerId: userId, type: 'raise', amount: 2.5 });
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
});

await test('makes each Personal Assistant tool card one full-card button', () => {
  const source = readFileSync(resolve('pages/hub/personal-assistant/index.js'), 'utf8');
  assert.ok(source.includes('className={styles.systemCardTrigger}'));
  assert.ok(source.includes('onClick={() => openGuardedRoute(system.route)}'));
  assert.equal((source.match(/className=\{styles\.systemCardTrigger\}/g) || []).length, 1);
});

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
