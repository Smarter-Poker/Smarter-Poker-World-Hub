import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cardIndex,
  comboIndex,
  exactBoardStrings,
  findSolvedSpotV2Match,
  findMemoryChartMatch,
  findDirectCorpusSolverMatch,
} from '../src/lib/training/directSolverMatcher.mjs';
import { auditParsedHands, MATCHER_VERSION } from '../src/lib/training/handAuditEngine.js';
import {
  V2_COMBO_ORDER,
  V2_SOURCE_COMBO_ORDER_SCHEMA,
} from '../src/utils/v2Matrix.js';
import { mergeAuditJobProgress, kickAuditWorker } from '../src/lib/personal-assistant/auditJobRuntime.mjs';

const VALID_SHA = 'a'.repeat(64);

function makeValidV2Matrix({
  board = ['2d', 'Ah', 'Kd'],
  street = 'flop',
  position = 'BB',
  hero = 'OOP',
  oop = 'BB',
  ip = 'BTN',
  node = 'r:0',
  potBb = 5.5,
  effStackBb = 17.5,
  targetComboIdx,
  probs = { b412: 0.75, b182: 0.15, c: 0.10 },
  actionEvs = null,
} = {}) {
  const mkVec = (val) => {
    const arr = new Array(1326).fill(0);
    // Fill a few legal combos with valid probability distributions so v2ToAppMatrix bridges cleanly
    arr[targetComboIdx] = val;
    return arr;
  };
  const matrix = {
    solver: 'PioSOLVER',
    combo_order: V2_COMBO_ORDER,
    range_combo_order: V2_COMBO_ORDER,
    source_combo_order_schema: V2_SOURCE_COMBO_ORDER_SCHEMA,
    source_combo_order_sha256: VALID_SHA,
    oop_range_checksum: VALID_SHA,
    ip_range_checksum: VALID_SHA,
    training_game_contracts_sha256: VALID_SHA,
    rake: '0 0',
    tree_geometry: 'srp_btn_bb',
    street,
    board,
    position,
    hero,
    oop_player: oop,
    ip_player: ip,
    node,
    pot_bb: potBb,
    eff_stack_bb: effStackBb,
    exploitability_pct: 0.12,
    convergence: {
      schema: 'piosolver.calc-results.v1',
      source_command: 'calc_results',
      accuracy_fraction: 0.005,
      starting_pot_chips: potBb * 100,
      achieved_exploitability_chips: potBb * 100 * 0.0012,
      achieved_exploitability_fraction: 0.0012,
    },
    actions: [
      { code: 'b412', key: 'bet_75', size_pct: 75 },
      { code: 'b182', key: 'bet_33', size_pct: 33 },
      { code: 'c', key: 'check', size_pct: 0 },
    ],
    frequencies: {
      b412: mkVec(probs.b412),
      b182: mkVec(probs.b182),
      c: mkVec(probs.c),
    },
    hand_evs_bb: new Array(1326).fill(2.5),
  };
  if (actionEvs) {
    matrix.action_evs_bb = {
      b412: mkVec(actionEvs.b412),
      b182: mkVec(actionEvs.b182),
      c: mkVec(actionEvs.c),
    };
  }
  return matrix;
}

test('comboIndex and exactBoardStrings follow canonical PioSOLVER ordering and preserve turn/river order', () => {
  assert.equal(cardIndex('2c'), 0);
  assert.equal(cardIndex('As'), 51);
  assert.equal(comboIndex(['2c', '2d']), 0);
  assert.equal(comboIndex(['Ah', 'As']), 1325);
  assert.equal(comboIndex(['As', 'Ah']), 1325);
  assert.equal(comboIndex(['As', 'As']), -1);

  const flopPerms = exactBoardStrings(['2d', 'Ah', 'Kd']);
  assert.equal(flopPerms.length, 6);
  assert.ok(flopPerms.includes('AhKd2d'));

  const turnPerms = exactBoardStrings(['2d', 'Ah', 'Kd', '7c']);
  assert.equal(turnPerms.length, 6);
  assert.ok(turnPerms.every(s => s.endsWith('7c')));
  assert.ok(!turnPerms.some(s => s.endsWith('Kd')));
});

