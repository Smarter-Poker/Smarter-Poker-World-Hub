import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BLUNDER_OPTIMAL_FREQUENCY_THRESHOLD as MATCHER_BLUNDER_THRESHOLD,
  classifyFromPercentFrequency,
  comboIndex,
  findMemoryChartMatch,
  findSolvedSpotV2Match,
  resolveSolverStackDepthBb,
} from '../src/lib/training/directSolverMatcher.mjs';
import {
  MATCHER_VERSION,
  auditParsedHands,
  normalizeClubArenaHand,
  resolveStackDepthBb,
  syncClubArenaHandsForAudit,
} from '../src/lib/training/handAuditEngine.js';
import {
  BLUNDER_OPTIMAL_FREQUENCY_THRESHOLD,
  aggregateSolverLeaks,
  classifyFrequencyDecision,
  summarizeSolverDecisionGroups,
} from '../src/lib/training/solverDecisionEvidence.js';
import {
  getHeroDecisionPoints,
  parseHandHistory,
} from '../src/engines/HandHistoryParser.js';
import { mergeAuditJobProgress } from '../src/lib/personal-assistant/auditJobRuntime.mjs';
import {
  FORMAT_BASELINES,
  analyzeCaHandFacts,
} from '../src/lib/personal-assistant/caHandFactsAnalyzer.mjs';
import { sanitizeExportHandRow } from '../src/lib/personal-assistant/dataLifecycle.mjs';
import { buildHandMetadata } from '../src/lib/personal-assistant/handAuditRouteCore.mjs';
import { buildLeakTakeaway } from '../src/lib/personal-assistant/leakRecord.js';
import { V2_COMBO_ORDER, V2_SOURCE_COMBO_ORDER_SCHEMA } from '../src/utils/v2Matrix.js';
import { canonicalCacheRowFixture } from './helpers/canonicalTrainingPolicyFixture.mjs';

const VALID_SHA = 'a'.repeat(64);
const HERO_ID = '11111111-1111-4111-8111-111111111111';
const VILLAIN_1 = '22222222-2222-4222-8222-222222222222';
const VILLAIN_2 = '33333333-3333-4333-8333-333333333333';

const SOLVER_PROVENANCE = Object.freeze({
  verified: true,
  scenarioHash: 'pa-phase7-engine-hardening-fixture',
  solverVersion: 'PioSOLVER-3.0',
  solverBinaryChecksum: 'a'.repeat(64),
  machineId: 'M1',
  pipelineCommit: 'b'.repeat(40),
  manifestVersion: 'phase7-1',
  manifestChecksum: 'c'.repeat(64),
  sourceArtifactChecksum: 'd'.repeat(64),
  qualityStatus: 'validated',
  auditedAt: '2026-11-26T00:00:00.000Z',
});

function makeV2Row({
  id = 'v2-100bb-1',
  gameType = 'postflop_complete',
  street = 'flop',
  stackDepth = 100,
  board = ['Ah', 'Kd', '2d'],
  node = 'r:0',
  hero = 'OOP',
  position = 'BB',
  oopPlayer = 'BB',
  ipPlayer = 'BTN',
  rootPotBb = 5.5,
  effStackBb = 97.5,
  targetComboIdx,
} = {}) {
  const actions = [
    { code: 'b412', key: 'bet_75', size_chips: 412, size_pct: 75 },
    { code: 'c', key: 'check', size_chips: 0, size_pct: null },
  ];
  const frequencies = {
    b412: new Array(1326).fill(0),
    c: new Array(1326).fill(0),
  };
  frequencies.b412[targetComboIdx] = 0.85;
  frequencies.c[targetComboIdx] = 0.15;
  const prefix = street === 'turn' ? 'turn_' : street === 'river' ? 'river_' : '';
  return {
    id,
    scenario_hash: `${prefix}${gameType}_${position}_${stackDepth}bb_${board.join('')}`,
    game_type: gameType,
    stack_depth: stackDepth,
    street,
    solved_v2_at: '2026-11-26T00:00:00Z',
    quality_status: 'validated',
    solver_version: 'PioSOLVER-3.0',
    solver_binary_checksum: '1'.repeat(64),
    machine_id: 'M1',
    pipeline_commit: '2'.repeat(40),
    manifest_version: 'v2-prod',
    manifest_checksum: '3'.repeat(64),
    source_artifact_checksum: '4'.repeat(64),
    audited_at: '2026-11-26T00:00:00Z',
    strategy_matrix_v2: {
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
      board,
      node,
      street,
      hero,
      position,
      oop_player: oopPlayer,
      ip_player: ipPlayer,
      pot_bb: rootPotBb,
      eff_stack_bb: effStackBb,
      exploitability_pct: 0.1,
      convergence: {
        schema: 'piosolver.calc-results.v1',
        source_command: 'calc_results',
        accuracy_fraction: 0.005,
        starting_pot_chips: rootPotBb * 100,
        achieved_exploitability_chips: rootPotBb * 100 * 0.001,
        achieved_exploitability_fraction: 0.001,
      },
      actions,
      frequencies,
      hand_evs_bb: new Array(1326).fill(2.0),
    },
  };
}

