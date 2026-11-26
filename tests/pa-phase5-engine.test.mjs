import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bucketStackDepth,
  RULE_LEAK_DECISION_MATCHERS,
  findRuleBasedDecisions,
  buildStakePoolContext,
  buildCoverageGapsRanked,
  buildCoachingSnapshot,
  buildTrainingPlan,
  selectTopLeakedHands,
} from '../src/lib/personal-assistant/coachingIntelligence.mjs';

import { buildStudyPlanMarkdown } from '../src/lib/personal-assistant/studyPlanExport.mjs';
import { resolveStackDepthBb, auditParsedHands } from '../src/lib/training/handAuditEngine.js';

test('bucketStackDepth: categorizes stack depths into <=20bb, 20-50bb, 50-100bb, 100bb+, or unknown', () => {
  // Unknown / invalid
  assert.equal(bucketStackDepth(null), 'unknown');
  assert.equal(bucketStackDepth(undefined), 'unknown');
  assert.equal(bucketStackDepth(''), 'unknown');
  assert.equal(bucketStackDepth(0), 'unknown');
  assert.equal(bucketStackDepth(-10), 'unknown');
  assert.equal(bucketStackDepth(NaN), 'unknown');
  assert.equal(bucketStackDepth('invalid'), 'unknown');

  // <=20bb
  assert.equal(bucketStackDepth(5), '<=20bb');
  assert.equal(bucketStackDepth(15.4), '<=20bb');
  assert.equal(bucketStackDepth(20), '<=20bb');
  assert.equal(bucketStackDepth('20'), '<=20bb');

  // 20-50bb
  assert.equal(bucketStackDepth(20.1), '20-50bb');
  assert.equal(bucketStackDepth(35), '20-50bb');
  assert.equal(bucketStackDepth(50), '20-50bb');
  assert.equal(bucketStackDepth('50'), '20-50bb');

  // 50-100bb
  assert.equal(bucketStackDepth(50.1), '50-100bb');
  assert.equal(bucketStackDepth(75), '50-100bb');
  assert.equal(bucketStackDepth(100), '50-100bb');
  assert.equal(bucketStackDepth('100'), '50-100bb');

  // 100bb+
  assert.equal(bucketStackDepth(100.1), '100bb+');
  assert.equal(bucketStackDepth(250), '100bb+');
  assert.equal(bucketStackDepth('300'), '100bb+');
});

test('coverageGapsRanked uses real stack buckets from stack_depth_bb / stackDepthBb', () => {
  const decisions = [
    { classification: 'unpriced', solver_verified: false, game_id: 'mtt-hand-audit', street: 'preflop', hero_position: 'btn', stack_depth_bb: 15.2, spot_type: 'open' },
    { classification: 'unpriced', solver_verified: false, game_id: 'mtt-hand-audit', street: 'preflop', hero_position: 'btn', stack_depth_bb: 18.0, spot_type: 'open' },
    { classification: 'unpriced', solver_verified: false, game_id: 'cash-hand-audit', street: 'turn', hero_position: 'co', stackDepthBb: 75.0, spot_type: 'cbet' },
    { classification: 'unpriced', solver_verified: false, game_id: 'cash-hand-audit', street: 'river', hero_position: 'bb', stack_depth_bb: null, spot_type: 'defense' },
  ];

  const ranked = buildCoverageGapsRanked(decisions);
  assert.equal(ranked.totalUnpriced, 4);
  const shortGroup = ranked.gaps.find(g => g.stackBucket === '<=20bb');
  assert.ok(shortGroup, 'Should find <=20bb stack bucket');
  assert.equal(shortGroup.count, 2);
  assert.equal(shortGroup.format, 'Tournament NLH');

  const midDeepGroup = ranked.gaps.find(g => g.stackBucket === '50-100bb');
  assert.ok(midDeepGroup, 'Should find 50-100bb stack bucket');
  assert.equal(midDeepGroup.count, 1);

  const unknownGroup = ranked.gaps.find(g => g.stackBucket === 'unknown');
  assert.ok(unknownGroup, 'Should fall back to unknown for null stack_depth_bb');
  assert.equal(unknownGroup.count, 1);
});

