/**
 * Phase 2 Adversarial Hardening & Anti-Regression Suite
 *
 * Executable behavioral tests covering every root-cause defect discovered during
 * the 5-agent deep audit across World Hub Personal Assistant, Leak Finder,
 * Direct Solver Matcher, Hand Audit, Coaching/Training Plan, Equity Engine,
 * Scenario Contract, and Privacy/Security boundaries.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  comboIndex,
  deriveV2ActionSizingPct,
  classifyFromPercentFrequency,
  findSolvedSpotV2Match,
  findMemoryChartMatch,
} from '../src/lib/training/directSolverMatcher.mjs';
import {
  isProvenanceCompleteAuditedDecision,
  summarizeProvenanceCompleteHandAudit,
} from '../src/lib/training/handHistoryReviewAuthority.mjs';
import {
  normalizeClubArenaHand,
  clubArenaHandRejectionReason,
  syncClubArenaHandsForAudit,
  MATCHER_VERSION,
} from '../src/lib/training/handAuditEngine.js';
import {
  classifyHandAuditEligibility,
  classifyLeakStatus,
} from '../src/lib/personal-assistant/leakRecord.js';
import { analyzeCaHandFacts } from '../src/lib/personal-assistant/caHandFactsAnalyzer.mjs';
import { buildTrainingPlan, evidenceFingerprint } from '../src/lib/personal-assistant/coachingIntelligence.mjs';
import { leakToDrill, evImpact, migrateRecord } from '../src/lib/sandbox/leakReview.js';
import { executeSingleHandAudit } from '../src/lib/personal-assistant/handAuditRouteCore.mjs';
import { sanitizeExportHandRow } from '../src/lib/personal-assistant/dataLifecycle.mjs';
import { gradeAction, parseActionLabel } from '../src/lib/sandbox/actionGrading.js';
import { calculateEquity, expandRangeToCombos, simulateRunouts } from '../src/lib/sandbox/EquityEngine.js';
import { validateAndNormalizeScenario } from '../src/lib/sandbox/scenarioContract.mjs';
import { chooseTrainingCacheMatch } from '../src/lib/sandbox/trainingCacheSolver.mjs';
import { sealCanonicalTrainingQuestion } from './helpers/canonicalTrainingPolicyFixture.mjs';
import { V2_COMBO_ORDER, V2_SOURCE_COMBO_ORDER_SCHEMA } from '../src/utils/v2Matrix.js';

const VALID_SHA = 'a'.repeat(64);

function makeHarvestedV2Row({
  id = 'v2-harvest-1',
  gameType = 'mtt_6max_chipev',
  street = 'turn',
  stackDepth = 20,
  board = ['2d', 'Ah', 'Kd', '7c'],
  node = 'r:0:c:c:7c',
  hero = 'OOP',
  position = 'BB',
  oopPlayer = 'BB',
  ipPlayer = 'BTN',
  rootPotBb = 5.5,
  effStackBb = 19,
  actions = [
    { code: 'b412', key: 'bet_chips_412', size_chips: 412, size_semantics: 'cumulative_postflop_contribution_target', size_pct: null },
    { code: 'b1900', key: 'bet_chips_1900', size_chips: 1900, size_semantics: 'cumulative_postflop_contribution_target', size_pct: null },
    { code: 'c', key: 'check', size_chips: 0, size_pct: null },
  ],
  targetComboIdx,
  probs = { b412: 0.70, b1900: 0.25, c: 0.05 },
} = {}) {
  const frequencies = {};
  for (const a of actions) {
    const arr = new Array(1326).fill(0);
    arr[targetComboIdx] = probs[a.code] ?? 0;
    frequencies[a.code] = arr;
  }
  const prefix = street === 'turn' ? 'turn_' : street === 'river' ? 'river_' : '';
  return {
    id,
    scenario_hash: `${prefix}${gameType}_${position}_${stackDepth}bb_${board.join('')}`,
    game_type: gameType,
    stack_depth: stackDepth,
    street,
    solved_v2_at: '2026-11-20T00:00:00Z',
    quality_status: 'validated',
    solver_version: 'PioSOLVER-3.0',
    solver_binary_checksum: '1'.repeat(64),
    machine_id: 'M1',
    pipeline_commit: '2'.repeat(40),
    manifest_version: 'v2-prod',
    manifest_checksum: '3'.repeat(64),
    source_artifact_checksum: '4'.repeat(64),
    audited_at: '2026-11-20T00:00:00Z',
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
      exploitability_pct: 0.12,
      convergence: {
        schema: 'piosolver.calc-results.v1',
        source_command: 'calc_results',
        accuracy_fraction: 0.005,
        starting_pot_chips: rootPotBb * 100,
        achieved_exploitability_chips: rootPotBb * 100 * 0.0012,
        achieved_exploitability_fraction: 0.0012,
      },
      actions,
      frequencies,
      hand_evs_bb: new Array(1326).fill(2.4),
    },
  };
}

test('directSolverMatcher matches harvested V2 rows with size_pct:null / size_chips, turn_ prefix, and all-in jam detection', async () => {
  const holeCards = ['As', 'Qc'];
  const cIdx = comboIndex(holeCards);
  const row = makeHarvestedV2Row({ targetComboIdx: cIdx });
  let queriedHashes = [];
  const db = {
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
  };

  const hand = { format: 'tournament', tableSize: 6, hero: { stack: 20 } };
  // 1. Bet 75% pot matches b412 (412 / 550 = 74.9%) even when size_pct is null!
  const betMatch = await findSolvedSpotV2Match(db, hand, {
    street: 'turn',
    position: 'BB',
    villainPosition: 'BTN',
    nodeClass: 'hero_bets_or_checks',
    holeCards,
    board: ['Ah', 'Kd', '2d', '7c'],
    potBeforeBB: 5.5,
    action: 'bet',
    sizingPct: 75,
  });
  assert.ok(betMatch, 'must match harvested turn V2 row with size_pct:null via size_chips');
  assert.ok(queriedHashes.some(h => h.startsWith('turn_mtt_6max_chipev_BB_20bb_')));
  assert.equal(betMatch.selectedFrequency, 70);
  assert.equal(betMatch.optimalFrequency, 70);
  assert.equal(betMatch.classification, 'best');

  // 2. All-in matches b1900 (size_chips === eff_stack_bb * 100 = 1900) even without "allin" in key!
  const jamMatch = await findSolvedSpotV2Match(db, hand, {
    street: 'turn',
    position: 'BB',
    villainPosition: 'BTN',
    nodeClass: 'hero_bets_or_checks',
    holeCards,
    board: ['Ah', 'Kd', '2d', '7c'],
    potBeforeBB: 5.5,
    action: 'allin',
  });
  assert.ok(jamMatch, 'must match harvested all-in chip target');
  assert.equal(jamMatch.selectedFrequency, 25);
  assert.equal(jamMatch.classification, 'best');
});

test('findMemoryChartMatch grades sparse pure-fold blunders, blocks limped pots, and maps BB allin call', async () => {
  const openChart = {
    chart_id: 'mtt-utg-15bb',
    game_type: 'Tournament',
    stack_depth: 15,
    hero_position: 'UTG',
    villain_action: 'fold_to_hero',
    hand_matrix: { AA: { push: 1, fold: 0 } }, // 72o intentionally omitted (sparse pure fold)
  };
  const sbPushChart = {
    chart_id: 'mtt-bb-sbpush-10bb',
    game_type: 'Tournament',
    stack_depth: 10,
    hero_position: 'BB',
    villain_action: 'sb_push',
    hand_matrix: { AQs: { call: 1, fold: 0 } },
  };
  const makeChartDb = (row) => ({
    from() {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return Promise.resolve({ data: row, error: null }); },
      };
      return chain;
    },
  });

  // 1. Shoving omitted 72o from UTG at 15bb is caught as a 0% blunder!
  const trashBlunder = await findMemoryChartMatch(
    makeChartDb(openChart),
    { format: 'tournament', hero: { stack: 15 } },
    { street: 'preflop', position: 'UTG', nodeClass: 'preflop_open', holeCards: ['7s', '2d'], action: 'allin', priorActions: [] },
  );
  assert.ok(trashBlunder);
  assert.equal(trashBlunder.solverAction, 'fold');
  assert.equal(trashBlunder.selectedFrequency, 0);
  assert.equal(trashBlunder.optimalFrequency, 100);
  assert.equal(trashBlunder.classification, 'blunder');

  // 2. Limped pot fails closed (never priced against unopened fold_to_hero chart)
  const limpedMiss = await findMemoryChartMatch(
    makeChartDb(openChart),
    { format: 'tournament', hero: { stack: 15 } },
    {
      street: 'preflop', position: 'UTG', nodeClass: 'preflop_open',
      holeCards: ['As', 'Ad'], action: 'allin',
      priorActions: [{ position: 'LJ', action: 'call' }],
    },
  );
  assert.equal(limpedMiss, null);

  // 3. BB calling SB shove as allin maps cleanly to call
  const bbCall = await findMemoryChartMatch(
    makeChartDb(sbPushChart),
    { format: 'tournament', hero: { stack: 10 } },
    {
      street: 'preflop', position: 'BB', villainPosition: 'SB', nodeClass: 'preflop_facing_raise',
      holeCards: ['Ah', 'Qh'], action: 'allin',
      priorActions: [{ position: 'SB', action: 'allin' }],
    },
  );
  assert.ok(bbCall);
  assert.equal(bbCall.solverAction, 'call');
  assert.equal(bbCall.classification, 'best');
});

test('handHistoryReviewAuthority accepts MEMORY_CHARTS_GOLD & SOLVED_SPOTS_GOLD_V2 while rejecting legacy CHART', () => {
  const base = {
    solverVerified: true,
    matchTier: 1,
    classification: 'best',
    street: 'preflop',
    playerAction: 'allin',
    solverAction: 'allin',
    evLossMeasured: false,
  };
  assert.equal(isProvenanceCompleteAuditedDecision({ ...base, solverSource: `MEMORY_CHARTS_GOLD|${MATCHER_VERSION}` }), true);
  assert.equal(isProvenanceCompleteAuditedDecision({ ...base, solverSource: `SOLVED_SPOTS_GOLD_V2|${MATCHER_VERSION}` }), true);
  assert.equal(isProvenanceCompleteAuditedDecision({ ...base, solverSource: `CHART|${MATCHER_VERSION}` }), false);

  const summary = summarizeProvenanceCompleteHandAudit({
    decisions: [{ ...base, solverSource: `MEMORY_CHARTS_GOLD|${MATCHER_VERSION}` }],
  });
  assert.equal(summary.authority, 'provenance_complete_server_audit');
  assert.equal(summary.score, 100);
});

test('rit_boards jsonb array is rejected and bomb_pot:false / dead-button hands are accepted cleanly', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const baseRow = {
    id: '22222222-2222-4222-8222-222222222222',
    game_variant: 'nlh',
    small_blind: 1,
    big_blind: 2,
    bomb_pot: false,
    kill_pot: false,
    rit_boards: null,
    button_seat: 9, // dead button (not in players seats [1, 3, 5])
    players: [
      { userId, seatIndex: 1, startStack: 200, holeCards: ['As', 'Ks'] },
      { userId: 'opp-1', seatIndex: 3, startStack: 200 },
      { userId: 'opp-2', seatIndex: 5, startStack: 200 },
    ],
    actions: [{ playerId: userId, stage: 'preflop', action: 'raise', amount: 6 }],
    created_at: '2026-11-24T00:00:00Z',
  };

  // Explicit false flags + dead button must be accepted and assign valid hero position!
  assert.equal(classifyHandAuditEligibility(baseRow).eligible, true);
  assert.equal(clubArenaHandRejectionReason(baseRow, userId), null);
  const norm = normalizeClubArenaHand(baseRow, userId);
  assert.ok(norm, 'bomb_pot:false + dead-button hand must normalize cleanly');
  assert.ok(norm.hero.position && norm.hero.position.length > 0, 'dead button must still assign valid hero position');

  // JSONB rit_boards array must be rejected by BOTH eligibility and engine!
  const ritRow = { ...baseRow, rit_boards: [['Ah', 'Kd', '2c', '5s', '9h']] };
  assert.equal(classifyHandAuditEligibility(ritRow).eligible, false);
  assert.equal(clubArenaHandRejectionReason(ritRow, userId), 'unsupported_special_format');
  assert.equal(normalizeClubArenaHand(ritRow, userId), null);
});

test('caHandFactsAnalyzer uses call-only AF (no check-inclusive false positives), separates tournament stacks, and classifyLeakStatus creates ratio leaks', () => {
  // 50 cash hands where player checks often (passive_actions_turn=3) with healthy call-only AF (3:1)
  const healthyCashRows = Array.from({ length: 50 }, (_, i) => ({
    hand_id: `h-${i}`,
    game_variant: 'nlh',
    tournament_id: null,
    effective_stack_bb_at_deal: 100,
    position: 'BTN',
    aggressive_actions_turn: 1,
    passive_actions_turn: 3, // includes checks!
    af_bet_raise_actions: 3,
    af_call_actions: 1,
  }));
  const healthyRes = analyzeCaHandFacts(healthyCashRows);
  assert.equal(healthyRes.cash.turnRiverAf, null, 'must not fabricate turn/river AF from check-inclusive passive_actions');
  assert.equal(healthyRes.cash.postflopAf, 3);
  assert.ok(!healthyRes.detectedLeaks.some(l => l.leak_type.includes('passive')));

  // Truly passive call-only AF (0.5) must emit passive_postflop_facts AND classifyLeakStatus must create it!
  const passiveCashRows = Array.from({ length: 50 }, (_, i) => ({
    hand_id: `p-${i}`,
    game_variant: 'nlh',
    tournament_id: null,
    effective_stack_bb_at_deal: 100,
    position: 'BTN',
    af_bet_raise_actions: 1,
    af_call_actions: 2,
  }));
  const passiveRes = analyzeCaHandFacts(passiveCashRows);
  const afLeak = passiveRes.detectedLeaks.find(l => l.leak_type === 'cash_passive_postflop_facts');
  assert.ok(afLeak, 'call-only passive AF must emit cash_passive_postflop_facts');
  assert.equal(classifyLeakStatus(null, afLeak.current_frequency, afLeak.optimal_range), 'emerging');

  // Unknown-stack tournament hands must NOT default to <20bb 'short' bucket!
  const unknownStackMtt = Array.from({ length: 40 }, (_, i) => ({
    hand_id: `m-${i}`,
    game_variant: 'nlh',
    tournament_id: 'tourn-1',
    effective_stack_bb_at_deal: null,
    position: 'BB',
    blind_defense_opportunity: true,
    defended_blind: false,
  }));
  const mttRes = analyzeCaHandFacts(unknownStackMtt);
  const mttLeak = mttRes.detectedLeaks.find(l => l.leak_type.includes('blind_defense_too_tight'));
  assert.ok(mttLeak);
  assert.equal(mttLeak.leak_type, 'mtt_blind_defense_too_tight', 'unknown stack MTT must not be tagged mtt_short_');
});

test('buildTrainingPlan counts classification:"best" as correct, supports snake_case leaks in leakToDrill, and includes baseline in fingerprint', () => {
  const baseline = '2026-11-20T00:00:00.000Z';
  const snakeLeak = {
    id: 'leak-ca-1',
    leak_type: 'solver_club_arena_cash_002_flop_btn_cbet',
    leak_category: 'flop',
    situation_class: 'BTN Flop C-Bet (Cash NLH)',
    status: 'persistent',
    source_system: 'ca_hand_facts',
    recommended_drill: 'cash-002',
    avg_ev_loss_bb: 1.5,
    occurrence_count: 10,
  };
  assert.equal(evImpact(snakeLeak), 15);
  const drill = leakToDrill(snakeLeak);
  assert.ok(drill, 'leakToDrill must accept snake_case normalizeUserLeakRow');
  assert.equal(drill.street, 'Flop');
  assert.equal(drill.position, 'BTN');
  assert.equal(drill.game, 'cash-002');

  const postDecisions = Array.from({ length: 10 }, (_, i) => ({
    hand_external_id: `club-arena:hand-${i}`,
    evidence_scope: 'club_arena',
    game_id: 'cash-002',
    street: 'flop',
    hero_position: 'BTN',
    spot_type: 'cbet',
    classification: 'best', // optimal GTO play!
    solver_verified: true,
    solver_source: `PIOSOLVER|${MATCHER_VERSION}`,
    hand_played_at: '2026-11-22T00:00:00.000Z',
    audited_at: '2026-11-23T00:00:00.000Z',
  }));
  const plan = buildTrainingPlan({
    leaks: [snakeLeak],
    decisions: postDecisions,
    reviews: [{
      leak_id: 'leak-ca-1',
      retired: true,
      strong_streak: 4,
      interval_days: 21,
      remediation_baseline_at: baseline,
    }],
  });
  const mod = plan.modules[0];
  assert.equal(mod.tableVerification.status, 'confirmed_fixed_at_tables');
  assert.equal(mod.tableVerification.postBaselineErrorRate, 0);
  assert.equal(mod.drillParams?.game, 'cash-002');

  // Fingerprint changes when remediation_baseline_at or interval_days changes
  const fp1 = evidenceFingerprint({ reviews: [{ leak_id: 'l1', interval_days: 3, remediation_baseline_at: null, last_outcome: { score: 0.8 } }] });
  const fp2 = evidenceFingerprint({ reviews: [{ leak_id: 'l1', interval_days: 21, remediation_baseline_at: baseline, last_outcome: { score: 0.95 } }] });
  assert.notEqual(fp1, fp2);

  // migrateRecord preserves remediationBaselineAt when present and omits when absent
  const m1 = migrateRecord({ leakId: 'l1', reps: 1, remediationBaselineAt: baseline });
  assert.equal(m1.remediationBaselineAt, baseline);
  const m2 = migrateRecord({ leakId: 'l1', reps: 1 });
  assert.equal('remediationBaselineAt' in m2, false);
});

test('handAuditRouteCore matches solver_club_arena leaks, populates streetTimeline board, and blocks live grading during cooldown', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const handId = '22222222-2222-4222-8222-222222222222';
  const bundleData = {
    found: true,
    hand: {
      id: handId,
      hand_number: 42,
      game_variant: 'nlh',
      small_blind: 1,
      big_blind: 2,
      button_seat: 0,
      source: 'manual',
      community_cards: ['Ah', 'Kd', '7c'],
      players: [
        { userId, seatIndex: 0, startStack: 200, holeCards: ['As', 'Qc'] },
        { userId: 'opp-1', seatIndex: 1, startStack: 200 },
      ],
      actions: [
        { playerId: userId, stage: 'preflop', action: 'raise', amount: 6 },
        { playerId: 'opp-1', stage: 'preflop', action: 'call', amount: 6 },
        { playerId: 'opp-1', stage: 'flop', action: 'check', amount: 0 },
        { playerId: userId, stage: 'flop', action: 'bet', amount: 6 },
      ],
      created_at: '2026-11-24T00:00:00Z',
    },
    fact: { hole_cards: ['As', 'Qc'], effective_stack_bb_at_deal: 100 },
    decisions: [
      {
        decision_key: 'd-1',
        game_id: 'cash-002',
        street: 'flop',
        hero_position: 'EP',
        spot_type: 'cbet',
        player_action: 'check',
        solver_action: 'bet_50',
        classification: 'blunder',
        ev_loss: 1.2,
        ev_loss_measured: true,
        solver_verified: true,
        solver_source: `PIOSOLVER|${MATCHER_VERSION}`,
      },
      {
        decision_key: 'd-2',
        game_id: 'cash-002',
        street: 'preflop',
        hero_position: 'BTN',
        spot_type: 'open',
        player_action: 'raise',
        solver_action: 'raise',
        classification: 'best',
        ev_loss: 0,
        ev_loss_measured: true,
        solver_verified: true,
        solver_source: `PIOSOLVER|${MATCHER_VERSION}`,
      },
    ],
    leaks: [
      {
        id: 'leak-99',
        leak_type: 'solver_club_arena_cash_002_flop_ep_cbet',
        leak_category: 'flop',
        situation_class: 'EP Flop C-Bet',
        status: 'persistent',
        source_system: 'solver_engine',
        recommended_drill: 'cash-002',
      },
    ],
  };

  const runReq = async ({ accessLevel = 'full_access', preloadedDecisions = bundleData.decisions }) => {
    const resObj = {
      statusCode: 200,
      headers: {},
      body: null,
      setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    await executeSingleHandAudit(
      { method: 'GET', query: { hand: handId }, headers: {} },
      resObj,
      {
        getDb: () => ({
          async rpc() { return { data: { ...bundleData, decisions: preloadedDecisions }, error: null }; },
          from() {
            const chain = {
              select() { return chain; },
              eq() { return chain; },
              order() { return chain; },
              limit() { return Promise.resolve({ data: [], error: null }); },
            };
            return chain;
          },
        }),
        getUser: async () => ({ user: { id: userId }, error: null, status: 200 }),
        checkAccess: async () => ({ allowed: true, accessLevel }),
        auditHands: async () => { throw new Error('must not compute live solver during cooldown'); },
      },
    );
    return resObj;
  };

  const full = await runReq({ accessLevel: 'full_access' });
  assert.equal(full.statusCode, 200);
  assert.equal(full.body.matchedLeaks.length, 1, 'must match solver_club_arena_* leak via evidenceScope');
  assert.equal(full.body.matchedLeaks[0].id, 'leak-99');
  assert.equal(full.body.trainingAction.drillParams.position, 'UTG', 'EP must normalize to ALLOWED_DRILL_POSITIONS UTG');
  const flopStep = full.body.streetTimeline.find(s => s.street === 'flop');
  assert.deepEqual(flopStep.board, ['Ah', 'Kd', '7c'], 'streetTimeline flop must include board cards');

  // During LIMITED_REVIEW cooldown with no preloaded decisions, GET must NOT compute new live solver grades!
  const cooldown = await runReq({ accessLevel: 'limited_review', preloadedDecisions: [] });
  assert.equal(cooldown.statusCode, 200);
  assert.equal(cooldown.body.audited, false);
  assert.equal(cooldown.body.reason, 'cooldown_active');
});

test('sanitizeExportHandRow strips opponent hole cards from hole_cards map, summary object/string, and player.heroCards', () => {
  const row = {
    id: 'hand-1',
    players: [
      { userId: 'u-owner', holeCards: ['As', 'Ks'], showed: false },
      { userId: 'u-opp-folded', heroCards: ['7c', '2d'], cards: ['7c', '2d'], showed: false },
      { userId: 'u-opp-shown', holeCards: ['Qh', 'Qd'], showed: true },
    ],
    hole_cards: {
      'u-owner': ['As', 'Ks'],
      'u-opp-folded': ['7c', '2d'],
      'u-opp-shown': ['Qh', 'Qd'],
    },
    summary: JSON.stringify({
      players: [
        { userId: 'u-owner', heroCards: ['As', 'Ks'], showed: false },
        { userId: 'u-opp-folded', heroCards: ['7c', '2d'], holeCards: ['7c', '2d'], showed: false },
      ],
      hole_cards: { 'u-owner': ['As', 'Ks'], 'u-opp-folded': ['7c', '2d'] },
    }),
  };

  const clean = sanitizeExportHandRow(row, 'u-owner');
  assert.deepEqual(clean.players[0].holeCards, ['As', 'Ks']);
  assert.equal(clean.players[1].heroCards, undefined);
  assert.equal(clean.players[1].cards, undefined);
  assert.deepEqual(clean.players[2].holeCards, ['Qh', 'Qd']);
  assert.deepEqual(clean.hole_cards, { 'u-owner': ['As', 'Ks'], 'u-opp-shown': ['Qh', 'Qd'] });
  const parsedSummary = JSON.parse(clean.summary);
  assert.equal(parsedSummary.players[1].heroCards, undefined);
  assert.equal(parsedSummary.players[1].holeCards, undefined);
  assert.deepEqual(parsedSummary.hole_cards, { 'u-owner': ['As', 'Ks'] });
});

test('Sandbox math hardening: actionGrading, EquityEngine collisions/blocked ranges/diagonals, scenarioContract, and trainingCacheSolver', () => {
  // 1. actionGrading Overbet / Push / Check-Call
  assert.equal(gradeAction('Bet 150%', 'Overbet 150%'), true);
  assert.equal(gradeAction('Bet Pot', 'Overbet 150%'), true);
  assert.equal(gradeAction('Push', 'All-In'), true);
  assert.equal(gradeAction('Check', 'Check/Call'), true);
  assert.equal(parseActionLabel('Overbet 200%').type, 'bet');

  // 2. EquityEngine: card collision rejection, case normalization, blocked range, diagonal connectors
  const collision = calculateEquity(['Ah', 'Kd'], ['ah', 'Ts', '2c'], 100, null, 42);
  assert.equal(collision.invalid, true);
  assert.equal(collision.error, 'card_collision');
  assert.equal(collision.heroEquity, null);

  const blocked = calculateEquity(['Ah', 'As'], ['Ad', 'Ac', '2h'], 100, 'AA', 42);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.heroEquity, null);

  const runoutCollision = simulateRunouts(['Ah', 'Kd'], ['Ah', 'Ts', '2c'], 30, null, 42);
  assert.equal(runoutCollision.baseline, null);

  const diag = expandRangeToCombos('JTs-87s');
  assert.equal(diag.length, 16, 'JTs, T9s, 98s, 87s = 4 * 4 = 16 suited combos');

  // 3. scenarioContract: bare 'bet', space-separated range, dead-street all-in closure
  const parsed = validateAndNormalizeScenario({
    gameType: 'cash',
    heroPosition: 'BTN',
    heroStack: 100,
    potSize: 10,
    heroHand: { card1: 'As', card2: 'Kd' },
    board: { flop: ['Qh', 'Jc', '4s'] },
    villains: [{ position: 'BB', stack: 100, range: 'AA KK QQ' }],
    actionHistory: [
      { street: 'flop', position: 'BB', action: 'check' },
      { street: 'flop', position: 'BTN', action: 'bet' },
    ],
  });
  assert.equal(parsed.villains[0].range, 'AA,KK,QQ');
  assert.equal(parsed.actionHistory[1].action, 'bet');

  assert.throws(
    () => validateAndNormalizeScenario({
      gameType: 'cash',
      heroPosition: 'BTN',
      heroStack: 100,
      potSize: 10,
      heroHand: { card1: 'As', card2: 'Kd' },
      board: { flop: ['Qh', 'Jc', '4s'], turn: '2d' },
      villains: [{ position: 'BB', stack: 100, range: 'AA' }],
      actionHistory: [
        { street: 'flop', position: 'BB', action: 'allin' },
        { street: 'flop', position: 'BTN', action: 'call' },
        { street: 'turn', position: 'BTN', action: 'b50' },
        { street: 'turn', position: 'BTN', action: 'b50' },
      ],
    }),
    (err) => Array.isArray(err?.issues) && err.issues.some(i => i.code === 'round_closed'),
  );

  // 4. trainingCacheSolver prefers contextVerified:true over lower question_id
  const prov = {
    verified: true,
    scenarioHash: 'hardening-fixture',
    solverVersion: 'fixture-1',
    solverBinaryChecksum: 'a'.repeat(64),
    machineId: 'M1',
    pipelineCommit: 'b'.repeat(40),
    manifestVersion: 'fixture-1',
    manifestChecksum: 'c'.repeat(64),
    sourceArtifactChecksum: 'd'.repeat(64),
    qualityStatus: 'validated',
    auditedAt: '2026-11-20T00:00:00Z',
  };
  const makeQuestion = (qid, potSize) => ({
    id: qid,
    question_id: qid,
    game_id: 'cash-002',
    question_data: sealCanonicalTrainingQuestion({
      source: 'PIO',
      solverProvenance: prov,
      dataQuality: 'VERIFIED',
      heroHand: 'AKo',
      boardCards: ['Qh', 'Jc', '4s'],
      gtoFrequencies: { c: 70, b33: 30 },
      options: [{ id: 'c', text: 'Check' }, { id: 'b33', text: 'Bet 33%' }],
      scenario: {
        street: 'flop',
        heroPosition: 'BTN',
        villainPosition: 'BB',
        stackDepth: 100,
        villainStack: 100,
        numberOfOpponents: 1,
        potSize,
        gameType: 'cash',
        villainRange: 'AA,KK',
        actionHistory: [],
      },
    }),
  });
  const decisionContext = validateAndNormalizeScenario({
    gameType: 'cash',
    heroPosition: 'BTN',
    heroStack: 100,
    potSize: 6,
    heroHand: { card1: 'As', card2: 'Kd' },
    board: { flop: ['Qh', 'Jc', '4s'] },
    villains: [{ position: 'BB', stack: 100, range: 'AA,KK' }],
    actionHistory: [],
  });
  const chosen = chooseTrainingCacheMatch(
    [makeQuestion('a-unverified', 99), makeQuestion('z-verified', 6)],
    {
      heroNotation: 'AKo',
      heroPosition: 'BTN',
      heroStack: 100,
      street: 'flop',
      boardCards: ['Qh', 'Jc', '4s'],
      facingBet: false,
      decisionContext,
    },
  );
  assert.ok(chosen);
  assert.equal(chosen.contextVerified, true);
  assert.equal(chosen.row.question_id, 'z-verified');
});

test('Static security & UI wiring guards: audit-jobs fail-closed + RTA GET guard, weekly-spot strips correct_action, coaching selects interval_days, CSS scoped', () => {
  const auditJobs = fs.readFileSync(path.resolve('pages/api/assistant/leaks/audit-jobs.js'), 'utf8');
  assert.match(auditJobs, /if \(!url \|\| !key\)/, 'audit-jobs.js must fail closed on missing service role env');
  assert.match(auditJobs, /req\.method === 'GET'[\s\S]*?checkSandboxAccess\(db\(\), user\.id\)/, 'audit-jobs GET must enforce live-play RTA guard before kicking worker');

  const auditWorker = fs.readFileSync(path.resolve('app/api/assistant/leaks/audit-worker/route.js'), 'utf8');
  assert.match(auditWorker, /private, no-store, max-age=0/);
  assert.match(auditWorker, /checkSandboxAccess\(db\(\), job\.user_id\)/);

  const weeklySpot = fs.readFileSync(path.resolve('pages/api/assistant/sandbox/weekly-spot.js'), 'utf8');
  assert.match(weeklySpot, /function stripAnswerKey/);
  assert.match(weeklySpot, /res\.setHeader\('Allow', 'GET'\)/);

  const coaching = fs.readFileSync(path.resolve('pages/api/assistant/coaching.js'), 'utf8');
  assert.match(coaching, /interval_days/);
  assert.match(coaching, /\.like\('solver_source', '%hand-audit-v3%'\)/);
  assert.match(coaching, /const rejected = audit\?\.progress \|\| \{\};/);

  const css = fs.readFileSync(path.resolve('src/components/personal-assistant/CoachingWorkspace.module.css'), 'utf8');
  assert.match(css, /\.priorityList > li > button/);
  assert.doesNotMatch(css, /\.priorityList button\s*\{/);
});