test('findSolvedSpotV2Match verifies exact PioSOLVER V2 combo, rejects legacy V1/stack drift/sizing mismatch', async () => {
  const holeCards = ['As', 'Qc'];
  const idx = comboIndex(holeCards);
  const v2 = makeValidV2Matrix({
    targetComboIdx: idx,
    probs: { b412: 0.80, b182: 0.15, c: 0.05 },
    actionEvs: { b412: 3.40, b182: 3.10, c: 2.55 },
  });

  const makeDb = (rows) => ({
    from(table) {
      const chain = {
        select() { return chain; },
        in() { return chain; },
        not() { return chain; },
        limit() {
          if (table === 'solved_spots_gold') return Promise.resolve({ data: rows, error: null });
          return Promise.resolve({ data: [], error: null });
        },
      };
      return chain;
    },
  });

  const hand = {
    format: 'cash',
    gameType: 'nlh',
    tableSize: 6,
    hero: { stack: 20.4 },
  };
  const point = {
    street: 'flop',
    position: 'BB',
    villainPosition: 'BTN',
    nodeClass: 'hero_bets_or_checks',
    holeCards,
    board: ['Ah', 'Kd', '2d'], // different flop permutation from stored 2dAhKd!
    potBeforeBB: 5.5,
    action: 'check',
    sizingPct: 0,
  };

  const validRow = {
    id: 'row-v2-1',
    scenario_hash: '6max_cash_BB_20bb_2dAhKd',
    game_type: '6max_cash',
    stack_depth: 20,
    street: 'flop',
    strategy_matrix_v2: v2,
    solved_v2_at: '2026-11-01T00:00:00Z',
    quality_status: 'verified',
  };

  // 1. Exact V2 match -> verified PIOSOLVER blunder/wrong with exact EV loss (3.40 - 2.55 = 0.85)
  const hit = await findSolvedSpotV2Match(makeDb([validRow]), hand, point);
  assert.ok(hit, 'expected exact V2 match');
  assert.equal(hit.solverVerified, true);
  assert.equal(hit.solverSource, 'PIOSOLVER');
  assert.equal(hit.solverAction, 'bet_75');
  assert.equal(hit.selectedFrequency, 0.05);
  assert.equal(hit.optimalFrequency, 0.8);
  assert.equal(hit.classification, 'wrong');
  assert.equal(hit.evLossMeasured, true);
  assert.equal(hit.evLoss, 0.85);

  // 2. Stack drift (> 1bb from 20bb) fails closed
  const driftMiss = await findSolvedSpotV2Match(makeDb([validRow]), { ...hand, hero: { stack: 28 } }, point);
  assert.equal(driftMiss, null);

  // 3. Unmatched bet sizing (150% pot vs 33/75% solved sizes) fails closed
  const sizingMiss = await findSolvedSpotV2Match(makeDb([validRow]), hand, { ...point, action: 'bet', sizingPct: 150 });
  assert.equal(sizingMiss, null);

  // 4. Corrupt/unsealed V2 envelope fails closed via selectTrustedSolverMatrix
  const unsealed = { ...validRow, strategy_matrix_v2: { ...v2, source_combo_order_sha256: '0'.repeat(64) } };
  const unsealedMiss = await findSolvedSpotV2Match(makeDb([unsealed]), hand, point);
  assert.equal(unsealedMiss, null);
});

