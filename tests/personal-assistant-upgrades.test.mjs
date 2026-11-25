import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  FORMAT_BASELINES,
  classifyStackBucket,
  analyzeCaHandFacts,
  summarizeSolverCoverageGaps,
} from '../src/lib/personal-assistant/caHandFactsAnalyzer.mjs';
import {
  buildTrainingPlan,
  buildCoachingSnapshot,
} from '../src/lib/personal-assistant/coachingIntelligence.mjs';
import { executeSingleHandAudit } from '../src/lib/personal-assistant/handAuditRouteCore.mjs';
import { ACCESS_LEVELS, CONTEXT_STATES } from '../src/lib/personal-assistant/contextAuthority.js';
import { syncClubArenaHandsForAudit, MATCHER_VERSION } from '../src/lib/training/handAuditEngine.js';

const ROOT = process.cwd();

function makeResponse() {
  const headers = new Map();
  let statusCode = 200;
  let body = null;
  const res = {
    setHeader(k, v) { headers.set(String(k).toLowerCase(), v); },
    getHeader(k) { return headers.get(String(k).toLowerCase()); },
    status(code) { statusCode = code; return res; },
    json(payload) { body = payload; return res; },
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
  return res;
}

function makeCaFactRow(overrides = {}) {
  return {
    hand_id: `hand-${Math.random().toString(36).slice(2, 10)}`,
    tournament_id: null,
    game_variant: 'nlh',
    effective_stack_bb_at_deal: 100,
    position: 'BTN',
    vpip: false,
    pfr: false,
    three_bet: false,
    three_bet_opportunity: false,
    faced_three_bet: false,
    folded_to_three_bet: false,
    squeezed: false,
    squeeze_opportunity: false,
    stole: false,
    steal_opportunity: false,
    defended_blind: false,
    blind_defense_opportunity: false,
    cbet_flop: false,
    cbet_flop_opportunity: false,
    barreled_turn: false,
    barrel_turn_opportunity: false,
    barreled_river: false,
    barrel_river_opportunity: false,
    check_raised: false,
    check_raise_opportunity: false,
    donk_bet: false,
    donk_opportunity: false,
    probe_bet: false,
    probe_opportunity: false,
    saw_flop: false,
    went_to_showdown: false,
    won_at_showdown: false,
    aggressive_actions_flop: 0,
    passive_actions_flop: 0,
    aggressive_actions_turn: 0,
    passive_actions_turn: 0,
    aggressive_actions_river: 0,
    passive_actions_river: 0,
    af_bet_raise_actions: 0,
    af_call_actions: 0,
    ...overrides,
  };
}

test('caHandFactsAnalyzer separates Cash vs Tournament stack buckets, excludes PLO/OFC, and detects opportunity-gated leaks', () => {
  assert.equal(classifyStackBucket(14), 'short');
  assert.equal(classifyStackBucket(28), 'mid');
  assert.equal(classifyStackBucket(65), 'deep');
  assert.equal(classifyStackBucket(null), 'unknown');
  assert.ok(FORMAT_BASELINES.cash.blindDefense[0] < FORMAT_BASELINES.tournament_short.blindDefense[0]);

  const rows = [];
  // 50 Cash NLH hands with severe blind under-defense, low turn barrel, passive turn/river AF, and tight BTN
  for (let i = 0; i < 50; i += 1) {
    rows.push(makeCaFactRow({
      hand_id: `cash-${i}`,
      tournament_id: null,
      game_variant: 'nlh',
      effective_stack_bb_at_deal: 100,
      position: 'BTN',
      vpip: i < 8, // 16% VPIP on BTN (way below 38% cash baseline)
      pfr: i < 7,
      blind_defense_opportunity: i < 35,
      defended_blind: i < 4, // 11.4% defense across 35 opps
      barrel_turn_opportunity: i < 30,
      barreled_turn: i < 5, // 16.7% turn barrel across 30 opps
      aggressive_actions_turn: i < 2 ? 1 : 0,
      passive_actions_turn: 1,
      aggressive_actions_river: 0,
      passive_actions_river: 1,
    }));
  }
  // 40 Tournament short-stack (<20bb) hands with severe steal under-frequency and fold-to-3bet
  for (let i = 0; i < 40; i += 1) {
    rows.push(makeCaFactRow({
      hand_id: `mtt-${i}`,
      tournament_id: '99999999-9999-4999-8999-999999999999',
      game_variant: 'nlh',
      effective_stack_bb_at_deal: 15,
      position: 'CO',
      steal_opportunity: i < 35,
      stole: i < 6, // 17.1% steal across 35 opps (<20bb baseline 40-65%)
      faced_three_bet: i < 28,
      folded_to_three_bet: i < 23, // 82.1% fold to 3bet
    }));
  }
  // 15 unsupported PLO / OFC rows must be strictly excluded
  for (let i = 0; i < 15; i += 1) {
    rows.push(makeCaFactRow({
      hand_id: `unsupported-${i}`,
      tournament_id: null,
      game_variant: i % 2 === 0 ? 'plo' : 'ofc',
      blind_defense_opportunity: true,
      defended_blind: false,
    }));
  }

  const res = analyzeCaHandFacts(rows);
  assert.equal(res.totalEligibleHands, 90);
  assert.equal(res.excludedUnsupportedHands, 15);
  assert.equal(res.cash.hands, 50);
  assert.equal(res.tournament.hands, 40);
  assert.equal(res.tournamentByStack.short.hands, 40);
  assert.equal(res.tournamentByStack.mid.hands, 0);

  const leakTypes = new Set(res.detectedLeaks.map(l => l.leak_type));
  assert.ok(leakTypes.has('cash_blind_defense_too_tight'), 'expected cash blind defense leak');
  assert.ok(leakTypes.has('cash_turn_barrel_too_rare_facts'), 'expected cash turn barrel leak');
  assert.ok(leakTypes.has('cash_btn_too_tight'), 'expected cash BTN too tight leak');
  assert.ok(leakTypes.has('mtt_short_steal_too_rare'), 'expected tournament short-stack steal leak');
  assert.ok(leakTypes.has('mtt_short_fold_to_3bet_too_high'), 'expected tournament short-stack fold-to-3bet leak');

  // Unmeasured denominators stay strictly null (never fabricated 0%)
  const emptyRes = analyzeCaHandFacts([makeCaFactRow({ hand_id: 'single-1' })]);
  assert.equal(emptyRes.cash.blindDefenseFreq, null);
  assert.equal(emptyRes.cash.barrelTurnFreq, null);
  assert.equal(emptyRes.cash.squeezeFreq, null);
  assert.equal(emptyRes.detectedLeaks.length, 0);
});

test('summarizeSolverCoverageGaps ranks top unmeasured solver buckets deterministically', () => {
  const decisions = [
    { solver_verified: true, game_id: 'cash-001', street: 'flop', hero_position: 'BTN', spot_type: 'cbet' },
    { solver_verified: false, game_id: 'mtt-002', street: 'turn', hero_position: 'BB', spot_type: 'probe' },
    { solver_verified: false, game_id: 'mtt-002', street: 'turn', hero_position: 'BB', spot_type: 'probe' },
    { solver_verified: false, game_id: 'mtt-002', street: 'turn', hero_position: 'BB', spot_type: 'probe' },
    { solver_verified: false, game_id: 'cash-004', street: 'river', hero_position: 'CO', spot_type: 'bluff_catch' },
  ];
  const gaps = summarizeSolverCoverageGaps(decisions);
  assert.equal(gaps.totalDecisions, 5);
  assert.equal(gaps.totalUnmeasured, 4);
  assert.equal(gaps.topGaps.length, 2);
  assert.equal(gaps.topGaps[0].format, 'Tournament NLH');
  assert.equal(gaps.topGaps[0].street, 'turn');
  assert.equal(gaps.topGaps[0].heroPosition, 'BB');
  assert.equal(gaps.topGaps[0].count, 3);
  assert.equal(gaps.topGaps[0].sharePercent, 75);
});

test('buildTrainingPlan evaluates table-verified leak resolution across all four behavioral states', () => {
  const baseLeak = {
    id: 'leak-1',
    leak_type: 'flop_overfold',
    title: 'Overfolding Flop C-Bets',
    leak_category: 'flop',
    status: 'persistent',
    avg_ev_loss_bb: 0.25,
    ev_loss_measured: true,
    occurrence_count: 15,
    total_samples: 60,
    first_detected_at: '2026-10-01T00:00:00Z',
  };
  const baseline = '2026-11-01T00:00:00Z';

  // 1. In progress (not mastered in drills)
  const inProgressPlan = buildTrainingPlan({
    leaks: [baseLeak],
    reviews: [{ leak_id: 'leak-1', strong_streak: 1, retired: false, remediation_baseline_at: baseline }],
    decisions: [],
  });
  assert.equal(inProgressPlan.version, 'pa-training-plan-v2');
  assert.equal(inProgressPlan.modules[0].tableVerification.status, 'in_progress');

  // 2. Mastered in drills, <10 post-baseline live spots -> rechecking
  const recheckingDecisions = Array.from({ length: 4 }, (_, i) => ({
    leak_id: 'leak-1',
    solver_verified: true,
    classification: 'correct',
    audited_at: `2026-11-05T0${i}:00:00Z`,
  }));
  const recheckingPlan = buildTrainingPlan({
    leaks: [baseLeak],
    reviews: [{ leak_id: 'leak-1', strong_streak: 4, retired: true, remediation_baseline_at: baseline }],
    decisions: recheckingDecisions,
  });
  assert.equal(recheckingPlan.modules[0].tableVerification.status, 'mastered_in_drills_rechecking');
  assert.equal(recheckingPlan.modules[0].tableVerification.postBaselineSamples, 4);

  // 3. Mastered in drills + 10 post-baseline spots at <=15% error -> confirmed_fixed_at_tables
  const fixedDecisions = Array.from({ length: 10 }, (_, i) => ({
    leak_id: 'leak-1',
    solver_verified: true,
    classification: i === 0 ? 'mistake' : 'correct', // 10% error rate
    audited_at: `2026-11-10T1${i}:00:00Z`,
  }));
  const fixedPlan = buildTrainingPlan({
    leaks: [baseLeak],
    reviews: [{ leak_id: 'leak-1', strong_streak: 4, retired: true, remediation_baseline_at: baseline }],
    decisions: fixedDecisions,
  });
  assert.equal(fixedPlan.modules[0].tableVerification.status, 'confirmed_fixed_at_tables');
  assert.equal(fixedPlan.tableVerifiedCount, 1);

  // 4. Mastered in drills + 10 post-baseline spots at 40% error -> mastered_in_drills_still_leaking
  const leakingDecisions = Array.from({ length: 10 }, (_, i) => ({
    leak_id: 'leak-1',
    solver_verified: true,
    classification: i < 4 ? 'mistake' : 'correct', // 40% error rate
    audited_at: `2026-11-10T1${i}:00:00Z`,
  }));
  const leakingPlan = buildTrainingPlan({
    leaks: [baseLeak],
    reviews: [{ leak_id: 'leak-1', strong_streak: 4, retired: true, remediation_baseline_at: baseline }],
    decisions: leakingDecisions,
  });
  assert.equal(leakingPlan.modules[0].tableVerification.status, 'mastered_in_drills_still_leaking');
  assert.equal(leakingPlan.modules[0].cadence, 'Re-Drill Required');

  // Snapshot carries solverCoverageGaps
  const snapshot = buildCoachingSnapshot({
    leaks: [baseLeak],
    decisions: [{ solver_verified: false, game_id: 'cash-001', street: 'river', hero_position: 'BB', spot_type: 'facing_bet' }],
  });
  assert.equal(snapshot.solverCoverageGaps.totalUnmeasured, 1);
  assert.equal(snapshot.solverCoverageGaps.topGaps[0].street, 'river');
});

test('executeSingleHandAudit uses get_pa_linked_hand_bundle single-round-trip RPC, builds streetTimeline, and seeds trainingAction from largest EV loss', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const handId = '22222222-2222-4222-8222-222222222222';
  let rpcCalls = 0;
  let fromCalls = 0;

  const db = {
    async rpc(fn, params) {
      rpcCalls += 1;
      assert.equal(fn, 'get_pa_linked_hand_bundle');
      assert.equal(params.p_user_id, userId);
      assert.equal(params.p_hand_id, handId);
      return {
        data: {
          found: true,
          hand: {
            id: handId,
            game_variant: 'nlh',
            small_blind: 1,
            big_blind: 2,
            button_seat: 1,
            pot_size: 24,
            community_cards: ['Ah', 'Kd', '7c', '2s'],
            players: [
              { userId, seat: 1, position: 'BTN', stack: 200 },
              { userId: 'other-player', seat: 2, position: 'BB', stack: 200 },
            ],
            actions: [
              { street: 'preflop', playerId: userId, type: 'raise', amount: 6 },
              { street: 'preflop', playerId: 'other-player', type: 'call', amount: 6 },
              { street: 'flop', playerId: 'other-player', type: 'check', amount: 0 },
              { street: 'flop', playerId: userId, type: 'bet', amount: 8 },
              { street: 'flop', playerId: 'other-player', type: 'call', amount: 8 },
              { street: 'turn', playerId: 'other-player', type: 'bet', amount: 16 },
              { street: 'turn', playerId: userId, type: 'fold', amount: 0 },
            ],
            created_at: '2026-11-24T12:00:00Z',
          },
          fact: { hand_id: handId, hole_cards: ['As', 'Qc'] },
          decisions: [
            {
              decision_key: 'dk-flop',
              street: 'flop',
              hero_position: 'BTN',
              spot_type: 'cbet',
              player_action: 'bet',
              solver_action: 'bet',
              selected_frequency: 0.72,
              optimal_frequency: 0.75,
              classification: 'correct',
              ev_loss: 0.02,
              ev_loss_measured: true,
              solver_verified: true,
              solver_source: 'canonical|hand-audit-v3',
              game_id: 'cash-002',
            },
            {
              decision_key: 'dk-turn',
              street: 'turn',
              hero_position: 'BTN',
              spot_type: 'facing_probe',
              player_action: 'fold',
              solver_action: 'call',
              selected_frequency: 0.08,
              optimal_frequency: 0.84,
              classification: 'blunder',
              ev_loss: 1.45,
              ev_loss_measured: true,
              solver_verified: true,
              solver_source: 'canonical|hand-audit-v3',
              game_id: 'cash-003',
            },
          ],
          leaks: [],
        },
        error: null,
      };
    },
    from() {
      fromCalls += 1;
      throw new Error('Should not hit direct table queries when single-round-trip RPC succeeds');
    },
  };

  const req = { method: 'GET', query: { hand: handId }, headers: {} };
  const res = makeResponse();
  await executeSingleHandAudit(req, res, {
    getDb: () => db,
    applyRateLimit: () => true,
    limits: {},
    getUser: async () => ({ user: { id: userId }, error: null }),
    checkAccess: async () => ({ allowed: true, accessLevel: ACCESS_LEVELS.FULL_ACCESS, contextState: CONTEXT_STATES.TRAINING_MODE }),
  });

  assert.equal(res.statusCode, 200);
  assert.equal(rpcCalls, 1);
  assert.equal(fromCalls, 0);
  assert.equal(res.body.singleRoundTrip, true);
  assert.equal(res.body.solverVerifiedCount, 2);
  assert.ok(Array.isArray(res.body.streetTimeline) && res.body.streetTimeline.length >= 2);
  assert.equal(res.body.streetTimeline[0].street, 'preflop');
  assert.equal(res.body.trainingAction.street, 'turn');
  assert.equal(res.body.trainingAction.evLossBB, 1.45);
  assert.equal(res.body.trainingAction.drillParams.game, 'cash-003');
});