// ─── 1. [P0-1] Stack-unit normalization across matcher & audit engine ────────

test('[P0-1] directSolverMatcher and handAuditEngine normalize chip/dollar stacks into BB before matching', async () => {
  const holeCards = ['As', 'Qc'];
  const cIdx = comboIndex(holeCards);

  // 1a. $0.05/$0.10 ($10 = 100bb) must NOT match a 10bb push/fold chart in findMemoryChartMatch
  const chart10bb = {
    chart_id: 'cash-btn-10bb',
    game_type: 'Cash',
    stack_depth: 10,
    hero_position: 'BTN',
    villain_action: 'fold_to_hero',
    hand_matrix: { AQo: { push: 1, fold: 0 } },
  };
  let chartQueriedStacks = [];
  const chartDb = {
    from() {
      const chain = {
        select() { return chain; },
        eq(col, val) {
          if (col === 'stack_depth') chartQueriedStacks.push(val);
          return chain;
        },
        maybeSingle() { return Promise.resolve({ data: chart10bb, error: null }); },
      };
      return chain;
    },
  };

  const nl10Hand = {
    format: 'cash',
    gameType: 'nlh',
    stakes: '$0.05/$0.10',
    tableSize: 6,
    hero: { name: 'Hero', position: 'BTN', stack: 10, holeCards },
  };
  assert.equal(resolveSolverStackDepthBb(nl10Hand, {}), 100);
  const false10bbMatch = await findMemoryChartMatch(chartDb, nl10Hand, {
    street: 'preflop',
    position: 'BTN',
    nodeClass: 'preflop_open',
    holeCards,
    action: 'allin',
    priorActions: [],
  });
  assert.equal(false10bbMatch, null, '$10 at $0.05/$0.10 (100bb) must never match a 10bb push/fold chart');
  assert.equal(chartQueriedStacks.length, 0);

  // 1b. $1/$2 ($200 = 100bb) must match 100bb (NOT 200bb) in findSolvedSpotV2Match
  const v2RowCash100 = makeV2Row({ id: 'v2-cash-100', gameType: 'hu_cash', stackDepth: 100, targetComboIdx: cIdx });
  let queriedHashes = [];
  const v2Db = (row) => ({
    from() {
      const chain = {
        select() { return chain; },
        in(_col, vals) { queriedHashes.push(...vals); return chain; },
        eq() { return chain; },
        not() { return chain; },
        limit() { return Promise.resolve({ data: [row], error: null }); },
      };
      return chain;
    },
  });

  const nl200Hand = {
    format: 'cash',
    gameType: 'nlh',
    stakes: '$1/$2',
    bigBlind: 2,
    tableSize: 2,
    hero: { name: 'Hero', position: 'BB', stack: 200, holeCards },
  };
  const pointFlop = {
    street: 'flop',
    position: 'BB',
    villainPosition: 'BTN',
    nodeClass: 'hero_bets_or_checks',
    holeCards,
    board: ['Ah', 'Kd', '2d'],
    potBeforeBB: 5.5,
    action: 'bet',
    sizingPct: 75,
  };
  const nl200Match = await findSolvedSpotV2Match(v2Db(v2RowCash100), nl200Hand, pointFlop);
  assert.ok(nl200Match, '$200 at $1/$2 must match 100bb V2 solved spot');
  assert.ok(queriedHashes.some(h => h.includes('_100bb_')), 'must query 100bb hash');
  assert.ok(!queriedHashes.some(h => h.includes('_200bb_')), 'must not query 200bb hash for $200 at $1/$2');

  // 1c. 10,000-chip 50/100 MTT (100bb) must match 100bb V2 solved spot and exactIdentityCompatible in auditParsedHands
  queriedHashes = [];
  const v2RowMtt100 = makeV2Row({ id: 'v2-mtt-100', gameType: 'mtt_6max_chipev', stackDepth: 100, targetComboIdx: cIdx });
  const mtt10kHand = {
    id: 'mtt-10k-hand',
    format: 'tournament',
    variant: 'holdem',
    gameType: 'nlh',
    stakes: '50/100',
    bigBlind: 100,
    tableSize: 6,
    hero: { name: 'Hero', position: 'BB', stack: 10000, holeCards },
    players: [
      { name: 'Hero', position: 'BB', stack: 10000 },
      { name: 'Villain', position: 'BTN', stack: 10000 },
    ],
    streets: {
      preflop: { actions: [] },
      flop: {
        board: ['Ah', 'Kd', '2d'],
        actions: [{ player: 'Hero', position: 'BB', isHero: true, action: 'bet', amount: 412, potBeforeBB: 5.5, sizingPct: 75 }],
      },
      turn: null,
      river: null,
    },
  };
  const mttMatch = await findSolvedSpotV2Match(v2Db(v2RowMtt100), mtt10kHand, pointFlop);
  assert.ok(mttMatch, '10,000-chip 50/100 MTT hand must resolve to 100bb and match');
  assert.ok(queriedHashes.some(h => h.startsWith('mtt_6max_chipev_BB_100bb_')));

  // Verify exactIdentityCompatible in auditParsedHands matches 100bb training_question_cache row for 10,000-chip 50/100 MTT
  const cached100bbRow = canonicalCacheRowFixture({
    source: 'DETERMINISTIC_SOLVER',
    solverProvenance: SOLVER_PROVENANCE,
    heroCards: holeCards,
    scenario: {
      street: 'flop',
      heroPosition: 'BB',
      villainPosition: 'BTN',
      heroHand: 'AQo',
      nodeType: 'hero_bets_or_checks',
      boardCards: ['Ah', 'Kd', '2d'],
      tableSize: 6,
      stackDepth: 100,
      potSize: 5.5,
      actionHistory: [],
    },
    options: [{ id: 'b75', text: 'Bet 75%' }, { id: 'x', text: 'Check' }],
    correctAnswer: 'b75',
    gtoFrequencies: { b75: 100, x: 0 },
  }, { id: 'q-mtt-100bb', questionId: 'q-mtt-100bb', gameId: 'mtt-postflop' });

  const cacheDb = {
    from(table) {
      const chain = {
        select: () => chain,
        like: () => chain,
        in: () => chain,
        eq: () => chain,
        not: () => chain,
        limit: async () => ({
          data: table === 'training_question_cache' ? [cached100bbRow] : [],
          error: null,
        }),
      };
      return chain;
    },
  };
  const auditedMtt = await auditParsedHands(cacheDb, HERO_ID, [mtt10kHand], { persist: false });
  assert.equal(auditedMtt.solverVerified, 1, 'exactIdentityCompatible must match 100bb cache row for 10,000-chip 50/100 MTT');
  assert.equal(auditedMtt.analyses[0].decisions[0].stackDepthBb, 100);
});