test('resolveStackDepthBb extracts depth in BB and never returns zero', () => {
  // From point
  assert.equal(resolveStackDepthBb({}, { effectiveStackBb: 25.66 }), 25.7);
  assert.equal(resolveStackDepthBb({}, { stack_depth_bb: 18.44 }), 18.4);

  // From hand effective stack
  assert.equal(resolveStackDepthBb({ effectiveStackBb: 42.12 }, {}), 42.1);
  assert.equal(resolveStackDepthBb({ hero: { effective_stack_bb_at_deal: 99.98 } }, {}), 100);

  // From hero stack / bigBlind
  assert.equal(resolveStackDepthBb({ bigBlind: 2, hero: { stack: 200 } }, {}), 100);
  assert.equal(resolveStackDepthBb({ bigBlind: 50, hero: { stack: 1750 } }, {}), 35);

  // Zero / negative / invalid => null (NEVER 0!)
  assert.equal(resolveStackDepthBb({ bigBlind: 2, hero: { stack: 0 } }, {}), null);
  assert.equal(resolveStackDepthBb({ bigBlind: 2, hero: { stack: -50 } }, {}), null);
  assert.equal(resolveStackDepthBb({ bigBlind: 0, hero: { stack: 100 } }, {}), null);
  assert.equal(resolveStackDepthBb({}, {}), null);
});

test('self_reported_live isolation: excludes self_reported_live from tableVerification and sessionDebrief', () => {
  const baseline = '2026-11-25T12:00:00Z';
  const postPlayedAt = '2026-11-25T14:00:00Z';

  // 10 decisions: 6 are self_reported_live (all correct), 4 are club_arena (all mistakes)
  // If self_reported_live contaminated tableVerification, sample would be 10 and mistake rate would be 40%.
  // When properly isolated: sample is 4 < 8 (MIN_LIVE_VERIFY_HANDS), status must be awaiting_live_hands!
  const relatedDecisions = [
    ...Array.from({ length: 6 }, (_, i) => ({
      leak_id: 'leak-1',
      hand_external_id: `live-spot:${i}`,
      evidence_scope: 'self_reported_live',
      solver_verified: true,
      classification: 'best',
      hand_played_at: postPlayedAt,
      audited_at: postPlayedAt,
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      leak_id: 'leak-1',
      hand_external_id: `club-arena:${i}`,
      evidence_scope: 'club_arena',
      solver_verified: true,
      classification: 'mistake',
      ev_loss_measured: true,
      ev_loss: -2.5,
      hand_played_at: postPlayedAt,
      audited_at: postPlayedAt,
    })),
  ];

  const leaks = [{ id: 'leak-1', leakType: 'cbet_leak', status: 'active' }];
  const reviews = [{ leak_id: 'leak-1', retired: true, remediation_baseline_at: baseline }];

  const snapshot = buildCoachingSnapshot({
    leaks,
    reviews,
    decisions: relatedDecisions,
    liveTable: { active: false, cooldown: false },
  });

  const module = snapshot.trainingPlan.modules[0];
  assert.ok(module, 'Plan module should exist');
  assert.equal(module.tableVerification.status, 'awaiting_live_hands');
  assert.equal(module.tableVerification.postSampleCount, 4, 'Only club_arena decisions counted in post sample');
  assert.equal(module.tableVerification.selfReportedExcludedCount, 6, 'Self-reported hands reported in excluded count');

  // Verify sessionDebrief recap exclusion
  const sessionWindow = {
    startMs: Date.parse('2026-11-25T13:00:00Z'),
    endMs: Date.parse('2026-11-25T15:00:00Z'),
    source: 'poker_sessions',
  };

  const recap = selectTopLeakedHands(relatedDecisions, sessionWindow);
  // All 4 club_arena mistakes qualify, 0 self_reported_live hands qualify
  assert.equal(recap.hands.length, 2);
  recap.hands.forEach(h => {
    assert.ok(h.handId.startsWith('0') || h.handId.startsWith('1') || h.handId.startsWith('2') || h.handId.startsWith('3'));
    assert.ok(!h.handId.includes('live-spot'));
  });
});