test('syncClubArenaHandsForAudit honors incremental watermark and bypasses on fullRescan or matcher drift', async () => {
  const userId = '33333333-3333-4333-8333-333333333333';
  const sampleHands = [
    { id: 'h-3', created_at: '2026-11-24T12:03:00Z', game_variant: 'nlh', players: [{ userId }], actions: [] },
    { id: 'h-2', created_at: '2026-11-24T12:02:00Z', game_variant: 'nlh', players: [{ userId }], actions: [] },
    { id: 'h-1', created_at: '2026-11-24T12:01:00Z', game_variant: 'nlh', players: [{ userId }], actions: [] },
  ];

  const makeMockDb = () => ({
    from(table) {
      const chain = {
        select() { return chain; },
        contains() { return chain; },
        eq() { return chain; },
        in() { return chain; },
        lte() { return chain; },
        or() { return chain; },
        order() { return chain; },
        range() {
          if (table === 'hand_history') return Promise.resolve({ data: sampleHands, error: null });
          return Promise.resolve({ data: [], error: null });
        },
        limit() {
          if (table === 'hand_history') return Promise.resolve({ data: sampleHands, error: null });
          return Promise.resolve({ data: [], error: null });
        },
      };
      return chain;
    },
  });

  // 1. Watermark at h-2 with matching MATCHER_VERSION stops at h-2 -> only h-3 scanned!
  const incRes = await syncClubArenaHandsForAudit(makeMockDb(), userId, {
    limit: 50,
    sinceBoundary: { createdAt: '2026-11-24T12:02:00Z', id: 'h-2', matcherVersion: MATCHER_VERSION },
  });
  assert.equal(incRes.incrementalStop, true);
  assert.equal(incRes.handsFound, 1);
  assert.equal(incRes.latestHandWatermark?.id, 'h-3');
  assert.equal(incRes.latestHandWatermark?.matcherVersion, MATCHER_VERSION);

  // 2. fullRescan: true ignores watermark and scans all 3 hands
  const fullRes = await syncClubArenaHandsForAudit(makeMockDb(), userId, {
    limit: 50,
    sinceBoundary: { createdAt: '2026-11-24T12:02:00Z', id: 'h-2', matcherVersion: MATCHER_VERSION },
    fullRescan: true,
  });
  assert.equal(fullRes.incrementalStop, false);
  assert.equal(fullRes.handsFound, 3);

  // 3. Stale matcherVersion ignores watermark so upgraded solver re-audits all hands
  const driftRes = await syncClubArenaHandsForAudit(makeMockDb(), userId, {
    limit: 50,
    sinceBoundary: { createdAt: '2026-11-24T12:02:00Z', id: 'h-2', matcherVersion: 'hand-audit-v1' },
  });
  assert.equal(driftRes.incrementalStop, false);
  assert.equal(driftRes.handsFound, 3);
});

test('orphaned legacy Sandbox components are permanently removed and reusable E2E verifier exists', () => {
  const removed = [
    'src/components/sandbox/CoachFeedback.jsx',
    'src/components/sandbox/EquityHeatmapOverlay.jsx',
    'src/components/sandbox/NodeLockExploits.jsx',
    'src/components/sandbox/SaveHandModal.jsx',
    'src/components/sandbox/StudyFolders.jsx',
    'src/components/sandbox/TiltMonitor.jsx',
  ];
  for (const rel of removed) {
    assert.equal(fs.existsSync(path.join(ROOT, rel)), false, `${rel} should remain removed`);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'scripts/verify-pa-cross-app-e2e.mjs')), true);
});