// ─── 2. [P0-2] Multi-page audit metric accumulation ──────────────────────────

test('[P0-2] syncClubArenaHandsForAudit and mergeAuditJobProgress accumulate PAGE_LEVEL_METRICS across multi-page audits while skipping retrying pages', async () => {
  // Verify mergeAuditJobProgress with multi-page sync payloads (hasMorePages: true, pageRetrying: false, truncated: true)
  const page1Detection = {
    success: true,
    auditInProgress: true,
    clubArenaSync: {
      auditCursor: 'cursor-page-2',
      handsFound: 50,
      cumulativeHandsFound: 50,
      handsEligible: 42,
      privateCardsRecovered: 18,
      handsMissingPrivateCards: 4,
      handsRejectedBeforeAudit: 2,
      handsSkippedNoHeroDecisions: 2,
      handsAlreadyCurrent: 12,
      handsAudited: 30,
      decisionsAnalyzed: 65,
      solverVerified: 40,
      unpriced: 25,
      truncated: true,
      pageRetrying: false,
      hasMorePages: true,
    },
  };
  const page2Detection = {
    success: true,
    auditInProgress: true,
    clubArenaSync: {
      auditCursor: 'cursor-page-3',
      handsFound: 50,
      cumulativeHandsFound: 100,
      handsEligible: 45,
      privateCardsRecovered: 22,
      handsMissingPrivateCards: 3,
      handsRejectedBeforeAudit: 1,
      handsSkippedNoHeroDecisions: 1,
      handsAlreadyCurrent: 15,
      handsAudited: 30,
      decisionsAnalyzed: 70,
      solverVerified: 50,
      unpriced: 20,
      truncated: true,
      pageRetrying: false,
      hasMorePages: true,
    },
  };
  const page3Detection = {
    success: true,
    auditInProgress: false,
    leaksDetected: 4,
    clubArenaSync: {
      auditCursor: null,
      handsFound: 20,
      cumulativeHandsFound: 120,
      handsEligible: 18,
      privateCardsRecovered: 10,
      handsMissingPrivateCards: 1,
      handsRejectedBeforeAudit: 1,
      handsSkippedNoHeroDecisions: 0,
      handsAlreadyCurrent: 8,
      handsAudited: 10,
      decisionsAnalyzed: 25,
      solverVerified: 15,
      unpriced: 10,
      truncated: false,
      pageRetrying: false,
      hasMorePages: false,
    },
  };

  const p1 = mergeAuditJobProgress({}, page1Detection, 500);
  assert.equal(p1.handsEligible, 42, 'Page 1 must accumulate handsEligible even when hasMorePages/truncated is true');
  assert.equal(p1.privateCardsRecovered, 18);
  assert.equal(p1.handsMissingPrivateCards, 4);
  assert.equal(p1.handsRejectedBeforeAudit, 2);
  assert.equal(p1.handsSkippedNoHeroDecisions, 2);
  assert.equal(p1.handsAlreadyCurrent, 12);

  // Simulate mid-page decision-cap truncation retry on Page 2 (pageRetrying: true)
  const p2Retry = mergeAuditJobProgress(p1, {
    success: true,
    auditInProgress: true,
    clubArenaSync: {
      ...page2Detection.clubArenaSync,
      pageRetrying: true,
    },
  }, 300);
  assert.equal(p2Retry.handsEligible, 42, 'pageRetrying:true must NOT double-count PAGE_LEVEL_METRICS');
  assert.equal(p2Retry.privateCardsRecovered, 18);

  // Page 2 completes normally
  const p2 = mergeAuditJobProgress(p1, page2Detection, 500);
  assert.equal(p2.handsEligible, 87);
  assert.equal(p2.privateCardsRecovered, 40);
  assert.equal(p2.handsMissingPrivateCards, 7);
  assert.equal(p2.handsRejectedBeforeAudit, 3);
  assert.equal(p2.handsSkippedNoHeroDecisions, 3);
  assert.equal(p2.handsAlreadyCurrent, 27);

  // Page 3 completes the job
  const p3 = mergeAuditJobProgress(p2, page3Detection, 400);
  assert.equal(p3.complete, true);
  assert.equal(p3.handsScanned, 120);
  assert.equal(p3.handsEligible, 105);
  assert.equal(p3.privateCardsRecovered, 50);
  assert.equal(p3.handsMissingPrivateCards, 8);
  assert.equal(p3.handsRejectedBeforeAudit, 4);
  assert.equal(p3.handsSkippedNoHeroDecisions, 3);
  assert.equal(p3.handsAlreadyCurrent, 35);
});