test('rule-based leak decision attribution: maps statistical leak types when direct lookup is empty', () => {
  const leakTypes = [
    'river_overfold',
    'flop_cbet_too_low',
    'flop_cbet_too_high',
    'fold_to_3bet_high',
    'vpip_too_high',
    'pfr_too_low',
    'bb_overfold',
    'turn_barrel_leak',
    'aggression_low',
    'over_calling',
    'missed_value',
  ];

  // Create mock decisions for each spot
  const decisions = [
    { street: 'river', player_action: 'fold', spot_type: 'facing_bet' },
    { street: 'flop', player_action: 'check', spot_type: 'cbet_opp' },
    { street: 'flop', player_action: 'bet', spot_type: 'cbet_opp' },
    { street: 'preflop', player_action: 'fold', spot_type: 'facing_3bet' },
    { street: 'preflop', player_action: 'call', spot_type: 'open' },
    { street: 'preflop', player_action: 'call', spot_type: 'limp' },
    { street: 'preflop', hero_position: 'BB', player_action: 'fold', spot_type: 'facing_steal' },
    { street: 'turn', player_action: 'check', spot_type: 'barrel_opp' },
    { street: 'turn', player_action: 'call', spot_type: 'facing_bet' },
    { street: 'river', player_action: 'call', spot_type: 'bluff_catch' },
    { street: 'river', player_action: 'check', spot_type: 'value_opp' },
  ];

  const decisionIndex = { list: decisions, byKey: new Map() }; // empty byKey => 0 direct matches!

  for (const leakType of leakTypes) {
    const matched = findRuleBasedDecisions({ leak_type: leakType }, leakType, decisionIndex);
    assert.ok(matched.length >= 1, `Rule attribution for '${leakType}' must match at least 1 decision row`);
  }
});

test('buildStakePoolContext: enforces RTA/cooldown gating and sample size >= 500 threshold', () => {
  const leak = { category: 'Preflop Defense', leakType: 'bb_overfold', format: 'cash' };
  const poolBenchmarks = [
    {
      key: 'bb_overfold',
      category: 'Preflop Defense',
      format: 'cash',
      sampleHands: 1250,
      verified: true,
      stakeLabel: '1/2 Cash',
      poolMetricLabel: 'Pool BB Fold: 68%',
      gtoBaselineLabel: '48%',
    },
    {
      key: 'small_sample_leak',
      category: 'Flop Play',
      format: 'cash',
      sampleHands: 240, // < 500!
      verified: true,
    },
  ];

  // 1. Live table active -> null (RTA guard!)
  assert.equal(
    buildStakePoolContext({ leak, poolBenchmarks, liveTableActive: true, cooldownActive: false }),
    null,
    'Must return null when live table is active'
  );

  // 2. Cooldown active -> null (Cooldown guard!)
  assert.equal(
    buildStakePoolContext({ leak, poolBenchmarks, liveTableActive: false, cooldownActive: true }),
    null,
    'Must return null during post-session cooldown'
  );

  // 3. Small sample (< 500) -> null
  const smallLeak = { category: 'Flop Play', leakType: 'small_sample_leak', format: 'cash' };
  assert.equal(
    buildStakePoolContext({ leak: smallLeak, poolBenchmarks, liveTableActive: false, cooldownActive: false }),
    null,
    'Must return null when sampleHands < 500'
  );

  // 4. Eligible off-table query -> returns complete descriptor
  const context = buildStakePoolContext({ leak, poolBenchmarks, liveTableActive: false, cooldownActive: false });
  assert.ok(context, 'Should return context when eligible');
  assert.equal(context.stakeLabel, '1/2 Cash');
  assert.equal(context.poolMetricLabel, 'Pool BB Fold: 68%');
  assert.equal(context.gtoBaselineLabel, '48%');
  assert.equal(context.sampleHands, 1250);
  assert.equal(context.readOnly, true);
  assert.equal(context.postSessionOnly, true);
});