test('findMemoryChartMatch verifies exact Cash/Tournament short-stack preflop push/fold spots and fails closed on non-shoves', async () => {
  const chartRow = {
    chart_id: 'chart-mtt-12-btn',
    game_type: 'Tournament',
    stack_depth: 12,
    hero_position: 'BTN',
    villain_action: 'fold_to_hero',
    hand_matrix: {
      A9s: { push: 1.0, fold: 0.0 },
      '72o': { push: 0.0, fold: 1.0 },
    },
  };

  const mockDb = {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() {
          if (table === 'memory_charts_gold') return Promise.resolve({ data: chartRow, error: null });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  };

  const hand = { format: 'tournament', gameType: 'nlh', tableSize: 6, hero: { stack: 12.2 } };

  // 1. Folding A9s at 12bb BTN -> verified blunder on MEMORY_CHARTS_GOLD (evLossMeasured stays false)
  const blunder = await findMemoryChartMatch(mockDb, hand, {
    street: 'preflop',
    position: 'BTN',
    nodeClass: 'preflop_open',
    holeCards: ['As', '9s'],
    action: 'fold',
  });
  assert.ok(blunder);
  assert.equal(blunder.solverVerified, true);
  assert.equal(blunder.solverSource, 'MEMORY_CHARTS_GOLD');
  assert.equal(blunder.solverAction, 'allin');
  assert.equal(blunder.classification, 'blunder');
  assert.equal(blunder.evLossMeasured, false);
  assert.equal(blunder.evLoss, null);

  // 2. Min-raising (non-shove) on a pure push/fold chart fails closed (never conflates raise with push)
  const raiseMiss = await findMemoryChartMatch(mockDb, hand, {
    street: 'preflop',
    position: 'BTN',
    nodeClass: 'preflop_open',
    holeCards: ['As', '9s'],
    action: 'raise',
  });
  assert.equal(raiseMiss, null);
});

test('auditParsedHands falls through from empty training_question_cache to certified direct corpus match', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const mockDb = {
    from(table) {
      const chain = {
        select() { return chain; },
        like() { return chain; },
        in() { return chain; },
        eq() { return chain; },
        not() { return chain; },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle() {
          if (table === 'memory_charts_gold') {
            return Promise.resolve({
              data: {
                chart_id: 'chart-cash-10-btn',
                game_type: 'Cash',
                stack_depth: 10,
                hero_position: 'BTN',
                villain_action: 'fold_to_hero',
                hand_matrix: { KQs: { push: 1.0, fold: 0.0 } },
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return chain;
    },
    async rpc() {
      return { data: { success: true, removed: 0 }, error: null };
    },
  };

  const hand = {
    id: 'club-arena:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    format: 'cash',
    gameType: 'nlh',
    tableSize: 6,
    bigBlind: 2,
    hero: { position: 'BTN', stack: 10, holeCards: ['Ks', 'Qs'] },
    board: [],
    streets: {
      preflop: {
        actions: [
          { position: 'UTG', action: 'fold', amount: 0, isHero: false },
          { position: 'BTN', action: 'allin', amount: 20, isHero: true },
        ],
      },
    },
  };

  const result = await auditParsedHands(mockDb, userId, [hand], { persist: false });
  assert.equal(result.solverVerified, 1);
  assert.equal(result.analyses[0].decisions[0].solverVerified, true);
  assert.equal(result.analyses[0].decisions[0].solverSource, `MEMORY_CHARTS_GOLD|${MATCHER_VERSION}`);
  assert.equal(result.analyses[0].decisions[0].classification, 'correct');
});

test('auditJobRuntime preserves caHandFactsSummary, incrementalStop, and forwards fullRescan to audit-worker', async () => {
  const merged = mergeAuditJobProgress({}, {
    success: true,
    leaksDetected: 2,
    caHandFactsSummary: { cashHands: 120, tournamentHands: 80, tournamentByStack: { short: 30, mid: 25, deep: 25 }, excludedUnsupportedHands: 5 },
    clubArenaSync: { handsFound: 20, incrementalStop: true },
  }, 450);

  assert.equal(merged.incrementalStop, true);
  assert.equal(merged.caHandFactsSummary.cashHands, 120);
  assert.equal(merged.caHandFactsSummary.tournamentHands, 80);

  let sentBody = null;
  process.env.PA_AUDIT_JOB_SECRET = process.env.PA_AUDIT_JOB_SECRET || 'test-secret-for-unit-test-only-1234567890';
  await kickAuditWorker(
    { id: 'job-1', user_id: 'user-1' },
    {
      origin: 'https://smarter.poker',
      fullRescan: true,
      fetchImpl: async (_url, opts) => {
        sentBody = JSON.parse(opts.body);
        return { ok: true, status: 202 };
      },
    },
  );
  assert.equal(sentBody?.jobId, 'job-1');
  assert.equal(sentBody?.fullRescan, true);
});