// ─── 3. [P0-6] Windows CRLF & comma-stakes parser bugs ──────────────────────

test('[P0-6] HandHistoryParser normalizes Windows CRLF multi-hand files, parses comma stakes, and populates 888 stakes/comma amounts', () => {
  const psHand1 = [
    "PokerStars Hand #1001: Tournament #555, $10+$1 USD Hold'em No Limit - Level X (1,000/2,000) - 2026/11/26 12:00:00 ET",
    "Table '555 1' 6-max Seat #1 is the button",
    'Seat 1: Hero (200,000 in chips)',
    'Seat 2: Villain (180,000 in chips)',
    'Hero: posts small blind 1,000',
    'Villain: posts big blind 2,000',
    '*** HOLE CARDS ***',
    'Dealt to Hero [As Ks]',
    'Hero: raises 2,000 to 4,000',
    'Villain: folds',
    'Hero collected 4,000 from pot',
    '*** SUMMARY ***',
    'Total pot 4,000',
  ].join('\r\n');

  const psHand2 = psHand1
    .replace('Hand #1001', 'Hand #1002')
    .replace('[As Ks]', '[Qh Qd]');

  const crlfMultiPs = `${psHand1}\r\n\r\n${psHand2}`;
  const parsedPs = parseHandHistory(crlfMultiPs, 'Hero');
  assert.equal(parsedPs.length, 2, 'Windows CRLF multi-hand PokerStars file must split into 2 hands');
  assert.equal(parsedPs[0].stakes, '$1000/$2000', '1,000/2,000 stakes must parse to $1000/$2000 (BB=2000, not 2)');
  assert.equal(resolveStackDepthBb(parsedPs[0], {}), 90, 'Effective stack = min(200000, 180000) / 2000 = 90 BB');

  // 888poker multi-hand Windows CRLF with comma-formatted stakes, stacks, and bets
  const hand888A = [
    '***** 888poker Hand History for Game 88801 *****',
    '$1,000/$2,000 Blinds No Limit Holdem - *** 26 11 2026 12:00:00',
    'Table Turbo 6 Max (Real Money)',
    'Seat 1 is the button',
    'Total number of players : 2',
    'Seat 1: Hero ( $200,000 )',
    'Seat 2: Villain ( $150,000 )',
    'Hero posts small blind [$1,000]',
    'Villain posts big blind [$2,000]',
    '** Dealing down cards **',
    'Dealt to Hero [ Ah, Kd ]',
    'Hero raises [$3,000] to [$4,000]',
    'Villain calls [$2,000]',
    '** Flop ** [ As, 7d, 2c ]',
    'Villain checks',
    'Hero bets [$5,500]',
    'Villain folds',
    'Hero collected $12,000',
  ].join('\r\n');

  const hand888B = hand888A.replace('Game 88801', 'Game 88802').replace('Ah, Kd', 'Ks, Qs');
  const crlfMulti888 = `${hand888A}\r\n\r\n${hand888B}`;
  const parsed888 = parseHandHistory(crlfMulti888, 'Hero');
  assert.equal(parsed888.length, 2, 'Windows CRLF multi-hand 888poker file must split into 2 hands');
  assert.equal(parsed888[0].stakes, '$1000/$2000', '888poker hand must populate hand.stakes');
  assert.equal(parsed888[0].players[0].stack, 200000, '888poker seat stack must support commas');
  assert.equal(parsed888[0].players[1].stack, 150000);
  assert.equal(parsed888[0].streets.flop.actions[1].amount, 5500, '888poker bet amount must support commas');
  assert.equal(parsed888[0].result.winners[0].amount, 12000, '888poker winner amount must support commas');
  assert.equal(resolveStackDepthBb(parsed888[0], {}), 75, '888poker effective stack = 150,000 / 2,000 = 75 BB');
});