test('buildStudyPlanMarkdown: exports structured, truthful, PII-free Markdown', () => {
  const snapshot = {
    generatedAt: '2026-11-25T20:00:00Z',
    funnelMetrics: {
      auditedHands: 1420,
      activeLeaks: 3,
      drilledLeaks: 2,
      masteredLeaks: 1,
      verifiedFixedLive: 1,
    },
    trainingPlan: {
      modules: [
        {
          rank: 1,
          title: 'River Defense Against Triple Barrel',
          status: 'Active',
          tableVerification: {
            status: 'confirmed_fixed_at_tables',
            label: 'Confirmed Fixed At The Tables',
            preMistakeRate: 38.5,
            postMistakeRate: 11.2,
          },
          drillParams: { street: 'River Defense Drill' },
          stakePoolContext: {
            label: 'NL50 Pool Context',
            poolMetricLabel: 'Pool Fold 70%',
            gtoBaselineLabel: '52%',
            sampleHands: 1500,
          },
        },
      ],
    },
    coverageGapsRanked: [
      {
        format: 'Tournament NLH',
        street: 'preflop',
        position: 'BTN',
        stackBucket: '<=20bb',
        count: 14,
        coverageHint: { label: 'ICM Study Model' },
      },
    ],
  };

  const md = buildStudyPlanMarkdown(snapshot);

  // Header & sections
  assert.match(md, /# Personal Assistant Poker Study Plan/);
  assert.match(md, /## Coaching Funnel Summary/);
  assert.match(md, /\| Audited Hands \| 1,420 \|/);
  assert.match(md, /\| Active Leaks \| 3 \|/);
  assert.match(md, /## Top Priority Leaks & Training Plan/);
  assert.match(md, /River Defense Against Triple Barrel/);
  assert.match(md, /38.5% → 11.2%/);
  assert.match(md, /Confirmed Fixed At The Tables/);
  assert.match(md, /## Ranked Solver Coverage Gaps/);
  assert.match(md, /Tournament NLH \| preflop \| BTN \| <=20bb \| 14 \| ICM Study Model/);

  // Null-safety test: empty snapshot must not throw and must not fabricate zeros
  const emptyMd = buildStudyPlanMarkdown({});
  assert.match(emptyMd, /\| Audited Hands \| N\/A \|/);
  assert.match(emptyMd, /\| Active Leaks \| N\/A \|/);
  assert.match(emptyMd, /_No active leak modules are currently pending._/);
  assert.match(emptyMd, /_No unpriced solver coverage gaps recorded._/);

  // ZERO PII guarantee test
  const piiSnapshot = {
    generatedAt: '2026-11-25T20:00:00Z',
    funnelMetrics: { auditedHands: 100 },
    trainingPlan: {
      modules: [
        {
          title: 'Leak by user user@smarter.poker with token Bearer secret-auth-token-12345678 and id 12345678-1234-1234-1234-123456789abc',
        },
      ],
    },
  };
  const piiCleaned = buildStudyPlanMarkdown(piiSnapshot);
  assert.ok(!piiCleaned.includes('user@smarter.poker'), 'Email must be scrubbed');
  assert.ok(!piiCleaned.includes('Bearer secret-auth-token'), 'Token must be scrubbed');
  assert.ok(!piiCleaned.includes('12345678-1234-1234-1234-123456789abc'), 'UUID must be scrubbed');
});

test('handAuditEngine persists stack_depth_bb and evidence_scope on decision rows', async () => {
  const fakeDb = {
    rpcCalls: [],
    async rpc(name, params) {
      this.rpcCalls.push({ name, params });
      return { data: { success: true, removed: 0 }, error: null };
    },
    from() {
      return {
        async upsert() { return { error: null }; },
      };
    },
  };

  const hands = [
    {
      id: 'test-hand-101',
      format: 'cash',
      gameType: 'nlhe',
      tableSize: 6,
      bigBlind: 2,
      effectiveStackBb: 45.5,
      hero: {
        name: 'Hero',
        position: 'BTN',
        holeCards: ['As', 'Kd'],
        stack: 100,
      },
      players: [
        { name: 'Hero', seat: 1, stack: 100, position: 'BTN' },
        { name: 'Villain', seat: 2, stack: 100, position: 'BB' },
      ],
      streets: {
        preflop: {
          actions: [
            { player: 'Hero', action: 'raise', amount: 5, isHero: true },
            { player: 'Villain', action: 'fold', isHero: false },
          ],
        },
      },
    },
  ];

  // Test auditParsedHands with evidenceScope: 'self_reported_live'
  const result = await auditParsedHands(fakeDb, 'user-1', hands, {
    persist: true,
    evidenceScope: 'self_reported_live',
  });

  assert.equal(result.evidenceScope, 'self_reported_live');
  assert.equal(fakeDb.rpcCalls.length, 1);
  const call = fakeDb.rpcCalls[0];
  assert.equal(call.name, 'replace_hand_audit_decisions');
  const rows = call.params.p_rows;
  assert.ok(rows.length > 0, 'Decision rows should be generated');

  const row = rows[0];
  assert.equal(row.evidence_scope, 'self_reported_live');
  assert.equal(row.stack_depth_bb, 45.5);
});

test('audit-hand-history endpoint honors evidenceScope allowlist and forwards to engine', async () => {
  const fs = await import('node:fs');
  const route = fs.readFileSync(new URL('../pages/api/training/audit-hand-history.js', import.meta.url), 'utf8');

  // Verify allowlist contract
  assert.match(route, /req\.body\?\.evidenceScope/);
  assert.match(route, /'self_reported_live'/);
  assert.match(route, /'external_upload'/);
  assert.match(route, /evidenceScope\s*:\s*evidenceScope/);
});

test('coaching endpoint reads and saves weeklyDigestOptIn, selecting stack_depth_bb and evidence_scope', async () => {
  const fs = await import('node:fs');
  const route = fs.readFileSync(new URL('../pages/api/assistant/coaching.js', import.meta.url), 'utf8');

  // Verify schema column selections with fallback
  assert.match(route, /stack_depth_bb,\s*evidence_scope/);
  assert.match(route, /weekly_digest_opt_in/);
  assert.match(route, /weeklyDigestOptIn:\s*Boolean\(rawPrefs\?\.weekly_digest_opt_in\)/);
  assert.match(route, /weeklyDigestOptIn/);
  assert.match(route, /payload\.weekly_digest_opt_in\s*=\s*weeklyDigestOptIn/);
});

test('buildCoachingSnapshot attaches stakePoolContext to plan modules and leaks when eligible, and omits when seated', () => {
  const leaks = [
    { id: 'leak-bb', category: 'Preflop Defense', leakType: 'bb_overfold', status: 'active' },
  ];
  const poolBenchmarks = [
    {
      key: 'bb_overfold',
      category: 'Preflop Defense',
      format: 'cash',
      sampleHands: 1200,
      verified: true,
      stakeLabel: '1/2 Cash',
      poolMetricLabel: 'Pool BB Fold: 68%',
      gtoBaselineLabel: '48%',
    },
  ];

  // 1. Off-table query -> stakePoolContext attached
  const offTableSnapshot = buildCoachingSnapshot({
    leaks,
    poolBenchmarks,
    liveTable: { active: false, cooldown: false },
  });
  const module = offTableSnapshot.trainingPlan.modules[0];
  assert.ok(module.stakePoolContext, 'Module should receive stakePoolContext when off-table');
  assert.equal(module.stakePoolContext.stakeLabel, '1/2 Cash');
  assert.equal(offTableSnapshot.leaks[0].stakePoolContext.sampleHands, 1200);

  // 2. Live table active -> NEVER attached (RTA protection!)
  const seatedSnapshot = buildCoachingSnapshot({
    leaks,
    poolBenchmarks,
    liveTable: { active: true, cooldown: false },
  });
  const seatedModule = seatedSnapshot.trainingPlan.modules[0];
  assert.equal(seatedModule.stakePoolContext, undefined, 'Module must NEVER receive stakePoolContext while seated');
  assert.equal(seatedSnapshot.leaks[0].stakePoolContext, undefined, 'Leaks must NEVER receive stakePoolContext while seated');
});