// ─── 4. [P1-1] Opponent hole-card privacy leak & camelCase sanitizer ─────────

test('[P1-1] normalizeClubArenaHand never leaks opponent hole cards on uncontested folded hands and sanitizeExportHandRow scrubs camelCase holeCards', () => {
  // Uncontested hand: Hero folds preflop, rawShowdown is empty, Villain has cards in row.players without showed:true
  const uncontestedRow = {
    id: 'uncontested-privacy-1',
    game_variant: 'nlh',
    small_blind: 1,
    big_blind: 2,
    button_seat: 1,
    source: 'manual',
    players: [
      { userId: HERO_ID, username: 'Hero', seat: 1, startStack: 200, cards: ['As', 'Kd'] },
      { userId: VILLAIN_1, username: 'VillainBB', seat: 2, startStack: 200, cards: ['Qs', 'Qd'] },
    ],
    actions: [
      { seat: 1, userId: HERO_ID, stage: 'preflop', action: 'fold', amount: 0 },
    ],
  };

  const normalized = normalizeClubArenaHand(uncontestedRow, HERO_ID);
  assert.ok(normalized);
  const heroPlayer = normalized.players.find(p => p.id === HERO_ID);
  const villainPlayer = normalized.players.find(p => p.id === VILLAIN_1);
  assert.deepEqual(heroPlayer.holeCards, ['As', 'Kd']);
  assert.deepEqual(villainPlayer.holeCards, [], 'Uncontested villain hole cards from row.players MUST NOT leak');
  assert.equal(villainPlayer.holeCardsAvailable, false);
  const showdownVillain = normalized.showdown.players.find(p => p.playerId === VILLAIN_1);
  assert.deepEqual(showdownVillain.holeCards, []);
  assert.equal(showdownVillain.holeCardsAvailable, false);

  // Explicitly shown villain cards (shown: true) ARE preserved
  const shownRow = {
    ...uncontestedRow,
    id: 'shown-privacy-2',
    players: [
      { userId: HERO_ID, username: 'Hero', seat: 1, startStack: 200, cards: ['As', 'Kd'] },
      { userId: VILLAIN_1, username: 'VillainBB', seat: 2, startStack: 200, cards: ['Qs', 'Qd'], shown: true },
    ],
  };
  const normalizedShown = normalizeClubArenaHand(shownRow, HERO_ID);
  const shownVillain = normalizedShown.players.find(p => p.id === VILLAIN_1);
  assert.deepEqual(shownVillain.holeCards, ['Qs', 'Qd']);
  assert.equal(shownVillain.holeCardsAvailable, true);

  // sanitizeExportHandRow scrubs camelCase row.holeCards and row.hand_data.holeCards
  const exportRow = {
    id: 'exp-1',
    players: [
      { userId: HERO_ID, holeCards: ['As', 'Kd'], showed: false },
      { userId: VILLAIN_1, holeCards: ['7c', '2d'], showed: false },
      { userId: VILLAIN_2, holeCards: ['Qh', 'Qd'], showed: true },
    ],
    holeCards: {
      [HERO_ID]: ['As', 'Kd'],
      [VILLAIN_1]: ['7c', '2d'],
      [VILLAIN_2]: ['Qh', 'Qd'],
    },
    hand_data: {
      players: [
        { userId: HERO_ID, holeCards: ['As', 'Kd'], showed: false },
        { userId: VILLAIN_1, holeCards: ['7c', '2d'], showed: false },
      ],
      holeCards: {
        [HERO_ID]: ['As', 'Kd'],
        [VILLAIN_1]: ['7c', '2d'],
        [VILLAIN_2]: ['Qh', 'Qd'],
      },
    },
  };
  const sanitized = sanitizeExportHandRow(exportRow, HERO_ID);
  assert.deepEqual(sanitized.holeCards, {
    [HERO_ID]: ['As', 'Kd'],
    [VILLAIN_2]: ['Qh', 'Qd'],
  });
  assert.equal(sanitized.holeCards[VILLAIN_1], undefined, 'Unshown opponent removed from row.holeCards');
  assert.deepEqual(sanitized.hand_data.holeCards, {
    [HERO_ID]: ['As', 'Kd'],
    [VILLAIN_2]: ['Qh', 'Qd'],
  });
  assert.equal(sanitized.hand_data.holeCards[VILLAIN_1], undefined, 'Unshown opponent removed from hand_data.holeCards');
});

// ─── 5. [P1-3] Stack unit mismatch in buildHandMetadata ─────────────────────

test('[P1-3] buildHandMetadata keeps effectiveStackBb in BB and sets effectiveStack to chip amount (effectiveStackBb * bb) or null when bb is unknown', () => {
  const metaWithBlinds = buildHandMetadata(
    {
      id: 'hand-meta-1',
      small_blind: 1,
      big_blind: 2,
      effectiveStackBb: 100,
    },
    { format: 'cash', variant: 'nlh' },
    ['As', 'Kd'],
  );
  assert.equal(metaWithBlinds.effectiveStackBb, 100);
  assert.equal(metaWithBlinds.effectiveStack, 200, 'effectiveStack must be chip amount (100 BB * $2 = 200), never raw 100 BB');

  const metaMicro = buildHandMetadata(
    {
      id: 'hand-meta-2',
      small_blind: 0.05,
      big_blind: 0.1,
      effectiveStackBb: 100,
    },
    { format: 'cash', variant: 'nlh' },
    ['As', 'Kd'],
  );
  assert.equal(metaMicro.effectiveStackBb, 100);
  assert.equal(metaMicro.effectiveStack, 10);

  const metaUnknownBb = buildHandMetadata(
    {
      id: 'hand-meta-3',
      effectiveStackBb: 100,
    },
    { format: 'cash', variant: 'nlh' },
    ['As', 'Kd'],
  );
  assert.equal(metaUnknownBb.effectiveStackBb, 100);
  assert.equal(metaUnknownBb.effectiveStack, null, 'effectiveStack must be null when big blind is unknown');
});

// ─── 6. [P1-4] solverVerified on representativeDecision ─────────────────────

test('[P1-4] summarizeSolverDecisionGroups and aggregateSolverLeaks include solverVerified: true on representativeDecision', () => {
  const rows = Array.from({ length: 8 }, (_, idx) => ({
    id: `dec-${idx}`,
    hand_external_id: `club-arena:h-${idx}`,
    decision_key: `river:${idx}`,
    evidence_scope: 'club_arena',
    game_id: 'cash-005',
    street: 'river',
    hero_position: 'BB',
    villain_position: 'BTN',
    spot_type: 'facing_bet',
    hero_hand: 'KdJc',
    board_cards: ['Ks', '9d', '4c', '2h', '7s'],
    player_action: idx < 4 ? 'fold' : 'call',
    solver_action: 'call',
    classification: idx < 4 ? 'blunder' : 'best',
    ev_loss: idx < 4 ? 1.25 : 0,
    ev_loss_measured: true,
    solver_verified: true,
  }));

  const [group] = summarizeSolverDecisionGroups(rows);
  assert.ok(group.representativeDecision);
  assert.equal(group.representativeDecision.solverVerified, true);

  const [leak] = aggregateSolverLeaks(rows);
  assert.ok(leak.representative_decision);
  assert.equal(leak.representative_decision.solverVerified, true);
});

// ─── 7. [P1-6 & P2-5] ca_hand_facts AF baseline & stable MTT BTN/UTG keys ───

test('[P1-6 & P2-5] caHandFactsAnalyzer uses baseline.postflopAf for passive_postflop_facts and emits stable mtt_btn_too_tight / mtt_utg_too_loose keys', () => {
  // 7a. Cash postflopAf = 1.50 across 45 postflop actions (below postflopAf[0] - 0.3 = 1.70,
  //     but above turnRiverAf[0] - 0.3 = 1.30 so it was previously missed!)
  const cashRows = Array.from({ length: 45 }, (_, idx) => ({
    hand_id: `cash-af-${idx}`,
    game_variant: 'nlhe',
    tournament_id: null,
    position: 'CO',
    effective_stack_bb_at_deal: 100,
    // 15 bets/raises and 10 calls across 45 hands -> 30 agg, 20 calls -> postflopAf = 1.50 across 50 actions
    af_bet_raise_actions: idx < 30 ? 1 : 0,
    af_call_actions: idx < 20 ? 1 : 0,
  }));
  const cashOut = analyzeCaHandFacts(cashRows);
  const postflopLeak = cashOut.detectedLeaks.find(l => l.leak_type === 'cash_passive_postflop_facts');
  assert.ok(postflopLeak, 'postflopAf=1.50 (< 2.0 - 0.3 = 1.7) must trigger cash_passive_postflop_facts');
  assert.deepEqual(postflopLeak.optimal_range, FORMAT_BASELINES.cash.postflopAf);

  // 7b. Stable mtt_btn_too_tight and mtt_utg_too_loose whether 1 or 2+ stack buckets qualify
  const makeMttPosRows = (includeShortBucket) => {
    const list = [];
    // 45 BTN hands in deep bucket (40bb+) with VPIP = 10% (too tight)
    for (let i = 0; i < 45; i += 1) {
      list.push({
        hand_id: `mtt-btn-${i}`,
        game_variant: 'nlhe',
        tournament_id: 'tourney-1',
        position: 'BTN',
        effective_stack_bb_at_deal: 50,
        vpip: i < 4,
      });
    }
    // 45 UTG hands in deep bucket (40bb+) with VPIP = 45% (too loose)
    for (let i = 0; i < 45; i += 1) {
      list.push({
        hand_id: `mtt-utg-${i}`,
        game_variant: 'nlhe',
        tournament_id: 'tourney-1',
        position: 'UTG',
        effective_stack_bb_at_deal: 50,
        vpip: i < 20,
      });
    }
    if (includeShortBucket) {
      for (let i = 0; i < 35; i += 1) {
        list.push({
          hand_id: `mtt-short-co-${i}`,
          game_variant: 'nlhe',
          tournament_id: 'tourney-1',
          position: 'CO',
          effective_stack_bb_at_deal: 14,
          vpip: i < 10,
        });
      }
    }
    return list;
  };

  const singleBucketLeaks = analyzeCaHandFacts(makeMttPosRows(false)).detectedLeaks.map(l => l.leak_type);
  const multiBucketLeaks = analyzeCaHandFacts(makeMttPosRows(true)).detectedLeaks.map(l => l.leak_type);

  assert.ok(singleBucketLeaks.includes('mtt_btn_too_tight'), '1 qualified bucket must emit stable mtt_btn_too_tight');
  assert.ok(singleBucketLeaks.includes('mtt_utg_too_loose'), '1 qualified bucket must emit stable mtt_utg_too_loose');
  assert.ok(!singleBucketLeaks.some(k => k.endsWith('_btn_too_tight') && k !== 'mtt_btn_too_tight'));
  assert.ok(!singleBucketLeaks.some(k => k.endsWith('_utg_too_loose') && k !== 'mtt_utg_too_loose'));

  assert.ok(multiBucketLeaks.includes('mtt_btn_too_tight'), '2+ qualified buckets must emit stable mtt_btn_too_tight');
  assert.ok(multiBucketLeaks.includes('mtt_utg_too_loose'), '2+ qualified buckets must emit stable mtt_utg_too_loose');
});

// ─── 8. [P2-4] Ante accounting symmetry ──────────────────────────────────────

test('[P2-4] normalizeClubArenaHand records BB ante in forcedPosts and distributes per-seat explicitTotal antes into totalCommittedByActor', () => {
  // 8a. Big Blind Ante (bigBlindAnte: true)
  const bbaRow = {
    id: 'bba-hand-1',
    game_variant: 'nlhe',
    tournament_id: 'mtt-bba',
    small_blind: 100,
    big_blind: 200,
    ante: 200,
    big_blind_ante: true,
    button_seat: 1,
    source: 'manual',
    players: [
      { userId: VILLAIN_1, username: 'BTN', seat: 1, startStack: 4000 },
      { userId: HERO_ID, username: 'HeroBB', seat: 2, startStack: 4000 },
    ],
    hero_private_cards: ['As', 'Kh'],
    actions: [
      { seat: 1, userId: VILLAIN_1, stage: 'preflop', action: 'raise', amount: 400 },
      { seat: 2, userId: HERO_ID, stage: 'preflop', action: 'call', amount: 200 },
    ],
  };
  const bbaHand = normalizeClubArenaHand(bbaRow, HERO_ID);
  assert.ok(bbaHand);
  const bbaPost = bbaHand.forcedPosts.find(p => p.type === 'ante');
  assert.ok(bbaPost, 'Big blind ante must be pushed into forcedPosts');
  assert.equal(bbaPost.playerId, HERO_ID);
  assert.equal(bbaPost.amount, 200);
  assert.equal(bbaPost.amountBB, 1);
  const bbaPoints = getHeroDecisionPoints(bbaHand);
  // Hero started with 4000, posted 200 BB + 200 BBA = 400 committed before decision -> stackAtDecision = 3600 (18 BB)
  assert.equal(bbaPoints[0].stackAtDecision, 3600);
  assert.equal(bbaPoints[0].stackAtDecisionBB, 18);

  // 8b. Per-seat ante with explicit ante_total
  const explicitTotalRow = {
    id: 'ante-total-hand-2',
    game_variant: 'nlhe',
    tournament_id: 'mtt-perseat',
    small_blind: 100,
    big_blind: 200,
    ante: 25,
    ante_total: 100,
    button_seat: 1,
    source: 'manual',
    players: [
      { userId: HERO_ID, username: 'HeroBTN', seat: 1, startStack: 4000 },
      { userId: VILLAIN_1, username: 'SB', seat: 2, startStack: 4000 },
      { userId: VILLAIN_2, username: 'BB', seat: 3, startStack: 4000 },
      { userId: '44444444-4444-4444-8444-444444444444', username: 'CO', seat: 4, startStack: 4000 },
    ],
    hero_private_cards: ['As', 'Kh'],
    actions: [
      { seat: 4, userId: '44444444-4444-4444-8444-444444444444', stage: 'preflop', action: 'fold' },
      { seat: 1, userId: HERO_ID, stage: 'preflop', action: 'raise', amount: 450 },
    ],
  };
  const perSeatHand = normalizeClubArenaHand(explicitTotalRow, HERO_ID);
  assert.ok(perSeatHand);
  const antePosts = perSeatHand.forcedPosts.filter(p => p.type === 'ante');
  assert.equal(antePosts.length, 4, 'Per-seat explicitTotal antes must record forcedPosts for all 4 players');
  const heroPoints = getHeroDecisionPoints(perSeatHand);
  // Hero started with 4000 and posted 25 ante -> stackAtDecision = 3975 (19.875 BB)
  assert.equal(heroPoints[0].stackAtDecision, 3975);
  assert.equal(heroPoints[0].stackAtDecisionBB, 19.875);
});

// ─── 9. [P2-6] Blunder threshold unification ─────────────────────────────────

test('[P2-6] BLUNDER_OPTIMAL_FREQUENCY_THRESHOLD is unified across solverDecisionEvidence and directSolverMatcher', () => {
  assert.equal(BLUNDER_OPTIMAL_FREQUENCY_THRESHOLD, 80);
  assert.equal(MATCHER_BLUNDER_THRESHOLD, BLUNDER_OPTIMAL_FREQUENCY_THRESHOLD);

  // At 75% optimal frequency (with 25% secondary action), choosing a 0% action is 'wrong' (not 'blunder') in both
  const freqGrade75 = classifyFrequencyDecision({ bet: 75, check: 25, fold: 0 }, 'fold', 'bet');
  const matcherGrade75 = classifyFromPercentFrequency(0, 75, false);
  assert.equal(freqGrade75.classification, 'wrong');
  assert.equal(matcherGrade75, 'wrong');

  // At 80% optimal frequency, choosing a 0% action is 'blunder' in both
  const freqGrade80 = classifyFrequencyDecision({ bet: 80, check: 20, fold: 0 }, 'fold', 'bet');
  const matcherGrade80 = classifyFromPercentFrequency(0, 80, false);
  assert.equal(freqGrade80.classification, 'blunder');
  assert.equal(matcherGrade80, 'blunder');
});

// ─── 10. [P1-7] Ratio formatting in buildLeakTakeaway ────────────────────────

test('[P1-7] buildLeakTakeaway formats aggression factor ratio leaks with .toFixed(2) and no % suffix', () => {
  const ratioTypes = [
    'passive_postflop',
    'over_aggressive_postflop',
    'cash_passive_postflop_facts',
    'mtt_passive_postflop_facts',
  ];

  for (const leakType of ratioTypes) {
    const takeaway = buildLeakTakeaway({
      leak_type: leakType,
      current_frequency: 1.4,
      optimal_frequency: 2.8,
      situation_class: 'Postflop Aggression Factor',
    });
    assert.match(takeaway.whatYouAreDoing, /1\.40 vs 2\.80/, `${leakType} must format with .toFixed(2)`);
    assert.doesNotMatch(takeaway.whatYouAreDoing, /%/, `${leakType} must not include a % suffix`);
  }

  // Non-ratio percentage leaks continue to format with %
  const pctTakeaway = buildLeakTakeaway({
    leak_type: 'river_overfold',
    current_frequency: 72,
    optimal_frequency: 48,
    situation_class: 'River Defense',
  });
  assert.match(pctTakeaway.whatYouAreDoing, /72% vs 48%/);
});
